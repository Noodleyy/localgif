// Each case runs on a fresh engine; wasm memory never shrinks, so its size is the peak.
import { beforeAll, describe, expect, it } from "vitest";
import { convertToGif } from "../app/lib/gif";
import { estimateConversionRisk } from "../app/lib/memory";
import { asFFmpeg, loadCore, makeVideo } from "./helpers";

const MB = 1024 * 1024;
const x264 = ["-pix_fmt", "yuv420p", "-c:v", "libx264", "-preset", "ultrafast"];
let videos: Record<"sd" | "hd" | "big", File>;

beforeAll(async () => {
  const gen = await loadCore();
  const sd = await makeVideo(gen, "sd.mp4", ["-f", "lavfi", "-i", "testsrc2=size=640x360:rate=30:duration=20", ...x264]);
  const hd = await makeVideo(gen, "hd.mp4", ["-f", "lavfi", "-i", "testsrc2=size=1920x1080:rate=30:duration=5", ...x264, "-crf", "10"]);
  gen.FS.writeFile("hd.mp4", new Uint8Array(await hd.arrayBuffer()));
  const big = await makeVideo(gen, "big.mp4", ["-stream_loop", "9", "-i", "hd.mp4", "-c", "copy"]);
  videos = { sd, hd, big };
}, 180_000);

async function peakMemoryMB(file: File, o: { start?: number; seconds: number; fps: number; width: number }) {
  const core = await loadCore();
  await convertToGif(asFFmpeg(core), file, { start: o.start ?? 0, end: (o.start ?? 0) + o.seconds, fps: o.fps, colors: 256, width: o.width });
  return core.HEAPU8.buffer.byteLength / MB;
}

describe("memory estimate vs. real ffmpeg.wasm", () => {
  it.each([
    ["sd", 640, 360, { seconds: 20, fps: 10, width: 640 }],
    ["hd", 1920, 1080, { seconds: 4, fps: 10, width: 960 }],
    ["hd", 1920, 1080, { seconds: 5, fps: 20, width: 480 }],
  ] as const)("%s video %dx%d %o: estimate within 15%%", async (name, w, h, o) => {
    const measured = await peakMemoryMB(videos[name], o);
    const { estimatedMB } = estimateConversionRisk({
      clipDuration: o.seconds,
      sourceWidth: w,
      sourceHeight: h,
      outputFps: o.fps,
      outputWidth: o.width,
      outputHeight: Math.round((o.width * h) / w),
    });
    expect(Math.abs(estimatedMB - measured) / measured).toBeLessThan(0.15);
  }, 60_000);

  it("the input file isn't counted: the same clip from a 10x bigger file uses the same memory", async () => {
    expect(videos.big.size).toBeGreaterThan(videos.hd.size * 9);
    const fromSmall = await peakMemoryMB(videos.hd, { seconds: 1, fps: 10, width: 480 });
    const fromBig = await peakMemoryMB(videos.big, { seconds: 1, fps: 10, width: 480 });
    expect(fromBig).toBeLessThanOrEqual(fromSmall * 1.1);
  }, 60_000);

  it("trimming deep into a long file costs no more than trimming from the start", async () => {
    const fromStart = await peakMemoryMB(videos.big, { seconds: 2, fps: 10, width: 480 });
    const deepIn = await peakMemoryMB(videos.big, { start: 40, seconds: 2, fps: 10, width: 480 });
    expect(deepIn).toBeLessThanOrEqual(fromStart * 1.1);
  }, 60_000);

  it("a selection the estimate calls 'high' really runs out of memory, with a clear error", async () => {
    // 640x360 upscaled to 2560x1440 at 10 fps: ~16 MB per frame, 15 s = 150 frames ≈ 2.4 GB
    const o = { seconds: 15, fps: 10, width: 2560 };
    const risk = estimateConversionRisk({
      clipDuration: o.seconds, sourceWidth: 640, sourceHeight: 360,
      outputFps: o.fps, outputWidth: 2560, outputHeight: 1440,
    });
    expect(risk.level).toBe("high");
    expect(risk.maxSeconds).toBeLessThan(o.seconds);
    await expect(peakMemoryMB(videos.sd, o)).rejects.toThrow(/^Ran out of memory/);
  }, 120_000);
});
