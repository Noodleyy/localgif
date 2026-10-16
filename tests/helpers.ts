// Test helpers: run the *same* ffmpeg.wasm core the browser loads (@ffmpeg/core,
// pinned to the version in app/lib/ffmpeg.ts) inside Node, and parse GIF output.
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import type { FFmpegLike } from "../app/lib/gif";

const require = createRequire(import.meta.url);

type Core = {
  exec(...args: string[]): number;
  ffprobe(...args: string[]): number;
  reset(): void;
  ret: number;
  HEAPU8: Uint8Array; // the wasm memory; its size only ever grows, so it shows the peak
  setLogger(cb: (log: { type: string; message: string }) => void): void;
  FS: {
    writeFile(path: string, data: Uint8Array): void;
    readFile(path: string, opts?: { encoding?: string }): Uint8Array | string;
    unlink(path: string): void;
    readdir(path: string): string[];
    mkdir(path: string): void;
    rmdir(path: string): void;
    mount(type: unknown, opts: unknown, mountPoint: string): void;
    unmount(mountPoint: string): void;
    filesystems: Record<string, unknown>;
  };
};

/** Loads a fresh ffmpeg.wasm instance (same 2 GiB heap limit as in the browser). */
export type { Core };
export async function loadCore(): Promise<Core> {
  // The core is built for web workers; give it the bits of `self` it expects.
  (globalThis as { self?: unknown }).self ??= { location: { href: "file:///" } };
  const createCore = require("@ffmpeg/core");
  const wasmBinary = readFileSync(require.resolve("@ffmpeg/core/wasm"));
  return createCore({ wasmBinary });
}

/** Wraps the raw core in the same async API that @ffmpeg/ffmpeg's FFmpeg class exposes. */
export function asFFmpeg(core: Core): FFmpegLike & { files(): string[] } {
  const listeners = new Set<(e: { message: string }) => void>();
  core.setLogger(({ message }) => listeners.forEach((l) => l({ message })));
  const run = (fn: () => number) => {
    try {
      fn();
      return core.ret;
    } finally {
      core.reset();
    }
  };
  return {
    readFile: async (path, encoding) => core.FS.readFile(path, { encoding: encoding ?? "binary" }),
    deleteFile: async (path) => core.FS.unlink(path),
    createDir: async (path) => core.FS.mkdir(path),
    deleteDir: async (path) => core.FS.rmdir(path),
    // Uses emscripten's real WORKERFS, exactly like the browser. Only the byte source
    // differs: browsers read File slices with FileReaderSync (worker-only), so we hand
    // WORKERFS blobs whose slices are already in memory.
    mount: async (fsType, { blobs }, mountPoint) => {
      const inMemory = await Promise.all(
        blobs.map(async ({ name, data }) => ({ name, data: syncBlob(new Uint8Array(await data.arrayBuffer())) }))
      );
      core.FS.mount(core.FS.filesystems[fsType], { blobs: inMemory }, mountPoint);
    },
    unmount: async (mountPoint) => core.FS.unmount(mountPoint),
    exec: async (args) => run(() => core.exec(...args)),
    ffprobe: async (args) => run(() => core.ffprobe(...args)),
    on: (_event, cb) => listeners.add(cb),
    off: (_event, cb) => listeners.delete(cb),
    files: () => core.FS.readdir("/").filter((f) => !/^(\.|\.\.|tmp|home|dev|proc)$/.test(f)),
  };
}

// Minimal stand-in for what WORKERFS needs from a Blob + FileReaderSync.
type SyncSlice = { bytes: Uint8Array; size: number };
function syncBlob(bytes: Uint8Array) {
  (globalThis as { FileReaderSync?: unknown }).FileReaderSync ??= class {
    readAsArrayBuffer(slice: SyncSlice) {
      return slice.bytes;
    }
  };
  return { size: bytes.length, slice: (start: number, end: number): SyncSlice => {
      const part = bytes.subarray(start, end);
      return { bytes: part, size: part.length };
    },
  };
}

/** Builds a test video with ffmpeg's built-in test sources. Returns it as a browser-like File. */
export async function makeVideo(core: Core, name: string, ffmpegArgs: string[]): Promise<File> {
  core.setLogger(() => {});
  core.exec(...ffmpegArgs, name);
  const code = core.ret;
  core.reset();
  if (code !== 0) throw new Error(`fixture ${name} failed (exit ${code})`);
  const bytes = core.FS.readFile(name) as Uint8Array;
  core.FS.unlink(name);
  return new File([bytes as Uint8Array<ArrayBuffer>], name, { type: "video/mp4" });
}

export type GifInfo = {
  width: number;
  height: number;
  frames: number;
  durationSec: number; // sum of frame delays
  minDelayCs: number; // shortest frame delay, in 1/100 s
  loopsForever: boolean;
  maxColors: number; // most distinct colors in any color table (ffmpeg pads tables to 256 slots)
  palette: { r: number; g: number; b: number }[]; // every color used in any table
};

/** Minimal GIF89a block walker — enough to check what we produce. */
export function parseGif(bytes: Uint8Array): GifInfo {
  const header = new TextDecoder().decode(bytes.subarray(0, 6));
  if (header !== "GIF89a" && header !== "GIF87a") throw new Error(`not a GIF (header "${header}")`);

  const u16 = (i: number) => bytes[i] | (bytes[i + 1] << 8);
  const tableSize = (packed: number) => (packed & 0x80 ? 2 ** ((packed & 7) + 1) : 0);
  const info: GifInfo = { width: u16(6), height: u16(8), frames: 0, durationSec: 0, minDelayCs: Infinity, loopsForever: false, maxColors: 0, palette: [] };
  const allColors = new Set<number>();

  // Collects the distinct RGB entries of the color table at `pos`, then skips past it.
  const readTable = (size: number) => {
    const colors = new Set<number>();
    for (let i = 0; i < size; i++, pos += 3) colors.add((bytes[pos] << 16) | (bytes[pos + 1] << 8) | bytes[pos + 2]);
    info.maxColors = Math.max(info.maxColors, colors.size);
    colors.forEach((c) => allColors.add(c));
    info.palette = [...allColors].map((c) => ({ r: c >> 16, g: (c >> 8) & 255, b: c & 255 }));
  };

  let pos = 13;
  readTable(tableSize(bytes[10]));

  const skipSubBlocks = () => {
    while (bytes[pos] !== 0) pos += bytes[pos] + 1;
    pos += 1;
  };

  while (pos < bytes.length) {
    const block = bytes[pos++];
    if (block === 0x3b) return info; // trailer
    if (block === 0x21) {
      const label = bytes[pos++];
      if (label === 0xf9) {
        // graphic control extension: frame delay in 1/100 s
        info.durationSec += u16(pos + 2) / 100;
        info.minDelayCs = Math.min(info.minDelayCs, u16(pos + 2));
      }
      if (label === 0xff && new TextDecoder().decode(bytes.subarray(pos + 1, pos + 12)) === "NETSCAPE2.0") {
        info.loopsForever = u16(pos + 12 + 2) === 0; // loop count 0 = forever
      }
      skipSubBlocks();
    } else if (block === 0x2c) {
      info.frames += 1;
      const localTable = tableSize(bytes[pos + 8]);
      pos += 9; // image descriptor
      readTable(localTable);
      pos += 1; // LZW minimum code size
      skipSubBlocks();
    } else {
      throw new Error(`corrupt GIF: unexpected block 0x${block.toString(16)} at ${pos - 1}`);
    }
  }
  throw new Error("corrupt GIF: missing trailer");
}
