import { describe, expect, it } from "vitest";
import { MIN_CROP, centeredCrop, clampCrop, cornerPoint, dragCrop, setCropField, type Crop } from "../app/lib/crop";

const hd = { width: 1920, height: 1080 };
const inside = (c: Crop, src = hd) => c.x >= 0 && c.y >= 0 && c.x + c.width <= src.width && c.y + c.height <= src.height;

describe("centeredCrop", () => {
  it("picks the largest centered rectangle with the ratio", () => {
    expect(centeredCrop(hd, 1)).toEqual({ x: 420, y: 0, width: 1080, height: 1080 });
    expect(centeredCrop(hd, 16 / 9)).toEqual({ x: 0, y: 0, width: 1920, height: 1080 });
    expect(centeredCrop(hd, 9 / 16)).toEqual({ x: 656, y: 0, width: 608, height: 1080 });
    expect(centeredCrop({ width: 360, height: 640 }, 1)).toEqual({ x: 0, y: 140, width: 360, height: 360 });
  });

  it("free: the middle 80%", () => {
    expect(centeredCrop(hd, null)).toEqual({ x: 192, y: 108, width: 1536, height: 864 });
  });
});

describe("clampCrop", () => {
  it("keeps the crop inside the frame, in whole pixels", () => {
    expect(clampCrop({ x: -10.4, y: 1000, width: 300.6, height: 200 }, hd)).toEqual({ x: 0, y: 880, width: 301, height: 200 });
    expect(clampCrop({ x: 0, y: 0, width: 5000, height: 5000 }, hd)).toEqual({ x: 0, y: 0, ...hd });
  });

  it("never gets smaller than MIN_CROP, unless the video itself is", () => {
    expect(clampCrop({ x: 0, y: 0, width: 2, height: 2 }, hd)).toMatchObject({ width: MIN_CROP, height: MIN_CROP });
    expect(clampCrop({ x: 0, y: 0, width: 2, height: 2 }, { width: 8, height: 8 })).toMatchObject({ width: 8, height: 8 });
  });
});

describe("dragCrop", () => {
  const start: Crop = { x: 100, y: 100, width: 400, height: 300 };

  it("moves without resizing, and stops at the edges", () => {
    expect(dragCrop(start, "move", 50, -20, hd, null)).toEqual({ ...start, x: 150, y: 80 });
    expect(dragCrop(start, "move", -500, 5000, hd, null)).toEqual({ ...start, x: 0, y: 780 });
  });

  it("resizes from a corner, keeping the opposite corner in place", () => {
    expect(dragCrop(start, "se", 100, 50, hd, null)).toEqual({ x: 100, y: 100, width: 500, height: 350 });
    expect(dragCrop(start, "nw", 50, 50, hd, null)).toEqual({ x: 150, y: 150, width: 350, height: 250 });
    expect(dragCrop(start, "ne", 20, -30, hd, null)).toEqual({ x: 100, y: 70, width: 420, height: 330 });
    expect(dragCrop(start, "sw", -40, 10, hd, null)).toEqual({ x: 60, y: 100, width: 440, height: 310 });
  });

  it("can't be dragged past the frame or below the minimum size", () => {
    const big = dragCrop(start, "se", 9999, 9999, hd, null);
    expect(big).toEqual({ x: 100, y: 100, width: 1820, height: 980 });
    const tiny = dragCrop(start, "nw", 9999, 9999, hd, null);
    expect(tiny).toEqual({ x: 500 - MIN_CROP, y: 400 - MIN_CROP, width: MIN_CROP, height: MIN_CROP });
  });

  it("keeps a fixed ratio while resizing, also against the edges", () => {
    const square = { x: 100, y: 100, width: 300, height: 300 };
    expect(dragCrop(square, "se", 100, 10, hd, 1)).toEqual({ x: 100, y: 100, width: 400, height: 400 });
    const capped = dragCrop(square, "se", 5000, 5000, hd, 1);
    expect(capped.width).toBe(capped.height);
    expect(capped).toEqual({ x: 100, y: 100, width: 980, height: 980 });
    for (const handle of ["nw", "ne", "sw", "se"] as const) {
      const c = dragCrop(square, handle, -3000, 3000, hd, 16 / 9);
      expect(inside(c)).toBe(true);
      expect(c.width / c.height).toBeCloseTo(16 / 9, 1);
    }
  });
});

describe("setCropField", () => {
  const c: Crop = { x: 100, y: 100, width: 400, height: 300 };

  it("sets one field, clamped to the frame", () => {
    expect(setCropField(c, "x", 1800, hd, null)).toEqual({ ...c, x: 1520 });
    expect(setCropField(c, "width", 640, hd, null)).toEqual({ ...c, width: 640 });
  });

  it("with a fixed ratio, the other side follows (and both shrink to fit)", () => {
    expect(setCropField(c, "width", 800, hd, 16 / 9)).toEqual({ ...c, width: 800, height: 450 });
    expect(setCropField(c, "height", 2000, hd, 1)).toEqual({ x: 100, y: 0, width: 1080, height: 1080 });
  });
});

describe("cornerPoint", () => {
  it("finds each corner of the crop", () => {
    const c: Crop = { x: 10, y: 20, width: 100, height: 50 };
    expect([cornerPoint(c, "nw"), cornerPoint(c, "ne"), cornerPoint(c, "sw"), cornerPoint(c, "se")]).toEqual([
      { x: 10, y: 20 },
      { x: 110, y: 20 },
      { x: 10, y: 70 },
      { x: 110, y: 70 },
    ]);
  });
});
