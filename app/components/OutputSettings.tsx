import { useState } from "react";
import { MAX_COLORS, MAX_GIF_FPS, MIN_COLORS } from "../lib/gif";
import { clamp } from "../lib/time";
import { IconButton, Pending } from "./ui";

export type Settings = { fps: number; colors: number; scale: number };

type OutputSettingsProps = {
  settings: Settings;
  onChange: (settings: Settings) => void;
  maxFps: number | null; // null until the video's frame rate is known
  sourceWidth: number;
};

export function OutputSettings({ settings, onChange, maxFps, sourceWidth }: OutputSettingsProps) {
  const fpsLimit = maxFps ?? MAX_GIF_FPS;
  const set = (patch: Partial<Settings>) => onChange({ ...settings, ...patch });
  const setFps = (fps: number) => set({ fps: clamp(Math.round(fps), 1, fpsLimit) });
  // what's typed in the FPS box, so it can be cleared and retyped without snapping back
  const [fpsDraft, setFpsDraft] = useState<string | null>(null);

  return (
    <div className="grid gap-5 text-sm text-ink-muted tabular-nums sm:grid-cols-[auto_1fr_1fr] sm:gap-6 lg:grid-cols-1 lg:gap-5">
      <div className="flex items-center justify-between gap-3 sm:flex-col sm:items-start sm:justify-start lg:flex-row lg:items-center lg:justify-between">
        <label htmlFor="gif-fps" className="text-ink">
          FPS <span className="text-ink-muted">(max {maxFps ?? <Pending placeholder="00" />})</span>
        </label>
        <div className="flex items-center gap-3 sm:gap-2">
          <IconButton icon="minus" compact label="Decrease FPS" onClick={() => setFps(settings.fps - 1)} />
          <input
            type="number"
            inputMode="numeric"
            min={1}
            max={fpsLimit}
            id="gif-fps"
            value={fpsDraft ?? settings.fps}
            onChange={(e) => {
              setFpsDraft(e.target.value);
              const next = Number(e.target.value);
              if (e.target.value !== "" && next >= 1 && next <= fpsLimit) setFps(next);
            }}
            onBlur={() => {
              if (fpsDraft !== null && fpsDraft !== "" && !Number.isNaN(Number(fpsDraft))) setFps(Number(fpsDraft));
              setFpsDraft(null);
            }}
            onKeyDown={(e) => e.key === "Enter" && e.currentTarget.blur()}
            // 16px on phones: iOS zooms into any smaller input on focus
            className="h-10 w-14 rounded-lg border border-border-strong bg-surface-alt text-center text-base text-ink sm:h-8 sm:w-12 sm:text-sm [appearance:textfield] [&::-webkit-inner-spin-button]:appearance-none [&::-webkit-outer-spin-button]:appearance-none"
          />
          <IconButton icon="plus" compact label="Increase FPS" onClick={() => setFps(settings.fps + 1)} />
        </div>
      </div>
      <label className="flex min-w-0 flex-col gap-1.5">
        <span className="flex justify-between gap-3">
          <span className="text-ink">Quality</span>
          <span>{settings.colors} colors</span>
        </span>
        <input
          type="range"
          min={MIN_COLORS}
          max={MAX_COLORS}
          value={settings.colors}
          onChange={(e) => set({ colors: Number(e.target.value) })}
          className="h-8 w-full accent-primary lg:h-6"
        />
      </label>
      <label className="flex min-w-0 flex-col gap-1.5">
        <span className="flex justify-between gap-3">
          <span className="text-ink">Size</span>
          <span className="truncate">
            {settings.scale}x · {Math.round(sourceWidth * settings.scale)} px wide
          </span>
        </span>
        <input
          type="range"
          min={0.1}
          max={4}
          step={0.05}
          value={settings.scale}
          onChange={(e) => set({ scale: Number(e.target.value) })}
          className="h-8 w-full accent-primary lg:h-6"
        />
      </label>
    </div>
  );
}
