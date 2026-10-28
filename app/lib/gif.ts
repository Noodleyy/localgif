// No React in here, so the tests can run it in Node against the same ffmpeg.wasm build.
import type { Crop } from "./crop";
import { MEMORY_LIMIT_MB } from "./memory";
import { clamp } from "./time";

export const DEFAULT_FPS = 30;
export const MIN_COLORS = 4; // palettegen fails below 4
export const MAX_COLORS = 256;
// GIF delays are whole 1/100 s; above 50 fps they round to 1/100 s, which browsers
// replace with 1/10 s, so the GIF would play slowly.
export const MAX_GIF_FPS = 50;

export const clampFps = (fps: number) => clamp(fps, 1, MAX_GIF_FPS);
export const clampColors = (colors: number) => clamp(Math.round(colors), MIN_COLORS, MAX_COLORS);

/** The part of @ffmpeg/ffmpeg's FFmpeg class used here. */
export interface FFmpegLike {
  readFile(path: string, encoding?: string): Promise<Uint8Array | string>;
  deleteFile(path: string): Promise<unknown>;
  createDir(path: string): Promise<unknown>;
  deleteDir(path: string): Promise<unknown>;
  mount(fsType: string, options: { blobs: { name: string; data: Blob }[] }, mountPoint: string): Promise<unknown>;
  unmount(mountPoint: string): Promise<unknown>;
  exec(args: string[]): Promise<number>;
  ffprobe(args: string[]): Promise<number>;
  on(event: "log", callback: (event: { message: string }) => void): void;
  off(event: "log", callback: (event: { message: string }) => void): void;
}

export type GifOptions = {
  start: number;
  end: number;
  fps: number;
  colors: number;
  crop?: Crop; // the part of the frame to keep (default: all of it)
  width: number; // of the GIF; the height follows the (cropped) aspect ratio
};

export function fileExtension(fileName: string): string {
  const match = /\.([a-z0-9]+)$/i.exec(fileName);
  return match ? match[1].toLowerCase() : "mp4";
}

let mountCount = 0;

// WORKERFS lets ffmpeg read the file from disk in chunks instead of copying the whole
// video into memory. A folder per call, so a probe and a conversion can't collide.
async function withMountedFile<T>(ffmpeg: FFmpegLike, file: File, read: (path: string) => Promise<T>): Promise<T> {
  const dir = `/input${++mountCount}`;
  const name = `video.${fileExtension(file.name)}`; // ffmpeg misreads some names, e.g. "a:b.mp4"
  await ffmpeg.createDir(dir);
  try {
    await ffmpeg.mount("WORKERFS", { blobs: [{ name, data: file }] }, dir);
    try {
      return await read(`${dir}/${name}`);
    } finally {
      await ffmpeg.unmount(dir).catch(() => {});
    }
  } finally {
    await ffmpeg.deleteDir(dir).catch(() => {});
  }
}

// One showinfo line per frame before and after the palette step. ffmpeg's own progress
// only starts moving once palettegen has seen every frame.
const FRAME_LOG = /\bn:\s*\d+\s+pts:/;

export function gifArgs(input: string, output: string, o: GifOptions): string[] {
  const crop = o.crop ? `crop=${o.crop.width}:${o.crop.height}:${o.crop.x}:${o.crop.y},` : "";
  const filter =
    `${crop}fps=${clampFps(o.fps)},scale=${o.width}:-1:flags=lanczos,showinfo=checksum=0,split[s0][s1];` +
    `[s0]palettegen=max_colors=${clampColors(o.colors)}[p];[s1][p]paletteuse,showinfo=checksum=0`;
  return [
    // the log level is global in ffmpeg.wasm: an earlier `ffprobe -v error` would hide the showinfo lines
    "-loglevel", "info",
    "-ss", String(o.start),
    "-t", String(o.end - o.start),
    "-i", input,
    "-vf", filter,
    "-loop", "0",
    output,
  ];
}

export function frameCount(o: Pick<GifOptions, "start" | "end" | "fps">) {
  return Math.max(1, Math.ceil((o.end - o.start) * clampFps(o.fps)));
}

export async function convertToGif(
  ffmpeg: FFmpegLike,
  file: File,
  options: GifOptions,
  onProgress?: (fraction: number) => void
): Promise<Uint8Array> {
  if (!(options.end > options.start)) throw new Error("End time must be after start time");

  const output = "output.gif";
  const totalSteps = frameCount(options) * 2;
  let steps = 0;
  const logs: string[] = [];
  const onLog = ({ message }: { message: string }) => {
    if (FRAME_LOG.test(message)) return onProgress?.(Math.min(++steps / totalSteps, 0.99));
    logs.push(message);
    if (logs.length > 40) logs.shift();
  };

  ffmpeg.on("log", onLog);
  try {
    return await withMountedFile(ffmpeg, file, async (input) => {
      const exitCode = await ffmpeg.exec(gifArgs(input, output, options));
      if (exitCode !== 0) {
        if (logs.some((line) => /out of memory|OOM/i.test(line))) {
          throw new Error(
            `Ran out of memory (ffmpeg in the browser is limited to ${MEMORY_LIMIT_MB / 1024} GB). Every GIF frame is kept in memory, so shorten the trim, or lower the size or FPS.`
          );
        }
        throw new Error(`FFmpeg failed (exit code ${exitCode}).\n${logs.slice(-5).join("\n")}`);
      }
      const gif = await ffmpeg.readFile(output).catch(() => null);
      if (!(gif instanceof Uint8Array) || gif.byteLength === 0) {
        throw new Error("Conversion produced an empty GIF. Check that the trim range is inside the video.");
      }
      onProgress?.(1);
      return gif;
    });
  } finally {
    ffmpeg.off("log", onLog);
    await ffmpeg.deleteFile(output).catch(() => {});
  }
}

/** ffprobe's r_frame_rate, e.g. "30000/1001" or "25". */
export function parseFrameRate(text: string): number {
  const [num, den = 1] = text.trim().split("/").map(Number);
  const fps = num / den;
  return Number.isFinite(fps) && fps > 0 ? fps : DEFAULT_FPS;
}

export type VideoInfo = {
  fps: number;
  width: number;
  height: number;
  duration: number | null; // null when the file doesn't say (live-recorded WebM)
};

/** Also works for formats the browser can't play. Throws if there's no video stream. */
export async function probeVideo(ffmpeg: FFmpegLike, file: File): Promise<VideoInfo> {
  const output = `probe${++mountCount}.json`;
  try {
    await withMountedFile(ffmpeg, file, (input) =>
      ffmpeg.ffprobe([
        "-v", "error",
        "-select_streams", "v:0",
        "-show_entries", "stream=r_frame_rate,width,height,duration:format=duration",
        "-of", "json",
        input,
        "-o", output,
      ])
    );
    const json = JSON.parse(String(await ffmpeg.readFile(output, "utf8")));
    const stream = json.streams?.[0];
    if (!stream?.width || !stream?.height) throw new Error("No video stream found");
    const duration = Number(json.format?.duration ?? stream.duration);
    return {
      fps: parseFrameRate(String(stream.r_frame_rate ?? "")),
      width: stream.width,
      height: stream.height,
      duration: Number.isFinite(duration) && duration > 0 ? duration : null,
    };
  } finally {
    await ffmpeg.deleteFile(output).catch(() => {});
  }
}

export function maxOutputFps(sourceFps: number): number {
  return clampFps(Math.round(sourceFps));
}
