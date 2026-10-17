"use client";

import { useEffect, useRef } from "react";
import { motion, AnimatePresence } from "framer-motion";

type Size = { width: number; height: number };
export type Gif = Size & { url: string; bytes: number; name: string };

type GifResultProps = {
  gif: Gif | null; // shown when not converting
  error: string | null;
  isConverting: boolean;
  progress: number | null; // null while the converter is still loading
  loadProgress: number | null;
  convertingSize: Size; // so the frame already has the GIF's shape while converting
  onClose: () => void;
  onCancel: () => void;
};

// The frame is the GIF's real size, shrunk to fit the screen. 100cqw/100cqh are the
// overlay's inner size; the constants are the dialog's own padding, status line and button.
const AVAILABLE_W = "(100cqw - 42px)";
const AVAILABLE_H = "(100cqh - 128px)";

function frameStyle({ width, height }: Size): React.CSSProperties {
  return {
    aspectRatio: `${width} / ${height}`,
    width: `max(min(18rem, ${AVAILABLE_W}), min(${width}px, ${AVAILABLE_W}, ${AVAILABLE_H} * ${width / height}))`,
    minHeight: `min(10rem, ${AVAILABLE_H})`,
    maxHeight: AVAILABLE_H,
  };
}

function formatBytes(bytes: number) {
  const mb = bytes / (1024 * 1024);
  return mb >= 1 ? `${mb.toFixed(1)} MB` : `${Math.max(1, Math.round(bytes / 1024))} KB`;
}

export function GifResult({ gif, error, isConverting, progress, loadProgress, convertingSize, onClose, onCancel }: GifResultProps) {
  const isFailed = error !== null && !isConverting;
  const ready = !isConverting && !isFailed ? gif : null;
  const isOpen = isConverting || isFailed || ready !== null;
  const size = ready ?? convertingSize;

  const dialogRef = useRef<HTMLDivElement>(null);
  const downloadRef = useRef<HTMLAnchorElement>(null);
  const closeRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    if (isOpen) dialogRef.current?.focus();
  }, [isOpen]);

  function trapTab(e: React.KeyboardEvent) {
    if (e.key !== "Tab") return;
    const focusable = [...(dialogRef.current?.querySelectorAll<HTMLElement>("a[href], button:not(:disabled)") ?? [])];
    if (focusable.length === 0) return e.preventDefault();
    const first = focusable[0];
    const last = focusable[focusable.length - 1];
    if (e.shiftKey && (document.activeElement === first || document.activeElement === dialogRef.current)) {
      e.preventDefault();
      last.focus();
    } else if (!e.shiftKey && document.activeElement === last) {
      e.preventDefault();
      first.focus();
    }
  }

  useEffect(() => {
    if (ready) downloadRef.current?.focus();
    if (isFailed) closeRef.current?.focus();
  }, [ready, isFailed]);

  useEffect(() => {
    if (!isOpen) return;
    function onKeyDown(e: KeyboardEvent) {
      if (e.key === "Escape") (isConverting ? onCancel : onClose)();
    }
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [isOpen, isConverting, onClose, onCancel]);

  const loading = progress === null;
  const barValue = loading ? loadProgress : progress;

  const pop = {
    initial: { opacity: 0, scale: 0.9 },
    animate: { opacity: 1, scale: 1 },
    transition: { delay: 0.05, type: "spring", stiffness: 300, damping: 22 },
  } as const;

  return (
    <AnimatePresence>
      {isOpen && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.2 }}
          className="fixed inset-0 z-50 flex items-center justify-center bg-bg/70 p-4 backdrop-blur-sm [container-type:size]"
          onClick={(e) => {
            if (e.target === e.currentTarget && !isConverting) onClose();
          }}
        >
          <motion.div
            initial={{ opacity: 0, scale: 0.9, y: 16 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.9, y: 16 }}
            transition={{ type: "spring", stiffness: 300, damping: 26 }}
            ref={dialogRef}
            tabIndex={-1}
            onKeyDown={trapTab}
            role="dialog"
            aria-modal="true"
            aria-label={isConverting ? "Converting to GIF" : isFailed ? "Conversion failed" : "GIF ready"}
            className="relative rounded-xl border border-border bg-surface shadow-2xl"
          >
            {!isConverting && (
              <button
                onClick={onClose}
                aria-label="Close"
                className="absolute -top-3 -right-3 flex h-7 w-7 before:absolute before:-inset-2 items-center justify-center rounded-full border border-border bg-surface text-ink-muted shadow-md hover:bg-surface-alt hover:text-ink"
              >
                ✕
              </button>
            )}

            <div className="flex flex-col items-center gap-3 p-5 text-center">
              <div
                className={`relative flex items-center justify-center overflow-hidden rounded-lg ${isConverting ? "skeleton-fill" : ""}`}
                style={frameStyle(size)}
              >
                {isConverting && (
                  <>
                    <svg
                      viewBox="0 0 24 24"
                      fill="none"
                      stroke="currentColor"
                      strokeWidth={1.5}
                      aria-hidden="true"
                      className="h-10 w-10 text-ink-muted/60 motion-safe:animate-pulse"
                    >
                      <path
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        d="m2.25 15.75 5.159-5.159a2.25 2.25 0 0 1 3.182 0l5.159 5.159m-1.5-1.5 1.409-1.409a2.25 2.25 0 0 1 3.182 0l2.909 2.909m-18 3.75h16.5a1.5 1.5 0 0 0 1.5-1.5V6a1.5 1.5 0 0 0-1.5-1.5H3.75A1.5 1.5 0 0 0 2.25 6v12a1.5 1.5 0 0 0 1.5 1.5Zm10.5-11.25h.008v.008h-.008V8.25Zm.375 0a.375.375 0 1 1-.75 0 .375.375 0 0 1 .75 0Z"
                      />
                    </svg>
                    <div
                      role="progressbar"
                      aria-label={loading ? "Loading converter" : "Conversion progress"}
                      aria-valuemin={0}
                      aria-valuemax={100}
                      aria-valuenow={barValue === null ? undefined : Math.round(barValue * 100)}
                      className="absolute inset-x-6 bottom-4 h-1.5 overflow-hidden rounded-full bg-ink/10"
                    >
                      <div
                        className="progress-shine h-full rounded-full bg-primary transition-[width] duration-300 ease-out"
                        style={{ width: `${(barValue ?? 0) * 100}%` }}
                      />
                    </div>
                  </>
                )}
                {ready && <motion.img {...pop} src={ready.url} alt="GIF preview" className="h-full w-full object-scale-down" />}
                {isFailed && (
                  <motion.div {...pop} className="flex max-h-full flex-col items-center gap-2 overflow-auto px-2">
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.5} className="h-10 w-10 shrink-0 text-danger">
                      <path
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        d="M12 9v3.75m-9.303 3.376c-.866 1.5.217 3.374 1.948 3.374h14.71c1.73 0 2.813-1.874 1.948-3.374L13.949 4.626c-.866-1.5-3.032-1.5-3.898 0L2.697 16.126ZM12 15.75h.007v.008H12v-.008Z"
                      />
                    </svg>
                    <p className="text-xs whitespace-pre-line text-ink-muted">{error}</p>
                  </motion.div>
                )}
              </div>

              {/* the outcome for screen readers; the percentages would only be noise */}
              <p role="status" className="sr-only">
                {isConverting
                  ? "Converting to GIF"
                  : isFailed
                    ? `Conversion failed. ${error}`
                    : `GIF ready, ${size.width} by ${size.height} pixels. Download GIF is focused.`}
              </p>

              <div className="flex min-h-6 flex-wrap items-center justify-center gap-2 text-sm font-medium text-ink">
                {isConverting && (
                  <span className="font-normal text-ink-muted tabular-nums">
                    {loading ? "Loading converter…" : "Converting to GIF…"}{" "}
                    <span className="inline-block w-[4ch] text-right">
                      {barValue !== null && `${Math.round(barValue * 100)}%`}
                    </span>
                  </span>
                )}
                {isFailed && <span>Conversion failed</span>}
                {ready && (
                  <>
                    <motion.svg
                      viewBox="0 0 24 24"
                      fill="none"
                      stroke="currentColor"
                      strokeWidth={2}
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      className="h-5 w-5"
                    >
                      <motion.circle
                        cx={12}
                        cy={12}
                        r={10}
                        initial={{ pathLength: 0, opacity: 0 }}
                        animate={{ pathLength: 1, opacity: 1 }}
                        transition={{ duration: 0.4, delay: 0.15, ease: "easeOut" }}
                      />
                      <motion.path
                        d="m8 12.5 2.5 2.5L16 9.5"
                        initial={{ pathLength: 0 }}
                        animate={{ pathLength: 1 }}
                        transition={{ duration: 0.3, delay: 0.5, ease: "easeOut" }}
                      />
                    </motion.svg>
                    <motion.span initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ duration: 0.3, delay: 0.55 }}>
                      GIF ready
                      <span className="font-normal text-ink-muted tabular-nums">
                        {" "}· {size.width}×{size.height} · {formatBytes(ready.bytes)}
                      </span>
                    </motion.span>
                  </>
                )}
              </div>

              {isConverting ? (
                <button
                  onClick={onCancel}
                  className="w-36 rounded-lg border border-border-strong bg-surface-alt px-4 py-2 text-sm font-medium text-ink transition-colors hover:bg-surface-hover"
                >
                  Cancel
                </button>
              ) : isFailed ? (
                <button
                  ref={closeRef}
                  onClick={onClose}
                  className="w-36 rounded-lg border border-border-strong bg-surface-alt px-4 py-2 text-sm font-medium text-ink transition-colors hover:bg-surface-hover"
                >
                  Close
                </button>
              ) : (
                <a
                  ref={downloadRef}
                  href={ready?.url}
                  download={ready?.name}
                  className="ping-once w-36 rounded-lg border border-transparent bg-primary px-4 py-2 text-sm font-medium text-ink transition-[background-color,scale] hover:bg-primary-hover motion-safe:hover:scale-[1.03] motion-safe:active:scale-[0.97]"
                >
                  Download GIF
                </a>
              )}
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
