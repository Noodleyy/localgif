import { FFmpeg } from "@ffmpeg/ffmpeg";

// Everything is served by this site itself (no CDN), under the base path when hosted
// at /<repo>/ on GitHub Pages:
//  - the converter (single-threaded @ffmpeg/core, copied in by scripts/copy-ffmpeg-core.mjs).
//    Its wasm memory can grow to 2 GiB; the multithreaded core-mt build has a *fixed*
//    1 GiB and runs out ("Aborted(OOM)") on larger clips.
//  - our copy of the library's worker in public/ffmpeg (bundlers mangle the original).
const FFMPEG_DIR = `${process.env.NEXT_PUBLIC_BASE_PATH ?? ""}/ffmpeg`;
// Size of ffmpeg-core.wasm, read at build time (next.config.ts), so the download can
// show a percentage even when the server compresses it. 0 if unknown.
const WASM_BYTES = Number(process.env.NEXT_PUBLIC_FFMPEG_WASM_BYTES) || 0;

let instance: Promise<FFmpeg> | null = null;
const loadListeners = new Set<(fraction: number | null) => void>();

/**
 * Follows the converter's download: called with 0..1 while it downloads and with
 * null once it's ready (or failed). Returns an unsubscribe function.
 */
export function onConverterLoad(listener: (fraction: number | null) => void) {
  loadListeners.add(listener);
  return () => void loadListeners.delete(listener);
}

const emitLoad = (fraction: number | null) => loadListeners.forEach((listener) => listener(fraction));

/** Downloads `url` into a Blob, reporting progress against `expectedBytes` (skipped if 0). */
export async function fetchWithProgress(
  url: string,
  expectedBytes: number,
  onProgress: (fraction: number) => void,
  type = ""
): Promise<Blob> {
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
  return new Blob(chunks, { type: type || (res.headers.get("content-type") ?? "") });
}

/** Loads ffmpeg.wasm once and reuses it. */
export function getFFmpeg(): Promise<FFmpeg> {
  instance ??= (async () => {
    emitLoad(0);
    const base = `${window.location.origin}${FFMPEG_DIR}`;
    // fetched here (not by the worker) only so we can show how far the ~31 MB download is
    const wasm = await fetchWithProgress(`${base}/core/ffmpeg-core.wasm`, WASM_BYTES, emitLoad, "application/wasm");
    const wasmURL = URL.createObjectURL(wasm);
    try {
      const ffmpeg = new FFmpeg();
      await ffmpeg.load({
        classWorkerURL: `${base}/worker.js`,
        coreURL: `${base}/core/ffmpeg-core.js`,
        wasmURL,
      });
      return ffmpeg;
    } finally {
      URL.revokeObjectURL(wasmURL);
    }
  })()
    .catch((err) => {
      instance = null;
      console.error(err);
      throw new Error(
        "Couldn't load the video converter (ffmpeg.wasm, ~30 MB). Check your internet connection and try again."
      );
    })
    .finally(() => emitLoad(null));
  return instance;
}

/** Kills the worker (to cancel, or after an out-of-memory crash) so the next call starts fresh. */
export function resetFFmpeg() {
  instance?.then((ffmpeg) => ffmpeg.terminate()).catch(() => {});
  instance = null;
}
