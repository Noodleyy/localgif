import type { NextConfig } from "next";

// Built as a static site (plain HTML/CSS/JS in out/) so it can be hosted on GitHub Pages.
//
// BASE_PATH is the sub-path the site is served from: "/<repo>" for a project site at
// https://<user>.github.io/<repo>/, empty for a user site or a custom domain. The deploy
// workflow sets it (.github/workflows/deploy.yml); locally it's empty.
//
// No COOP/COEP headers: static hosts like GitHub Pages can't send custom headers, and
// they're only needed by the multi-threaded ffmpeg core — we use the single-threaded one.
const basePath = process.env.BASE_PATH ?? "";

const nextConfig: NextConfig = {
  output: "export",
  basePath,
  trailingSlash: true, // /mp4togif/ -> /mp4togif/index.html, which is what Pages serves
  images: { unoptimized: true }, // no image server on a static host
  env: { NEXT_PUBLIC_BASE_PATH: basePath }, // for URLs built in client code (the ffmpeg worker)
};

export default nextConfig;
