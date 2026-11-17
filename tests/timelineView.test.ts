import { describe, expect, it } from "vitest";
import { MIN_VIEW, canZoom, followTime, fullView, revealTime, ticks, viewAt, zoomOf, zoomView } from "../app/lib/timelineView";

const hour = 3600;

describe("timeline view", () => {
  it("zooms around a point that stays in place, within the video and the closest zoom", () => {
    expect(zoomView(fullView(hour), 2, 0.5, hour)).toEqual({ start: 900, end: 2700 });
    expect(zoomView(fullView(hour), 4, 0, hour)).toEqual({ start: 0, end: 900 }); // around the left edge
    const atQuarter = zoomView({ start: 1000, end: 2000 }, 2, 0.25, hour); // 1250 s stays a quarter across
    expect(atQuarter).toEqual({ start: 1125, end: 1625 });
    expect(zoomView({ start: 10, end: 12 }, 8, 0.5, hour)).toEqual({ start: 10.5, end: 10.5 + MIN_VIEW });
    expect(zoomView({ start: 1000, end: 2000 }, 1 / 100, 0.5, hour)).toEqual(fullView(hour)); // out: never past the whole video
    expect(zoomOf({ start: 0, end: 900 }, hour)).toBe(4);
  });

  it("keeps a view inside the video", () => {
    expect(viewAt(-50, 100, hour)).toEqual({ start: 0, end: 100 });
    expect(viewAt(3550, 100, hour)).toEqual({ start: 3500, end: hour });
  });

  it("follows the playhead: scrolls along just past an edge, centers on a jump", () => {
    const view = { start: 100, end: 200 };
    expect(followTime(view, 150, hour)).toBe(view);
    expect(followTime(view, 205, hour)).toEqual({ start: 105, end: 205 }); // playing on
    expect(followTime(view, 1000, hour)).toEqual({ start: 950, end: 1050 }); // a jump
    expect(followTime(view, 30, hour)).toEqual({ start: 0, end: 100 }); // a jump, kept inside the video
    expect(revealTime(view, 1000, hour)).toEqual({ start: 900, end: 1000 }); // dragging: just to the edge
  });

  it("puts ticks at round times, about two dozen across", () => {
    expect(ticks(fullView(4)).map((t) => t.time)).toEqual(Array.from({ length: 21 }, (_, i) => Math.round(i * 0.2 * 10) / 10));
    const zoomed = ticks({ start: 61.3, end: 71.3 }); // 10 s: every 0.5 s
    expect(zoomed[0]).toEqual({ time: 61.5, major: false });
    expect(zoomed.find((t) => t.major)?.time).toBe(62.5);
    expect(ticks(fullView(hour)).length).toBeLessThanOrEqual(24);
    expect(ticks({ start: 5, end: 5 })).toEqual([]);
  });

  it("only offers zoom when there's something to zoom", () => {
    expect(canZoom(1.5)).toBe(false);
    expect(canZoom(60)).toBe(true);
  });
});
