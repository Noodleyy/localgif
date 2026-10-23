import { describe, expect, it } from "vitest";
import { fileExtension, frameCount, gifArgs, maxOutputFps, parseFrameRate } from "../app/lib/gif";
import { estimateConversionRisk } from "../app/lib/memory";
import { formatBytes, formatSeconds, formatTimecode } from "../app/lib/format";
import { stepFrame } from "../app/lib/time";

describe("gifArgs", () => {
  it("seeks to the trim start, limits to the trim length and builds the palette filter", () => {
    expect(gifArgs("input.mp4", "output.gif", { start: 1.5, end: 4, fps: 12, colors: 64, width: 480 })).toEqual([
      "-loglevel", "info",
      "-ss", "1.5",
      "-t", "2.5",
      "-i", "input.mp4",
      "-vf",
      "fps=12,scale=480:-1:flags=lanczos,showinfo=checksum=0,split[s0][s1];" +
        "[s0]palettegen=max_colors=64[p];[s1][p]paletteuse,showinfo=checksum=0",
      "-loop", "0",
      "output.gif",
    ]);
  });

  it("frameCount: GIF frames in a selection (used for progress)", () => {
    expect(frameCount({ start: 1, end: 3, fps: 10 })).toBe(20);
    expect(frameCount({ start: 0, end: 0.01, fps: 10 })).toBe(1);
    expect(frameCount({ start: 0, end: 1, fps: 60 })).toBe(50); // capped like the GIF itself
  });

  it("caps fps at 50 so frame delays don't round down to 1/100 s", () => {
    expect(gifArgs("i", "o", { start: 0, end: 1, fps: 60, colors: 256, width: 100 })[9]).toMatch(/^fps=50,/);
  });

  it("keeps the color count within what ffmpeg's palettegen accepts (4-256)", () => {
    const colorsIn = (colors: number) =>
      gifArgs("i", "o", { start: 0, end: 1, fps: 10, colors, width: 100 })[9].match(/max_colors=(\d+)/)![1];
    expect(colorsIn(2)).toBe("4");
    expect(colorsIn(300)).toBe("256");
  });
});

describe("fileExtension", () => {
  it.each([
    ["clip.MP4", "mp4"],
    ["holiday.mov", "mov"],
    ["my.video.webm", "webm"],
    ["no-extension", "mp4"],
    ["weird.", "mp4"],
  ])("%s -> %s", (name, ext) => expect(fileExtension(name)).toBe(ext));
});

describe("parseFrameRate", () => {
  it.each([
    ["30/1", 30],
    ["25", 25],
    ["30000/1001\n", 30000 / 1001],
    ["0/0", 30], // ffprobe's "unknown" -> fallback
    ["", 30],
    ["garbage", 30],
  ])("%j -> %d", (text, fps) => expect(parseFrameRate(text)).toBeCloseTo(fps, 5));
});

describe("maxOutputFps", () => {
  it("never offers more fps than the source has, or than GIFs can play (50)", () => {
    expect(maxOutputFps(29.97)).toBe(30);
    expect(maxOutputFps(0.2)).toBe(1);
    expect(maxOutputFps(60)).toBe(50);
  });
});

describe("estimateConversionRisk", () => {
  const risk = (o: Partial<Parameters<typeof estimateConversionRisk>[0]>) =>
    estimateConversionRisk({
      clipDuration: 5,
      sourceWidth: 1920,
      sourceHeight: 1080,
      outputFps: 10,
      outputWidth: 480,
      outputHeight: 270,
      ...o,
    });

  // Peak ffmpeg.wasm memory measured on real conversions (fresh engine each, 2 GiB cap).
  // [source w, h, output w, h, output fps, seconds, measured peak MB]
  const measured: [number, number, number, number, number, number, number][] = [
    [1920, 1080, 480, 270, 10, 2, 55],
    [1920, 1080, 480, 270, 10, 20, 166],
    [1920, 1080, 480, 270, 20, 4, 96],
    [1920, 1080, 960, 540, 10, 4, 138],
    [1920, 1080, 1920, 1080, 10, 4, 412],
    [640, 360, 640, 360, 10, 20, 239],
    [640, 360, 640, 360, 30, 20, 687],
    [3840, 2160, 480, 270, 5, 2, 80],
    [1920, 1080, 1280, 720, 10, 30, 1183],
    [1920, 1080, 1920, 1080, 10, 20, 1719],
  ];
  it.each(measured)("%dx%d -> %dx%d @ %d fps, %d s: estimate within 15%% of measured %d MB", (sw, sh, ow, oh, fps, secs, peak) => {
    const { estimatedMB } = risk({ sourceWidth: sw, sourceHeight: sh, outputWidth: ow, outputHeight: oh, outputFps: fps, clipDuration: secs });
    expect(Math.abs(estimatedMB - peak) / peak).toBeLessThan(0.15);
  });

  it("matches what really happened at full 1080p, 10 fps", () => {
    const full = { outputWidth: 1920, outputHeight: 1080 };
    expect(risk({ ...full, clipDuration: 4 }).level).toBe("none"); // 412 MB, fine
    expect(risk({ ...full, clipDuration: 20 }).level).toBe("moderate"); // 1719 MB, succeeded
    expect(risk({ ...full, clipDuration: 30 }).level).toBe("high"); // ran out of memory
    const { maxSeconds } = risk(full);
    expect(maxSeconds).toBeGreaterThan(20);
    expect(maxSeconds).toBeLessThan(30);
  });

  it("maxSeconds is the selection length where 'high' starts", () => {
    const { maxSeconds } = risk({ outputWidth: 1280, outputHeight: 720 });
    expect(risk({ outputWidth: 1280, outputHeight: 720, clipDuration: maxSeconds - 0.5 }).level).not.toBe("high");
    expect(risk({ outputWidth: 1280, outputHeight: 720, clipDuration: maxSeconds + 0.5 }).level).toBe("high");
  });

  it("output fps drives memory (more frames are kept)", () => {
    expect(risk({ outputFps: 20 }).estimatedMB).toBeGreaterThan(risk({ outputFps: 10 }).estimatedMB);
  });

  it("negative clip length counts as zero", () => {
    expect(risk({ clipDuration: -3 })).toEqual(risk({ clipDuration: 0 }));
  });
});

describe("time helpers", () => {
  it("steps one frame and clamps to the range", () => {
    expect(stepFrame(1, 1, 10, 0, 5)).toBeCloseTo(1.1);
    expect(stepFrame(1, -1, 25, 0, 5)).toBeCloseTo(0.96);
    expect(stepFrame(0, -1, 30, 0, 5)).toBe(0);
    expect(stepFrame(5, 1, 30, 0, 5)).toBe(5);
  });

  it("formats mm:ss:hundredths", () => {
    expect(formatTimecode(0)).toBe("00:00:00");
    expect(formatTimecode(83.456)).toBe("01:23:45");
    expect(formatTimecode(0.29)).toBe("00:00:29"); // not :28 from floating-point error
    expect(formatTimecode(0.1 + 0.2)).toBe("00:00:30");
  });

  it("formats sizes in KB, MB and GB", () => {
    expect(formatBytes(100)).toBe("1 KB");
    expect(formatBytes(300 * 1024)).toBe("300 KB");
    expect(formatBytes(2.34 * 1024 ** 2)).toBe("2.3 MB");
    expect(formatBytes(412 * 1024 ** 2)).toBe("412 MB");
    expect(formatBytes(2 * 1024 ** 3)).toBe("2.0 GB");
  });

  it("formats durations", () => {
    expect(formatSeconds(4.56)).toBe("4.5s");
    expect(formatSeconds(42.9)).toBe("42s");
    expect(formatSeconds(125)).toBe("2m 5s");
  });
});
