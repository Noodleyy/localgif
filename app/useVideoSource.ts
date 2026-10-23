import { useRef, useState } from "react";
import type { VideoStatus } from "./components/VideoPreview";
import { getFFmpeg } from "./lib/ffmpeg";
import { DEFAULT_FPS, probeVideo, type VideoInfo } from "./lib/gif";

export type VideoMeta = { duration: number; width: number; height: number };

// Live-recorded WebM reports an Infinity duration until the browser has seen the end,
// so seek far past it and wait for the real value.
function durationFromSeek(video: HTMLVideoElement): Promise<number> {
  return new Promise((resolve) => {
    const done = () => {
      clearTimeout(timer);
      video.removeEventListener("durationchange", onChange);
      video.currentTime = 0;
      resolve(video.duration);
    };
    const onChange = () => Number.isFinite(video.duration) && done();
    const timer = setTimeout(done, 3000);
    video.addEventListener("durationchange", onChange);
    video.currentTime = 1e101;
  });
}

/**
 * The picked video: its preview URL, its size and length (from the browser, or from ffmpeg
 * when the browser can't play it) and its frame rate (only ffmpeg knows).
 */
export function useVideoSource(onReady: (meta: VideoMeta) => void) {
  const [file, setFile] = useState<File | null>(null);
  const [url, setUrl] = useState<string | null>(null);
  const [meta, setMeta] = useState<VideoMeta | null>(null); // kept while the next file loads
  const [status, setStatus] = useState<VideoStatus>("loading");
  const [fps, setFps] = useState<number | null>(null);
  // the latest file's probe: answers about an earlier file are dropped
  const probeRef = useRef<Promise<VideoInfo> | null>(null);

  function select(newFile: File) {
    if (url) URL.revokeObjectURL(url);
    setFile(newFile);
    setUrl(URL.createObjectURL(newFile));
    setStatus("loading");
    setFps(null);
    const probe = getFFmpeg().then((ffmpeg) => probeVideo(ffmpeg, newFile));
    probeRef.current = probe;
    probe.then((info) => info.fps, () => DEFAULT_FPS).then((detected) => {
      if (probeRef.current === probe) setFps(detected);
    });
  }

  function show(m: VideoMeta, next: VideoStatus) {
    setMeta(m);
    setStatus(next);
    onReady(m);
  }

  function fail() {
    setMeta(null);
    setStatus("error");
  }

  return {
    file,
    url,
    meta,
    status,
    fps,
    select,
    /** Spread onto the <video>. */
    events: {
      async onLoadedMetadata(e: React.SyntheticEvent<HTMLVideoElement>) {
        const video = e.currentTarget;
        const probe = probeRef.current;
        let duration = video.duration;
        if (!Number.isFinite(duration)) duration = await durationFromSeek(video);
        if (!Number.isFinite(duration)) duration = (await probe?.catch(() => null))?.duration ?? NaN;
        if (probeRef.current !== probe) return;
        if (!Number.isFinite(duration) || duration <= 0) return fail();
        show({ duration, width: video.videoWidth, height: video.videoHeight }, "ready");
      },
      // The browser can't play it (HEVC, AVI, MKV…), but ffmpeg usually can: no preview, then.
      async onError() {
        const probe = probeRef.current;
        const info = await probe?.catch(() => null);
        if (probeRef.current !== probe) return;
        if (!info?.duration) return fail();
        show({ duration: info.duration, width: info.width, height: info.height }, "no-preview");
      },
    },
  };
}
