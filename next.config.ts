import type { NextConfig } from "next";
import { statSync } from "node:fs";

// Built as a static site (plain HTML/CSS/JS in out/) so it can be hosted on GitHub Pages.
//
// BASE_PATH is the sub-path the site is served from: "/<repo>" for a project site at
// https://<user>.github.io/<repo>/, empty for a user site or a custom domain. The deploy
// workflow sets it (.github/workflows/deploy.yml); locally it's empty.
//
// No COOP/COEP headers: static hosts like GitHub Pages can't send custom headers, and
// they're only needed by the multi-threaded ffmpeg core — we use the single-threaded one.
const basePath = process.env.BASE_PATH ?? "";

// The converter's size, so the app can show download progress (0 = unknown, no percentage).
// scripts/copy-ffmpeg-core.mjs puts the file there before every dev/build.
const wasmBytes = statSync("public/ffmpeg/core/ffmpeg-core.wasm", { throwIfNoEntry: false })?.size ?? 0;

const nextConfig: NextConfig = {
  output: "export",
  basePath,
  trailingSlash: true, // /mp4togif/ -> /mp4togif/index.html, which is what Pages serves
  images: { unoptimized: true }, // no image server on a static host
  env: {
    NEXT_PUBLIC_BASE_PATH: basePath, // for URLs built in client code (the ffmpeg files)
    // link to the source code in the footer (GPL); the deploy workflow sets REPO_URL
    NEXT_PUBLIC_REPO_URL: process.env.REPO_URL ?? "",
    NEXT_PUBLIC_FFMPEG_WASM_BYTES: String(wasmBytes),
  },
};

export default nextConfig;
