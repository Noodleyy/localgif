// Small browser-side helpers: remembered settings and the converter download progress.
import { afterEach, describe, expect, it, vi } from "vitest";
import { loadSettings, saveSettings } from "../app/lib/settings";
import { fetchWithProgress } from "../app/lib/ffmpeg";

function memoryStorage(initial: Record<string, string> = {}) {
  const data = { ...initial };
  return {
    data,
    getItem: (key: string) => data[key] ?? null,
    setItem: (key: string, value: string) => void (data[key] = value),
  };
}

describe("remembered settings", () => {
  it("round-trips FPS and quality, but not size", () => {
    const storage = memoryStorage();
    saveSettings({ fps: 24, colors: 64, scale: 0.5 } as never, storage);
    expect(JSON.parse(Object.values(storage.data)[0])).toEqual({ fps: 24, colors: 64 });
    expect(loadSettings(storage)).toEqual({ fps: 24, colors: 64 });
  });

  it("starts from defaults when nothing is saved", () => {
    expect(loadSettings(memoryStorage())).toEqual({});
  });

  it("drops values that are out of range or the wrong type", () => {
    const save = (value: unknown) => memoryStorage({ "nobsvideo2gif:settings": JSON.stringify(value) });
    expect(loadSettings(save({ fps: 0, colors: 2 }))).toEqual({});
    expect(loadSettings(save({ fps: 500, colors: 1000 }))).toEqual({});
    expect(loadSettings(save({ fps: "12", colors: null }))).toEqual({});
    expect(loadSettings(save({ fps: 12 }))).toEqual({ fps: 12 });
    expect(loadSettings(save(null))).toEqual({});
  });

  it("survives corrupt data and blocked storage", () => {
    expect(loadSettings(memoryStorage({ "nobsvideo2gif:settings": "{not json" }))).toEqual({});
    const blocked = {
      getItem: () => {
        throw new DOMException("denied", "SecurityError");
      },
      setItem: () => {
        throw new DOMException("full", "QuotaExceededError");
      },
    };
    expect(loadSettings(blocked)).toEqual({});
    expect(() => saveSettings({ fps: 10, colors: 256 }, blocked)).not.toThrow();
  });
});

describe("converter download progress", () => {
  afterEach(() => vi.unstubAllGlobals());

  function serve(chunks: number[], status = 200) {
    vi.stubGlobal("fetch", async () => {
      const body = new ReadableStream<Uint8Array>({
        start(controller) {
          for (const size of chunks) controller.enqueue(new Uint8Array(size));
          controller.close();
        },
      });
      return new Response(status === 200 ? body : null, { status });
    });
  }

  it("reports progress per chunk and returns the whole file", async () => {
    serve([250, 250, 500]);
    const seen: number[] = [];
    const blob = await fetchWithProgress("/x.wasm", 1000, (f) => seen.push(f), "application/wasm");
    expect(seen).toEqual([0.25, 0.5, 1]);
    expect(blob.size).toBe(1000);
    expect(blob.type).toBe("application/wasm");
  });

  it("never reports more than 100% when the size is off", async () => {
    serve([600, 600]);
    const seen: number[] = [];
    await fetchWithProgress("/x.wasm", 1000, (f) => seen.push(f));
    expect(Math.max(...seen)).toBe(1);
  });

  it("reports nothing when the size is unknown", async () => {
    serve([100]);
    const seen: number[] = [];
    await fetchWithProgress("/x.wasm", 0, (f) => seen.push(f));
    expect(seen).toEqual([]);
  });

  it("fails on an HTTP error", async () => {
    serve([], 404);
    await expect(fetchWithProgress("/x.wasm", 1000, () => {})).rejects.toThrow("HTTP 404");
  });
});
