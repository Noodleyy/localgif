import { MAX_COLORS, MAX_GIF_FPS, MIN_COLORS } from "./gif";

// FPS and quality are remembered between visits (in this browser only). Size isn't:
// it's relative to each video, so it starts at 1x for every new file.
export type SavedSettings = { fps: number; colors: number };

const KEY = "nobsvideo2gif:settings";

/** Reads saved settings; anything missing, out of range or unreadable is left out. */
export function loadSettings(storage?: Pick<Storage, "getItem">): Partial<SavedSettings> {
  try {
    // (even reading window.localStorage can throw, e.g. with cookies blocked)
    const saved = JSON.parse((storage ?? localStorage).getItem(KEY) ?? "{}");
    const result: Partial<SavedSettings> = {};
    if (Number.isFinite(saved.fps) && saved.fps >= 1 && saved.fps <= MAX_GIF_FPS) result.fps = saved.fps;
    if (Number.isInteger(saved.colors) && saved.colors >= MIN_COLORS && saved.colors <= MAX_COLORS) result.colors = saved.colors;
    return result;
  } catch {
    return {}; // storage blocked (private mode, disabled cookies) or corrupt JSON
  }
}

export function saveSettings(settings: SavedSettings, storage?: Pick<Storage, "setItem">) {
  try {
    (storage ?? localStorage).setItem(KEY, JSON.stringify({ fps: settings.fps, colors: settings.colors }));
  } catch {
    // storage blocked or full: just don't remember
  }
}
