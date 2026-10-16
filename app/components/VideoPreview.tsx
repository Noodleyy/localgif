"use client";

import { useState } from "react";

export type VideoStatus = "loading" | "ready" | "no-preview" | "error";

type VideoPreviewProps = {
  videoRef: React.RefObject<HTMLVideoElement | null>;
  videoUrl: string;
  status: VideoStatus;
  className?: string; // size
  onLoadedMetadata: (e: React.SyntheticEvent<HTMLVideoElement>) => void;
  onError: () => void;
  onTimeUpdate: (e: React.SyntheticEvent<HTMLVideoElement>) => void;
  onPlay: () => void;
  onPause: () => void;
  onEnded: (e: React.SyntheticEvent<HTMLVideoElement>) => void;
};

const MESSAGES = {
  "no-preview": {
    title: "Your browser can't preview this format",
    body: "You can still trim by time and convert it to a GIF.",
  },
  error: {
    title: "Couldn't read this file",
    body: "It doesn't look like a video, or the file is damaged.",
  },
};

export function VideoPreview({ videoRef, videoUrl, status, className = "", ...events }: VideoPreviewProps) {
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
      {/* screen readers hear loading / can't-preview / unreadable changes */}
      <p role="status" className="sr-only">
        {announcement}
      </p>
      <video
        ref={videoRef}
        src={videoUrl}
        muted={isMuted}
        playsInline
        className={`h-full w-full object-contain ${isReady ? "" : "invisible"}`}
        {...events}
      />

      {status === "loading" && (
        <div className="absolute inset-0 flex flex-col items-center justify-center gap-3 rounded-xl bg-bg/80 backdrop-blur-sm">
          <div className="h-9 w-9 animate-spin rounded-full border-[3px] border-ink-muted/25 border-t-primary" />
          <p className="text-sm text-ink-muted">Loading video…</p>
        </div>
      )}

      {message && (
        <div className="absolute inset-0 flex flex-col items-center justify-center gap-2 p-6 text-center">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.5} className={`h-8 w-8 ${status === "error" ? "text-danger" : "text-ink-muted"}`}>
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              d="m15.75 10.5 4.72-4.72a.75.75 0 0 1 1.28.53v11.38a.75.75 0 0 1-1.28.53l-4.72-4.72M4.5 18.75h9a2.25 2.25 0 0 0 2.25-2.25v-9a2.25 2.25 0 0 0-2.25-2.25h-9A2.25 2.25 0 0 0 2.25 7.5v9a2.25 2.25 0 0 0 2.25 2.25Z"
            />
          </svg>
          <p className="text-sm font-medium text-ink">{message.title}</p>
          <p className="text-xs text-ink-muted">{message.body}</p>
        </div>
      )}

      {isReady && (
        <button
          onClick={() => setIsMuted((muted) => !muted)}
          aria-label={isMuted ? "Unmute preview" : "Mute preview"}
          className="absolute right-3 bottom-3 flex h-8 w-8 before:absolute before:-inset-1.5 items-center justify-center rounded-full border border-border bg-surface/90 text-ink shadow-md backdrop-blur-sm hover:bg-surface-alt"
        >
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.5} className="h-4 w-4">
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              d={
                isMuted
                  ? "M17.25 9.75 19.5 12m0 0 2.25 2.25M19.5 12l2.25-2.25M19.5 12l-2.25 2.25M6.75 8.25l4.72-4.72a.75.75 0 0 1 1.28.53v15.88a.75.75 0 0 1-1.28.53l-4.72-4.72H4.5a.75.75 0 0 1-.75-.75v-6a.75.75 0 0 1 .75-.75h2.25Z"
                  : "M19.114 5.636a9 9 0 0 1 0 12.728M16.463 8.288a5.25 5.25 0 0 1 0 7.424M6.75 8.25l4.72-4.72a.75.75 0 0 1 1.28.53v15.88a.75.75 0 0 1-1.28.53l-4.72-4.72H4.5a.75.75 0 0 1-.75-.75v-6a.75.75 0 0 1 .75-.75h2.25Z"
              }
            />
          </svg>
        </button>
      )}
    </div>
  );
}
