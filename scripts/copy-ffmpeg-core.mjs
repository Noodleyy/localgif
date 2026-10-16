// Copies the ffmpeg.wasm core (the actual converter, ~31 MB) from node_modules into
// public/ffmpeg/core/, so the site serves it itself instead of loading it from a CDN.
// Runs automatically before `npm run dev` and `npm run build` (see package.json).
// The copy is git-ignored; node_modules/@ffmpeg/core is the single source of truth,
// and it's the exact same build the tests run against.
import { copyFileSync, mkdirSync, readFileSync } from "node:fs";
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
for (const file of ["ffmpeg-core.js", "ffmpeg-core.wasm"]) copyFileSync(join(from, file), join(to, file));
console.log(`ffmpeg core ${version} -> public/ffmpeg/core/`);
