"use client";

import { useEffect, useRef, useState } from "react";
import { MotionConfig, motion } from "framer-motion";
import { getFFmpeg } from "./lib/ffmpeg";
import { maxOutputFps, probeVideo, DEFAULT_FPS, type VideoInfo } from "./lib/gif";
import { estimateConversionRisk } from "./lib/memory";
import { clamp, stepFrame } from "./lib/time";
import { loadSettings, saveSettings } from "./lib/settings";
import { UploadBox } from "./components/UploadBox";
import { VideoPreview, type VideoStatus } from "./components/VideoPreview";
import { ClipControls } from "./components/ClipControls";
import { OutputSettings, type Settings } from "./components/OutputSettings";
import { MemoryMeter } from "./components/MemoryMeter";
import { GifResult } from "./components/GifResult";
import { Footer } from "./components/Footer";
import { useConversion } from "./useConversion";

type VideoMeta = { duration: number; width: number; height: number };

// what the skeleton cards are laid out with while the first video loads
const PLACEHOLDER_META: VideoMeta = { duration: 10, width: 1920, height: 1080 };

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

export default function Page() {
  const videoRef = useRef<HTMLVideoElement>(null);
  const convertButtonRef = useRef<HTMLButtonElement>(null);

  const [file, setFile] = useState<File | null>(null);
  const [videoUrl, setVideoUrl] = useState<string | null>(null);
  const [meta, setMeta] = useState<VideoMeta | null>(null); // kept while the next file loads
  const [videoStatus, setVideoStatus] = useState<VideoStatus>("loading");
  const [sourceFps, setSourceFps] = useState<number | null>(null);
  const probeRef = useRef<{ file: File; info: Promise<VideoInfo> } | null>(null);

  const [trim, setTrim] = useState({ start: 0, end: 0 });
  const [currentTime, setCurrentTime] = useState(0);
  const [isPlaying, setIsPlaying] = useState(false);

  // read during hydration on purpose: the settings aren't in the HTML until a video is loaded
  const [settings, setSettings] = useState<Settings>(() => ({ fps: 10, colors: 256, ...loadSettings(), scale: 1 }));
  const conversion = useConversion();

  // frame-by-frame steps follow the video's own frame rate
  const stepFps = sourceFps ?? DEFAULT_FPS;

  function handleFileSelect(newFile: File) {
    if (videoUrl) URL.revokeObjectURL(videoUrl);
    setFile(newFile);
    setVideoUrl(URL.createObjectURL(newFile));
    setVideoStatus("loading");
    setSourceFps(null);
    setCurrentTime(0);
    setIsPlaying(false);
    setSettings((s) => ({ ...s, scale: 1 }));
    conversion.close();
    conversion.discard();

    const probe = { file: newFile, info: getFFmpeg().then((ffmpeg) => probeVideo(ffmpeg, newFile)) };
    probeRef.current = probe;
    probe.info
      .then((info) => info.fps)
      .catch(() => DEFAULT_FPS)
      .then((detected) => {
        if (probeRef.current !== probe) return;
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

  // The browser can't play it (HEVC, AVI, MKV…), but ffmpeg usually can: no preview, then.
  async function handleVideoError() {
    const probe = probeRef.current;
    const info = await probe?.info.catch(() => null);
    if (probeRef.current !== probe) return;
    if (!info?.duration) return failVideo();
    showVideo({ duration: info.duration, width: info.width, height: info.height }, "no-preview");
  }

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

  function showFrame(time: number) {
    const video = videoRef.current;
    if (!video) return;
    video.pause();
    video.currentTime = time;
  }

  function stepPreview(direction: 1 | -1) {
    const video = videoRef.current;
    if (!video || !meta) return;
    showFrame(stepFrame(video.currentTime, direction, stepFps, 0, meta.duration));
  }

  function nudgeTrim(edge: "start" | "end", direction: 1 | -1) {
    if (!meta) return;
    const time =
      edge === "start"
        ? stepFrame(trim.start, direction, stepFps, 0, trim.end)
        : stepFrame(trim.end, direction, stepFps, trim.start, meta.duration);
    setTrim((t) => ({ ...t, [edge]: time }));
    showFrame(time);
  }

  const canConvert = !!file && !!meta && (videoStatus === "ready" || videoStatus === "no-preview") && trim.end - trim.start >= 0.01;

  function changeSettings(next: Settings) {
    setSettings(next);
    saveSettings(next);
  }

  function handleConvert() {
    if (!file || !meta || !canConvert) return;
    const { fps, colors, scale } = settings;
    conversion.convert(file, { start: trim.start, end: trim.end, fps, colors, width: Math.round(meta.width * scale) }, outputSize);
  }

  const { dialogOpen, isConverting, gif } = conversion;

  // the page behind the dialog is inert, so focus needs a place to go back to
  const wasOpenRef = useRef(false);
  useEffect(() => {
    if (wasOpenRef.current && !dialogOpen) convertButtonRef.current?.focus();
    wasOpenRef.current = dialogOpen;
  }, [dialogOpen]);

  // while a video loads, the cards are skeletons (over the previous video's values, if any)
  const isLoading = file !== null && videoStatus === "loading";
  const cardMeta = meta ?? (isLoading ? PLACEHOLDER_META : null);

  const outputSize = {
    width: Math.max(1, Math.round((cardMeta?.width ?? 16) * settings.scale)),
    height: Math.max(1, Math.round((cardMeta?.height ?? 9) * settings.scale)),
  };
  const risk = cardMeta
    ? estimateConversionRisk({
        clipDuration: trim.end - trim.start,
        sourceWidth: cardMeta.width,
        sourceHeight: cardMeta.height,
        outputFps: settings.fps,
        outputWidth: outputSize.width,
        outputHeight: outputSize.height,
      })
    : null;

  const card = "rounded-xl border border-border bg-surface p-4 sm:p-6";
  const loadState = isLoading ? "skeleton" : "reveal";
  const loadProps = { inert: isLoading, "aria-busy": isLoading };
  const cardHeading = "text-xs font-semibold tracking-wide text-ink-muted uppercase";
  const lift = "transition-[background-color,box-shadow,translate,scale] duration-200 motion-safe:enabled:hover:-translate-y-px motion-safe:enabled:active:scale-[0.98]";
  const fadeIn = { initial: { opacity: 0, y: 8 }, animate: { opacity: 1, y: 0 }, transition: { duration: 0.3, ease: "easeOut" } } as const;

  return (
    <MotionConfig reducedMotion="user">
    <main
      inert={dialogOpen}
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

      {/* two columns from the moment a file is picked, so the preview never changes width */}
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
                converterLoad={conversion.converterLoad}
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

          {cardMeta && (
            <motion.section {...fadeIn} {...loadProps} aria-labelledby="trim-heading" className={`${card} ${loadState}`}>
              <h2 id="trim-heading" className={`${cardHeading} mb-4`}>
                Trim
              </h2>
              <ClipControls
                duration={cardMeta.duration}
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

        {cardMeta && (
          // `contents` below lg lets the Convert bar stick to the bottom of the whole page
          <div className="contents lg:sticky lg:top-6 lg:flex lg:flex-col lg:gap-6 lg:self-start">
            <motion.section
              {...fadeIn}
              {...loadProps}
              aria-labelledby="output-heading"
              className={`${card} flex flex-col gap-5 ${loadState}`}
            >
              <h2 id="output-heading" className={cardHeading}>
                Output
              </h2>
              <OutputSettings
                settings={settings}
                onChange={changeSettings}
                maxFps={sourceFps === null ? null : maxOutputFps(sourceFps)}
                sourceWidth={cardMeta.width}
              />
              {risk && <MemoryMeter risk={risk} />}
            </motion.section>

            <div className="sticky bottom-0 z-10 -mx-4 border-t border-border bg-bg/90 px-4 pt-3 pb-[max(0.75rem,env(safe-area-inset-bottom))] backdrop-blur sm:bottom-[max(1rem,env(safe-area-inset-bottom))] sm:mx-0 sm:rounded-xl sm:border sm:bg-surface/90 sm:p-3 sm:shadow-lg lg:static lg:rounded-none lg:border-0 lg:bg-transparent lg:p-0 lg:shadow-none lg:backdrop-blur-none">
              <div {...loadProps} className={`flex gap-2 sm:justify-center ${loadState}`}>
                <button
                  ref={convertButtonRef}
                  onClick={handleConvert}
                  disabled={isConverting || !canConvert}
                  className={`min-w-0 flex-1 rounded-lg border border-transparent bg-primary py-3 font-medium text-ink enabled:hover:bg-primary-hover enabled:hover:shadow-[0_8px_24px_-8px_rgb(124_58_237/0.8)] disabled:cursor-not-allowed disabled:opacity-50 sm:w-64 sm:flex-none lg:flex-1 lg:py-2.5 ${lift}`}
                >
                  {isConverting ? "Converting..." : "Convert to GIF"}
                </button>
                {gif && !isConverting && (
                  <button
                    onClick={conversion.reopen}
                    className={`shrink-0 rounded-lg border border-border-strong bg-surface-alt px-4 py-3 font-medium text-ink hover:bg-surface-hover lg:py-2.5 ${lift}`}
                  >
                    View GIF
                  </button>
                )}
              </div>
            </div>
          </div>
        )}
      </div>

      <Footer />
    </main>

      <GifResult
        gif={conversion.showResult ? gif : null}
        error={conversion.showResult ? conversion.error : null}
        isConverting={isConverting}
        progress={conversion.progress}
        loadProgress={conversion.converterLoad}
        convertingSize={outputSize}
        onClose={conversion.close}
        onCancel={conversion.cancel}
      />
    </MotionConfig>
  );
}
