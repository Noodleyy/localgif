import { useRef, useState } from "react";
import { formatBytes } from "../lib/format";
import { Icon } from "./icons";

type UploadBoxProps = {
  onFileSelect: (file: File) => void;
  file: File | null;
};

/** A big drop zone until a file is picked, then a compact bar. */
export function UploadBox({ onFileSelect, file }: UploadBoxProps) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [isDragging, setIsDragging] = useState(false);

  function handleDrop(e: React.DragEvent<HTMLDivElement>) {
    e.preventDefault();
    setIsDragging(false);
    const picked = e.dataTransfer.files?.[0];
    if (picked) onFileSelect(picked);
  }

  // bg-surface-alt (while dragging) only has enough contrast with text-ink, not text-ink-muted
  const mutedTextClass = isDragging ? "text-ink" : "text-ink-muted";

  return (
    <div
      role="button"
      tabIndex={0}
      onClick={() => inputRef.current?.click()}
      onKeyDown={(e) => {
        if (e.key !== "Enter" && e.key !== " ") return;
        e.preventDefault();
        inputRef.current?.click();
      }}
      onDragOver={(e) => {
        e.preventDefault();
        setIsDragging(true);
      }}
      onDragLeave={(e) => {
        // also fires when moving over the box's own children
        if (!e.currentTarget.contains(e.relatedTarget as Node | null)) setIsDragging(false);
      }}
      onDrop={handleDrop}
      // the height eases between drop zone and bar thanks to interpolate-size (globals.css)
      className={`rise group w-full cursor-pointer [animation-delay:0.1s] [animation-duration:0.4s] overflow-hidden rounded-xl border-2 border-dashed transition-[height,padding,border-color,background-color,scale] duration-300 ease-out motion-reduce:transition-colors motion-safe:active:scale-[0.99] ${
        isDragging ? "border-primary-soft bg-surface-alt motion-safe:scale-[1.01]" : "border-border-strong bg-surface hover:border-primary-soft"
      } ${file ? "flex items-center gap-3 px-4 py-3" : "flex h-56 flex-col items-center justify-center gap-3 p-6 text-center sm:h-72 lg:h-80"}`}
    >
      <Icon
        name="upload"
        className={`shrink-0 transition-transform motion-safe:group-hover:-translate-y-0.5 ${isDragging ? "motion-safe:-translate-y-1" : ""} ${file ? "h-6 w-6" : "h-8 w-8"} ${mutedTextClass}`}
      />

      {file ? (
        <>
          <div className="min-w-0 flex-1">
            <p className="truncate text-sm font-medium text-ink">{file.name}</p>
            <p className={`text-xs tabular-nums ${mutedTextClass}`}>{formatBytes(file.size)}</p>
          </div>
          <span className="shrink-0 rounded-lg border border-border-strong px-3 py-1.5 text-sm font-medium text-ink">Change</span>
        </>
      ) : (
        <div>
          <p className="text-lg font-medium text-ink">Choose a video</p>
          <p className={`text-sm pointer-coarse:hidden ${mutedTextClass}`}>or drop it here</p>
          <p className={`mt-1 text-xs ${mutedTextClass}`}>MP4, MOV, WebM, AVI, MKV… · stays on your device</p>
        </div>
      )}

      <input
        ref={inputRef}
        type="file"
        accept="video/*"
        className="hidden"
        onChange={(e) => {
          const picked = e.target.files?.[0];
          if (picked) onFileSelect(picked);
          e.target.value = "";
        }}
      />
    </div>
  );
}
