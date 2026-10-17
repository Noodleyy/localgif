"use client";

import { useEffect, useRef, useState } from "react";
import { MotionConfig, motion } from "framer-motion";
import { getFFmpeg, onConverterLoad, resetFFmpeg } from "./lib/ffmpeg";
import { convertToGif, estimateConversionRisk, maxOutputFps, probeVideo, DEFAULT_FPS, type VideoInfo } from "./lib/gif";
import { clamp, stepFrame } from "./lib/time";
import { loadSettings, saveSettings } from "./lib/settings";
import { UploadBox } from "./components/UploadBox";
import { VideoPreview, type VideoStatus } from "./components/VideoPreview";
import { ClipControls } from "./components/ClipControls";
import { OutputSettings, type Settings } from "./components/OutputSettings";
import { MemoryMeter } from "./components/MemoryMeter";
import { GifResult, type Gif } from "./components/GifResult";

type VideoMeta = { duration: number; width: number; height: number };

// what the skeleton cards are laid out with while the first video loads
const PLACEHOLDER_META: VideoMeta = { duration: 10, width: 1920, height: 1080 };

function preload(url: string) {
  const img = new Image();
  img.src = url;
  return img.decode().catch(() => {});
}

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
  const [isConverting, setIsConverting] = useState(false);
  const [progress, setProgress] = useState<number | null>(null);
  const [converterLoad, setConverterLoad] = useState<number | null>(null);
  const [gif, setGif] = useState<Gif | null>(null); // kept after the dialog closes ("View GIF")
  const [showResult, setShowResult] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // cancelling bumps the run number, so the cancelled run knows to stop
  const runRef = useRef(0);
  const phaseRef = useRef<"loading" | "converting">("loading");

  useEffect(() => onConverterLoad(setConverterLoad), []);

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
    discardGif();

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

  function changeSettings(next: Settings) {
    setSettings(next);
    saveSettings(next);
  }

  async function handleConvert() {
    if (!file || !meta || !canConvert) return;
    const run = ++runRef.current;
    const isCancelled = () => runRef.current !== run;
    phaseRef.current = "loading";
    discardGif();
    setError(null);
    setShowResult(true);
    setIsConverting(true);
    setProgress(null);
    const size = outputSize;
    const name = `${file.name.replace(/\.[^.]+$/, "") || "output"}.gif`;
    try {
      const ffmpeg = await getFFmpeg();
      if (isCancelled()) return;
      phaseRef.current = "converting";
      setProgress(0);
      const options = {
        start: trim.start,
        end: trim.end,
        fps: settings.fps,
        colors: settings.colors,
        width: Math.round(meta.width * settings.scale),
      };
      // whole percents, so React can skip most updates
      const data = await convertToGif(ffmpeg, file, options, (p) => {
        if (!isCancelled()) setProgress(Math.floor(p * 100) / 100);
      });
      const url = URL.createObjectURL(new Blob([data as Uint8Array<ArrayBuffer>], { type: "image/gif" }));
      await preload(url); // so it appears in one go instead of painting in
      if (isCancelled()) return URL.revokeObjectURL(url);
      setGif({ url, bytes: data.byteLength, ...size, name });
    } catch (err) {
      if (isCancelled()) return;
      setError(err instanceof Error ? err.message : String(err));
      resetFFmpeg(); // a crashed (e.g. out of memory) instance can't be reused
    } finally {
      if (!isCancelled()) setIsConverting(false);
    }
  }

  function cancelConversion() {
    runRef.current++;
    // Only killing the worker stops ffmpeg. A download in progress may finish: it's needed anyway.
    if (phaseRef.current === "converting") resetFFmpeg();
    setIsConverting(false);
    setShowResult(false);
  }

  function closeResult() {
    setShowResult(false);
    setError(null);
  }

  function discardGif() {
    // after the dialog's exit animation is done with it
    if (gif) setTimeout(() => URL.revokeObjectURL(gif.url), 1000);
    setGif(null);
  }

  const dialogOpen = isConverting || (showResult && (gif !== null || error !== null));

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
                converterLoad={converterLoad}
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
                    onClick={() => setShowResult(true)}
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

      {/* the GPL asks to say what the app is built on and where its source is */}
      <motion.footer
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ duration: 0.5, delay: 0.25 }}
        className="pt-2 pb-8 text-center text-xs leading-relaxed text-ink-muted"
      >
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
      </motion.footer>
    </main>

      <GifResult
        gif={showResult ? gif : null}
        error={showResult ? error : null}
        isConverting={isConverting}
        progress={progress}
        loadProgress={converterLoad}
        convertingSize={outputSize}
        onClose={closeResult}
        onCancel={cancelConversion}
      />
    </MotionConfig>
  );
}
