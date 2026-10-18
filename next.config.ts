import type { NextConfig } from "next";
import { statSync } from "node:fs";

// A static site for GitHub Pages. BASE_PATH is "/<repo>" there (set by the deploy workflow).
const basePath = process.env.BASE_PATH ?? "";
// copied in by scripts/copy-ffmpeg-core.mjs before every dev/build; used for the download percentage
const wasmBytes = statSync("public/ffmpeg/core/ffmpeg-core.wasm", { throwIfNoEntry: false })?.size ?? 0;

const nextConfig: NextConfig = {
  output: "export",
  basePath,
  trailingSlash: true, // Pages serves /<repo>/ from /<repo>/index.html
  env: {
    NEXT_PUBLIC_BASE_PATH: basePath,
    NEXT_PUBLIC_REPO_URL: process.env.REPO_URL ?? "",
    NEXT_PUBLIC_FFMPEG_WASM_BYTES: String(wasmBytes),
  },
};

export default nextConfig;
