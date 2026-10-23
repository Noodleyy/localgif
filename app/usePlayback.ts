import { useEffect, useState } from "react";
import type { Trim } from "./components/Timeline";
import { clamp, stepFrame } from "./lib/time";

type Clip = {
  trim: Trim;
  setTrim: React.Dispatch<React.SetStateAction<Trim>>;
  duration: number;
  fps: number; // frame steps follow the video's own frame rate
};

/** The preview's playback: loops between the trim points, steps frame by frame. */
export function usePlayback(videoRef: React.RefObject<HTMLVideoElement | null>, { trim, setTrim, duration, fps }: Clip) {
  const [currentTime, setCurrentTime] = useState(0);
  const [isPlaying, setIsPlaying] = useState(false);

  // timeupdate only fires ~4x/s: too jumpy for the playhead, and playback would overshoot the trim end
  useEffect(() => {
    if (!isPlaying) return;
    let id = requestAnimationFrame(function tick() {
      const video = videoRef.current;
      if (video) {
        if (video.currentTime >= trim.end) video.currentTime = trim.start;
        setCurrentTime(video.currentTime);
      }
      id = requestAnimationFrame(tick);
    });
    return () => cancelAnimationFrame(id);
  }, [videoRef, isPlaying, trim.start, trim.end]);

  /** Pauses on `time`, to show that frame. */
  function showFrame(time: number) {
    const video = videoRef.current;
    if (!video) return;
    video.pause();
    video.currentTime = time;
  }

  return {
    currentTime,
    isPlaying,
    reset() {
      setCurrentTime(0);
      setIsPlaying(false);
    },
    togglePlay() {
      const video = videoRef.current;
      if (!video) return;
      if (!video.paused) return video.pause();
      if (video.currentTime < trim.start || video.currentTime >= trim.end) {
        video.currentTime = trim.start;
        setCurrentTime(trim.start);
      }
      video.play().catch(() => {});
    },
    seek(time: number) {
      const t = clamp(time, 0, duration);
      if (videoRef.current) videoRef.current.currentTime = t;
      setCurrentTime(t);
    },
    step(direction: 1 | -1) {
      const video = videoRef.current;
      if (video) showFrame(stepFrame(video.currentTime, direction, fps, 0, duration));
    },
    nudgeTrim(edge: keyof Trim, direction: 1 | -1) {
      const time =
        edge === "start"
          ? stepFrame(trim.start, direction, fps, 0, trim.end)
          : stepFrame(trim.end, direction, fps, trim.start, duration);
      setTrim((t) => ({ ...t, [edge]: time }));
      showFrame(time);
    },
    /** Spread onto the <video>. */
    events: {
      onTimeUpdate: (e: React.SyntheticEvent<HTMLVideoElement>) => setCurrentTime(e.currentTarget.currentTime),
      onPlay: () => setIsPlaying(true),
      onPause: () => setIsPlaying(false),
      onEnded(e: React.SyntheticEvent<HTMLVideoElement>) {
        e.currentTarget.currentTime = trim.start;
        e.currentTarget.play().catch(() => {});
      },
    },
  };
}
