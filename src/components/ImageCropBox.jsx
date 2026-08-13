import React, { useEffect, useRef, useState, useCallback } from "react";
import { ZoomIn, ZoomOut, Crop } from "lucide-react";

const OUTPUT_SIZE = 1000; // square canvas resolution for the cropped file

/**
 * Square image crop box with white background and zoom/pan controls.
 *
 * Props:
 *  - file: a newly selected File (when present, shows zoom controls and emits a cropped square file)
 *  - src: an existing image URL to display read-only (object-contain on white)
 *  - onChange: (croppedFile | null) => void  — emits a square PNG File whenever the crop changes
 */
export default function ImageCropBox({ file, src, alt, onChange }) {
  const [img, setImg] = useState(null);   // HTMLImageElement of selected file
  const [zoom, setZoom] = useState(1);
  const [offset, setOffset] = useState({ x: 0, y: 0 });
  const [dragging, setDragging] = useState(null); // { startX, startY, origOffset }
  const boxRef = useRef(null);
  const canvasRef = useRef(null);

  // load the selected File into an image
  useEffect(() => {
    if (!file) { setImg(null); setZoom(1); setOffset({ x: 0, y: 0 }); return; }
    const url = URL.createObjectURL(file);
    const image = new Image();
    image.onload = () => {
      setImg(image);
      setZoom(1);
      setOffset({ x: 0, y: 0 });
    };
    image.src = url;
    return () => URL.revokeObjectURL(url);
  }, [file]);

  const boxSize = () => {
    const r = boxRef.current?.getBoundingClientRect();
    return Math.max(r?.width || 1, 1);
  };

  // cover scale at zoom = 1 (image fully covers the square)
  const coverScale = img ? Math.max(OUTPUT_SIZE / img.width, OUTPUT_SIZE / img.height) : 1;
  const displayScale = img ? Math.max(boxSize() / img.width, boxSize() / img.height) : 1;

  // clamp offset so image always covers the square
  const clampOffset = useCallback((ox, oy, z) => {
    if (!img) return { x: 0, y: 0 };
    const w = img.width * displayScale * z;
    const h = img.height * displayScale * z;
    const maxX = Math.max(0, (w - boxSize()) / 2);
    const maxY = Math.max(0, (h - boxSize()) / 2);
    return { x: Math.max(-maxX, Math.min(maxX, ox)), y: Math.max(-maxY, Math.min(maxY, oy)) };
  }, [img, displayScale]);

  // render the cropped square to canvas and emit a file
  const emitCropped = useCallback(() => {
    if (!img) { onChange?.(null); return; }
    const canvas = canvasRef.current || (canvasRef.current = document.createElement("canvas"));
    canvas.width = OUTPUT_SIZE;
    canvas.height = OUTPUT_SIZE;
    const ctx = canvas.getContext("2d");
    ctx.fillStyle = "#ffffff";
    ctx.fillRect(0, 0, OUTPUT_SIZE, OUTPUT_SIZE);
    const scale = coverScale * zoom;
    const w = img.width * scale;
    const h = img.height * scale;
    // map display offset (px in box) to output offset (px in OUTPUT_SIZE)
    const ratio = OUTPUT_SIZE / boxSize();
    const dx = (OUTPUT_SIZE - w) / 2 + offset.x * ratio;
    const dy = (OUTPUT_SIZE - h) / 2 + offset.y * ratio;
    ctx.drawImage(img, dx, dy, w, h);
    canvas.toBlob((blob) => {
      if (!blob) return;
      const cropped = new File([blob], "work-square.png", { type: "image/png" });
      onChange?.(cropped);
    }, "image/png", 0.92);
  }, [img, zoom, offset, coverScale, onChange]);

  // emit whenever crop changes
  useEffect(() => {
    if (img) emitCropped();
  }, [img, zoom, offset, emitCropped]);

  const onPointerDown = (e) => {
    if (!img) return;
    setDragging({ startX: e.clientX, startY: e.clientY, origOffset: { ...offset } });
    e.currentTarget.setPointerCapture?.(e.pointerId);
  };
  const onPointerMove = (e) => {
    if (!dragging) return;
    const dx = e.clientX - dragging.startX;
    const dy = e.clientY - dragging.startY;
    setOffset(clampOffset(dragging.origOffset.x + dx, dragging.origOffset.y + dy, zoom));
  };
  const onPointerUp = (e) => {
    setDragging(null);
    e.currentTarget.releasePointerCapture?.(e.pointerId);
  };

  // Display rendering
  const dispW = img ? img.width * displayScale * zoom : 0;
  const dispH = img ? img.height * displayScale * zoom : 0;
  const dispX = img ? (boxSize() - dispW) / 2 + offset.x : 0;
  const dispY = img ? (boxSize() - dispH) / 2 + offset.y : 0;

  return (
    <div className="w-full">
      <div
        ref={boxRef}
        className="relative aspect-square w-full overflow-hidden border border-border bg-white select-none touch-none"
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onPointerCancel={onPointerUp}
      >
        {img ? (
          <img
            src={img.src}
            alt={alt || "Work preview"}
            className="absolute max-w-none max-h-none"
            style={{ width: dispW, height: dispH, left: dispX, top: dispY, cursor: dragging ? "grabbing" : "grab" }}
            draggable={false}
          />
        ) : src ? (
          <img src={src} alt={alt || "Work"} className="absolute inset-0 h-full w-full object-contain" />
        ) : (
          <div className="flex items-center justify-center h-full text-sm text-muted-foreground font-mono-caps">No image</div>
        )}
        {img && (
          <span className="absolute top-2 left-2 flex items-center gap-1 bg-black/60 text-white px-2 py-1 font-mono-caps text-[10px]">
            <Crop className="h-3 w-3" /> Drag to position
          </span>
        )}
      </div>

      {img && (
        <div className="flex items-center gap-3 mt-3">
          <ZoomOut className="h-4 w-4 text-muted-foreground shrink-0" />
          <input
            type="range"
            min={1}
            max={4}
            step={0.01}
            value={zoom}
            onChange={(e) => setZoom(parseFloat(e.target.value))}
            className="flex-1 accent-primary"
          />
          <ZoomIn className="h-4 w-4 text-muted-foreground shrink-0" />
          <button
            type="button"
            onClick={() => { setZoom(1); setOffset({ x: 0, y: 0 }); }}
            className="font-mono-caps text-[11px] text-primary hover:opacity-70 ml-1"
          >
            Reset
          </button>
        </div>
      )}
    </div>
  );
}