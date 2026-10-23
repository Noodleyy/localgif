export function clamp(value: number, min: number, max: number) {
  return Math.min(Math.max(value, min), max);
}

export function stepFrame(time: number, direction: 1 | -1, fps: number, min: number, max: number) {
  return clamp(time + direction / fps, min, max);
}
