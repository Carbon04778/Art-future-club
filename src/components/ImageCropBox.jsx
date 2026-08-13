import React, { useEffect, useRef, useState, useCallback } from "react";
import { ZoomIn, ZoomOut, Crop } from "lucide-react";

const OUTPUT_WIDTH = 1600; // rendered width of the cropped file, in pixels

/**
 * Image crop box with drag-to-reposition and zoom controls.
 *
 * Props:
 *  - file: a newly selected File. When present, shows the controls and emits a
 *          cropped file whenever the crop changes.
 *  - src: an existing image URL, shown read-only.
 *  - onChange: (croppedFile | null) => void
 *  - aspect: output width / height. Defaults to 1 (square) so every existing
 *          caller is unaffected. Editorial passes 16/9 and 4/3, because a
 *          square crop would have its sides cut off again when displayed wide.
 */
export default function ImageCropBox({ file, src, alt, onChange, aspect = 1 }) {
  // Output dimensions follow the requested ratio.
  const OUT_W = OUTPUT_WIDTH;
  const OUT_H = Math.round(OUTPUT_WIDTH / (aspect || 1));
  const [img, setImg] = useState(null);   // HTMLImageElement of selected file
  const [zoom, setZoom] = useState(1);
  const [offset, setOffset] = useState({ x: 0, y: 0 });
  const [dragging, setDragging] = useState(null); // { startX, startY, origOffset }
  const boxRef = useRef(null);
  const canvasRef = useRef(null);
  // Parents usually pass an inline arrow function, so `onChange` is a new
  // identity on every render. Holding it in a ref keeps emitCropped stable —
  // otherwise the emit effect re-ran continuously, producing a new File and a
  // new object URL each pass, which made the live preview flicker.
  const onChangeRef = useRef(onChange);
  useEffect(() => { onChangeRef.current = onChange; }, [onChange]);

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
  const boxHeight = () => boxSize() / (aspect || 1);

  // cover scale at zoom = 1 — the image fully covers the frame
  const coverScale = img ? Math.max(OUT_W / img.width, OUT_H / img.height) : 1;
  const displayScale = img ? Math.max(boxSize() / img.width, boxHeight() / img.height) : 1;

  // clamp offset so image always covers the square
  const clampOffset = useCallback((ox, oy, z) => {
    if (!img) return { x: 0, y: 0 };
    const w = img.width * displayScale * z;
    const h = img.height * displayScale * z;
    const maxX = Math.max(0, (w - boxSize()) / 2);
    const maxY = Math.max(0, (h - boxHeight()) / 2);
    return { x: Math.max(-maxX, Math.min(maxX, ox)), y: Math.max(-maxY, Math.min(maxY, oy)) };
  }, [img, displayScale]);

  // render the cropped square to canvas and emit a file
  const emitCropped = useCallback(() => {
    if (!img) { onChangeRef.current?.(null); return; }
    const canvas = canvasRef.current || (canvasRef.current = document.createElement("canvas"));
    canvas.width = OUT_W;
    canvas.height = OUT_H;
    const ctx = canvas.getContext("2d");
    ctx.fillStyle = "#ffffff";
    ctx.fillRect(0, 0, OUT_W, OUT_H);
    const scale = coverScale * zoom;
    const w = img.width * scale;
    const h = img.height * scale;
    // map display offset (px in box) to output offset (px in OUTPUT_SIZE)
    const ratio = OUT_W / boxSize();
    const dx = (OUT_W - w) / 2 + offset.x * ratio;
    const dy = (OUT_H - h) / 2 + offset.y * ratio;
    ctx.drawImage(img, dx, dy, w, h);
    canvas.toBlob((blob) => {
      if (!blob) return;
      const cropped = new File([blob], "cropped.png", { type: "image/png" });
      onChangeRef.current?.(cropped);
    }, "image/png", 0.92);
  }, [img, zoom, offset, coverScale, OUT_W, OUT_H]);

  // Emit once the crop settles rather than on every pointer move. Encoding a
  // 1600px canvas on each mousemove was both wasteful and the second cause of
  // the flicker.
  useEffect(() => {
    if (!img) return;
    const t = setTimeout(emitCropped, 150);
    return () => clearTimeout(t);
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
  const dispY = img ? (boxHeight() - dispH) / 2 + offset.y : 0;

  return (
    <div className="w-full">
      <div
        ref={boxRef}
        className="relative w-full overflow-hidden border border-border bg-white select-none touch-none"
        style={{ aspectRatio: String(aspect) }}
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