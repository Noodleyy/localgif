import { KEYFRAME_SNAP, type Keyframe } from "../lib/crop";
import { formatTimecode } from "../lib/format";
import { IconButton } from "./ui";

type CropMotionProps = {
  keyframes: Keyframe[]; // none: the crop stays put
  time: number; // the moment the preview shows
  disabled: boolean; // no crop to move (the whole frame)
  onToggle: (on: boolean) => void;
  onAdd: () => void; // a keyframe where the crop is now
  onRemove: (keyframe: Keyframe) => void;
  onSeek: (time: number) => void;
};

/** Keyframes for a crop that moves: it glides from one to the next. */
export function CropMotion({ keyframes, time, disabled, onToggle, onAdd, onRemove, onSeek }: CropMotionProps) {
  const on = keyframes.length > 0;
  const here = keyframes.some((k) => Math.abs(k.time - time) < KEYFRAME_SNAP);
  return (
    <div className="flex flex-col gap-3">
      <label className={`flex items-center gap-2 text-ink ${disabled ? "opacity-50" : "cursor-pointer"}`}>
        <input type="checkbox" checked={on} disabled={disabled} onChange={(e) => onToggle(e.target.checked)} className="h-4 w-4 accent-primary" />
        Move the crop over time
      </label>

      {on && (
        <>
          <p className="text-ink-muted">
            Go to another moment and drag the frame, or change X and Y: that sets a keyframe, and the crop glides from one
            keyframe to the next.
          </p>
          <ol aria-label="Crop keyframes" className="flex flex-col gap-1.5 tabular-nums">
            {keyframes.map((k) => {
              const current = Math.abs(k.time - time) < KEYFRAME_SNAP;
              return (
                <li
                  key={k.time}
                  className={`flex items-center gap-3 rounded-lg border px-2 py-1 ${current ? "border-primary-soft/60 bg-primary/15" : "border-border"}`}
                >
                  <button
                    type="button"
                    onClick={() => onSeek(k.time)}
                    aria-current={current || undefined}
                    aria-label={`Go to the keyframe at ${formatTimecode(k.time)}`}
                    className="rounded px-1 font-medium text-ink underline-offset-2 hover:underline"
                  >
                    {formatTimecode(k.time)}
                  </button>
                  <span className="flex-1 text-ink-muted">
                    X {k.x}, Y {k.y}
                  </span>
                  <IconButton icon="close" compact label={`Remove the keyframe at ${formatTimecode(k.time)}`} onClick={() => onRemove(k)} />
                </li>
              );
            })}
          </ol>
          {!here && (
            <button
              type="button"
              onClick={onAdd}
              className="self-start rounded-lg border border-border-strong bg-surface-alt px-3 py-1.5 text-ink tabular-nums hover:bg-surface-hover"
            >
              Add keyframe at {formatTimecode(time)}
            </button>
          )}
        </>
      )}
    </div>
  );
}
