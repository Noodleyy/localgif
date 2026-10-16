export function clamp(value: number, min: number, max: number) {
  return Math.min(Math.max(value, min), max);
}

/** Moves `time` one frame forward (1) or back (-1), kept within [min, max]. */
export function stepFrame(time: number, direction: 1 | -1, fps: number, min: number, max: number) {
  return clamp(time + direction / fps, min, max);
}

/** 83.456 -> "01:23:45" (minutes:seconds:hundredths) */
export function formatTimecode(seconds: number) {
  const pad = (n: number) => n.toString().padStart(2, "0");
  // Work in whole hundredths (with a tiny epsilon) so 0.29 doesn't show as 0.28 from float error.
  const total = Math.floor(Math.max(0, seconds) * 100 + 1e-6);
  const minutes = Math.floor(total / 6000);
  const secs = Math.floor(total / 100) % 60;
  return `${pad(minutes)}:${pad(secs)}:${pad(total % 100)}`;
}
