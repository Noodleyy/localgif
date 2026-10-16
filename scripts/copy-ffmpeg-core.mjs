// Copies the ffmpeg.wasm core (the actual converter, ~31 MB) from node_modules into
// public/ffmpeg/core/, so the site serves it itself instead of loading it from a CDN.
// Runs automatically before `npm run dev` and `npm run build` (see package.json).
// The copy is git-ignored; node_modules/@ffmpeg/core is the single source of truth,
// and it's the exact same build the tests run against.
import { copyFileSync, existsSync, mkdirSync, readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

// The package doesn't export its package.json, so find its folder via its main file
// (<package>/dist/umd/ffmpeg-core.js).
const pkgDir = join(dirname(createRequire(import.meta.url).resolve("@ffmpeg/core")), "..", "..");
const { version } = JSON.parse(readFileSync(join(pkgDir, "package.json"), "utf8"));
const from = join(pkgDir, "dist", "esm");
const to = join(dirname(fileURLToPath(import.meta.url)), "..", "public", "ffmpeg", "core");

mkdirSync(to, { recursive: true });
let copied = 0;
for (const file of ["ffmpeg-core.js", "ffmpeg-core.wasm"]) {
  const src = join(from, file);
  const dest = join(to, file);
  // Skip files that are already up to date. Besides saving time, this matters on Windows:
  // there a file that's in use (e.g. served by a dev server that's still running) can't be
  // overwritten, and a failing copy would stop `npm run dev` from starting.
  if (existsSync(dest) && readFileSync(dest).equals(readFileSync(src))) continue;
  try {
    copyFileSync(src, dest);
    copied++;
  } catch (err) {
    if (!existsSync(dest)) throw err; // no converter at all: the app can't work
    console.warn(`Couldn't update public/ffmpeg/core/${file} (${err.code}); keeping the existing copy.`);
  }
}
console.log(`ffmpeg core ${version} -> public/ffmpeg/core/ (${copied ? `${copied} file(s) copied` : "already up to date"})`);
