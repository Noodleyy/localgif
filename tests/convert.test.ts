import { readFileSync } from "node:fs";
import { beforeAll, describe, expect, it } from "vitest";
import { convertToGif, probeVideo, type GifOptions } from "../app/lib/gif";
import { asFFmpeg, loadCore, makeVideo, parseGif } from "./helpers";

const x264 = ["-pix_fmt", "yuv420p", "-c:v", "libx264", "-preset", "ultrafast"];

let ffmpeg: Awaited<ReturnType<typeof setup>>["ffmpeg"];
let videos: Awaited<ReturnType<typeof setup>>["videos"];

async function setup() {
  // a separate engine, so the one under test starts clean like on a fresh page
  const gen = await loadCore();
  const videos = {
    tiny: await makeVideo(gen, "tiny.mp4", ["-f", "lavfi", "-i", "testsrc=size=64x48:rate=10:duration=1", ...x264]),
    // with audio, which must be ignored
    small: await makeVideo(gen, "small.mp4", [
      "-f", "lavfi", "-i", "testsrc=size=320x240:rate=30:duration=2",
      "-f", "lavfi", "-i", "sine=frequency=440:duration=2",
      ...x264, "-c:a", "aac", "-shortest",
    ]),
    // shows *which* part got exported
    redThenBlue: await makeVideo(gen, "red-then-blue.mp4", [
      "-filter_complex", "color=red:s=64x48:r=10:d=1[a];color=blue:s=64x48:r=10:d=1[b];[a][b]concat=n=2",
      ...x264,
    ]),
    // red left half, blue right half: shows *where* the crop was taken
    redLeftBlueRight: await makeVideo(gen, "red-left-blue-right.mp4", [
      "-filter_complex", "color=red:s=32x48:r=10:d=1[a];color=blue:s=32x48:r=10:d=1[b];[a][b]hstack",
      ...x264,
    ]),
    fps60: await makeVideo(gen, "fps60.mp4", ["-f", "lavfi", "-i", "testsrc=size=160x120:rate=60:duration=1", ...x264]),
    // committed: ffmpeg.wasm can decode HEVC but not encode it
    hevc: new File([readFileSync(new URL("./fixtures/hevc-320x240-25fps-2s.mp4", import.meta.url))], "hevc.mp4"),
    avi: await makeVideo(gen, "clip.avi", ["-f", "lavfi", "-i", "testsrc=size=320x240:rate=25:duration=2", "-c:v", "mpeg4"]),
    // like a browser screen recording: no duration in the file
    liveWebm: await makeVideo(gen, "live.webm", ["-f", "lavfi", "-i", "testsrc=size=320x240:rate=30:duration=2", "-c:v", "libvpx", "-deadline", "realtime", "-f", "webm", "-live", "1"]),
    portrait: await makeVideo(gen, "portrait.mp4", ["-f", "lavfi", "-i", "testsrc2=size=360x640:rate=30000/1001:duration=2", ...x264]),
    large: await makeVideo(gen, "large.mp4", ["-f", "lavfi", "-i", "testsrc2=size=1920x1080:rate=30:duration=5", ...x264, "-crf", "10"]),
  };
  // ~180 MB: the large clip looped 10x without re-encoding
  await gen.FS.writeFile("large.mp4", new Uint8Array(await videos.large.arrayBuffer()));
  const huge = await makeVideo(gen, "huge.mp4", ["-stream_loop", "9", "-i", "large.mp4", "-c", "copy"]);
  gen.FS.unlink("large.mp4");

  return { ffmpeg: asFFmpeg(await loadCore()), videos: { ...videos, huge } };
}

beforeAll(async () => {
  ({ ffmpeg, videos } = await setup());
}, 180_000);

const opts = (o: Partial<GifOptions> & Pick<GifOptions, "end" | "width">): GifOptions => ({
  start: 0,
  fps: 10,
  colors: 256,
  ...o,
});

/** Files/folders a conversion or probe left behind in ffmpeg's filesystem (should be none). */
const leftovers = () => ffmpeg.files().filter((f) => /^(input|probe|output)/.test(f));

async function convert(file: File, options: GifOptions) {
  return parseGif(await convertToGif(ffmpeg, file, options));
}

describe("small videos", () => {
  it("converts a tiny video into a valid, looping GIF", async () => {
    const gif = await convert(videos.tiny, opts({ end: 1, width: 64 }));
    expect(gif).toMatchObject({ width: 64, height: 48, loopsForever: true });
    expect(gif.frames).toBe(10);
    expect(gif.durationSec).toBeCloseTo(1, 1);
  });

  it("converts the whole clip at the chosen fps (and ignores the audio track)", async () => {
    const gif = await convert(videos.small, opts({ end: 2, width: 320 }));
    expect(gif).toMatchObject({ width: 320, height: 240 });
    expect(gif.frames).toBe(20);
    expect(gif.durationSec).toBeCloseTo(2, 1);
  });

  it("only exports the trimmed range", async () => {
    const gif = await convert(videos.small, opts({ start: 0.5, end: 1.5, fps: 15, width: 320 }));
    expect(gif.frames).toBe(15);
    expect(gif.durationSec).toBeCloseTo(1, 1);
  });

  it("exports the content from the selected time, not from the start", async () => {
    const isRed = (c: { r: number; b: number }) => c.r > 200 && c.b < 60;
    const isBlue = (c: { r: number; b: number }) => c.b > 200 && c.r < 60;

    const first = await convert(videos.redThenBlue, opts({ start: 0.2, end: 0.8, width: 64 }));
    expect(first.palette.some(isRed)).toBe(true);
    expect(first.palette.some(isBlue)).toBe(false);

    const second = await convert(videos.redThenBlue, opts({ start: 1.2, end: 1.8, width: 64 }));
    expect(second.palette.some(isBlue)).toBe(true);
    expect(second.palette.some(isRed)).toBe(false);
  });

  it("crops to the selected part of the frame", async () => {
    const isRed = (c: { r: number; b: number }) => c.r > 200 && c.b < 60;
    const isBlue = (c: { r: number; b: number }) => c.b > 200 && c.r < 60;

    const right = await convert(videos.redLeftBlueRight, opts({ end: 1, crop: { x: 36, y: 8, width: 24, height: 32 }, width: 24 }));
    expect(right).toMatchObject({ width: 24, height: 32 });
    expect(right.palette.some(isBlue)).toBe(true);
    expect(right.palette.some(isRed)).toBe(false);

    const left = await convert(videos.redLeftBlueRight, opts({ end: 1, crop: { x: 0, y: 0, width: 16, height: 48 }, width: 32 }));
    expect(left).toMatchObject({ width: 32, height: 96 }); // scaled 2x after cropping
    expect(left.palette.some(isRed)).toBe(true);
    expect(left.palette.some(isBlue)).toBe(false);
  });

  it("handles a selection shorter than one GIF frame", async () => {
    const gif = await convert(videos.small, opts({ start: 1, end: 1.05, width: 320 }));
    expect(gif.frames).toBeGreaterThanOrEqual(1);
  });

  it("scales down and up, keeping the aspect ratio", async () => {
    expect(await convert(videos.small, opts({ end: 1, width: 80 }))).toMatchObject({ width: 80, height: 60 });
    expect(await convert(videos.small, opts({ end: 1, width: 640 }))).toMatchObject({ width: 640, height: 480 });
  });

  it.each([4, 16, 256])("respects a %d color limit", async (colors) => {
    const gif = await convert(videos.small, opts({ end: 1, colors, width: 320 }));
    expect(gif.maxColors).toBeLessThanOrEqual(colors);
    expect(gif.maxColors).toBeGreaterThan(1);
  });

  it("clamps color counts ffmpeg can't handle (below 4) instead of failing", async () => {
    const gif = await convert(videos.small, opts({ end: 1, colors: 2, width: 320 }));
    expect(gif.maxColors).toBeLessThanOrEqual(4);
  });

  it("keeps portrait orientation", async () => {
    const gif = await convert(videos.portrait, opts({ end: 1, width: 180 }));
    expect(gif).toMatchObject({ width: 180, height: 320 });
  });

  it("doesn't rely on the file extension", async () => {
    const asMov = new File([videos.tiny], "clip.MOV");
    const noExt = new File([videos.tiny], "clip");
    expect((await convert(asMov, opts({ end: 1, width: 64 }))).frames).toBe(10);
    expect((await convert(noExt, opts({ end: 1, width: 64 }))).frames).toBe(10);
  });
});

describe("large videos", () => {
  it("converts a trimmed, downscaled 1080p clip", async () => {
    const gif = await convert(videos.large, opts({ start: 1, end: 3, width: 480 }));
    expect(gif).toMatchObject({ width: 480, height: 270 });
    expect(gif.frames).toBe(20);
    expect(gif.durationSec).toBeCloseTo(2, 1);
  }, 60_000);

  it("converts at full 1080p resolution", async () => {
    const gif = await convert(videos.large, opts({ end: 1, fps: 5, width: 1920 }));
    expect(gif).toMatchObject({ width: 1920, height: 1080, frames: 5 });
  }, 60_000);

  it(`converts a section from deep inside a ~180 MB file`, async () => {
    expect(videos.huge.size).toBeGreaterThan(150 * 1024 * 1024);
    const gif = await convert(videos.huge, opts({ start: 45, end: 48, width: 320 }));
    expect(gif).toMatchObject({ width: 320, height: 180, frames: 30 });
  }, 120_000);

  it("survives repeated big conversions on one engine (memory is freed each time)", async () => {
    for (let i = 0; i < 3; i++) {
      const gif = await convert(videos.huge, opts({ start: i * 10, end: i * 10 + 1, width: 240 }));
      expect(gif.frames).toBe(10);
      expect(leftovers()).toEqual([]);
    }
  }, 240_000);
});

describe("progress", () => {
  it("reports steady progress through both halves of the conversion, ending at 1", async () => {
    const seen: number[] = [];
    await convertToGif(ffmpeg, videos.small, opts({ end: 2, fps: 15, width: 320 }), (p) => seen.push(p));
    expect(seen.length).toBeGreaterThan(30); // ~one update per frame per half
    expect(seen).toEqual([...seen].sort((a, b) => a - b)); // never goes backwards
    expect(seen.filter((p) => p > 0.1 && p < 0.5).length).toBeGreaterThan(5); // moves during the palette pass too
    expect(seen.filter((p) => p > 0.5 && p < 1).length).toBeGreaterThan(5);
    expect(seen.at(-1)).toBe(1);
  });

  it("still reports progress after a probe (ffprobe -v error must not silence it)", async () => {
    await probeVideo(ffmpeg, videos.small); // what the app does when a file is picked
    const seen: number[] = [];
    await convertToGif(ffmpeg, videos.small, opts({ end: 1, width: 160 }), (p) => seen.push(p));
    expect(seen.length).toBeGreaterThan(10);
  });
});

describe("reading the input", () => {
  it("works with file names ffmpeg would otherwise misread", async () => {
    for (const name of ["clip:1.mp4", "my video (final).MP4", "über-ñ.mp4", "-flag.mp4"]) {
      expect((await convert(new File([videos.tiny], name), opts({ end: 1, width: 64 }))).frames).toBe(10);
    }
    expect(leftovers()).toEqual([]);
  });
});

describe("probeVideo", () => {
  it.each([
    ["tiny", 10, 64, 48, 1],
    ["small", 30, 320, 240, 2],
    ["portrait", 30000 / 1001, 360, 640, 2],
    ["large", 30, 1920, 1080, 5],
    ["hevc", 25, 320, 240, 2],
    ["avi", 25, 320, 240, 2],
  ] as const)("%s video -> %d fps, %dx%d, %d s", async (name, fps, width, height, duration) => {
    const info = await probeVideo(ffmpeg, videos[name]);
    expect(info.fps).toBeCloseTo(fps, 2);
    expect(info).toMatchObject({ width, height });
    expect(info.duration).toBeCloseTo(duration, 1);
    expect(leftovers()).toEqual([]);
  });

  it("reports an unknown duration for live-recorded WebM instead of a bogus number", async () => {
    expect(await probeVideo(ffmpeg, videos.liveWebm)).toMatchObject({ width: 320, height: 240, duration: null });
  });

  it("two files probed at the same time each get their own answer", async () => {
    const [a, b] = await Promise.all([probeVideo(ffmpeg, videos.tiny), probeVideo(ffmpeg, videos.small)]);
    expect(a.fps).toBe(10);
    expect(b.fps).toBe(30);
  });

  it("throws for a file that isn't a video", async () => {
    const junk = new File([crypto.getRandomValues(new Uint8Array(4096))], "notes.txt");
    await expect(probeVideo(ffmpeg, junk)).rejects.toThrow();
  });
});

describe("formats browsers can't preview still convert", () => {
  it.each(["hevc", "avi", "liveWebm"] as const)("%s", async (name) => {
    const gif = await convert(videos[name], opts({ end: 1, width: 160 }));
    expect(gif).toMatchObject({ width: 160, height: 120, frames: 10 });
  });
});

describe("GIF timing", () => {
  it("never writes frames shorter than 2/100 s (browsers would slow those down to 1/10 s)", async () => {
    const gif = await convert(videos.fps60, opts({ end: 1, fps: 60, width: 160 }));
    expect(gif.minDelayCs).toBeGreaterThanOrEqual(2);
    expect(gif.frames).toBe(50); // capped at 50 fps
    expect(gif.durationSec).toBeCloseTo(1, 1);
  });
});

describe("failures give a clear error and clean up", () => {
  it("rejects a file that isn't a video", async () => {
    const junk = new File([crypto.getRandomValues(new Uint8Array(4096))], "fake.mp4");
    await expect(convertToGif(ffmpeg, junk, opts({ end: 1, width: 100 }))).rejects.toThrow(/FFmpeg failed/);
    expect(leftovers()).toEqual([]);
  });

  it("rejects a trim that starts after the video ends", async () => {
    await expect(convertToGif(ffmpeg, videos.tiny, opts({ start: 5, end: 6, width: 64 }))).rejects.toThrow();
  });

  it("rejects an empty or reversed trim without running ffmpeg", async () => {
    await expect(convertToGif(ffmpeg, videos.tiny, opts({ start: 0.5, end: 0.5, width: 64 }))).rejects.toThrow(
      "End time must be after start time"
    );
  });

  it("still works after a failed conversion", async () => {
    expect((await convert(videos.tiny, opts({ end: 1, width: 64 }))).frames).toBe(10);
  });
});
