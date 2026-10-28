import { useId } from "react";
import { ASPECTS, MIN_CROP, centeredCrop, setCropField, type Crop, type Size } from "../lib/crop";
import { NumberField } from "./ui";

type CropControlsProps = {
  frame: Size;
  crop: Crop | null; // null: the whole frame
  aspect: string; // "Full" or a key of ASPECTS
  onChange: (crop: Crop | null, aspect: string) => void;
};

const FIELDS = [
  { key: "x", label: "X" },
  { key: "y", label: "Y" },
  { key: "width", label: "Width" },
  { key: "height", label: "Height" },
] as const;

export function CropControls({ frame, crop, aspect, onChange }: CropControlsProps) {
  const id = useId();
  const ratio = ASPECTS[aspect] ?? null;
  const shown = crop ?? { x: 0, y: 0, ...frame };

  function pick(next: string) {
    onChange(next === "Full" ? null : centeredCrop(frame, ASPECTS[next]), next);
  }

  const min = { x: 0, y: 0, width: Math.min(MIN_CROP, frame.width), height: Math.min(MIN_CROP, frame.height) };
  const max = { x: frame.width - shown.width, y: frame.height - shown.height, width: frame.width, height: frame.height };

  return (
    <div className="flex flex-col gap-4 text-sm">
      <fieldset>
        <legend className="sr-only">Crop shape</legend>
        <div className="flex flex-wrap gap-2">
          {["Full", ...Object.keys(ASPECTS)].map((option) => (
            <label
              key={option}
              className="cursor-pointer rounded-lg border border-border-strong bg-surface-alt px-3 py-1.5 text-ink transition-colors hover:bg-surface-hover has-checked:border-primary has-checked:bg-primary has-focus-visible:outline-2 has-focus-visible:outline-offset-2 has-focus-visible:outline-primary-soft"
            >
              <input type="radio" name={id} className="sr-only" checked={aspect === option} onChange={() => pick(option)} />
              <span>{option}</span>
            </label>
          ))}
        </div>
      </fieldset>

      <div className="grid grid-cols-2 gap-3 tabular-nums sm:grid-cols-4">
        {FIELDS.map(({ key, label }) => (
          <div key={key} className="flex flex-col gap-1">
            <label htmlFor={`${id}-${key}`} className="text-ink-muted">
              {label} <span className="sr-only">(pixels)</span>
            </label>
            <NumberField
              id={`${id}-${key}`}
              value={shown[key]}
              min={min[key]}
              max={max[key]}
              disabled={crop === null}
              onChange={(value) => onChange(setCropField(shown, key, value, frame, ratio), aspect)}
              className="w-full"
            />
          </div>
        ))}
      </div>
    </div>
  );
}
