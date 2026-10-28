import { useEffect, useRef, useState } from "react";
import { cornerPoint, dragCrop, type Crop, type Handle, type Size } from "../lib/crop";
import { clamp } from "../lib/time";

type Corner = Exclude<Handle, "move">;

type CropOverlayProps = {
  frame: Size; // the video's own size
  crop: Crop;
  ratio: number | null;
  videoRef: React.RefObject<HTMLVideoElement | null>; // the magnifier's picture
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
 * The crop frame over the preview: drag it to move, drag a corner to resize (with a magnifier
 * on that corner). Pointer-only (hidden from assistive tech): the Crop card's fields do the same
 * by keyboard (WCAG 2.5.7).
 */
export function CropOverlay({ frame, crop, ratio, videoRef, onChange }: CropOverlayProps) {
  const pictureRef = useRef<HTMLDivElement>(null);
  const dragRef = useRef<{ handle: Handle; x: number; y: number; start: Crop; scale: number } | null>(null);
  const [resizing, setResizing] = useState<{ corner: Corner; scale: number } | null>(null);

  const start = (handle: Handle) => (e: React.PointerEvent) => {
    e.stopPropagation();
    e.currentTarget.setPointerCapture(e.pointerId);
    const scale = pictureRef.current!.getBoundingClientRect().width / frame.width; // screen px per video px
    dragRef.current = { handle, x: e.clientX, y: e.clientY, start: crop, scale };
    if (handle !== "move") setResizing({ corner: handle, scale });
  };

  function move(e: React.PointerEvent) {
    const d = dragRef.current;
    if (d && d.scale > 0) onChange(dragCrop(d.start, d.handle, (e.clientX - d.x) / d.scale, (e.clientY - d.y) / d.scale, frame, ratio));
  }

  function stop() {
    dragRef.current = null;
    setResizing(null);
  }

  const rect = {
    left: pct(crop.x, frame.width),
    top: pct(crop.y, frame.height),
    width: pct(crop.width, frame.width),
    height: pct(crop.height, frame.height),
  };

  return (
    // the picture's place inside the box, like the <video>'s object-contain (cq: the box's size)
    <div aria-hidden="true" className="absolute inset-2 flex items-center justify-center [container-type:size] sm:inset-4">
      <div
        ref={pictureRef}
        className="relative"
        style={{ aspectRatio: `${frame.width} / ${frame.height}`, width: `min(100cqw, 100cqh * ${frame.width / frame.height})` }}
      >
        {/* dims everything outside the crop (clipped to the picture; the frame itself isn't, so its corners show whole) */}
        <div className="pointer-events-none absolute inset-0 overflow-hidden">
          <div className="absolute shadow-[0_0_0_9999px_rgb(13_11_18/0.6)]" style={rect} />
        </div>
        <div
          onPointerDown={start("move")}
          onPointerMove={move}
          onPointerUp={stop}
          onPointerCancel={stop}
          className="absolute cursor-move touch-none border-2 border-ink"
          style={rect}
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
        {resizing && <Magnifier frame={frame} crop={crop} videoRef={videoRef} {...resizing} />}
      </div>
    </div>
  );
}

const ZOOM = 4;
const DIM = "rgb(13 11 18 / 0.6)";

/** A round 4x close-up of the corner being dragged: above it (below, near the top), out of the finger's way. */
function Magnifier({ frame, crop, videoRef, corner, scale }: Pick<CropOverlayProps, "frame" | "crop" | "videoRef"> & { corner: Corner; scale: number }) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const picture = { width: frame.width * scale, height: frame.height * scale }; // on screen
  const size = Math.round(clamp(Math.min(picture.width, picture.height) * 0.5, 64, 128));
  const point = cornerPoint(crop, corner);
  const at = { x: point.x * scale, y: point.y * scale };
  const gap = 20;
  const above = at.y - gap - size;
  const below = at.y + gap;
  const top = above >= 0 || above > picture.height - (below + size) ? above : below;

  useEffect(() => {
    const canvas = canvasRef.current;
    const ctx = canvas?.getContext("2d");
    if (!canvas || !ctx) return;
    const dpr = window.devicePixelRatio || 1;
    const px = Math.round(size * dpr);
    canvas.width = canvas.height = px;
    const k = ZOOM * scale * dpr; // canvas px per video px
    const sx = point.x - px / 2 / k;
    const sy = point.y - px / 2 / k;
    ctx.fillStyle = "#0d0b12";
    ctx.fillRect(0, 0, px, px);
    const video = videoRef.current;
    if (video && video.readyState >= HTMLMediaElement.HAVE_CURRENT_DATA) {
      ctx.imageSmoothingEnabled = false; // show real pixels: that's where the edge goes
      ctx.drawImage(video, sx, sy, px / k, px / k, 0, 0, px, px);
    }
    const r = [(crop.x - sx) * k, (crop.y - sy) * k, crop.width * k, crop.height * k] as const;
    ctx.fillStyle = DIM;
    ctx.beginPath();
    ctx.rect(0, 0, px, px);
    ctx.rect(...r);
    ctx.fill("evenodd");
    ctx.strokeStyle = "#f5f3ff";
    ctx.lineWidth = 2 * dpr;
    ctx.strokeRect(...r);
  });

  return (
    <canvas
      ref={canvasRef}
      className="pointer-events-none absolute rounded-full border-2 border-ink shadow-lg"
      style={{
        width: size,
        height: size,
        left: clamp(at.x - size / 2, -8, picture.width - size + 8),
        top: clamp(top, -8, picture.height - size + 8),
      }}
    />
  );
}
