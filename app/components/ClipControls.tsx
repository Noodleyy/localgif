import { formatTimecode } from "../lib/format";
import { IconButton, Pending, press } from "./ui";
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
        <IconButton icon="stepBack" iconClassName="h-3.5 w-3.5" label="Step preview back one frame" onClick={() => p.onStepFrame(-1)} disabled={!p.canPlay} />
        <button
          onClick={p.onTogglePlay}
          disabled={!p.canPlay}
          className={`relative flex h-8 w-16 items-center before:absolute before:-inset-y-1.5 justify-center rounded-lg bg-primary text-sm font-medium text-ink hover:bg-primary-hover disabled:pointer-events-none disabled:opacity-40 ${press}`}
        >
          {p.isPlaying ? "Pause" : "Play"}
        </button>
        <IconButton icon="stepForward" iconClassName="h-3.5 w-3.5" label="Step preview forward one frame" onClick={() => p.onStepFrame(1)} disabled={!p.canPlay} />
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
            <IconButton icon="chevronLeft" tone="primary" compact label={`Move trim ${edge} one frame earlier`} onClick={() => p.onNudgeTrim(edge, -1)} />
            <span className="tabular-nums">
              {edge === "start" ? "Start" : "End"} {formatTimecode(p.trim[edge])}
            </span>
            <IconButton icon="chevronRight" tone="primary" compact label={`Move trim ${edge} one frame later`} onClick={() => p.onNudgeTrim(edge, 1)} />
          </div>
        ))}
      </div>
    </div>
  );
}
