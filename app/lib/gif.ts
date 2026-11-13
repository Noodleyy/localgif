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
  speed?: number; // 0.5 = half speed (slow motion), 2 = twice as fast (default 1)
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

/** The GIF's frames: cropped, sped up or slowed down, then picked at the GIF's FPS. */
function framesFilter(o: GifOptions) {
  const crop = o.crop ? `crop=${o.crop.width}:${o.crop.height}:${o.crop.x}:${o.crop.y},` : "";
  const speed = o.speed && o.speed !== 1 ? `setpts=PTS/${o.speed},` : ""; // before fps: it picks frames on the new timeline
  return `${crop}${speed}fps=${clampFps(o.fps)}`;
}

/** Frames to a GIF `width` wide, with a palette made for them. `id` keeps the labels apart. */
const toGif = (width: number, colors: number, id = "") =>
  `scale=${width}:-1:flags=lanczos,split[${id}a][${id}b];[${id}a]palettegen=max_colors=${clampColors(colors)}[${id}p];[${id}b][${id}p]paletteuse`;

const inputArgs = (input: string, o: GifOptions) => ["-ss", String(o.start), "-t", String(o.end - o.start), "-i", input];

export function gifArgs(input: string, output: string, o: GifOptions): string[] {
  const filter =
    `${framesFilter(o)},scale=${o.width}:-1:flags=lanczos,showinfo=checksum=0,split[s0][s1];` +
    `[s0]palettegen=max_colors=${clampColors(o.colors)}[p];[s1][p]paletteuse,showinfo=checksum=0`;
  // the log level is global in ffmpeg.wasm: an earlier `ffprobe -v error` would hide the showinfo lines
  return ["-loglevel", "info", ...inputArgs(input, o), "-vf", filter, "-loop", "0", output];
}

/** How long the GIF plays: the trim, sped up or slowed down. */
export const gifDuration = (o: Pick<GifOptions, "start" | "end" | "speed">) => (o.end - o.start) / (o.speed ?? 1);

export function frameCount(o: Pick<GifOptions, "start" | "end" | "fps" | "speed">) {
  return Math.max(1, Math.ceil(gifDuration(o) * clampFps(o.fps)));
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

export const ESTIMATE_PAIRS = 16; // pairs of frames converted at full size and small
const SHRINK = 3; // the small GIF is a third as wide,
const MIN_SMALL = 160; // but no smaller: tiny GIFs scale up less predictably

/**
 * The GIF's size, for less work than converting it. Short or narrow GIFs are just converted (exact).
 * Otherwise every frame is converted at a third of the width, so busy and quiet stretches
 * all count, and scaled up by how much bigger 16 pairs of frames (spread over the trim,
 * the second of each shows what changed) come out at full size than small.
 * Within ±10% of the real GIF on camera, screen-recording and animation clips.
 */
export async function estimateGifBytes(
  ffmpeg: FFmpegLike,
  file: File,
  o: GifOptions,
  onProgress?: (fraction: number) => void
): Promise<number> {
  const total = frameCount(o);
  const small = Math.max(MIN_SMALL, Math.round(o.width / SHRINK));
  if (total <= ESTIMATE_PAIRS * 4 || small >= o.width) return (await convertToGif(ffmpeg, file, o, onProgress)).byteLength;

  const pairs = `select='lt(mod(n\\,${Math.floor(total / ESTIMATE_PAIRS)})\\,2)'`;
  const filter =
    `${framesFilter(o)},split=3[all][big][little];` +
    `[all]showinfo=checksum=0,${toGif(small, o.colors, "s")},showinfo=checksum=0[small];` + // progress: like convertToGif
    `[big]${pairs},${toGif(o.width, o.colors, "b")}[bigPairs];` +
    `[little]${pairs},${toGif(small, o.colors, "l")}[smallPairs]`;
  const outputs = ["small", "bigPairs", "smallPairs"].map((name) => `${name}${++mountCount}.gif`);
  let steps = 0;
  const onLog = ({ message }: { message: string }) => {
    if (FRAME_LOG.test(message)) onProgress?.(Math.min(++steps / (total * 2), 0.99));
  };
  ffmpeg.on("log", onLog);
  return withMountedFile(ffmpeg, file, async (input) => {
    try {
      const code = await ffmpeg.exec([
        "-loglevel", "info",
        ...inputArgs(input, o),
        "-filter_complex", filter,
        ...["[small]", "[bigPairs]", "[smallPairs]"].flatMap((label, i) => ["-map", label, "-loop", "0", outputs[i]]),
      ]);
      const [all, big, little] = await Promise.all(outputs.map((path) => ffmpeg.readFile(path)));
      if (code !== 0 || ![all, big, little].every((gif) => gif instanceof Uint8Array && gif.byteLength > 0)) {
        throw new Error(`FFmpeg failed (exit code ${code})`);
      }
      return Math.round((all.length * big.length) / little.length);
    } finally {
      ffmpeg.off("log", onLog);
      await Promise.all(outputs.map((path) => ffmpeg.deleteFile(path).catch(() => {})));
    }
  });
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
