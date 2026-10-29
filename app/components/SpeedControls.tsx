import { formatSeconds } from "../lib/format";
import { Choices } from "./ui";

export const SPEEDS = [0.25, 0.5, 0.75, 1, 1.5, 2] as const;
const OPTIONS = SPEEDS.map((speed) => ({ value: speed, label: `${speed}×` }));

type SpeedControlsProps = {
  speed: number;
  clipDuration: number; // the trim, in seconds of video
  onChange: (speed: number) => void;
};

export function SpeedControls({ speed, clipDuration, onChange }: SpeedControlsProps) {
  return (
    <div className="flex flex-col gap-3 text-sm">
      <Choices legend="Playback speed of the GIF" options={OPTIONS} value={speed} onChange={onChange} />
      <p className="text-ink-muted tabular-nums">
        {speed < 1 ? "Slow motion: " : speed > 1 ? "Sped up: " : ""}
        {formatSeconds(clipDuration)} of video plays as a {formatSeconds(clipDuration / speed)} GIF
      </p>
    </div>
  );
}
