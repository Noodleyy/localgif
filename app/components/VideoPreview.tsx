import { useState } from "react";
import { Icon } from "./icons";
import { IconButton, Percent } from "./ui";

export type VideoStatus = "loading" | "ready" | "no-preview" | "error";

type VideoPreviewProps = {
  videoRef: React.RefObject<HTMLVideoElement | null>;
  videoUrl: string;
  status: VideoStatus;
  converterLoad: number | null; // 0..1 while the converter downloads
  overlay?: React.ReactNode; // drawn over the picture (the crop frame)
  className?: string;
} & Pick<React.VideoHTMLAttributes<HTMLVideoElement>, "onLoadedMetadata" | "onError" | "onTimeUpdate" | "onPlay" | "onPause" | "onEnded">;

const MESSAGES = {
  "no-preview": {
    title: "Your browser can't preview this format",
    body: "You can still trim, crop and convert it to a GIF.",
  },
  error: {
    title: "Couldn't read this file",
    body: "It doesn't look like a video, or the file is damaged.",
  },
};

export function VideoPreview({ videoRef, videoUrl, status, converterLoad, overlay, className = "", ...events }: VideoPreviewProps) {
  const [isMuted, setIsMuted] = useState(false);
  const isReady = status === "ready";
  const message = status === "no-preview" || status === "error" ? MESSAGES[status] : null;
  const announcement = status === "loading" ? "Loading video" : message ? `${message.title}. ${message.body}` : "Video loaded";

  return (
    <div
      className={`relative flex items-center justify-center overflow-hidden rounded-xl bg-surface p-2 sm:p-4 ${className} ${
        isReady ? "border border-border" : "border-2 border-dashed border-border"
      }`}
    >
      <p role="status" className="sr-only">
        {announcement}
      </p>
      {/* eslint-disable-next-line jsx-a11y-x/media-has-caption -- a preview of the user's own file: no captions exist */}
      <video
        ref={videoRef}
        src={videoUrl}
        muted={isMuted}
        playsInline
        className={`h-full w-full object-contain ${isReady ? "" : "invisible"}`}
        {...events}
      />

      {status === "loading" && (
        <div className="skeleton-fill absolute inset-2 flex flex-col items-center justify-center gap-2 sm:inset-4">
          <p className="text-sm text-ink-muted">Loading video…</p>
          {/* always there, so "Loading video…" doesn't move when this fills in */}
          <p className="min-h-4 text-xs text-ink-muted tabular-nums">
            {converterLoad !== null && (
              <>
                Loading converter… <Percent value={converterLoad} />
              </>
            )}
          </p>
        </div>
      )}

      {message && (
        <div className="absolute inset-0 flex flex-col items-center justify-center gap-2 p-6 text-center">
          <Icon name="video" className={`h-8 w-8 ${status === "error" ? "text-danger" : "text-ink-muted"}`} />
          <p className="text-sm font-medium text-ink">{message.title}</p>
          <p className="text-xs text-ink-muted">{message.body}</p>
        </div>
      )}

      {overlay}

      {isReady && !overlay && (
        <div className="absolute right-3 bottom-3">
          <IconButton
            icon={isMuted ? "speakerOff" : "speaker"}
            iconClassName="h-4 w-4"
            tone="floating"
            label={isMuted ? "Unmute preview" : "Mute preview"}
            onClick={() => setIsMuted((muted) => !muted)}
          />
        </div>
      )}
    </div>
  );
}
