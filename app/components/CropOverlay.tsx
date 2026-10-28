import { useRef } from "react";
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
  const pictureRef = useRef<HTMLDivElement>(null);
  const dragRef = useRef<{ handle: Handle; x: number; y: number; start: Crop; scale: number } | null>(null);

  const start = (handle: Handle) => (e: React.PointerEvent) => {
    e.stopPropagation();
    e.currentTarget.setPointerCapture(e.pointerId);
    const scale = pictureRef.current!.getBoundingClientRect().width / frame.width; // screen px per video px
    dragRef.current = { handle, x: e.clientX, y: e.clientY, start: crop, scale };
  };

  function move(e: React.PointerEvent) {
    const d = dragRef.current;
    if (d && d.scale > 0) onChange(dragCrop(d.start, d.handle, (e.clientX - d.x) / d.scale, (e.clientY - d.y) / d.scale, frame, ratio));
  }

  const stop = () => (dragRef.current = null);

  return (
    // the picture's place inside the box, like the <video>'s object-contain (cq: the box's size)
    <div aria-hidden="true" className="absolute inset-2 flex items-center justify-center [container-type:size] sm:inset-4">
      <div
        ref={pictureRef}
        className="relative overflow-hidden"
        style={{ aspectRatio: `${frame.width} / ${frame.height}`, width: `min(100cqw, 100cqh * ${frame.width / frame.height})` }}
      >
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
          {["33.33%", "66.67%"].map((at) => (
            <div key={at} className="pointer-events-none">
              <div className="absolute inset-y-0 w-px bg-ink/35" style={{ left: at }} />
              <div className="absolute inset-x-0 h-px bg-ink/35" style={{ top: at }} />
            </div>
          ))}
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
    </div>
  );
}
