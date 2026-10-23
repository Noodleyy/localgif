import { FFmpeg } from "@ffmpeg/ffmpeg";

// Served by the site itself (copied by scripts/copy-ffmpeg.mjs), the worker included because
// bundlers break its import. The single-threaded core: its memory can grow to 2 GiB, the
// multithreaded one is fixed at 1 GiB and needs COOP/COEP headers, which GitHub Pages can't send.
const FFMPEG_DIR = `${process.env.NEXT_PUBLIC_BASE_PATH ?? ""}/ffmpeg`;
const WASM_BYTES = Number(process.env.NEXT_PUBLIC_FFMPEG_WASM_BYTES) || 0;

let instance: Promise<FFmpeg> | null = null;
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

/** Loads ffmpeg.wasm once and reuses it. */
export function getFFmpeg(): Promise<FFmpeg> {
  instance ??= (async () => {
    emitLoad(0);
    const base = `${window.location.origin}${FFMPEG_DIR}`;
    // fetched here rather than by the worker, to show the download's progress
    const wasm = await fetchWithProgress(`${base}/core/ffmpeg-core.wasm`, WASM_BYTES, emitLoad, "application/wasm");
    const wasmURL = URL.createObjectURL(wasm);
    try {
      const ffmpeg = new FFmpeg();
      await ffmpeg.load({ classWorkerURL: `${base}/worker.js`, coreURL: `${base}/core/ffmpeg-core.js`, wasmURL });
      return ffmpeg;
    } finally {
      URL.revokeObjectURL(wasmURL);
    }
  })()
    .catch((err) => {
      instance = null;
      console.error(err);
      throw new Error("Couldn't load the video converter (ffmpeg.wasm, ~30 MB). Check your internet connection and try again.");
    })
    .finally(() => emitLoad(null));
  return instance;
}

/** Kills the worker (to cancel, or after a crash); the next getFFmpeg() starts a fresh one. */
export function resetFFmpeg() {
  instance?.then((ffmpeg) => ffmpeg.terminate()).catch(() => {});
  instance = null;
}
