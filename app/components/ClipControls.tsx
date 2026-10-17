import { formatTimecode } from "../lib/time";
import { Pending } from "./Pending";
import { Timeline, type Trim } from "./Timeline";

type ClipControlsProps = {
  duration: number;
  sourceFps: number | null;
  currentTime: number;
  isPlaying: boolean;
  canPlay: boolean;
  trim: Trim;
  onTrimChange: (trim: Trim) => void;
  onSeek: (time: number) => void;
  onTogglePlay: () => void;
  onStepFrame: (direction: 1 | -1) => void;
  onNudgeTrim: (edge: "start" | "end", direction: 1 | -1) => void;
};

// before: gives the small buttons a bigger, invisible touch area
const press = "transition-transform motion-safe:hover:scale-105 motion-safe:active:scale-95";
const stepButtonClass = `relative flex h-8 w-8 before:absolute before:-inset-1.5 items-center justify-center rounded-full border border-border-strong bg-surface-alt text-ink shadow-sm hover:bg-surface-hover disabled:pointer-events-none disabled:opacity-40 ${press}`;
const nudgeButtonClass =
  "relative flex h-8 w-8 before:absolute before:-inset-1.5 sm:h-6 sm:w-6 sm:before:-inset-2 items-center justify-center rounded-full border border-primary-soft/50 bg-primary/15 text-ink shadow-sm hover:bg-primary/30";

export function ClipControls(p: ClipControlsProps) {
  return (
    <div className="flex flex-col gap-3">
      <Timeline
        duration={p.duration}
        currentTime={p.currentTime}
        trim={p.trim}
        onSeek={p.onSeek}
        onTrimChange={p.onTrimChange}
        onNudgeTrim={p.onNudgeTrim}
      />

      <div className="flex items-center justify-center gap-3">
        <button
          onClick={() => p.onStepFrame(-1)}
          disabled={!p.canPlay}
          aria-label="Step preview back one frame"
          title="Step preview back one frame"
          className={stepButtonClass}
        >
          <svg viewBox="0 0 24 24" fill="currentColor" className="h-3.5 w-3.5">
            <path d="M9.195 18.44c1.25.714 2.805-.189 2.805-1.629v-2.34l6.945 3.968c1.25.715 2.805-.188 2.805-1.628V8.69c0-1.44-1.555-2.343-2.805-1.628L12 11.03v-2.34c0-1.44-1.555-2.343-2.805-1.628l-7.108 4.061c-1.26.72-1.26 2.536 0 3.256l7.108 4.061Z" />
          </svg>
        </button>
        <button
          onClick={p.onTogglePlay}
          disabled={!p.canPlay}
          className={`relative flex h-8 w-16 items-center before:absolute before:-inset-y-1.5 justify-center rounded-lg bg-primary text-sm font-medium text-ink hover:bg-primary-hover disabled:pointer-events-none disabled:opacity-40 ${press}`}
        >
          {p.isPlaying ? "Pause" : "Play"}
        </button>
        <button
          onClick={() => p.onStepFrame(1)}
          disabled={!p.canPlay}
          aria-label="Step preview forward one frame"
          title="Step preview forward one frame"
          className={stepButtonClass}
        >
          <svg viewBox="0 0 24 24" fill="currentColor" className="h-3.5 w-3.5">
            <path d="M5.055 7.06C3.805 6.347 2.25 7.25 2.25 8.69v8.122c0 1.44 1.555 2.343 2.805 1.628L12 14.471v2.34c0 1.44 1.555 2.343 2.805 1.628l7.108-4.061c1.26-.72 1.26-2.536 0-3.256l-7.108-4.061C13.555 6.346 12 7.249 12 8.689v2.34L5.055 7.06Z" />
          </svg>
        </button>
      </div>

      {/* two fixed halves, so the FPS arriving later doesn't push "Length" sideways */}
      <div className="grid grid-cols-2 gap-4 text-sm text-ink-muted tabular-nums">
        <span className="text-right">Length {formatTimecode(p.duration)}</span>
        <span>FPS {p.sourceFps !== null ? p.sourceFps.toFixed(2) : <Pending placeholder="00.00" />}</span>
      </div>

      <p className="text-center text-xs text-ink-muted">Drag the white handles, or fine-tune frame by frame:</p>

      <div className="flex flex-wrap items-center justify-center gap-x-6 gap-y-2 text-sm text-ink-muted">
        {(["start", "end"] as const).map((edge) => (
          <div key={edge} className="flex items-center gap-1.5">
            <button
              onClick={() => p.onNudgeTrim(edge, -1)}
              aria-label={`Move trim ${edge} one frame earlier`}
              title={`Move trim ${edge} one frame earlier`}
              className={nudgeButtonClass}
            >
              <Chevron d="M15 18l-6-6 6-6" />
            </button>
            <span className="tabular-nums">
              {edge === "start" ? "Start" : "End"} {formatTimecode(p.trim[edge])}
            </span>
            <button
              onClick={() => p.onNudgeTrim(edge, 1)}
              aria-label={`Move trim ${edge} one frame later`}
              title={`Move trim ${edge} one frame later`}
              className={nudgeButtonClass}
            >
              <Chevron d="M9 18l6-6-6-6" />
            </button>
          </div>
        ))}
      </div>
    </div>
  );
}

function Chevron({ d }: { d: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.5} strokeLinecap="round" strokeLinejoin="round" className="h-3 w-3">
      <path d={d} />
    </svg>
  );
}
