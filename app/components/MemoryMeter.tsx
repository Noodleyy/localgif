import { formatBytes, formatSeconds } from "../lib/format";
import type { ConversionRisk } from "../lib/memory";

// Same structure in every state so the layout never shifts. The level is always in
// words too, never only a color.
const STYLE = {
  none: { box: "border-border bg-surface-alt/40", bar: "bg-primary", text: "text-ink-muted", label: "Memory OK" },
  moderate: { box: "border-warning/40 bg-warning/10", bar: "bg-warning", text: "text-warning", label: "Close to the limit" },
  high: { box: "border-danger/40 bg-danger/10", bar: "bg-danger", text: "text-danger", label: "Likely to run out" },
};

const formatMB = (mb: number) => formatBytes(mb * 1024 * 1024);

export function MemoryMeter({ risk }: { risk: ConversionRisk }) {
  const style = STYLE[risk.level];
  const fill = Math.min(risk.estimatedMB / risk.limitMB, 1) * 100;

  return (
    <div className={`flex flex-col gap-2 rounded-lg border px-4 py-3 transition-colors ${style.box}`}>
      <div className="flex flex-wrap items-baseline justify-between gap-x-3">
        <span aria-live="polite" className={`text-sm font-medium whitespace-nowrap ${style.text}`}>
          {style.label}
        </span>
        <span className="text-xs whitespace-nowrap text-ink-muted tabular-nums">
          ~{formatMB(risk.estimatedMB)} / {formatMB(risk.limitMB)}
        </span>
      </div>
      <div className="h-1.5 overflow-hidden rounded-full bg-ink/10">
        <div className={`h-full rounded-full transition-all duration-300 ${style.bar}`} style={{ width: `${fill}%` }} />
      </div>
      <div className="text-xs text-ink-muted">
        <p className="truncate tabular-nums">About {formatSeconds(risk.maxSeconds)} fits at this size and FPS.</p>
        <p>Every GIF frame is held in memory until the end.</p>
      </div>
    </div>
  );
}
