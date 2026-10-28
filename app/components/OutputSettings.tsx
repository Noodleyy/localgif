import type { Size } from "../lib/crop";
import { MAX_COLORS, MAX_GIF_FPS, MIN_COLORS } from "../lib/gif";
import { clamp } from "../lib/time";
import { IconButton, NumberField, Pending } from "./ui";

export type Settings = { fps: number; colors: number; scale: number };

type OutputSettingsProps = {
  settings: Settings;
  onChange: (settings: Settings) => void;
  maxFps: number | null; // null until the video's frame rate is known
  frame: Size; // what gets scaled: the (cropped) video
};

export function OutputSettings({ settings, onChange, maxFps, frame }: OutputSettingsProps) {
  const fpsLimit = maxFps ?? MAX_GIF_FPS;
  const set = (patch: Partial<Settings>) => onChange({ ...settings, ...patch });
  const setFps = (fps: number) => set({ fps: clamp(Math.round(fps), 1, fpsLimit) });

  return (
    <div className="grid gap-5 text-sm text-ink-muted tabular-nums sm:grid-cols-[auto_1fr_1fr] sm:gap-6 lg:grid-cols-1 lg:gap-5">
      <div className="flex items-center justify-between gap-3 sm:flex-col sm:items-start sm:justify-start lg:flex-row lg:items-center lg:justify-between">
        <label htmlFor="gif-fps" className="text-ink">
          FPS <span className="text-ink-muted">(max {maxFps ?? <Pending placeholder="00" />})</span>
        </label>
        <div className="flex items-center gap-3 sm:gap-2">
          <IconButton icon="minus" compact label="Decrease FPS" onClick={() => setFps(settings.fps - 1)} />
          <NumberField id="gif-fps" min={1} max={fpsLimit} value={settings.fps} onChange={setFps} className="w-14 sm:w-12" />
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
            {settings.scale}x · {Math.max(1, Math.round(frame.width * settings.scale))}×{Math.max(1, Math.round(frame.height * settings.scale))} px
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
