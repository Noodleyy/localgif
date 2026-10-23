import { useEffect, useRef } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { formatBytes } from "../lib/format";
import { Icon } from "./icons";
import { Bar, IconButton, Percent } from "./ui";

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
const secondaryButton =
  "w-36 rounded-lg border border-border-strong bg-surface-alt px-4 py-2 text-sm font-medium text-ink transition-colors hover:bg-surface-hover";

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
              <div className="absolute -top-3 -right-3">
                <IconButton icon="close" tone="floating" label="Close" onClick={onClose} />
              </div>
            )}

            <div className="flex flex-col items-center gap-3 p-5 text-center">
              <div
                className={`relative flex items-center justify-center overflow-hidden rounded-lg ${isConverting ? "skeleton-fill" : ""}`}
                style={frameStyle(size)}
              >
                {isConverting && (
                  <>
                    <Icon name="image" className="h-10 w-10 text-ink-muted/60 motion-safe:animate-pulse" />
                    <Bar
                      value={barValue ?? 0}
                      fill="progress-shine bg-primary"
                      role="progressbar"
                      aria-label={loading ? "Loading converter" : "Conversion progress"}
                      aria-valuemin={0}
                      aria-valuemax={100}
                      aria-valuenow={barValue === null ? undefined : Math.round(barValue * 100)}
                      className="absolute inset-x-6 bottom-4"
                    />
                  </>
                )}
                {ready && <motion.img {...pop} src={ready.url} alt="GIF preview" className="h-full w-full object-scale-down" />}
                {isFailed && (
                  <motion.div {...pop} className="flex max-h-full flex-col items-center gap-2 overflow-auto px-2">
                    <Icon name="warning" className="h-10 w-10 shrink-0 text-danger" />
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
                    {barValue !== null ? <Percent value={barValue} /> : <span className="inline-block w-[4ch]" />}
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
                  className={secondaryButton}
                >
                  Cancel
                </button>
              ) : isFailed ? (
                <button
                  ref={closeRef}
                  onClick={onClose}
                  className={secondaryButton}
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
