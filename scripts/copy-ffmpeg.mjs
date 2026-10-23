// Copies the converter into public/ffmpeg/, so the site serves it itself. Runs before `npm run dev` and `npm run build`.
// - core/: @ffmpeg/core (~31 MB), the ffmpeg build itself
// - the web worker of @ffmpeg/ffmpeg, because bundlers break its import of the core
import { copyFileSync, existsSync, mkdirSync, readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const require = createRequire(import.meta.url);
const coreDir = join(dirname(require.resolve("@ffmpeg/core")), "..", "esm"); // main is dist/umd/ffmpeg-core.js
const workerDir = dirname(require.resolve("@ffmpeg/ffmpeg/worker"));
const to = join(dirname(fileURLToPath(import.meta.url)), "..", "public", "ffmpeg");

const files = [
  ...["ffmpeg-core.js", "ffmpeg-core.wasm"].map((f) => [join(coreDir, f), join(to, "core", f)]),
  ...["worker.js", "const.js", "errors.js"].map((f) => [join(workerDir, f), join(to, f)]),
];

mkdirSync(join(to, "core"), { recursive: true });
let copied = 0;
for (const [src, dest] of files) {
  // On Windows a file in use (by a running dev server) can't be overwritten: skip copies
  // that are already up to date, and keep the old one if the copy fails.
  if (existsSync(dest) && readFileSync(dest).equals(readFileSync(src))) continue;
  try {
    copyFileSync(src, dest);
    copied++;
  } catch (err) {
    if (!existsSync(dest)) throw err;
    console.warn(`Couldn't update ${dest} (${err.code}); keeping the existing copy.`);
  }
}
console.log(`ffmpeg -> public/ffmpeg/ (${copied ? `${copied} file(s) copied` : "already up to date"})`);
