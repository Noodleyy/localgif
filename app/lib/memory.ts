// Out-of-memory estimate. ffmpeg.wasm can use at most 2 GiB. palettegen has to see every
// frame before paletteuse starts, so all output frames stay in memory (RGBA) until the
// end; the input file doesn't count (WORKERFS). Constants fitted to measured peaks,
// re-checked by tests/memory.test.ts.
const MB = 1024 * 1024;
export const MEMORY_LIMIT_MB = 2048;
const ENGINE_BASE_MB = 32;
const DECODER_FRAMES = 4; // YUV 4:2:0 = 1.5 bytes/pixel
const BUFFERED_FRAME_OVERHEAD = 1.1;
const PER_FRAME_MB = 0.1;
const HIGH = 0.9; // model error ±10% and the heap grows in steps
const MODERATE = 0.75;

export type ConversionRisk = {
  estimatedMB: number;
  limitMB: number;
  maxSeconds: number; // longest selection that stays under HIGH at these settings
  level: "none" | "moderate" | "high";
};

export function estimateConversionRisk(p: {
  clipDuration: number;
  sourceWidth: number;
  sourceHeight: number;
  outputFps: number;
  outputWidth: number;
  outputHeight: number;
}): ConversionRisk {
  const fixedMB = ENGINE_BASE_MB + (p.sourceWidth * p.sourceHeight * 1.5 * DECODER_FRAMES) / MB;
  const frameMB = (p.outputWidth * p.outputHeight * 4 * BUFFERED_FRAME_OVERHEAD) / MB + PER_FRAME_MB;
  const frames = Math.ceil(Math.max(0, p.clipDuration) * p.outputFps);
  const estimatedMB = fixedMB + frames * frameMB;
  const ratio = estimatedMB / MEMORY_LIMIT_MB;
  return {
    estimatedMB,
    limitMB: MEMORY_LIMIT_MB,
    maxSeconds: Math.max(0, (HIGH * MEMORY_LIMIT_MB - fixedMB) / frameMB / p.outputFps),
    level: ratio >= HIGH ? "high" : ratio >= MODERATE ? "moderate" : "none",
  };
}
