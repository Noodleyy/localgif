import { useEffect, useState } from "react";
import { getEstimator, resetEstimator } from "./lib/ffmpeg";
import { estimateGifBytes, type GifOptions } from "./lib/gif";

type Estimate = { file: File; key: string; bytes: number | null }; // null: couldn't estimate

/**
 * How big the GIF will be (see estimateGifBytes), redone shortly after the settings stop
 * changing. A change, or `paused` (while converting), stops an estimate under way at once:
 * it has its own ffmpeg worker, which is killed.
 */
export function useSizeEstimate(file: File | null, options: GifOptions | null, paused: boolean) {
  const [estimate, setEstimate] = useState<Estimate | null>(null);
  const [progress, setProgress] = useState<number | null>(null); // 0..1 while estimating
  const key = options && JSON.stringify(options); // a new object every render; the same values

  useEffect(() => {
    if (!file || !key || paused || (estimate?.file === file && estimate.key === key)) return;
    let stopped = false;
    let running = false;
    const timer = setTimeout(async () => {
      running = true;
      setProgress(0);
      const bytes = await getEstimator()
        .then((ffmpeg) =>
          estimateGifBytes(ffmpeg, file, JSON.parse(key), (p) => {
            if (!stopped) setProgress(Math.floor(p * 100) / 100); // whole percents: fewer updates
          })
        )
        .catch(() => {
          if (!stopped) resetEstimator(); // e.g. out of memory: a crashed worker can't be reused
          return null;
        });
      running = false;
      if (stopped) return;
      setProgress(null);
      setEstimate({ file, key, bytes });
    }, 500);
    return () => {
      stopped = true;
      clearTimeout(timer);
      if (running) resetEstimator();
      setProgress(null);
    };
  }, [file, key, paused, estimate]);

  const ofFile = estimate?.file === file ? estimate : null;
  return {
    bytes: ofFile?.bytes, // undefined: none yet
    current: ofFile?.key === key, // false while it's being worked out
    progress,
  };
}
