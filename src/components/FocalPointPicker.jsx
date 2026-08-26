import React, { useRef, useState } from "react";
import { Move } from "lucide-react";

/**
 * Choose which part of a wide image stays in frame.
 *
 * A cover photo is shown in a banner, so a tall or square image must be
 * cropped. The crop was always taken from the centre, which cut the subject
 * out of most photographs.
 *
 * This shows the image at the ratio it will actually be displayed at, and lets
 * the uploader drag to choose the point that stays visible. The same value is
 * then used wherever the image is rendered, so what they set is what everyone
 * sees.
 *
 * Props:
 *   src      image to position (an existing URL or an object URL)
 *   aspect   width / height of the frame it will appear in
 *   x, y     current focal point, 0-100
 *   onChange (x, y) => void
 */
export default function FocalPointPicker({ src, aspect = 16 / 9, x = 50, y = 50, onChange }) {
  const boxRef = useRef(null);
  const [dragging, setDragging] = useState(false);

  if (!src) return null;

  const setFromEvent = (e) => {
    const rect = boxRef.current?.getBoundingClientRect();
    if (!rect) return;
    const point = e.touches?.[0] || e;
    // Clamped: dragging beyond the edge would otherwise produce a value that
    // pushes the subject out of frame entirely.
    const nx = Math.min(100, Math.max(0, ((point.clientX - rect.left) / rect.width) * 100));
    const ny = Math.min(100, Math.max(0, ((point.clientY - rect.top) / rect.height) * 100));
    onChange(Math.round(nx), Math.round(ny));
  };

  return (
    <div className="mt-3">
      <div
        ref={boxRef}
        role="application"
        aria-label="Drag to choose which part of the image stays in frame"
        className="relative w-full cursor-crosshair overflow-hidden border border-border bg-muted select-none touch-none"
        style={{ aspectRatio: String(aspect) }}
        onPointerDown={(e) => { setDragging(true); e.currentTarget.setPointerCapture?.(e.pointerId); setFromEvent(e); }}
        onPointerMove={(e) => dragging && setFromEvent(e)}
        onPointerUp={() => setDragging(false)}
        onPointerCancel={() => setDragging(false)}
      >
        <img
          src={src}
          alt=""
          draggable={false}
          className="h-full w-full object-cover"
          style={{ objectPosition: `${x}% ${y}%` }}
        />

        {/* Where the chosen point sits, so it is clear what is being set. */}
        <span
          className="pointer-events-none absolute h-8 w-8 -translate-x-1/2 -translate-y-1/2 rounded-full border-2 border-primary bg-primary/20"
          style={{ left: `${x}%`, top: `${y}%` }}
        />
      </div>

      <p className="mt-2 flex items-center gap-1.5 text-xs text-muted-foreground">
        <Move className="h-3 w-3" />
        Drag to choose what stays in frame. This is exactly how the image will
        appear.
      </p>
    </div>
  );
}
