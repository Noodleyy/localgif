import { clamp } from "./time";

export type Size = { width: number; height: number };
/** A rectangle of the video, in its own pixels. */
export type Crop = Size & { x: number; y: number };

export const MIN_CROP = 16;

/** Aspect ratios offered; `null` is free. */
export const ASPECTS: Record<string, number | null> = { Free: null, "1:1": 1, "4:3": 4 / 3, "16:9": 16 / 9, "9:16": 9 / 16 };

/** The largest centered crop with `ratio`, or the middle 80% of the frame when free. */
export function centeredCrop(src: Size, ratio: number | null): Crop {
  let width = ratio === null ? src.width * 0.8 : src.width;
  let height = ratio === null ? src.height * 0.8 : src.height;
  if (ratio !== null) {
    if (width / height > ratio) width = height * ratio;
    else height = width / ratio;
  }
  return clampCrop({ x: (src.width - width) / 2, y: (src.height - height) / 2, width, height }, src);
}

/** Whole pixels, at least MIN_CROP (or the frame) in size, inside the frame. */
export function clampCrop(c: Crop, src: Size): Crop {
  const width = clamp(Math.round(c.width), Math.min(MIN_CROP, src.width), src.width);
  const height = clamp(Math.round(c.height), Math.min(MIN_CROP, src.height), src.height);
  return {
    x: clamp(Math.round(c.x), 0, src.width - width),
    y: clamp(Math.round(c.y), 0, src.height - height),
    width,
    height,
  };
}

export type Handle = "move" | "nw" | "ne" | "sw" | "se";

/** `start` with `handle` dragged by (dx, dy) video pixels. A corner keeps the opposite corner in place. */
export function dragCrop(start: Crop, handle: Handle, dx: number, dy: number, src: Size, ratio: number | null): Crop {
  if (handle === "move") return clampCrop({ ...start, x: start.x + dx, y: start.y + dy }, src);
  const west = handle.endsWith("w");
  const north = handle.startsWith("n");
  const anchorX = west ? start.x + start.width : start.x;
  const anchorY = north ? start.y + start.height : start.y;
  const maxWidth = west ? anchorX : src.width - anchorX;
  const maxHeight = north ? anchorY : src.height - anchorY;
  let width = clamp(start.width + (west ? -dx : dx), MIN_CROP, maxWidth);
  let height = clamp(start.height + (north ? -dy : dy), MIN_CROP, maxHeight);
  if (ratio !== null) {
    // follow the side that grew most, then shrink both to fit the frame
    if (width / height > ratio) height = width / ratio;
    else width = height * ratio;
    const fit = Math.min(1, maxWidth / width, maxHeight / height);
    width *= fit;
    height *= fit;
  }
  width = Math.round(width);
  height = Math.round(height);
  return { x: west ? anchorX - width : anchorX, y: north ? anchorY - height : anchorY, width, height };
}

/** One field typed in; with a fixed ratio, the other side follows. */
export function setCropField(c: Crop, field: keyof Crop, value: number, src: Size, ratio: number | null): Crop {
  const next = { ...c, [field]: value };
  if (ratio !== null && field === "width") next.height = value / ratio;
  if (ratio !== null && field === "height") next.width = value * ratio;
  if (ratio !== null && (field === "width" || field === "height")) {
    // too big for the frame: shrink both, so the ratio holds
    const fit = Math.min(1, src.width / next.width, src.height / next.height);
    next.width *= fit;
    next.height *= fit;
  }
  return clampCrop(next, src);
}

/** Where a corner handle sits, in video pixels. */
export function cornerPoint(c: Crop, handle: Exclude<Handle, "move">) {
  return { x: handle.endsWith("w") ? c.x : c.x + c.width, y: handle.startsWith("n") ? c.y : c.y + c.height };
}

/** Where the crop is at a moment of the video (in seconds); it glides between keyframes. */
export type Keyframe = { time: number; x: number; y: number };

/** Keyframes closer than this are the same one: dragging again on a frame replaces it. */
export const KEYFRAME_SNAP = 0.02;

/** The crop at `time`: in a straight line, at a steady speed, between the keyframes around it. */
export function cropAt(crop: Crop, keyframes: Keyframe[], time: number): Crop {
  if (keyframes.length === 0) return crop;
  const next = keyframes.findIndex((k) => k.time > time);
  if (next === 0) return { ...crop, x: keyframes[0].x, y: keyframes[0].y };
  const a = keyframes[next === -1 ? keyframes.length - 1 : next - 1];
  if (next === -1) return { ...crop, x: a.x, y: a.y };
  const b = keyframes[next];
  const f = (time - a.time) / (b.time - a.time);
  return { ...crop, x: Math.round(a.x + (b.x - a.x) * f), y: Math.round(a.y + (b.y - a.y) * f) };
}

/** `keyframes` with the crop at `time` set to `at` (sorted; one close by is replaced). */
export function setKeyframe(keyframes: Keyframe[], time: number, at: { x: number; y: number }): Keyframe[] {
  const others = keyframes.filter((k) => Math.abs(k.time - time) >= KEYFRAME_SNAP);
  return [...others, { time, x: at.x, y: at.y }].sort((a, b) => a.time - b.time);
}

/**
 * A crop changed (dragged, or a field typed) while showing `time`. Moved: that moment gets a
 * keyframe. Resized: every keyframe gets the same change, so the crop keeps one size throughout.
 */
export function editCrop(crop: Crop, keyframes: Keyframe[], time: number, next: Crop, src: Size) {
  if (keyframes.length === 0) return { crop: next, keyframes };
  const shown = cropAt(crop, keyframes, time);
  if (next.width === shown.width && next.height === shown.height) {
    return { crop: next, keyframes: setKeyframe(keyframes, time, next) };
  }
  const dx = next.x - shown.x;
  const dy = next.y - shown.y;
  return {
    crop: next,
    keyframes: keyframes.map((k) => {
      const { x, y } = clampCrop({ ...next, x: k.x + dx, y: k.y + dy }, src);
      return { time: k.time, x, y };
    }),
  };
}

/** ffmpeg expression for a value along keyframes (`t`: seconds since `start`, like the crop filter's). */
function along(keyframes: Keyframe[], value: (k: Keyframe) => number, start: number) {
  const n = (v: number) => {
    const r = Math.round(v * 1000) / 1000;
    return r < 0 ? `(${r})` : String(r);
  };
  const ks = keyframes.map((k) => ({ t: k.time - start, v: value(k) }));
  if (ks.length === 1) return n(ks[0].v);
  const t = `clip(t,${n(ks[0].t)},${n(ks.at(-1)!.t)})`; // held still before the first and after the last
  let expr = n(ks.at(-1)!.v);
  for (let i = ks.length - 2; i >= 0; i--) {
    const [a, b] = [ks[i], ks[i + 1]];
    if (b.t - a.t < 1e-6) continue;
    expr = `if(lt(${t},${n(b.t)}),${n(a.v)}+${n(b.v - a.v)}*(${t}-${n(a.t)})/${n(b.t - a.t)},${expr})`;
  }
  return expr;
}

/** ffmpeg's crop filter: still, or moving along the keyframes (`start`: the trim's start, where t = 0). */
export function cropFilter(crop: Crop, keyframes: Keyframe[] = [], start = 0) {
  if (keyframes.length === 0) return `crop=${crop.width}:${crop.height}:${crop.x}:${crop.y}`;
  // quoted, so the expressions' commas don't split the filter chain
  return `crop=w=${crop.width}:h=${crop.height}:x='${along(keyframes, (k) => k.x, start)}':y='${along(keyframes, (k) => k.y, start)}'`;
}
