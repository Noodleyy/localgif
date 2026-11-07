import { useEffect, useState } from "react";
import { getFFmpeg } from "./lib/ffmpeg";
import { estimateGifBytes, type GifOptions } from "./lib/gif";

type Estimate = { file: File; key: string; bytes: number | null }; // null: couldn't estimate

/**
 * How big the GIF will be, from a few sample frames (see estimateGifBytes). Re-estimates shortly
 * after the settings stop changing; `paused` (while converting) stops it so the conversion goes first.
 */
export function useSizeEstimate(file: File | null, options: GifOptions | null, paused: boolean) {
  const [estimate, setEstimate] = useState<Estimate | null>(null);
  const key = options && JSON.stringify(options); // a new object every render; the same values

  useEffect(() => {
    if (!file || !key || paused || (estimate?.file === file && estimate.key === key)) return;
    let stopped = false;
    const timer = setTimeout(async () => {
      const bytes = await getFFmpeg()
        .then((ffmpeg) => estimateGifBytes(ffmpeg, file, JSON.parse(key), () => stopped))
        .catch(() => null);
      if (!stopped) setEstimate({ file, key, bytes });
    }, 500);
    return () => {
      stopped = true;
      clearTimeout(timer);
    };
  }, [file, key, paused, estimate]);

  const ofFile = estimate?.file === file ? estimate : null;
  return {
    bytes: ofFile?.bytes, // undefined: none yet
    current: ofFile?.key === key, // false while it's being redone (the old value shows meanwhile)
  };
}
