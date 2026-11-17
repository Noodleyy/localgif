import { useEffect, useRef, useState } from "react";
import { formatTimecode } from "../lib/format";
import { clamp } from "../lib/time";
import { MIN_VIEW, ZOOM_STEP, canZoom, followTime, fullView, revealTime, ticks, viewAt, zoomOf, zoomView, type View } from "../lib/timelineView";
import { IconButton } from "./ui";

export type Trim = { start: number; end: number };
type Edge = keyof Trim;

type TimelineProps = {
  duration: number;
  currentTime: number;
  trim: Trim;
  onSeek: (time: number) => void;
  onTrimChange: (trim: Trim) => void;
  onNudgeTrim: (edge: Edge, direction: 1 | -1) => void;
  markers?: number[]; // diamonds at these times (the crop's keyframes; listed in the Crop card)
};

/**
 * The trim timeline. It can zoom in on part of a long video: the − / + buttons (around the
 * playhead), Ctrl/⌘ + wheel or a trackpad pinch (around the pointer). Scroll sideways, or drag
 * the window in the overview below, to move along; the view follows the playhead.
 */
export function Timeline({ duration, currentTime, trim, onSeek, onTrimChange, onNudgeTrim, markers = [] }: TimelineProps) {
  const trackRef = useRef<HTMLDivElement>(null);
  const [dragging, setDragging] = useState<Edge | null>(null);

  // the view, reset for a new video and moved along when the playhead leaves it
  const [state, setState] = useState(() => ({ duration, time: currentTime, view: fullView(duration) }));
  let view = state.view;
  if (state.duration !== duration || state.time !== currentTime) {
    if (state.duration !== duration) view = fullView(duration);
    view = followTime(view, currentTime, duration);
    setState({ duration, time: currentTime, view });
  }
  const setView = (next: View) => setState((s) => ({ ...s, view: next }));
  const viewRef = useRef(view); // for the wheel listener, set up once
  const durationRef = useRef(duration);
  useEffect(() => {
    viewRef.current = view;
    durationRef.current = duration;
  });

  const span = view.end - view.start;
  const zoom = zoomOf(view, duration);
  const toPct = (t: number) => (span > 0 ? ((t - view.start) / span) * 100 : 0);
  const shown = (t: number) => t >= view.start && t <= view.end;
  const startPct = toPct(trim.start);
  const endPct = toPct(trim.end);

  /** The time under the pointer; past the ends of the track it goes on (`clamped`: stops there). */
  function timeAt(clientX: number, clamped = true) {
    const rect = trackRef.current?.getBoundingClientRect();
    if (!rect || rect.width === 0) return 0;
    const at = (clientX - rect.left) / rect.width;
    return clamp(view.start + (clamped ? clamp(at, 0, 1) : at) * span, 0, duration);
  }

  // Ctrl/⌘ + wheel (a trackpad pinch too) zooms around the pointer; sideways scrolling pans.
  // A native listener: React's wheel listeners are passive, and this must stop the page zooming.
  useEffect(() => {
    const track = trackRef.current;
    if (!track) return;
    function onWheel(e: WheelEvent) {
      const rect = track!.getBoundingClientRect();
      const sideways = e.shiftKey ? e.deltaY : e.deltaX;
      if (e.ctrlKey || e.metaKey) {
        e.preventDefault();
        const at = clamp((e.clientX - rect.left) / rect.width, 0, 1);
        setState((s) => ({ ...s, view: zoomView(s.view, Math.exp(-e.deltaY * 0.005), at, s.duration) }));
      } else if (Math.abs(sideways) > Math.abs(e.shiftKey ? e.deltaX : e.deltaY)) {
        const { start, end } = viewRef.current;
        if (start === 0 && end >= durationRef.current) return; // nothing to pan: leave it to the page
        e.preventDefault(); // or a sideways swipe goes back a page
        setState((s) => {
          const w = s.view.end - s.view.start;
          return { ...s, view: viewAt(s.view.start + (sideways / rect.width) * w, w, s.duration) };
        });
      }
    }
    track.addEventListener("wheel", onWheel, { passive: false });
    return () => track.removeEventListener("wheel", onWheel);
  }, []);

  function zoomBy(factor: number) {
    const at = shown(currentTime) ? (currentTime - view.start) / span : 0.5; // around the playhead
    setView(zoomView(view, factor, at, duration));
  }

  function scrub(e: React.PointerEvent<HTMLDivElement>) {
    if (e.type === "pointerdown") e.currentTarget.setPointerCapture(e.pointerId);
    else if (e.buttons !== 1) return;
    onSeek(timeAt(e.clientX));
  }

  function dragHandle(edge: Edge, e: React.PointerEvent<HTMLDivElement>) {
    e.stopPropagation();
    if (e.type === "pointerdown") {
      e.currentTarget.setPointerCapture(e.pointerId);
      setDragging(edge);
    } else if (e.buttons !== 1) return;
    const t = timeAt(e.clientX, false);
    const time = edge === "start" ? Math.min(t, trim.end) : Math.max(t, trim.start);
    setView(revealTime(view, time, duration)); // dragged past the end of the track: it scrolls along
    onTrimChange({ ...trim, [edge]: time });
    onSeek(time);
  }

  function stopDrag(e: React.PointerEvent<HTMLDivElement>) {
    e.stopPropagation();
    setDragging(null);
  }

  function handle(edge: Edge, pct: number) {
    const off = pct < 0 || pct > 100; // out of view: waits at the edge, faded (and comes into view on focus)
    return (
      <div
        onPointerDown={(e) => dragHandle(edge, e)}
        onPointerMove={(e) => dragHandle(edge, e)}
        onPointerUp={stopDrag}
        onPointerCancel={stopDrag}
        onFocus={() => setView(followTime(view, trim[edge], duration))}
        onKeyDown={(e) => {
          const direction = { ArrowLeft: -1, ArrowDown: -1, ArrowRight: 1, ArrowUp: 1 }[e.key] as 1 | -1 | undefined;
          if (!direction) return;
          e.preventDefault();
          onNudgeTrim(edge, direction);
        }}
        role="slider"
        aria-label={edge === "start" ? "Trim start" : "Trim end"}
        aria-valuemin={edge === "start" ? 0 : trim.start}
        aria-valuemax={edge === "start" ? trim.end : duration}
        aria-valuenow={trim[edge]}
        aria-valuetext={formatTimecode(trim[edge])}
        tabIndex={0}
        // before: gives the small handle a bigger, invisible touch area
        className={`absolute top-1/2 h-4 w-2 -translate-x-1/2 -translate-y-1/2 cursor-ew-resize touch-none rounded-full bg-ink ring-2 ring-bg transition-transform before:absolute before:-inset-x-3 before:-inset-y-2 hover:scale-125 ${
          dragging === edge ? "scale-150" : ""
        } ${off ? "opacity-40" : ""}`}
        style={{ left: `${clamp(pct, 0, 100)}%` }}
      />
    );
  }

  return (
    <div className="flex flex-col gap-2">
      {canZoom(duration) && (
        <div className="flex items-center justify-between gap-3 text-xs text-ink-muted tabular-nums">
          <span aria-live="polite">
            {zoom > 1.01 ? `${formatTimecode(view.start)} – ${formatTimecode(view.end)}` : "Whole video"}
          </span>
          <div className="flex items-center gap-1.5">
            <IconButton icon="minus" compact label="Zoom out of the timeline" disabled={zoom <= 1.01} onClick={() => zoomBy(1 / ZOOM_STEP)} />
            <span className="min-w-9 text-center" aria-label={`Timeline zoom ${zoom.toFixed(1)} times`}>
              {zoom < 9.95 ? zoom.toFixed(1) : Math.round(zoom)}×
            </span>
            <IconButton icon="plus" compact label="Zoom in on the timeline" disabled={span <= MIN_VIEW + 1e-6} onClick={() => zoomBy(ZOOM_STEP)} />
            <button
              type="button"
              onClick={() => setView(fullView(duration))}
              disabled={zoom <= 1.01}
              className="relative ml-1 rounded-md border border-border-strong px-2 py-0.5 text-ink before:absolute before:-inset-1.5 hover:bg-surface-hover disabled:opacity-40"
            >
              Fit
            </button>
          </div>
        </div>
      )}

      <div
        ref={trackRef}
        onPointerDown={scrub}
        onPointerMove={scrub}
        data-skeleton="block"
        className="group relative flex h-8 w-full cursor-pointer touch-none items-center select-none sm:h-6"
      >
        {/* what's on the timeline, cut off at its ends when zoomed in */}
        <div className="pointer-events-none absolute inset-0 overflow-hidden">
          <div className="absolute inset-x-0 top-1/2 h-1.5 -translate-y-1/2 rounded-full bg-primary/20" />
          {ticks(view).map(({ time, major }) => (
            <div
              key={time}
              className={`absolute top-1/2 -translate-x-1/2 -translate-y-1/2 rounded-full ${major ? "h-4 w-0.5 bg-ink/70" : "h-2.5 w-px bg-ink/45"}`}
              style={{ left: `${toPct(time)}%` }}
            />
          ))}
          <div
            className="absolute top-1/2 h-1.5 -translate-y-1/2 rounded-full bg-primary"
            style={{ left: `${clamp(startPct, 0, 100)}%`, width: `${Math.max(clamp(endPct, 0, 100) - clamp(startPct, 0, 100), 0)}%` }}
          />
          {markers.map((time) => (
            <div
              key={time}
              aria-hidden="true"
              className="absolute top-0.5 h-2 w-2 -translate-x-1/2 rotate-45 rounded-[1px] bg-primary-soft ring-1 ring-bg"
              style={{ left: `${toPct(time)}%` }}
            />
          ))}
        </div>

        {shown(currentTime) && (
          <div
            className="pointer-events-none absolute top-1/2 h-3 w-3 -translate-x-1/2 -translate-y-1/2 rounded-full bg-ink shadow"
            style={{ left: `${toPct(currentTime)}%` }}
          />
        )}

        {handle("start", startPct)}
        {handle("end", endPct)}
      </div>

      {zoom > 1.01 && <Overview duration={duration} view={view} trim={trim} currentTime={currentTime} onPan={(start) => setView(viewAt(start, span, duration))} />}
    </div>
  );
}

type OverviewProps = { duration: number; view: View; trim: Trim; currentTime: number; onPan: (start: number) => void };

/** The whole video, with the part the timeline shows as a window: drag it (or use the arrow keys) to move along. */
function Overview({ duration, view, trim, currentTime, onPan }: OverviewProps) {
  const ref = useRef<HTMLDivElement>(null);
  const dragRef = useRef<{ x: number; start: number } | null>(null);
  const span = view.end - view.start;
  const pct = (t: number) => `${(t / duration) * 100}%`;

  function down(e: React.PointerEvent<HTMLDivElement>) {
    e.currentTarget.setPointerCapture(e.pointerId);
    const rect = ref.current!.getBoundingClientRect();
    const time = ((e.clientX - rect.left) / rect.width) * duration;
    // on the window: drag it; beside it: center it there, then drag
    const start = time >= view.start && time <= view.end ? view.start : time - span / 2;
    if (start !== view.start) onPan(start);
    dragRef.current = { x: e.clientX, start };
  }

  function move(e: React.PointerEvent<HTMLDivElement>) {
    if (!dragRef.current || e.buttons !== 1) return;
    const secondsPerPx = duration / ref.current!.getBoundingClientRect().width;
    onPan(dragRef.current.start + (e.clientX - dragRef.current.x) * secondsPerPx);
  }

  function key(e: React.KeyboardEvent) {
    const to: Record<string, number> = {
      ArrowLeft: view.start - span / 4,
      ArrowDown: view.start - span / 4,
      ArrowRight: view.start + span / 4,
      ArrowUp: view.start + span / 4,
      PageUp: view.start - span,
      PageDown: view.start + span,
      Home: 0,
      End: duration,
    };
    if (!(e.key in to)) return;
    e.preventDefault();
    onPan(to[e.key]);
  }

  return (
    <div
      ref={ref}
      role="slider"
      tabIndex={0}
      aria-label="Part of the video the timeline shows"
      aria-valuemin={0}
      aria-valuemax={Math.round((duration - span) * 100) / 100}
      aria-valuenow={Math.round(view.start * 100) / 100}
      aria-valuetext={`${formatTimecode(view.start)} to ${formatTimecode(view.end)}`}
      onPointerDown={down}
      onPointerMove={move}
      onPointerUp={() => (dragRef.current = null)}
      onPointerCancel={() => (dragRef.current = null)}
      onKeyDown={key}
      className="relative h-4 w-full cursor-grab touch-none rounded bg-primary/10 select-none active:cursor-grabbing"
    >
      <div className="pointer-events-none absolute inset-y-1 rounded-sm bg-primary/45" style={{ left: pct(trim.start), width: pct(trim.end - trim.start) }} />
      <div className="pointer-events-none absolute inset-y-0 w-px bg-ink/80" style={{ left: pct(currentTime) }} />
      <div
        className="pointer-events-none absolute inset-y-0 min-w-1.5 rounded border border-ink/80 bg-ink/15"
        style={{ left: pct(view.start), width: pct(span) }}
      />
    </div>
  );
}
