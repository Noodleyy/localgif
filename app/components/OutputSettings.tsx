"use client";

import { useState } from "react";
import { MAX_COLORS, MAX_GIF_FPS, MIN_COLORS } from "../lib/gif";
import { clamp } from "../lib/time";
import { Pending } from "./Pending";

export type Settings = { fps: number; colors: number; scale: number };

type OutputSettingsProps = {
  settings: Settings;
  onChange: (settings: Settings) => void;
  maxFps: number | null; // null until the video's frame rate is known
  sourceWidth: number;
};

// before: gives the small buttons a bigger, invisible touch area
const roundButtonClass =
  "relative flex h-8 w-8 before:absolute before:-inset-1.5 items-center sm:h-6 sm:w-6 sm:before:-inset-2 justify-center rounded-full border border-border-strong bg-surface-alt text-ink shadow-sm hover:bg-surface-hover";

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
          <button
            type="button"
            onClick={() => setFps(settings.fps - 1)}
            aria-label="Decrease FPS"
            title="Decrease FPS"
            className={roundButtonClass}
          >
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" className="h-3 w-3">
              <path d="M5 12h14" />
            </svg>
          </button>
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
          <button
            type="button"
            onClick={() => setFps(settings.fps + 1)}
            aria-label="Increase FPS"
            title="Increase FPS"
            className={roundButtonClass}
          >
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" className="h-3 w-3">
              <path d="M12 5v14M5 12h14" />
            </svg>
          </button>
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
