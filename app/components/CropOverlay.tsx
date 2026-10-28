import { useEffect, useRef, useState } from "react";
import { dragCrop, type Crop, type Handle, type Size } from "../lib/crop";

type CropOverlayProps = {
  frame: Size; // the video's own size
  crop: Crop;
  ratio: number | null;
  onChange: (crop: Crop) => void;
};

const CORNERS = [
  { handle: "nw", className: "-top-1.5 -left-1.5 cursor-nwse-resize" },
  { handle: "ne", className: "-top-1.5 -right-1.5 cursor-nesw-resize" },
  { handle: "sw", className: "-bottom-1.5 -left-1.5 cursor-nesw-resize" },
  { handle: "se", className: "-right-1.5 -bottom-1.5 cursor-nwse-resize" },
] as const;

const pct = (part: number, whole: number) => `${(part / whole) * 100}%`;

/**
 * The crop frame over the preview: drag it to move, drag a corner to resize. Pointer-only
 * (hidden from assistive tech): the Crop card's fields do the same by keyboard (WCAG 2.5.7).
 */
export function CropOverlay({ frame, crop, ratio, onChange }: CropOverlayProps) {
  const boxRef = useRef<HTMLDivElement>(null);
  const [box, setBox] = useState<Size | null>(null);
  const dragRef = useRef<{ handle: Handle; x: number; y: number; start: Crop } | null>(null);

  useEffect(() => {
    const observer = new ResizeObserver(([entry]) => setBox({ width: entry.contentRect.width, height: entry.contentRect.height }));
    observer.observe(boxRef.current!);
    return () => observer.disconnect();
  }, []);

  // the picture inside the box, like the <video>'s object-contain
  const scale = box ? Math.min(box.width / frame.width, box.height / frame.height) : 0;

  const start = (handle: Handle) => (e: React.PointerEvent) => {
    e.stopPropagation();
    e.currentTarget.setPointerCapture(e.pointerId);
    dragRef.current = { handle, x: e.clientX, y: e.clientY, start: crop };
  };

  function move(e: React.PointerEvent) {
    const d = dragRef.current;
    if (d && scale > 0) onChange(dragCrop(d.start, d.handle, (e.clientX - d.x) / scale, (e.clientY - d.y) / scale, frame, ratio));
  }

  const stop = () => (dragRef.current = null);

  return (
    <div ref={boxRef} aria-hidden="true" className="absolute inset-2 flex items-center justify-center sm:inset-4">
      {scale > 0 && (
        <div className="relative overflow-hidden" style={{ width: frame.width * scale, height: frame.height * scale }}>
          <div
            onPointerDown={start("move")}
            onPointerMove={move}
            onPointerUp={stop}
            onPointerCancel={stop}
            className="absolute cursor-move touch-none border-2 border-ink shadow-[0_0_0_9999px_rgb(13_11_18/0.6)]"
            style={{
              left: pct(crop.x, frame.width),
              top: pct(crop.y, frame.height),
              width: pct(crop.width, frame.width),
              height: pct(crop.height, frame.height),
            }}
          >
            {/* rule of thirds */}
            <div className="pointer-events-none absolute inset-0 bg-[linear-gradient(to_right,transparent_calc(33.33%-0.5px),rgb(245_243_255/0.35)_calc(33.33%-0.5px),rgb(245_243_255/0.35)_calc(33.33%+0.5px),transparent_calc(33.33%+0.5px),transparent_calc(66.67%-0.5px),rgb(245_243_255/0.35)_calc(66.67%-0.5px),rgb(245_243_255/0.35)_calc(66.67%+0.5px),transparent_calc(66.67%+0.5px)),linear-gradient(to_bottom,transparent_calc(33.33%-0.5px),rgb(245_243_255/0.35)_calc(33.33%-0.5px),rgb(245_243_255/0.35)_calc(33.33%+0.5px),transparent_calc(33.33%+0.5px),transparent_calc(66.67%-0.5px),rgb(245_243_255/0.35)_calc(66.67%-0.5px),rgb(245_243_255/0.35)_calc(66.67%+0.5px),transparent_calc(66.67%+0.5px))]" />
            {CORNERS.map(({ handle, className }) => (
              <div
                key={handle}
                onPointerDown={start(handle)}
                // before: a bigger, invisible touch area
                className={`absolute h-3 w-3 touch-none rounded-sm bg-ink shadow ring-2 ring-bg before:absolute before:-inset-2.5 ${className}`}
              />
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
