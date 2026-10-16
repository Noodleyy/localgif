"use client";

import { useRef, useState } from "react";
import { clamp, formatTimecode } from "../lib/time";

export type Trim = { start: number; end: number };
type Edge = keyof Trim;

type TimelineProps = {
  duration: number;
  currentTime: number;
  trim: Trim;
  onSeek: (time: number) => void;
  onTrimChange: (trim: Trim) => void;
  onNudgeTrim: (edge: Edge, direction: 1 | -1) => void;
};

export function Timeline({ duration, currentTime, trim, onSeek, onTrimChange, onNudgeTrim }: TimelineProps) {
  const trackRef = useRef<HTMLDivElement>(null);
  const [dragging, setDragging] = useState<Edge | null>(null);

  const toPct = (t: number) => (duration > 0 ? (clamp(t, 0, duration) / duration) * 100 : 0);
  const startPct = toPct(trim.start);
  const endPct = toPct(trim.end);

  function timeAt(clientX: number) {
    const rect = trackRef.current?.getBoundingClientRect();
    if (!rect || rect.width === 0) return 0;
    return clamp((clientX - rect.left) / rect.width, 0, 1) * duration;
  }

  // Click/drag on the track scrubs the playhead.
  function scrub(e: React.PointerEvent<HTMLDivElement>) {
    if (e.type === "pointerdown") e.currentTarget.setPointerCapture(e.pointerId);
    else if (e.buttons !== 1) return;
    onSeek(timeAt(e.clientX));
  }

  // Dragging a handle moves that trim edge (start can't pass end and vice versa).
  function dragHandle(edge: Edge, e: React.PointerEvent<HTMLDivElement>) {
    e.stopPropagation();
    if (e.type === "pointerdown") {
      e.currentTarget.setPointerCapture(e.pointerId);
      setDragging(edge);
    } else if (e.buttons !== 1) return;
    const t = timeAt(e.clientX);
    const time = edge === "start" ? Math.min(t, trim.end) : Math.max(t, trim.start);
    onTrimChange({ ...trim, [edge]: time });
    onSeek(time);
  }

  function stopDrag(e: React.PointerEvent<HTMLDivElement>) {
    e.stopPropagation();
    setDragging(null);
  }

  function handle(edge: Edge, pct: number) {
    return (
      <div
        onPointerDown={(e) => dragHandle(edge, e)}
        onPointerMove={(e) => dragHandle(edge, e)}
        onPointerUp={stopDrag}
        onPointerCancel={stopDrag}
        onKeyDown={(e) => {
          // the handles are sliders, so arrow keys move them a frame at a time
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
        // before: = invisible 32px hit area around the small handle, so it's easy to grab on touch screens
        className={`absolute top-1/2 h-4 w-2 -translate-x-1/2 -translate-y-1/2 cursor-ew-resize touch-none rounded-full bg-ink ring-2 ring-bg transition-transform before:absolute before:-inset-x-3 before:-inset-y-2 hover:scale-125 ${
          dragging === edge ? "scale-150" : ""
        }`}
        style={{ left: `${pct}%` }}
      />
    );
  }

  return (
    <div
      ref={trackRef}
      onPointerDown={scrub}
      onPointerMove={scrub}
      className="group relative flex h-8 w-full cursor-pointer sm:h-6 touch-none items-center select-none"
    >
      {/* full-length track */}
      <div className="absolute inset-x-0 h-1.5 rounded-full bg-primary/20" />

      {/* tick marks hinting the track is draggable */}
      <div className="pointer-events-none absolute inset-x-0 top-1/2 flex -translate-y-1/2 justify-between">
        {Array.from({ length: 21 }, (_, i) => (
          <div
            key={i}
            className={i % 5 === 0 ? "h-4 w-0.5 rounded-full bg-ink/70" : "h-2.5 w-px rounded-full bg-ink/45"}
          />
        ))}
      </div>

      {/* the range that will be exported */}
      <div
        className="absolute h-1.5 rounded-full bg-primary"
        style={{ left: `${startPct}%`, width: `${Math.max(endPct - startPct, 0)}%` }}
      />

      {/* playhead */}
      <div
        className="pointer-events-none absolute top-1/2 h-3 w-3 -translate-x-1/2 -translate-y-1/2 rounded-full bg-ink shadow"
        style={{ left: `${toPct(currentTime)}%` }}
      />

      {handle("start", startPct)}
      {handle("end", endPct)}
    </div>
  );
}
