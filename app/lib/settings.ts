import { clampColors, clampFps } from "./gif";

// Only FPS and quality: the size is relative to each video.
type SavedSettings = { fps: number; colors: number };

const KEY = "localgif:settings";

export function loadSettings(storage?: Pick<Storage, "getItem">): Partial<SavedSettings> {
  try {
    // inside the try: even touching localStorage throws when storage is blocked
    const saved = JSON.parse((storage ?? localStorage).getItem(KEY) ?? "{}");
    const result: Partial<SavedSettings> = {};
    if (Number.isFinite(saved.fps) && clampFps(saved.fps) === saved.fps) result.fps = saved.fps;
    if (Number.isInteger(saved.colors) && clampColors(saved.colors) === saved.colors) result.colors = saved.colors;
    return result;
  } catch {
    return {};
  }
}

export function saveSettings(settings: SavedSettings, storage?: Pick<Storage, "setItem">) {
  try {
    (storage ?? localStorage).setItem(KEY, JSON.stringify({ fps: settings.fps, colors: settings.colors }));
  } catch {}
}
