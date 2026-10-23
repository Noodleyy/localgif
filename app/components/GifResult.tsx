import { useEffect, useRef } from "react";
import { formatBytes } from "../lib/format";
import type { ConversionState, Size } from "../useConversion";
import { Icon } from "./icons";
import { Bar, IconButton, Percent } from "./ui";

type GifResultProps = {
  state: ConversionState;
  open: boolean;
  converterLoad: number | null; // 0..1 while the converter downloads
  convertingSize: Size; // so the frame already has the GIF's shape while converting
  onClose: () => void;
  onCancel: () => void;
};

// The frame is the GIF's real size, shrunk to fit the screen. The constants are the
// dialog's margins and padding, status line and button.
const AVAILABLE_W = "(100svw - 74px)";
const AVAILABLE_H = "(100svh - 160px)";

function frameStyle({ width, height }: Size): React.CSSProperties {
  return {
    aspectRatio: `${width} / ${height}`,
    width: `max(min(18rem, ${AVAILABLE_W}), min(${width}px, ${AVAILABLE_W}, ${AVAILABLE_H} * ${width / height}))`,
    minHeight: `min(10rem, ${AVAILABLE_H})`,
    maxHeight: AVAILABLE_H,
  };
}

const secondaryButton =
  "w-36 rounded-lg border border-border-strong bg-surface-alt px-4 py-2 text-sm font-medium text-ink transition-colors hover:bg-surface-hover";

/** A modal <dialog>: the page behind is inert, Escape closes it, focus returns to where it was. */
export function GifResult({ state, open, converterLoad, convertingSize, onClose, onCancel }: GifResultProps) {
  const dialogRef = useRef<HTMLDialogElement>(null);
  const downloadRef = useRef<HTMLAnchorElement>(null);
  const closeRef = useRef<HTMLButtonElement>(null);

  const busy = state.kind === "loading" || state.kind === "converting";
  const gif = state.kind === "done" ? state.gif : null;
  const error = state.kind === "failed" ? state.error : null;
  const size = gif ?? convertingSize;
  const progress = state.kind === "converting" ? state.progress : converterLoad;

  useEffect(() => {
    const dialog = dialogRef.current;
    if (open && !dialog?.open) dialog?.showModal();
    if (!open && dialog?.open) dialog.close();
  }, [open]);

  // the dialog itself while converting, then what the outcome offers
  useEffect(() => {
    if (open) (gif ? downloadRef : error !== null ? closeRef : dialogRef).current?.focus();
  }, [open, gif, error]);

  return (
    // eslint-disable-next-line jsx-a11y-x/click-events-have-key-events, jsx-a11y-x/no-noninteractive-element-interactions -- backdrop click; Escape is the keyboard way
    <dialog
      ref={dialogRef}
      tabIndex={-1}
      aria-label={busy ? "Converting to GIF" : error !== null ? "Conversion failed" : "GIF ready"}
      // also after Escape, which closes it natively: that cancels a conversion in progress
      onClose={() => open && (busy ? onCancel : onClose)()}
      onClick={(e) => e.target === e.currentTarget && !busy && onClose()}
      className="modal m-auto overflow-visible rounded-xl border border-border bg-surface p-0 text-ink shadow-2xl"
    >
      {!busy && (
        <div className="absolute -top-3 -right-3">
          <IconButton icon="close" tone="floating" label="Close" onClick={onClose} />
        </div>
      )}

      <div className="flex flex-col items-center gap-3 p-5 text-center">
        <div
          className={`relative flex items-center justify-center overflow-hidden rounded-lg ${busy ? "skeleton-fill" : ""}`}
          style={frameStyle(size)}
        >
          {busy && (
            <>
              <Icon name="image" className="h-10 w-10 text-ink-muted/60 motion-safe:animate-pulse" />
              <Bar
                value={progress ?? 0}
                fill="progress-shine bg-primary"
                role="progressbar"
                aria-label={state.kind === "loading" ? "Loading converter" : "Conversion progress"}
                aria-valuemin={0}
                aria-valuemax={100}
                aria-valuenow={progress === null ? undefined : Math.round(progress * 100)}
                className="absolute inset-x-6 bottom-4"
              />
            </>
          )}
          {gif && <img src={gif.url} alt="GIF preview" className="pop h-full w-full object-scale-down" />}
          {error !== null && (
            <div className="pop flex max-h-full flex-col items-center gap-2 overflow-auto px-2">
              <Icon name="warning" className="h-10 w-10 shrink-0 text-danger" />
              <p className="text-xs whitespace-pre-line text-ink-muted">{error}</p>
            </div>
          )}
        </div>

        {/* the outcome for screen readers; the percentages would only be noise */}
        <p role="status" className="sr-only">
          {busy && "Converting to GIF"}
          {error !== null && `Conversion failed. ${error}`}
          {gif && `GIF ready, ${size.width} by ${size.height} pixels. Download GIF is focused.`}
        </p>

        <div className="flex min-h-6 flex-wrap items-center justify-center gap-2 text-sm font-medium text-ink">
          {busy && (
            <span className="font-normal text-ink-muted tabular-nums">
              {state.kind === "loading" ? "Loading converter…" : "Converting to GIF…"}{" "}
              {progress !== null ? <Percent value={progress} /> : <span className="inline-block w-[4ch]" />}
            </span>
          )}
          {error !== null && <span>Conversion failed</span>}
          {gif && (
            <>
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" className="h-5 w-5">
                <circle cx={12} cy={12} r={10} pathLength={1} className="draw [animation-delay:0.15s]" />
                <path d="m8 12.5 2.5 2.5L16 9.5" pathLength={1} className="draw [animation-delay:0.5s] [animation-duration:0.3s]" />
              </svg>
              <span className="fade-in [animation-delay:0.55s]">
                GIF ready
                <span className="font-normal text-ink-muted tabular-nums">
                  {" "}· {size.width}×{size.height} · {formatBytes(gif.bytes)}
                </span>
              </span>
            </>
          )}
        </div>

        {busy && (
          <button onClick={onCancel} className={secondaryButton}>
            Cancel
          </button>
        )}
        {error !== null && (
          <button ref={closeRef} onClick={onClose} className={secondaryButton}>
            Close
          </button>
        )}
        {gif && (
          <a
            ref={downloadRef}
            href={gif.url}
            download={gif.name}
            className="ping-once w-36 rounded-lg border border-transparent bg-primary px-4 py-2 text-sm font-medium text-ink transition-[background-color,scale] hover:bg-primary-hover motion-safe:hover:scale-[1.03] motion-safe:active:scale-[0.97]"
          >
            Download GIF
          </a>
        )}
      </div>
    </dialog>
  );
}
