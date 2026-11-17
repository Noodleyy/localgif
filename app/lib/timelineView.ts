import { clamp } from "./time";

/** The part of the video the timeline shows, in seconds. */
export type View = { start: number; end: number };

export const MIN_VIEW = 1; // seconds across at the closest zoom
export const ZOOM_STEP = 2; // the − and + buttons

export const fullView = (duration: number): View => ({ start: 0, end: duration });
export const zoomOf = (view: View, duration: number) => (view.end > view.start ? duration / (view.end - view.start) : 1);
export const canZoom = (duration: number) => duration >= MIN_VIEW * 2;

/** A view `span` seconds wide from `start`, moved back inside the video if needed. */
export function viewAt(start: number, span: number, duration: number): View {
  const s = clamp(start, 0, Math.max(0, duration - span));
  return { start: s, end: s + span };
}

/** Zoomed by `factor` (2: twice as close) around the point `at` (0..1 across), which stays put. */
export function zoomView(view: View, factor: number, at: number, duration: number): View {
  const span = view.end - view.start;
  const next = clamp(span / factor, Math.min(MIN_VIEW, duration), duration);
  return viewAt(view.start + at * span - at * next, next, duration);
}

/** Moved just enough to show `time` at its edge (or unchanged when it's already shown). */
export function revealTime(view: View, time: number, duration: number): View {
  const span = view.end - view.start;
  if (time < view.start) return viewAt(time, span, duration);
  if (time > view.end) return viewAt(time - span, span, duration);
  return view;
}

/** Shows `time`: just past an edge (playing on) it scrolls along; further away (a jump) it's centered. */
export function followTime(view: View, time: number, duration: number): View {
  const span = view.end - view.start;
  const near = span * 0.1;
  if (time < view.start - near || time > view.end + near) return viewAt(time - span / 2, span, duration);
  return revealTime(view, time, duration);
}

const STEPS = [0.05, 0.1, 0.2, 0.5, 1, 2, 5, 10, 15, 30, 60, 120, 300, 600, 900, 1800, 3600];

/** Tick marks at round times, at most `count` across the view; every 5th is a long one. */
export function ticks(view: View, count = 24) {
  const span = view.end - view.start;
  if (!(span > 0)) return [];
  const step = STEPS.find((s) => span / s <= count) ?? span / count;
  const marks: { time: number; major: boolean }[] = [];
  const first = Math.ceil(view.start / step - 1e-9) + 0; // + 0: not -0
  for (let i = first; i * step <= view.end + 1e-9; i++) {
    marks.push({ time: Math.round(i * step * 1000) / 1000, major: i % 5 === 0 });
  }
  return marks;
}
