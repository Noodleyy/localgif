"use client";

import { useEffect, useRef, useState } from "react";
import { MotionConfig, motion } from "framer-motion";
import { getFFmpeg, resetFFmpeg } from "./lib/ffmpeg";
import { convertToGif, estimateConversionRisk, maxOutputFps, probeVideo, DEFAULT_FPS, type VideoInfo } from "./lib/gif";
import { clamp, stepFrame } from "./lib/time";
import { UploadBox } from "./components/UploadBox";
import { VideoPreview, type VideoStatus } from "./components/VideoPreview";
import { ClipControls } from "./components/ClipControls";
import { OutputSettings, type Settings } from "./components/OutputSettings";
import { MemoryMeter } from "./components/MemoryMeter";
import { GifResult } from "./components/GifResult";

type VideoMeta = { duration: number; width: number; height: number };

function preload(url: string) {
  const img = new Image();
  img.src = url;
  return img.decode().catch(() => {});
}

/**
 * Live-recorded WebM (e.g. screen recordings) reports an Infinity duration until
 * the browser has seen the end, so seek far past it and wait for the real value.
 */
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

export default function Page() {
  const videoRef = useRef<HTMLVideoElement>(null);
  const convertButtonRef = useRef<HTMLButtonElement>(null);

  // Source video
  const [file, setFile] = useState<File | null>(null);
  const [videoUrl, setVideoUrl] = useState<string | null>(null);
  const [meta, setMeta] = useState<VideoMeta | null>(null); // kept while the next file loads, so the controls don't collapse
  const [videoStatus, setVideoStatus] = useState<VideoStatus>("loading");
  const [sourceFps, setSourceFps] = useState<number | null>(null);
  // ffprobe of the current file (fps, and the fallback when the browser can't play it)
  const probeRef = useRef<{ file: File; info: Promise<VideoInfo> } | null>(null);

  // Preview + trim
  const [trim, setTrim] = useState({ start: 0, end: 0 });
  const [currentTime, setCurrentTime] = useState(0);
  const [isPlaying, setIsPlaying] = useState(false);

  // Output
  const [settings, setSettings] = useState<Settings>({ fps: 10, colors: 256, scale: 1 });
  const [isConverting, setIsConverting] = useState(false);
  const [progress, setProgress] = useState<number | null>(null); // null while the converter is still loading
  const [gifUrl, setGifUrl] = useState<string | null>(null);
  const [gifBytes, setGifBytes] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);

  const fps = sourceFps ?? DEFAULT_FPS;

  function handleFileSelect(newFile: File) {
    if (videoUrl) URL.revokeObjectURL(videoUrl);
    setFile(newFile);
    setVideoUrl(URL.createObjectURL(newFile));
    setVideoStatus("loading");
    setSourceFps(null);
    setCurrentTime(0);
    setIsPlaying(false);
    setSettings((s) => ({ ...s, scale: 1 }));
    closeResult();

    const probe = { file: newFile, info: getFFmpeg().then((ffmpeg) => probeVideo(ffmpeg, newFile)) };
    probeRef.current = probe;
    probe.info
      .then((info) => info.fps)
      .catch(() => DEFAULT_FPS)
      .then((detected) => {
        if (probeRef.current !== probe) return; // another file was picked meanwhile
        setSourceFps(detected);
        setSettings((s) => ({ ...s, fps: Math.min(s.fps, maxOutputFps(detected)) }));
      });
  }

  function showVideo(m: VideoMeta, status: VideoStatus) {
    setMeta(m);
    setTrim({ start: 0, end: m.duration });
    setCurrentTime(0);
    setVideoStatus(status);
  }

  function failVideo() {
    setMeta(null);
    setVideoStatus("error");
  }

  async function handleLoadedMetadata(e: React.SyntheticEvent<HTMLVideoElement>) {
    const video = e.currentTarget;
    const probe = probeRef.current;
    let duration = video.duration;
    if (!Number.isFinite(duration)) duration = await durationFromSeek(video);
    if (!Number.isFinite(duration)) duration = (await probe?.info.catch(() => null))?.duration ?? NaN;
    if (probeRef.current !== probe) return;
    if (!Number.isFinite(duration) || duration <= 0) return failVideo();
    showVideo({ duration, width: video.videoWidth, height: video.videoHeight }, "ready");
  }

  // The browser can't play this format (HEVC on many PCs, AVI, MKV…). ffmpeg usually
  // still can, so fall back to ffprobe's numbers and convert without a preview.
  async function handleVideoError() {
    const probe = probeRef.current;
    const info = await probe?.info.catch(() => null);
    if (probeRef.current !== probe) return;
    if (!info?.duration) return failVideo();
    showVideo({ duration: info.duration, width: info.width, height: info.height }, "no-preview");
  }

  // While playing, follow the video every frame (timeupdate only fires ~4x/s, which
  // makes the playhead step and lets playback overshoot the trim end).
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
  }, [isPlaying, trim.start, trim.end]);

  function handleEnded(e: React.SyntheticEvent<HTMLVideoElement>) {
    e.currentTarget.currentTime = trim.start;
    e.currentTarget.play().catch(() => {});
  }

  function togglePlay() {
    const video = videoRef.current;
    if (!video) return;
    if (!video.paused) return video.pause();
    if (video.currentTime < trim.start || video.currentTime >= trim.end) {
      video.currentTime = trim.start;
      setCurrentTime(trim.start);
    }
    video.play().catch(() => {});
  }

  function seek(time: number) {
    if (!meta) return;
    const t = clamp(time, 0, meta.duration);
    if (videoRef.current) videoRef.current.currentTime = t;
    setCurrentTime(t);
  }

  /** Pauses and shows the frame at `time` (used by the frame-step buttons). */
  function showFrame(time: number) {
    const video = videoRef.current;
    if (!video) return;
    video.pause();
    video.currentTime = time;
  }

  function stepPreview(direction: 1 | -1) {
    const video = videoRef.current;
    if (!video || !meta) return;
    showFrame(stepFrame(video.currentTime, direction, fps, 0, meta.duration));
  }

  function nudgeTrim(edge: "start" | "end", direction: 1 | -1) {
    if (!meta) return;
    const time =
      edge === "start"
        ? stepFrame(trim.start, direction, fps, 0, trim.end)
        : stepFrame(trim.end, direction, fps, trim.start, meta.duration);
    setTrim((t) => ({ ...t, [edge]: time }));
    showFrame(time);
  }

  const canConvert = !!file && !!meta && (videoStatus === "ready" || videoStatus === "no-preview") && trim.end - trim.start >= 0.01;

  async function handleConvert() {
    if (!file || !meta || !canConvert) return;
    setError(null);
    setGifUrl(null);
    setIsConverting(true);
    setProgress(null);
    try {
      const ffmpeg = await getFFmpeg();
      setProgress(0);
      const options = {
        start: trim.start,
        end: trim.end,
        fps: settings.fps,
        colors: settings.colors,
        width: Math.round(meta.width * settings.scale),
      };
      // whole percents only, so React skips the many updates that don't change the number
      const gif = await convertToGif(ffmpeg, file, options, (p) => setProgress(Math.floor(p * 100) / 100));
      const url = URL.createObjectURL(new Blob([gif as Uint8Array<ArrayBuffer>], { type: "image/gif" }));
      await preload(url); // so the preview appears in one go instead of painting in
      setGifBytes(gif.byteLength);
      setGifUrl(url);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
      resetFFmpeg(); // a crashed (e.g. out-of-memory) wasm instance can't be reused
    } finally {
      setIsConverting(false);
    }
  }

  function closeResult() {
    // Free the GIF's memory once the dialog's exit animation is done with it.
    if (gifUrl) setTimeout(() => URL.revokeObjectURL(gifUrl), 1000);
    setGifUrl(null);
    setError(null);
  }

  const outputSize = {
    width: Math.max(1, Math.round((meta?.width ?? 16) * settings.scale)),
    height: Math.max(1, Math.round((meta?.height ?? 9) * settings.scale)),
  };
  const risk = meta
    ? estimateConversionRisk({
        clipDuration: trim.end - trim.start,
        sourceWidth: meta.width,
        sourceHeight: meta.height,
        outputFps: settings.fps,
        outputWidth: outputSize.width,
        outputHeight: outputSize.height,
      })
    : null;

  const card = "rounded-xl border border-border bg-surface p-4 sm:p-6";
  const cardHeading = "text-xs font-semibold tracking-wide text-ink-muted uppercase";
  const fadeIn = { initial: { opacity: 0, y: 8 }, animate: { opacity: 1, y: 0 }, transition: { duration: 0.3, ease: "easeOut" } } as const;

  return (
    // reducedMotion="user": skip the animations for people who turned them off in their OS.
    <MotionConfig reducedMotion="user">
    {/* the page is `inert` while the result dialog is open, so keyboard focus can't wander behind it */}
    <main
      inert={isConverting || gifUrl !== null || error !== null}
      // Mobile first: phone layout is the default; sm: / lg: only add to it.
      className="mx-auto w-full max-w-2xl px-4 pt-6 sm:px-6 sm:pt-12 lg:max-w-6xl lg:pt-16 2xl:max-w-7xl"
    >
      <motion.h1
        initial={{ opacity: 0, y: -8 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.4, ease: "easeOut" }}
        className="mb-5 text-center text-xl font-semibold text-ink sm:mb-8 sm:text-2xl"
      >
        Video → GIF
      </motion.h1>

      {/* Phones/tablets: one column. Desktop: video + trim on the left, settings in a
          sidebar. The two columns start as soon as a file is picked, so the preview
          never changes width when the video's details arrive. */}
      <div
        className={`grid gap-4 pb-6 sm:gap-6 sm:pb-10 ${file ? "lg:grid-cols-[minmax(0,1fr)_22rem] xl:grid-cols-[minmax(0,1fr)_24rem]" : ""}`}
      >
        <div className="flex min-w-0 flex-col gap-4 sm:gap-6">
          <UploadBox onFileSelect={handleFileSelect} file={file} />

          {videoUrl && (
            <motion.div {...fadeIn}>
              <VideoPreview
                videoRef={videoRef}
                videoUrl={videoUrl}
                status={videoStatus}
                className="aspect-video w-full lg:max-h-[65vh]"
                onLoadedMetadata={handleLoadedMetadata}
                onError={handleVideoError}
                onTimeUpdate={(e) => setCurrentTime(e.currentTarget.currentTime)}
                onPlay={() => setIsPlaying(true)}
                onPause={() => setIsPlaying(false)}
                onEnded={handleEnded}
              />
            </motion.div>
          )}

          {meta && (
            <motion.section {...fadeIn} aria-labelledby="trim-heading" className={card}>
              <h2 id="trim-heading" className={`${cardHeading} mb-4`}>
                Trim
              </h2>
              <ClipControls
                duration={meta.duration}
                sourceFps={sourceFps}
                currentTime={currentTime}
                isPlaying={isPlaying}
                canPlay={videoStatus === "ready"}
                trim={trim}
                onTrimChange={setTrim}
                onSeek={seek}
                onTogglePlay={togglePlay}
                onStepFrame={stepPreview}
                onNudgeTrim={nudgeTrim}
              />
            </motion.section>
          )}
        </div>

        {meta && (
          // `contents` below lg: this wrapper disappears from layout, so the Convert bar
          // can stick to the bottom of the whole page. On desktop it's the sticky sidebar.
          <div className="contents lg:sticky lg:top-6 lg:flex lg:flex-col lg:gap-6 lg:self-start">
            <motion.section {...fadeIn} aria-labelledby="output-heading" className={`${card} flex flex-col gap-5`}>
              <h2 id="output-heading" className={cardHeading}>
                Output
              </h2>
              <OutputSettings
                settings={settings}
                onChange={setSettings}
                maxFps={maxOutputFps(sourceFps)}
                sourceWidth={meta.width}
              />
              {risk && <MemoryMeter risk={risk} />}
            </motion.section>

            {/* Phones/tablets: a bar stuck to the bottom of the screen, in thumb reach (and
                clear of the iPhone home indicator). Desktop: a plain button in the sidebar. */}
            <div className="sticky bottom-0 z-10 -mx-4 border-t border-border bg-bg/90 px-4 pt-3 pb-[max(0.75rem,env(safe-area-inset-bottom))] backdrop-blur sm:bottom-[max(1rem,env(safe-area-inset-bottom))] sm:mx-0 sm:rounded-xl sm:border sm:bg-surface/90 sm:p-3 sm:shadow-lg lg:static lg:rounded-none lg:border-0 lg:bg-transparent lg:p-0 lg:shadow-none lg:backdrop-blur-none">
              <motion.button
                ref={convertButtonRef}
                whileTap={{ scale: 0.98 }}
                onClick={handleConvert}
                disabled={isConverting || !canConvert}
                className="block w-full rounded-lg bg-primary py-3 font-medium text-ink transition-colors hover:bg-primary-hover disabled:cursor-not-allowed disabled:opacity-50 sm:mx-auto sm:w-64 lg:w-full lg:py-2.5"
              >
                {isConverting ? "Converting..." : "Convert to GIF"}
              </motion.button>
            </div>
          </div>
        )}
      </div>

      {/* GPL: say what the app is built on and where its source lives */}
      <footer className="pt-2 pb-8 text-center text-xs leading-relaxed text-ink-muted">
        <p>Runs entirely in your browser — your video never leaves your device.</p>
        <p>
          Converts with{" "}
          <a href="https://ffmpeg.org" className="text-ink underline underline-offset-2">
            FFmpeg
          </a>{" "}
          via{" "}
          <a href="https://github.com/ffmpegwasm/ffmpeg.wasm" className="text-ink underline underline-offset-2">
            ffmpeg.wasm
          </a>{" "}
          (GPL). This app is free software under the{" "}
          <a href="https://www.gnu.org/licenses/gpl-3.0.html" className="text-ink underline underline-offset-2">
            GPL-3.0
          </a>
          {process.env.NEXT_PUBLIC_REPO_URL && (
            <>
              {" · "}
              <a href={process.env.NEXT_PUBLIC_REPO_URL} className="text-ink underline underline-offset-2">
                Source code
              </a>
            </>
          )}
          .
        </p>
      </footer>
    </main>

      <GifResult
        gifUrl={gifUrl}
        isConverting={isConverting}
        progress={progress}
        error={error}
        size={outputSize}
        gifBytes={gifBytes}
        downloadName={`${file?.name.replace(/\.[^.]+$/, "") || "output"}.gif`}
        onClose={() => {
          closeResult();
          // give keyboard focus back to where the user started (after the page stops being inert)
          requestAnimationFrame(() => convertButtonRef.current?.focus());
        }}
      />
    </MotionConfig>
  );
}
