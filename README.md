# localgif

Convert a video (MP4, MOV, WebM, HEVC, AVI, MKV…) to a GIF entirely in the browser with [ffmpeg.wasm](https://github.com/ffmpegwasm/ffmpeg.wasm). Nothing is uploaded, and nothing is loaded from other sites: the converter is served by the site itself.

```bash
npm install
npm run dev     # http://localhost:3000
npm test        # conversion + memory tests (~1–2 min)
npm run build   # static site in out/
npm start       # serve out/ locally
```

## Deploying to GitHub Pages

The app builds to a plain static site (`output: "export"` in `next.config.ts`), and
`.github/workflows/deploy.yml` lints, tests, builds and publishes it.

1. Push the repo to GitHub.
2. **Settings → Pages → Build and deployment → Source: GitHub Actions** (one-time).
3. Push to `master` — or run **Deploy to GitHub Pages** by hand from the Actions tab.
   The site appears at `https://<user>.github.io/<repo>/`.

Notes:
- The workflow deploys from `master`. To deploy from another branch, change `branches:` in the
  workflow, and allow that branch under **Settings → Environments → github-pages**.
- The sub-path (`/<repo>`) is detected automatically (`actions/configure-pages`) and passed in as
  `BASE_PATH`; user sites (`<user>.github.io`) and custom domains get no sub-path. To try a
  sub-path build locally: `BASE_PATH=/<repo> npm run build`, then serve `out/` under `/<repo>/`.
- No special server headers are needed (GitHub Pages can't set them anyway): the single-threaded
  ffmpeg.wasm core doesn't need cross-origin isolation.
- Versions held back on purpose:
  - Next.js 16.3.x: from 16.4 Turbopack fails the build on the dynamic `new Worker(new URL(...))`
    inside `@ffmpeg/ffmpeg` ("Module not found: Can't resolve <dynamic>").
  - TypeScript 5.x: `typescript-eslint` doesn't support TypeScript 7 yet.
  - `@types/node` 22: matches the Node version the deploy workflow runs.
- Linting uses `typescript-eslint`, `@eslint-react` and `eslint-plugin-jsx-a11y-x` (accessibility)
  instead of `eslint-config-next`: its Next-specific rules (fonts, `next/script`, pages router)
  don't apply to this app, and it pulled in unsupported and vulnerable packages.
- The converter (`@ffmpeg/core`, ~31 MB) is copied from `node_modules` into `public/ffmpeg/core/` by
  `scripts/copy-ffmpeg-core.mjs` before every `dev`/`build`, and served by the site itself — no CDN.
  It's git-ignored; to update it, bump `@ffmpeg/core` in `package.json` (the tests use the same copy).
  Files that are already up to date are skipped (on Windows a file served by a running dev server
  can't be overwritten).

## Layout

```
app/
  lib/gif.ts         the conversion core: ffmpeg args, convertToGif, probeVideo, out-of-memory estimate
  lib/ffmpeg.ts      loads ffmpeg.wasm in the browser (once, with download progress); resets it to cancel or after a crash
  lib/settings.ts    remembers FPS and quality between visits (localStorage)
  lib/time.ts        clamp / frame-step / timecode helpers
  page.tsx           the video, trim and settings state, and the layout
  useConversion.ts   one conversion at a time: start, cancel, progress, the last GIF ("View GIF")
  components/        presentational pieces (upload box, preview, timeline, settings, result dialog, footer)
public/ffmpeg/       copy of @ffmpeg/ffmpeg's worker (bundlers break the original's worker import);
                     core/ gets the converter itself at dev/build time (git-ignored)
scripts/             copy-ffmpeg-core.mjs
.github/workflows/   deploy.yml: lint, test, build, publish to GitHub Pages
tests/
  gif.test.ts        fast unit tests for the pure helpers
  app.test.ts        remembered settings, converter download progress
  convert.test.ts    real MP4 -> GIF conversions through ffmpeg.wasm
  memory.test.ts     checks the out-of-memory estimate against ffmpeg.wasm's real memory use
  helpers.ts         runs ffmpeg.wasm in Node + a tiny GIF parser for assertions
  fixtures/          one small HEVC clip (ffmpeg.wasm can decode HEVC but not encode it)
```

## Tests

`tests/convert.test.ts` runs `convertToGif` against the **same ffmpeg.wasm build the browser downloads**
(`@ffmpeg/core` from `node_modules`, which is also what the site serves), so it has the
same 2 GiB memory limit. Test videos are generated on the fly with ffmpeg's built-in test sources:

| video | what it covers |
| --- | --- |
| tiny 64×48, 1 s | smallest case, looping, frame count |
| small 320×240, 2 s, with audio | trim range, fps, scaling up/down, color limits, audio ignored |
| red-then-blue | the trim actually exports the *selected* part |
| portrait 360×640 @ 29.97 fps | orientation, fractional fps detection |
| 60 fps | GIF frame delays never drop below 2/100 s (browsers slow those down) |
| HEVC, AVI, live-recorded WebM | formats the browser can't preview (or has no duration) still probe and convert |
| large 1080p, 5 s (~18 MB) | downscaled and full-resolution conversion |
| huge 1080p, 50 s (~180 MB) | seeking deep into a big file; repeated conversions don't leak memory |

Plus failure cases (non-video input, a trim past the end, an empty trim, recovery afterwards), odd file
names, and progress reporting. The Node tests read input through emscripten's real `WORKERFS` code, like
the browser; only the byte source differs (browsers use `FileReaderSync`, which only exists in workers).

## Progress

ffmpeg's own progress only moves after `palettegen` has seen every frame (i.e. halfway). So the filter
chain has a `showinfo` before and after the palette step; each logs one line per frame, and
`convertToGif` turns the count into a 0–1 fraction. The command sets `-loglevel info` explicitly
because the log level is global in ffmpeg.wasm and the earlier `ffprobe -v error` would silence it.

## Out-of-memory estimate

ffmpeg.wasm can use at most 2 GiB. The memory meter in the UI comes from `estimateConversionRisk`, whose
constants were fitted to the peak memory of real conversions (most within ±5%; `memory.test.ts`
re-measures some of them). What actually uses the memory:

- **Every output frame, until the end.** `palettegen` must see all frames before `paletteuse` can start,
  so each frame is kept as RGBA: about `width × height × 4.4 bytes + 0.1 MB` per frame.
  Halving the width cuts memory ~4×; halving the FPS or the trim length cuts it ~2×. Colors don't matter.
- **A small fixed part:** ~32 MB for the engine plus a few decoded source frames (~12 MB for 1080p, ~50 MB for 4K).
- **Not the input file.** ffmpeg reads it straight from disk, a chunk at a time (a `WORKERFS` mount,
  see `withMountedFile` in `app/lib/gif.ts`), so it's never copied into memory — a 264 MB file adds
  nothing, and trimming deep into a large file is free.

Where the "likely to run out" warning starts at 10 fps from a 1080p source: 480 px wide ≈ 4½ min, 1280 px ≈ 45 s, 1920 px ≈ 20 s (a real 20 s run peaked at 1.7 GB; 30 s failed).

## Responsive layout (mobile first)

Phone layout is the default; `sm:` (≥640px) and `lg:` (≥1024px) classes only add to it.

- **Phones**: one column — file bar, full-width video, Trim card, Output card — with Convert in a bar
  stuck to the bottom of the screen (thumb reach, clear of the iPhone home indicator via
  `env(safe-area-inset-bottom)`). Inputs use 16px text so iOS doesn't zoom in, buttons don't
  double-tap-zoom (`touch-action: manipulation`), and small buttons have 32px+ tap areas.
- **Tablets**: same column, wider; the three output settings sit side by side; Convert floats.
- **Desktop**: video + trim on the left, a sticky settings sidebar (with Convert) on the right.
- The result dialog sizes itself to the GIF and the screen (see `frameStyle` in `GifResult.tsx`).

## Motion

- **Skeleton loading** (`.skeleton` in `app/globals.css`): while a video loads, the Trim and Output cards
  render for real (with the previous video's values, or placeholders for the first one) but every text
  and control is drawn as a shimmering block in its exact place, so nothing moves when the real values
  arrive; then the content fades in (`.reveal`). The video preview and the GIF frame shimmer while
  they wait, and values still being read (the FPS) get a small inline skeleton (`.skeleton-inline`).
- The drop zone eases into the compact file bar (a CSS height transition, using `interpolate-size`).
- Small touches: page entrance, icon lift on hover/drag, button hover/press, a gloss on the progress
  bar, one pulse on Download when the GIF is ready.
- framer-motion only for things appearing and disappearing (dialog, fade-ins); hover/press effects are CSS.
- **Reduce motion** (OS setting): one rule in `globals.css` switches off all CSS animation, and
  framer-motion skips movement (`MotionConfig reducedMotion="user"`), keeping only short fades.
  Nothing keeps animating once the page is idle (WCAG 2.2.2).

## Accessibility (WCAG 2.2 AA)

Checked with axe-core in every state (empty, loaded, memory warnings, unplayable/unreadable file, result
dialog converting/ready/failed, phone width) plus manual checks. Things to keep when changing the UI:

- **Colors** live in `app/globals.css`; the comment there lists the contrast of each pairing. Text needs
  4.5:1, control edges / focus ring / slider thumb 3:1. Never show a state by color alone (the memory
  meter always says "Memory OK / Close to the limit / Likely to run out").
- **Focus**: one global `:focus-visible` ring (light purple). Don't add `outline-none`.
- **Dialog**: focus moves in on open, Tab wraps inside, the page behind is `inert`, focus returns to
  Convert on close. Escape closes it, or cancels a running conversion.
- **Announcements**: `role="status"` / `aria-live` for video loading state, memory level and the
  conversion outcome.
- **No auto-playing motion** (the background is static); framer animations respect "reduce motion".
- **Targets** are at least 24px (small buttons get an invisible `before:` hit area).

## License

Copyright (C) 2026 Noodleyy

This program is free software: you can redistribute it and/or modify it under the terms of the
GNU General Public License as published by the Free Software Foundation, either version 3 of the
License, or (at your option) any later version. See `LICENSE`.

It's distributed with FFmpeg (via ffmpeg.wasm, GPL-2.0-or-later) and some MIT-licensed libraries —
see `THIRD_PARTY_NOTICES.md`. The app's footer links to these licenses and, when deployed with the
workflow, to this repository's source code.
