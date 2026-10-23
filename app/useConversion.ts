import { useEffect, useRef, useState } from "react";
import { getFFmpeg, onConverterLoad, resetFFmpeg } from "./lib/ffmpeg";
import { convertToGif, type GifOptions } from "./lib/gif";

export type Size = { width: number; height: number };
export type Gif = Size & { url: string; bytes: number; name: string };

/** The last conversion. `open` (below) says whether the dialog shows it. */
export type ConversionState =
  | { kind: "idle" }
  | { kind: "loading" } // waiting for the converter to download
  | { kind: "converting"; progress: number }
  | { kind: "done"; gif: Gif }
  | { kind: "failed"; error: string };

/** One conversion at a time: start, cancel, progress, and the last GIF (kept for "View GIF"). */
export function useConversion() {
  const [state, setState] = useState<ConversionState>({ kind: "idle" });
  const [open, setOpen] = useState(false);
  const [converterLoad, setConverterLoad] = useState<number | null>(null); // 0..1 while it downloads
  // cancelling bumps the run number, so the cancelled run knows to stop
  const runRef = useRef(0);

  useEffect(() => onConverterLoad(setConverterLoad), []);

  // the last GIF stays until a new conversion or video replaces it (closing the dialog keeps it)
  function forgetGif() {
    if (state.kind === "done") URL.revokeObjectURL(state.gif.url);
  }

  async function convert(file: File, options: GifOptions, size: Size) {
    const run = ++runRef.current;
    const isCurrent = () => runRef.current === run;
    forgetGif();
    setState({ kind: "loading" });
    setOpen(true);
    try {
      const ffmpeg = await getFFmpeg();
      if (!isCurrent()) return;
      setState({ kind: "converting", progress: 0 });
      const data = await convertToGif(ffmpeg, file, options, (p) => {
        // whole percents, so React can skip most updates
        const progress = Math.floor(p * 100) / 100;
        if (isCurrent()) setState((s) => (s.kind === "converting" && s.progress === progress ? s : { kind: "converting", progress }));
      });
      if (!isCurrent()) return;
      const url = URL.createObjectURL(new Blob([data as Uint8Array<ArrayBuffer>], { type: "image/gif" }));
      const name = `${file.name.replace(/\.[^.]+$/, "") || "output"}.gif`;
      setState({ kind: "done", gif: { url, bytes: data.byteLength, ...size, name } });
    } catch (err) {
      if (!isCurrent()) return;
      resetFFmpeg(); // a crashed (e.g. out of memory) instance can't be reused
      setState({ kind: "failed", error: err instanceof Error ? err.message : String(err) });
    }
  }

  function cancel() {
    runRef.current++;
    // Only killing the worker stops ffmpeg. A download in progress may finish: it's needed anyway.
    if (state.kind === "converting") resetFFmpeg();
    setOpen(false);
  }

  return {
    state,
    open,
    busy: open && (state.kind === "loading" || state.kind === "converting"),
    converterLoad,
    convert,
    cancel,
    close: () => setOpen(false),
    reopen: () => setOpen(true),
    /** For a new video. */
    reset() {
      forgetGif();
      setState({ kind: "idle" });
    },
  };
}
