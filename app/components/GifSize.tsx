import { formatBytes } from "../lib/format";
import { Pending } from "./ui";

type GifSizeProps = {
  bytes: number | null | undefined; // undefined: not estimated yet; null: couldn't be
  current: boolean; // false: the settings changed and it's being redone
  progress: number | null; // 0..1 while it's worked out (null: about to start)
};

export function GifSize({ bytes, current, progress }: GifSizeProps) {
  const text = bytes === null ? "can't estimate" : `~${formatBytes(bytes ?? 0)}`;
  return (
    <p className="flex items-baseline justify-between gap-3 text-sm tabular-nums">
      <span className="text-ink">File size</span>
      {/* busy while it's worked out, so screen readers only hear the result */}
      <span aria-live="polite" aria-busy={!current} className="text-ink-muted">
        {current ? (
          text
        ) : progress === null ? (
          <Pending placeholder={bytes === undefined ? "~0.0 MB" : text} />
        ) : (
          `estimating… ${Math.round(progress * 100)}%`
        )}
      </span>
    </p>
  );
}
