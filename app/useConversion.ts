import { useEffect, useRef, useState } from "react";
import { getFFmpeg, onConverterLoad, resetFFmpeg } from "./lib/ffmpeg";
import { convertToGif, type GifOptions } from "./lib/gif";
import type { Gif } from "./components/GifResult";

/** One conversion at a time: start, cancel, progress, and the last GIF (kept for "View GIF"). */
export function useConversion() {
  const [isConverting, setIsConverting] = useState(false);
  const [progress, setProgress] = useState<number | null>(null); // null while the converter loads
  const [converterLoad, setConverterLoad] = useState<number | null>(null);
  const [gif, setGif] = useState<Gif | null>(null);
  const [showResult, setShowResult] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // cancelling bumps the run number, so the cancelled run knows to stop
  const runRef = useRef(0);
  const phaseRef = useRef<"loading" | "converting">("loading");

  useEffect(() => onConverterLoad(setConverterLoad), []);

  function discard() {
    // after the dialog's exit animation is done with it
    if (gif) setTimeout(() => URL.revokeObjectURL(gif.url), 1000);
    setGif(null);
  }

  function close() {
    setShowResult(false);
    setError(null);
  }

  async function convert(file: File, options: GifOptions, size: { width: number; height: number }) {
    const run = ++runRef.current;
    const isCancelled = () => runRef.current !== run;
    phaseRef.current = "loading";
    discard();
    setError(null);
    setShowResult(true);
    setIsConverting(true);
    setProgress(null);
    try {
      const ffmpeg = await getFFmpeg();
      if (isCancelled()) return;
      phaseRef.current = "converting";
      setProgress(0);
      // whole percents, so React can skip most updates
      const data = await convertToGif(ffmpeg, file, options, (p) => {
        if (!isCancelled()) setProgress(Math.floor(p * 100) / 100);
      });
      const url = URL.createObjectURL(new Blob([data as Uint8Array<ArrayBuffer>], { type: "image/gif" }));
      if (isCancelled()) return URL.revokeObjectURL(url);
      const name = `${file.name.replace(/\.[^.]+$/, "") || "output"}.gif`;
      setGif({ url, bytes: data.byteLength, ...size, name });
    } catch (err) {
      if (isCancelled()) return;
      setError(err instanceof Error ? err.message : String(err));
      resetFFmpeg(); // a crashed (e.g. out of memory) instance can't be reused
    } finally {
      if (!isCancelled()) setIsConverting(false);
    }
  }

  function cancel() {
    runRef.current++;
    // Only killing the worker stops ffmpeg. A download in progress may finish: it's needed anyway.
    if (phaseRef.current === "converting") resetFFmpeg();
    setIsConverting(false);
    setShowResult(false);
  }

  return {
    isConverting,
    progress,
    converterLoad,
    gif,
    error,
    showResult,
    dialogOpen: isConverting || (showResult && (gif !== null || error !== null)),
    convert,
    cancel,
    close,
    reopen: () => setShowResult(true),
    discard,
  };
}
