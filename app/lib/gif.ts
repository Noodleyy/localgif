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
let queue: Promise<unknown> = Promise.resolve();

/** One ffmpeg job at a time: a conversion mustn't count a size sample's log lines as its progress. */
function exclusive<T>(job: () => Promise<T>): Promise<T> {
  const result = queue.then(job, job);
  queue = result.catch(() => {});
  return result;
}

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
  const speed = o.speed && o.speed !== 1 ? `setpts=PTS/${o.speed},` : ""; // before fps: it picks frames on the new timeline
  const filter =
    `${crop}${speed}fps=${clampFps(o.fps)},scale=${o.width}:-1:flags=lanczos,showinfo=checksum=0,split[s0][s1];` +
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

/** How long the GIF plays: the trim, sped up or slowed down. */
export const gifDuration = (o: Pick<GifOptions, "start" | "end" | "speed">) => (o.end - o.start) / (o.speed ?? 1);

export function frameCount(o: Pick<GifOptions, "start" | "end" | "fps" | "speed">) {
  return Math.max(1, Math.ceil(gifDuration(o) * clampFps(o.fps)));
}

export function convertToGif(ffmpeg: FFmpegLike, file: File, options: GifOptions, onProgress?: (fraction: number) => void) {
  return exclusive(() => convert(ffmpeg, file, options, onProgress));
}

async function convert(ffmpeg: FFmpegLike, file: File, options: GifOptions, onProgress?: (fraction: number) => void): Promise<Uint8Array> {
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

/** A GIF's bytes split up: everything before the first frame, and each frame (with its extensions). */
export function gifParts(gif: Uint8Array): { header: number; frames: number[] } {
  const colorTable = (flags: number) => (flags & 0x80 ? 3 * (2 << (flags & 7)) : 0);
  let i = 13 + colorTable(gif[10]);
  const header = i;
  const frames: number[] = [];
  let frameStart = i;
  while (i < gif.length && gif[i] !== 0x3b) {
    const isImage = gif[i] === 0x2c;
    i += isImage ? 10 + colorTable(gif[i + 9]) + 1 : 2; // image: descriptor, colors, LZW code size; extension: label
    while (i < gif.length && gif[i] !== 0) i += gif[i] + 1; // data sub-blocks
    i++;
    if (isImage) {
      frames.push(i - frameStart);
      frameStart = i;
    }
  }
  return { header, frames };
}

export const SAMPLE_FRAMES = 5;
const sum = (xs: number[]) => xs.reduce((a, b) => a + b, 0);

/**
 * The GIF's size without converting all of it: converts three short samples (start, middle and end
 * of the trim) and scales up. A GIF's first frame is a whole picture, the others mostly only
 * what changed, so those are counted apart. Exact for clips of up to 3 samples' length.
 */
export function estimateGifBytes(ffmpeg: FFmpegLike, file: File, o: GifOptions, stopped = () => false): Promise<number | null> {
  return exclusive(() =>
    withMountedFile(ffmpeg, file, async (input) => {
      const total = frameCount(o);
      const whole = total <= SAMPLE_FRAMES * 3;
      const span = ((SAMPLE_FRAMES / clampFps(o.fps)) * (o.speed ?? 1)) * 0.999; // seconds of video per sample
      const starts = whole ? [o.start] : [0, 0.5, 1].map((k) => o.start + (o.end - o.start - span) * k);
      const output = `sample${++mountCount}.gif`;
      const samples = [];
      try {
        for (const start of starts) {
          if (stopped()) return null;
          const code = await ffmpeg.exec(gifArgs(input, output, { ...o, start, end: whole ? o.end : start + span }));
          const gif = await ffmpeg.readFile(output);
          if (code !== 0 || !(gif instanceof Uint8Array)) throw new Error(`FFmpeg failed (exit code ${code})`);
          if (whole) return gif.byteLength;
          samples.push(gifParts(gif));
        }
      } finally {
        await ffmpeg.deleteFile(output).catch(() => {});
      }
      const later = samples.flatMap((s) => s.frames.slice(1));
      const average = (xs: number[]) => sum(xs) / Math.max(1, xs.length);
      const first = average(samples.map((s) => s.header + s.frames[0]));
      return Math.round(first + average(later) * (total - 1) + 1); // + the trailer byte
    })
  );
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
