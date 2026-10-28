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
