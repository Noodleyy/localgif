"use client";

import { useRef, useState } from "react";
import { ASPECTS, type Crop } from "./lib/crop";
import { DEFAULT_FPS, MAX_GIF_FPS, maxOutputFps } from "./lib/gif";
import { estimateConversionRisk } from "./lib/memory";
import { loadSettings, saveSettings } from "./lib/settings";
import { ClipControls } from "./components/ClipControls";
import { CropControls } from "./components/CropControls";
import { CropOverlay } from "./components/CropOverlay";
import { Footer } from "./components/Footer";
import { GifResult } from "./components/GifResult";
import { MemoryMeter } from "./components/MemoryMeter";
import { OutputSettings, type Settings } from "./components/OutputSettings";
import type { Trim } from "./components/Timeline";
import { Card } from "./components/ui";
import { UploadBox } from "./components/UploadBox";
import { VideoPreview } from "./components/VideoPreview";
import { useConversion } from "./useConversion";
import { usePlayback } from "./usePlayback";
import { useVideoSource, type VideoMeta } from "./useVideoSource";

// what the skeleton cards are laid out with while the first video loads
const PLACEHOLDER_META: VideoMeta = { duration: 10, width: 1920, height: 1080 };

const lift =
  "transition-[background-color,box-shadow,translate,scale] duration-200 motion-safe:enabled:hover:-translate-y-px motion-safe:enabled:active:scale-[0.98]";

export default function Page() {
  const videoRef = useRef<HTMLVideoElement>(null);
  const [trim, setTrim] = useState<Trim>({ start: 0, end: 0 });
  const [crop, setCrop] = useState<Crop | null>(null); // null: the whole frame
  const [aspect, setAspect] = useState("Full");
  const source = useVideoSource((meta) => setTrim({ start: 0, end: meta.duration }));
  const playback = usePlayback(videoRef, { trim, setTrim, duration: source.meta?.duration ?? 0, fps: source.fps ?? DEFAULT_FPS });
  const conversion = useConversion();

  // read during hydration on purpose: the settings aren't in the HTML until a video is loaded
  const [settings, setSettings] = useState<Settings>(() => ({ fps: 10, colors: 256, ...loadSettings(), scale: 1 }));
  const maxFps = source.fps === null ? null : maxOutputFps(source.fps);
  const output = { ...settings, fps: Math.min(settings.fps, maxFps ?? MAX_GIF_FPS) }; // the saved FPS, capped to this video's

  function selectFile(file: File) {
    source.select(file);
    playback.reset();
    conversion.reset();
    changeCrop(null, "Full");
    setSettings((s) => ({ ...s, scale: 1 }));
  }

  function changeCrop(next: Crop | null, nextAspect: string) {
    setCrop(next);
    setAspect(nextAspect);
  }

  function changeSettings(next: Settings) {
    setSettings(next);
    saveSettings(next);
  }

  // while a video loads, the cards are skeletons (over the previous video's values, if any)
  const isLoading = source.file !== null && source.status === "loading";
  const meta = source.meta ?? (isLoading ? PLACEHOLDER_META : null);
  const loadProps = { inert: isLoading, "aria-busy": isLoading };
  const loadState = isLoading ? "skeleton" : "reveal";

  // what the GIF shows: the crop, or the whole frame
  const frame = crop ?? { width: meta?.width ?? 16, height: meta?.height ?? 9 };
  const outputSize = {
    width: Math.max(1, Math.round(frame.width * output.scale)),
    height: Math.max(1, Math.round(frame.height * output.scale)),
  };
  const canConvert = (source.status === "ready" || source.status === "no-preview") && trim.end - trim.start >= 0.01;

  function convert() {
    if (!source.file || !canConvert) return;
    const { fps, colors } = output;
    conversion.convert(source.file, { ...trim, fps, colors, crop: crop ?? undefined, width: outputSize.width }, outputSize);
  }

  return (
    <>
      <main className="mx-auto w-full max-w-2xl px-4 pt-6 sm:px-6 sm:pt-12 lg:max-w-6xl lg:pt-16 2xl:max-w-7xl">
        <h1 className="rise mb-5 text-center text-xl font-semibold text-ink [--rise:-8px] [animation-duration:0.4s] sm:mb-8 sm:text-2xl">
          Video → GIF
        </h1>

        {/* two columns from the moment a file is picked, so the preview never changes width */}
        <div
          className={`grid gap-4 pb-6 sm:gap-6 sm:pb-10 ${source.file ? "lg:grid-cols-[minmax(0,1fr)_22rem] xl:grid-cols-[minmax(0,1fr)_24rem]" : ""}`}
        >
          <div className="flex min-w-0 flex-col gap-4 sm:gap-6">
            <UploadBox onFileSelect={selectFile} file={source.file} />

            {source.url && (
              <VideoPreview
                videoRef={videoRef}
                videoUrl={source.url}
                status={source.status}
                converterLoad={conversion.converterLoad}
                overlay={
                  crop && source.meta && source.status !== "loading" ? (
                    <CropOverlay frame={source.meta} crop={crop} ratio={ASPECTS[aspect] ?? null} videoRef={videoRef} onChange={setCrop} />
                  ) : undefined
                }
                className="rise aspect-video w-full lg:max-h-[65vh]"
                {...source.events}
                {...playback.events}
              />
            )}

            {meta && (
              <Card title="Trim" {...loadProps} className={`rise gap-4 ${loadState}`}>
                <ClipControls
                  duration={meta.duration}
                  sourceFps={source.fps}
                  currentTime={playback.currentTime}
                  isPlaying={playback.isPlaying}
                  canPlay={source.status === "ready"}
                  trim={trim}
                  onTrimChange={setTrim}
                  onSeek={playback.seek}
                  onTogglePlay={playback.togglePlay}
                  onStepFrame={playback.step}
                  onNudgeTrim={playback.nudgeTrim}
                />
              </Card>
            )}

            {meta && (
              <Card title="Crop" {...loadProps} className={`rise gap-4 ${loadState}`}>
                <CropControls frame={meta} crop={crop} aspect={aspect} onChange={changeCrop} />
              </Card>
            )}
          </div>

          {meta && (
            // `contents` below lg lets the Convert bar stick to the bottom of the whole page
            <div className="contents lg:sticky lg:top-6 lg:flex lg:flex-col lg:gap-6 lg:self-start">
              <Card title="Output" {...loadProps} className={`rise gap-5 ${loadState}`}>
                <OutputSettings settings={output} onChange={changeSettings} maxFps={maxFps} frame={frame} />
                <MemoryMeter
                  risk={estimateConversionRisk({
                    clipDuration: trim.end - trim.start,
                    sourceWidth: meta.width,
                    sourceHeight: meta.height,
                    outputFps: output.fps,
                    outputWidth: outputSize.width,
                    outputHeight: outputSize.height,
                  })}
                />
              </Card>

              <div className="sticky bottom-0 z-10 -mx-4 border-t border-border bg-bg/90 px-4 pt-3 pb-[max(0.75rem,env(safe-area-inset-bottom))] backdrop-blur sm:bottom-[max(1rem,env(safe-area-inset-bottom))] sm:mx-0 sm:rounded-xl sm:border sm:bg-surface/90 sm:p-3 sm:shadow-lg lg:static lg:rounded-none lg:border-0 lg:bg-transparent lg:p-0 lg:shadow-none lg:backdrop-blur-none">
                <div {...loadProps} className={`flex gap-2 sm:justify-center ${loadState}`}>
                  {/* not disabled while converting: the dialog returns focus here, and a disabled
                      button would have lost it (the page behind the dialog is inert anyway) */}
                  <button
                    onClick={convert}
                    disabled={!canConvert}
                    className={`min-w-0 flex-1 rounded-lg border border-transparent bg-primary py-3 font-medium text-ink enabled:hover:bg-primary-hover enabled:hover:shadow-[0_8px_24px_-8px_rgb(124_58_237/0.8)] disabled:cursor-not-allowed disabled:opacity-50 sm:w-64 sm:flex-none lg:flex-1 lg:py-2.5 ${lift}`}
                  >
                    {conversion.busy ? "Converting..." : "Convert to GIF"}
                  </button>
                  {conversion.state.kind === "done" && !conversion.busy && (
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
        state={conversion.state}
        open={conversion.open}
        converterLoad={conversion.converterLoad}
        convertingSize={outputSize}
        onClose={conversion.close}
        onCancel={conversion.cancel}
      />
    </>
  );
}
