import { FFmpeg } from "@ffmpeg/ffmpeg";
import { toBlobURL } from "@ffmpeg/util";

// Single-threaded core: its wasm memory can grow up to 2 GiB. The multithreaded
// core-mt build uses a *fixed* 1 GiB shared memory, which runs out ("Aborted(OOM)")
// on larger clips. tests/ pin the same version via the @ffmpeg/core devDependency.
const CORE_URL = "https://unpkg.com/@ffmpeg/core@0.12.10/dist/esm";

let instance: Promise<FFmpeg> | null = null;

/** Loads ffmpeg.wasm once and reuses it. */
export function getFFmpeg(): Promise<FFmpeg> {
  instance ??= (async () => {
    const ffmpeg = new FFmpeg();
    await ffmpeg.load({
      // Our copy of the library's worker in public/ffmpeg (bundlers mangle the original).
      // (includes the base path, so it also works when hosted under /<repo>/ on GitHub Pages)
      classWorkerURL: `${window.location.origin}${process.env.NEXT_PUBLIC_BASE_PATH ?? ""}/ffmpeg/worker.js`,
      coreURL: await toBlobURL(`${CORE_URL}/ffmpeg-core.js`, "text/javascript"),
      wasmURL: await toBlobURL(`${CORE_URL}/ffmpeg-core.wasm`, "application/wasm"),
    });
    return ffmpeg;
  })().catch((err) => {
    instance = null;
    console.error(err);
    throw new Error(
      "Couldn't download the video converter (ffmpeg.wasm, ~30 MB). Check your internet connection and try again."
    );
  });
  return instance;
}

/** Kills the worker (e.g. after an out-of-memory crash) so the next call starts fresh. */
export function resetFFmpeg() {
  instance?.then((ffmpeg) => ffmpeg.terminate()).catch(() => {});
  instance = null;
}
