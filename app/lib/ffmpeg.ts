import { FFmpeg } from "@ffmpeg/ffmpeg";

// Everything is served by this site itself (no CDN), under the base path when hosted
// at /<repo>/ on GitHub Pages:
//  - the converter (single-threaded @ffmpeg/core, copied in by scripts/copy-ffmpeg-core.mjs).
//    Its wasm memory can grow to 2 GiB; the multithreaded core-mt build has a *fixed*
//    1 GiB and runs out ("Aborted(OOM)") on larger clips.
//  - our copy of the library's worker in public/ffmpeg (bundlers mangle the original).
const FFMPEG_DIR = `${process.env.NEXT_PUBLIC_BASE_PATH ?? ""}/ffmpeg`;

let instance: Promise<FFmpeg> | null = null;

/** Loads ffmpeg.wasm once and reuses it. */
export function getFFmpeg(): Promise<FFmpeg> {
  instance ??= (async () => {
    const ffmpeg = new FFmpeg();
    await ffmpeg.load({
      classWorkerURL: `${window.location.origin}${FFMPEG_DIR}/worker.js`,
      coreURL: `${window.location.origin}${FFMPEG_DIR}/core/ffmpeg-core.js`,
      wasmURL: `${window.location.origin}${FFMPEG_DIR}/core/ffmpeg-core.wasm`,
    });
    return ffmpeg;
  })().catch((err) => {
    instance = null;
    console.error(err);
    throw new Error(
      "Couldn't load the video converter (ffmpeg.wasm, ~30 MB). Check your internet connection and try again."
    );
  });
  return instance;
}

/** Kills the worker (e.g. after an out-of-memory crash) so the next call starts fresh. */
export function resetFFmpeg() {
  instance?.then((ffmpeg) => ffmpeg.terminate()).catch(() => {});
  instance = null;
}
