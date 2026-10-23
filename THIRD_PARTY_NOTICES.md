# Third-party software

localgif is free software under the GNU General Public License v3.0 or later
(see `LICENSE`). The deployed site includes the following third-party software.

## FFmpeg, via ffmpeg.wasm (`@ffmpeg/core` 0.12.10) — GPL-2.0-or-later

The actual converter: FFmpeg 5.1.4 compiled to WebAssembly by the ffmpeg.wasm project.
It is served from this site (`public/ffmpeg/core/`, copied from `node_modules` at build
time) and runs entirely in the visitor's browser.

This build enables GPL components (`--enable-gpl`, with libx264 and libx265), so the
binary as a whole is licensed under the **GNU GPL version 2 or later**. It also bundles
libvpx, libmp3lame, libtheora, libvorbis, libopus, zlib, libwebp, freetype, fribidi,
libass and zimg, each under its own license.

- FFmpeg source code: https://ffmpeg.org/download.html (version 5.1.4)
- ffmpeg.wasm source code and build scripts (including how the libraries above are
  compiled in): https://github.com/ffmpegwasm/ffmpeg.wasm (`@ffmpeg/core` 0.12.10)
- GPL-2.0 text: https://www.gnu.org/licenses/old-licenses/gpl-2.0.html

## ffmpeg.wasm JavaScript API (`@ffmpeg/ffmpeg` 0.12.15) — MIT

Bundled into the site; its web worker (`worker.js`, `const.js`, `errors.js`) is copied
into `public/ffmpeg/` at build time.
Author: Jerome Wu. Source: https://github.com/ffmpegwasm/ffmpeg.wasm

## Bundled JavaScript libraries — MIT

- Next.js 16.3.8 — Copyright (c) 2025 Vercel, Inc.
- React 19.2.4 / React DOM — Copyright (c) Meta Platforms, Inc. and affiliates.
- Framer Motion 13.0.0 — Copyright (c) 2018 Framer B.V.

Their full license texts are in each package's `LICENSE` file under `node_modules/`.
