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
import { GifResult } from "./components/GifResult";

type VideoMeta = { duration: number; width: number; height: number };
type Gif = { url: string; bytes: number; width: number; height: number; name: string };

// Shape for the skeleton cards shown while the first video loads (the cards render
// for real, as placeholders, so they take exactly their final space).
const PLACEHOLDER_META: VideoMeta = { duration: 10, width: 1920, height: 1080 };

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
  // FPS and quality as last used in this browser. (Fine to read during hydration: the
  // settings aren't in the page's HTML, they only show once a video is loaded.)
  const [settings, setSettings] = useState<Settings>(() => ({ fps: 10, colors: 256, ...loadSettings(), scale: 1 }));
  const [isConverting, setIsConverting] = useState(false);
  const [progress, setProgress] = useState<number | null>(null); // null while the converter is still loading
  const [converterLoad, setConverterLoad] = useState<number | null>(null); // 0..1 while the converter downloads
  const [gif, setGif] = useState<Gif | null>(null); // the last GIF; kept after the dialog closes
  const [showResult, setShowResult] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // Each conversion gets a number; cancelling bumps it, so a cancelled run knows to stop.
  const runRef = useRef(0);
  const phaseRef = useRef<"loading" | "converting">("loading");
  const openerRef = useRef<Element | null>(null); // gets focus back when the dialog closes

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

  function changeSettings(next: Settings) {
    setSettings(next);
    saveSettings(next);
  }

  async function handleConvert() {
    if (!file || !meta || !canConvert) return;
    const run = ++runRef.current;
    const isCancelled = () => runRef.current !== run;
    phaseRef.current = "loading";
    openerRef.current = document.activeElement;
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
      // whole percents only, so React skips the many updates that don't change the number
      const data = await convertToGif(ffmpeg, file, options, (p) => {
        if (!isCancelled()) setProgress(Math.floor(p * 100) / 100);
      });
      const url = URL.createObjectURL(new Blob([data as Uint8Array<ArrayBuffer>], { type: "image/gif" }));
      await preload(url); // so the preview appears in one go instead of painting in
      if (isCancelled()) return URL.revokeObjectURL(url);
      setGif({ url, bytes: data.byteLength, ...size, name });
    } catch (err) {
      if (isCancelled()) return; // stopped on purpose, not an error
      setError(err instanceof Error ? err.message : String(err));
      resetFFmpeg(); // a crashed (e.g. out-of-memory) wasm instance can't be reused
    } finally {
      if (!isCancelled()) setIsConverting(false);
    }
  }

  function cancelConversion() {
    runRef.current++;
    // Mid-conversion the only way to stop ffmpeg is to kill its worker (it reloads from
    // the browser cache next time). While the converter is still downloading, let it
    // finish: the next conversion needs it anyway.
    if (phaseRef.current === "converting") resetFFmpeg();
    setIsConverting(false);
    setShowResult(false);
  }

  function closeResult() {
    setShowResult(false);
    setError(null);
  }

  function showLastGif() {
    openerRef.current = document.activeElement;
    setShowResult(true);
  }

  function discardGif() {
    // free the GIF's memory once the dialog's exit animation is done with it
    if (gif) setTimeout(() => URL.revokeObjectURL(gif.url), 1000);
    setGif(null);
  }

  const dialogOpen = isConverting || (showResult && (gif !== null || error !== null));

  // When the dialog closes, focus goes back to the button that opened it (the page
  // behind was inert, so focus had nowhere else to be).
  const wasOpenRef = useRef(false);
  useEffect(() => {
    if (wasOpenRef.current && !dialogOpen) {
      const opener = openerRef.current;
      const target = opener instanceof HTMLElement && opener.isConnected && opener !== document.body ? opener : convertButtonRef.current;
      target?.focus();
    }
    wasOpenRef.current = dialogOpen;
  }, [dialogOpen]);

  // While a video loads, the cards show as skeletons: over the previous video's values,
  // or placeholder ones for the first video.
  const isLoading = file !== null && videoStatus === "loading";
  const cardMeta = meta ?? (isLoading ? PLACEHOLDER_META : null);

  const outputSize = {
    width: Math.max(1, Math.round((cardMeta?.width ?? 16) * settings.scale)),
    height: Math.max(1, Math.round((cardMeta?.height ?? 9) * settings.scale)),
  };
  const risk = cardMeta
    ? estimateConversionRisk({
        clipDuration: (meta ? trim.end - trim.start : cardMeta.duration),
        sourceWidth: cardMeta.width,
        sourceHeight: cardMeta.height,
        outputFps: settings.fps,
        outputWidth: outputSize.width,
        outputHeight: outputSize.height,
      })
    : null;

  const card = "rounded-xl border border-border bg-surface p-4 sm:p-6";
  // skeleton while loading (inert: nothing in it can be used yet), fade-in once loaded
  const loadState = isLoading ? "skeleton" : "reveal";
  const loadProps = { inert: isLoading, "aria-busy": isLoading };
  const cardHeading = "text-xs font-semibold tracking-wide text-ink-muted uppercase";
  const fadeIn = { initial: { opacity: 0, y: 8 }, animate: { opacity: 1, y: 0 }, transition: { duration: 0.3, ease: "easeOut" } } as const;

  return (
    // reducedMotion="user": skip the animations for people who turned them off in their OS.
    <MotionConfig reducedMotion="user">
    {/* the page is `inert` while the result dialog is open, so keyboard focus can't wander behind it */}
    <main
      inert={dialogOpen}
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
                // ffmpeg reads formats the browser can't, so those wait for the converter
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
          // `contents` below lg: this wrapper disappears from layout, so the Convert bar
          // can stick to the bottom of the whole page. On desktop it's the sticky sidebar.
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
                maxFps={maxOutputFps(sourceFps)}
                maxFpsLoading={sourceFps === null}
                sourceWidth={cardMeta.width}
              />
              {risk && <MemoryMeter risk={risk} />}
            </motion.section>

            {/* Phones/tablets: a bar stuck to the bottom of the screen, in thumb reach (and
                clear of the iPhone home indicator). Desktop: a plain button in the sidebar. */}
            <div className="sticky bottom-0 z-10 -mx-4 border-t border-border bg-bg/90 px-4 pt-3 pb-[max(0.75rem,env(safe-area-inset-bottom))] backdrop-blur sm:bottom-[max(1rem,env(safe-area-inset-bottom))] sm:mx-0 sm:rounded-xl sm:border sm:bg-surface/90 sm:p-3 sm:shadow-lg lg:static lg:rounded-none lg:border-0 lg:bg-transparent lg:p-0 lg:shadow-none lg:backdrop-blur-none">
              <div {...loadProps} className={`flex gap-2 sm:justify-center ${loadState}`}>
                <motion.button
                  ref={convertButtonRef}
                  whileHover={canConvert && !isConverting ? { y: -1 } : undefined}
                  whileTap={{ scale: 0.98 }}
                  onClick={handleConvert}
                  disabled={isConverting || !canConvert}
                  className="min-w-0 flex-1 rounded-lg border border-transparent bg-primary py-3 font-medium text-ink transition-[background-color,box-shadow,opacity] duration-200 enabled:hover:bg-primary-hover enabled:hover:shadow-[0_8px_24px_-8px_rgb(124_58_237/0.8)] disabled:cursor-not-allowed disabled:opacity-50 sm:w-64 sm:flex-none lg:flex-1 lg:py-2.5"
                >
                  {isConverting ? "Converting..." : "Convert to GIF"}
                </motion.button>
                {/* the last GIF stays available after its dialog is closed */}
                {gif && !isConverting && (
                  <motion.button
                    initial={{ opacity: 0, scale: 0.9 }}
                    animate={{ opacity: 1, scale: 1 }}
                    whileHover={{ y: -1 }}
                    whileTap={{ scale: 0.97 }}
                    transition={{ type: "spring", stiffness: 400, damping: 25 }}
                    onClick={showLastGif}
                    className="shrink-0 rounded-lg border border-border-strong bg-surface-alt px-4 py-3 font-medium text-ink transition-colors hover:bg-surface-hover lg:py-2.5"
                  >
                    View GIF
                  </motion.button>
                )}
              </div>
            </div>
          </div>
        )}
      </div>

      {/* GPL: say what the app is built on and where its source lives */}
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
        gifUrl={showResult ? (gif?.url ?? null) : null}
        isConverting={isConverting}
        progress={progress}
        loadProgress={converterLoad}
        error={showResult ? error : null}
        size={isConverting || !gif ? outputSize : gif}
        gifBytes={gif?.bytes ?? null}
        downloadName={gif?.name ?? "output.gif"}
        onClose={closeResult}
        onCancel={cancelConversion}
      />
    </MotionConfig>
  );
}
