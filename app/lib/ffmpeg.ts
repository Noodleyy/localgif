import type { FFmpeg } from "@ffmpeg/ffmpeg";

// Served by the site itself (copied by scripts/copy-ffmpeg.mjs), the library included: it's loaded
// at runtime, not bundled (see the script for why). The single-threaded core: its memory can grow
// to 2 GiB, the multithreaded one is fixed at 1 GiB and needs COOP/COEP headers, which GitHub Pages
// can't send.
const FFMPEG_DIR = `${process.env.NEXT_PUBLIC_BASE_PATH ?? ""}/ffmpeg`;
const WASM_BYTES = Number(process.env.NEXT_PUBLIC_FFMPEG_WASM_BYTES) || 0;

let loadListener: ((fraction: number | null) => void) | null = null;

/** Called with 0..1 while the converter downloads, and null when it's ready or failed. */
export function onConverterLoad(listener: (fraction: number | null) => void) {
  loadListener = listener;
  return () => void (loadListener = null);
}

const emitLoad = (fraction: number | null) => loadListener?.(fraction);

export async function fetchWithProgress(url: string, expectedBytes: number, onProgress: (fraction: number) => void, type = "") {
  const res = await fetch(url);
  if (!res.ok || !res.body) throw new Error(`HTTP ${res.status} for ${url}`);
  const reader = res.body.getReader();
  const chunks: Uint8Array<ArrayBuffer>[] = [];
  let received = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    chunks.push(value);
    received += value.byteLength;
    if (expectedBytes > 0) onProgress(Math.min(received / expectedBytes, 1));
  }
  return new Blob(chunks, { type });
}

let wasmFile: Promise<Blob> | null = null; // downloaded once, for both workers

async function load(): Promise<FFmpeg> {
  const base = `${window.location.origin}${FFMPEG_DIR}`;
  try {
    if (!wasmFile) {
      emitLoad(0);
      // fetched here rather than by the worker, to show the download's progress
      wasmFile = fetchWithProgress(`${base}/core/ffmpeg-core.wasm`, WASM_BYTES, emitLoad, "application/wasm")
        .catch((err) => {
          wasmFile = null;
          throw err;
        })
        .finally(() => emitLoad(null));
    }
    const wasmURL = URL.createObjectURL(await wasmFile);
    try {
      const { FFmpeg }: typeof import("@ffmpeg/ffmpeg") = await import(/* webpackIgnore: true */ `${base}/classes.js`);
      const ffmpeg = new FFmpeg();
      await ffmpeg.load({ classWorkerURL: `${base}/worker.js`, coreURL: `${base}/core/ffmpeg-core.js`, wasmURL });
      return ffmpeg;
    } finally {
      URL.revokeObjectURL(wasmURL);
    }
  } catch (err) {
    console.error(err);
    throw new Error("Couldn't load the video converter (ffmpeg.wasm, ~30 MB). Check your internet connection and try again.");
  }
}

/** An ffmpeg.wasm worker, loaded on first use and then reused. */
function worker() {
  let instance: Promise<FFmpeg> | null = null;
  return {
    get: () =>
      (instance ??= load().catch((err) => {
        instance = null;
        throw err;
      })),
    /** Kills the worker (to stop it, or after a crash); the next get() starts a fresh one. */
    reset() {
      instance?.then((ffmpeg) => ffmpeg.terminate()).catch(() => {});
      instance = null;
    },
  };
}

const converter = worker();
// The size estimate has its own: a conversion never waits for it, and it can be stopped at once.
const estimator = worker();

export const { get: getFFmpeg, reset: resetFFmpeg } = converter;
export const { get: getEstimator, reset: resetEstimator } = estimator;
