// Copies the converter (@ffmpeg/core, ~31 MB) into public/, so the site serves it itself.
// Runs before `npm run dev` and `npm run build`.
import { copyFileSync, existsSync, mkdirSync, readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

// the package doesn't export its package.json; its main file is <package>/dist/umd/ffmpeg-core.js
const pkgDir = join(dirname(createRequire(import.meta.url).resolve("@ffmpeg/core")), "..", "..");
const { version } = JSON.parse(readFileSync(join(pkgDir, "package.json"), "utf8"));
const from = join(pkgDir, "dist", "esm");
const to = join(dirname(fileURLToPath(import.meta.url)), "..", "public", "ffmpeg", "core");

mkdirSync(to, { recursive: true });
let copied = 0;
for (const file of ["ffmpeg-core.js", "ffmpeg-core.wasm"]) {
  const src = join(from, file);
  const dest = join(to, file);
  // On Windows a file in use (by a running dev server) can't be overwritten: skip copies
  // that are already up to date, and keep the old one if the copy fails.
  if (existsSync(dest) && readFileSync(dest).equals(readFileSync(src))) continue;
  try {
    copyFileSync(src, dest);
    copied++;
  } catch (err) {
    if (!existsSync(dest)) throw err;
    console.warn(`Couldn't update public/ffmpeg/core/${file} (${err.code}); keeping the existing copy.`);
  }
}
console.log(`ffmpeg core ${version} -> public/ffmpeg/core/ (${copied ? `${copied} file(s) copied` : "already up to date"})`);
