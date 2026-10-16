// The MP4 -> GIF core. Plain functions, no React, so it can be tested in Node
// against the same ffmpeg.wasm build the browser uses (see tests/).

export const DEFAULT_FPS = 30;
export const MIN_COLORS = 4; // ffmpeg's palettegen fails below 4
export const MAX_COLORS = 256;
// GIF frame delays are whole 1/100 s. Above 50 fps they'd round down to 1/100 s,
// which browsers treat as "too fast" and replace with 1/10 s — the GIF plays slowly.
export const MAX_GIF_FPS = 50;

/** The subset of @ffmpeg/ffmpeg's FFmpeg class this module needs. */
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
  start: number; // seconds
  end: number; // seconds
  fps: number;
  colors: number; // clamped to MIN_COLORS..MAX_COLORS
  width: number; // px; height keeps the aspect ratio
};

export function fileExtension(fileName: string): string {
  const match = /\.([a-z0-9]+)$/i.exec(fileName);
  return match ? match[1].toLowerCase() : "mp4";
}

let mountCount = 0;

/**
 * Lets ffmpeg read `file` straight from disk, a chunk at a time (WORKERFS), instead
 * of copying the whole video into memory first. Each call gets its own folder, so
 * two files probed/converted at the same time can't collide.
 */
async function withMountedFile<T>(ffmpeg: FFmpegLike, file: File, read: (path: string) => Promise<T>): Promise<T> {
  const dir = `/input${++mountCount}`;
  const name = `video.${fileExtension(file.name)}`; // our own name: ffmpeg misreads some (e.g. "a:b.mp4")
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

// A showinfo filter before the palette step and one after it each log a line per
// frame ("[Parsed_showinfo_2 @ 0x…] n:  12 pts: …"). That's the only per-frame signal:
// ffmpeg's own progress only moves once palettegen has seen every frame.
const FRAME_LOG = /\bn:\s*\d+\s+pts:/;

export function gifArgs(input: string, output: string, o: GifOptions): string[] {
  const colors = Math.min(Math.max(Math.round(o.colors), MIN_COLORS), MAX_COLORS);
  const fps = Math.min(Math.max(o.fps, 1), MAX_GIF_FPS);
  const filter =
    `fps=${fps},scale=${o.width}:-1:flags=lanczos,showinfo=checksum=0,split[s0][s1];` +
    `[s0]palettegen=max_colors=${colors}[p];[s1][p]paletteuse,showinfo=checksum=0`;
  return [
    // explicit: the log level is global in ffmpeg.wasm, so an earlier `ffprobe -v error`
    // would otherwise silence the per-frame lines that drive the progress bar
    "-loglevel", "info",
    "-ss", String(o.start),
    "-t", String(o.end - o.start),
    "-i", input,
    "-vf", filter,
    "-loop", "0",
    output,
  ];
}

/** Number of GIF frames a selection produces (roughly; ffmpeg may add one). */
export function frameCount(o: Pick<GifOptions, "start" | "end" | "fps">) {
  return Math.max(1, Math.ceil((o.end - o.start) * Math.min(o.fps, MAX_GIF_FPS)));
}

export async function convertToGif(
  ffmpeg: FFmpegLike,
  file: File,
  options: GifOptions,
  onProgress?: (fraction: number) => void
): Promise<Uint8Array> {
  if (!(options.end > options.start)) throw new Error("End time must be after start time");

  const output = "output.gif";
  const totalSteps = frameCount(options) * 2; // each frame passes both showinfo filters
  let steps = 0;
  const logs: string[] = [];
  const onLog = ({ message }: { message: string }) => {
    if (FRAME_LOG.test(message)) {
      onProgress?.(Math.min(++steps / totalSteps, 0.99));
      return;
    }
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
    await ffmpeg.deleteFile(output).catch(() => {}); // free the memory it used
  }
}

/** Parses ffprobe's r_frame_rate, e.g. "30000/1001" or "25". */
export function parseFrameRate(text: string): number {
  const [num, den = 1] = text.trim().split("/").map(Number);
  const fps = num / den;
  return Number.isFinite(fps) && fps > 0 ? fps : DEFAULT_FPS;
}

export type VideoInfo = {
  fps: number;
  width: number;
  height: number;
  duration: number | null; // null when the file doesn't say (e.g. live-recorded WebM)
};

/**
 * Reads frame rate, size and duration with ffprobe. Works for formats the
 * browser can't preview (HEVC, AVI, MKV…), so those can still be converted.
 * Throws if the file has no readable video stream.
 */
export async function probeVideo(ffmpeg: FFmpegLike, file: File): Promise<VideoInfo> {
  const output = `probe${++mountCount}.json`; // unique, like the mount folder
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

/** Highest GIF fps offered: never more than the source has, never more than GIFs can play. */
export function maxOutputFps(sourceFps: number | null): number {
  return sourceFps !== null ? Math.min(MAX_GIF_FPS, Math.max(1, Math.round(sourceFps))) : MAX_GIF_FPS;
}

// ---------------------------------------------------------------------------
// Out-of-memory risk estimate.
//
// ffmpeg.wasm's memory is capped at 2 GiB (ffmpeg-core 0.12.10's wasm maximum);
// going over it is what fails a conversion. The numbers below were fitted to the
// peak memory of real conversions, and tests/memory.test.ts re-checks them.
//
// What it isn't: the input file. ffmpeg reads it from disk a chunk at a time
// (see withMountedFile), so even a huge file costs no extra memory.
//
// What it is: palettegen needs to see *every* frame before paletteuse can start,
// so every output frame is held in memory (RGBA, 4 bytes/pixel) until the end.
// Memory therefore grows with  output frames x output width x output height.
// ---------------------------------------------------------------------------
const MB = 1024 * 1024;
const MEMORY_LIMIT_MB = 2048;
const ENGINE_BASE_MB = 32; // memory in use right after ffmpeg.wasm loads
const DECODER_FRAMES = 4; // source frames the decoder keeps around (YUV 4:2:0 = 1.5 bytes/pixel)
const BUFFERED_FRAME_OVERHEAD = 1.1; // measured: allocator/alignment overhead on each 4-byte/pixel frame
const PER_FRAME_MB = 0.1; // measured: fixed cost per buffered frame
const HIGH = 0.9; // ±10% model error + heap growing in steps -> above this, expect failure
const MODERATE = 0.75;

export type ConversionRisk = {
  clipDuration: number;
  estimatedMB: number;
  limitMB: number;
  maxSeconds: number; // longest selection that stays under the "high" line at these settings
  level: "none" | "moderate" | "high";
};

export function estimateConversionRisk(p: {
  clipDuration: number;
  sourceWidth: number;
  sourceHeight: number;
  outputFps: number;
  outputWidth: number;
  outputHeight: number;
}): ConversionRisk {
  const clipDuration = Math.max(0, p.clipDuration);
  const fixedMB = ENGINE_BASE_MB + (p.sourceWidth * p.sourceHeight * 1.5 * DECODER_FRAMES) / MB;
  const frameMB = (p.outputWidth * p.outputHeight * 4 * BUFFERED_FRAME_OVERHEAD) / MB + PER_FRAME_MB;
  const frames = Math.ceil(clipDuration * p.outputFps);

  const estimatedMB = fixedMB + frames * frameMB;
  const ratio = estimatedMB / MEMORY_LIMIT_MB;

  return {
    clipDuration,
    estimatedMB,
    limitMB: MEMORY_LIMIT_MB,
    maxSeconds: Math.max(0, (HIGH * MEMORY_LIMIT_MB - fixedMB) / frameMB / p.outputFps),
    level: ratio >= HIGH ? "high" : ratio >= MODERATE ? "moderate" : "none",
  };
}
