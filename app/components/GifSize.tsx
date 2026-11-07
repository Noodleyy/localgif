import { formatBytes } from "../lib/format";
import { Pending } from "./ui";

type GifSizeProps = {
  bytes: number | null | undefined; // undefined: not estimated yet; null: couldn't be
  current: boolean; // false: the settings changed and it's being redone
};

export function GifSize({ bytes, current }: GifSizeProps) {
  const text = bytes === null ? "can't estimate" : `~${formatBytes(bytes ?? 0)}`;
  return (
    <p className="flex items-baseline justify-between gap-3 text-sm tabular-nums">
      <span className="text-ink">File size</span>
      {/* busy while it's worked out, so screen readers only hear the result */}
      <span aria-live="polite" aria-busy={!current} className="text-ink-muted">
        {/* the last value's width, so the row doesn't jump */}
        {current ? text : <Pending placeholder={bytes === undefined ? "~0.0 MB" : text} />}
      </span>
    </p>
  );
}
