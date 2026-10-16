"use client";

import { useRef, useState } from "react";
import { motion } from "framer-motion";

function formatBytes(bytes: number) {
  const mb = bytes / (1024 * 1024);
  return mb >= 1024 ? `${(mb / 1024).toFixed(1)} GB` : `${mb.toFixed(1)} MB`;
}

type UploadBoxProps = {
  onFileSelect: (file: File) => void;
  file: File | null;
};

const uploadIcon =
  "M3 16.5v1.5A2.25 2.25 0 0 0 5.25 20.25h13.5A2.25 2.25 0 0 0 21 18v-1.5M7.5 9.75 12 5.25m0 0 4.5 4.5M12 5.25v10.5";

/**
 * Before a file is picked: a big drop zone. After: a compact one-row bar (on every
 * screen size) so the video and controls get the space. Both open the file picker
 * on click/Enter/Space and accept a dropped file.
 */
export function UploadBox({ onFileSelect, file }: UploadBoxProps) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [isDragging, setIsDragging] = useState(false);

  function handleDrop(e: React.DragEvent<HTMLDivElement>) {
    e.preventDefault();
    setIsDragging(false);
    const picked = e.dataTransfer.files?.[0];
    if (picked) onFileSelect(picked);
  }

  // bg-surface-alt (used while dragging) only clears WCAG AA against text-ink, not text-ink-muted
  const mutedTextClass = isDragging ? "text-ink" : "text-ink-muted";
  const surface = isDragging
    ? "border-primary-soft bg-surface-alt"
    : "border-border-strong bg-surface hover:border-primary-soft";

  return (
    <motion.div
      role="button"
      tabIndex={0}
      whileTap={{ scale: 0.99 }}
      animate={isDragging ? { scale: 1.01 } : { scale: 1 }}
      transition={{ type: "spring", stiffness: 300, damping: 22 }}
      onClick={() => inputRef.current?.click()}
      onKeyDown={(e) => {
        if (e.key !== "Enter" && e.key !== " ") return;
        e.preventDefault(); // Space would otherwise also scroll the page
        inputRef.current?.click();
      }}
      onDragOver={(e) => {
        e.preventDefault();
        setIsDragging(true);
      }}
      onDragLeave={(e) => {
        // dragleave also fires when moving over the box's own text/icon; ignore those
        if (!e.currentTarget.contains(e.relatedTarget as Node | null)) setIsDragging(false);
      }}
      onDrop={handleDrop}
      className={`w-full cursor-pointer rounded-xl border-2 border-dashed transition-colors ${surface} ${
        file
          ? "flex items-center gap-3 px-4 py-3"
          : "flex h-56 flex-col items-center justify-center gap-3 p-6 text-center sm:h-72 lg:h-80"
      }`}
    >
      <motion.svg
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth={1.5}
        aria-hidden="true"
        className={`shrink-0 ${file ? "h-6 w-6" : "h-8 w-8"} ${mutedTextClass}`}
        animate={isDragging ? { y: -3 } : { y: 0 }}
        transition={{ type: "spring", stiffness: 300, damping: 15 }}
      >
        <path strokeLinecap="round" strokeLinejoin="round" d={uploadIcon} />
      </motion.svg>

      {file ? (
        <>
          <div className="min-w-0 flex-1">
            <p className="truncate text-sm font-medium text-ink">{file.name}</p>
            <p className={`text-xs tabular-nums ${mutedTextClass}`}>{formatBytes(file.size)}</p>
          </div>
          <span className="shrink-0 rounded-lg border border-border-strong px-3 py-1.5 text-sm font-medium text-ink">
            Change
          </span>
        </>
      ) : (
        <div>
          <p className="text-lg font-medium text-ink">Choose a video</p>
          {/* phones can't drag files, so only mention dropping where there's a mouse */}
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
    </motion.div>
  );
}
