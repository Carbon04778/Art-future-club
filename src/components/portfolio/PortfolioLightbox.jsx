import React, { useState, useEffect } from "react";
import { X, ChevronLeft, ChevronRight } from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";

/**
 * Full-screen artwork viewer. Scrolls through multiple views of a single work.
 */
/**
 * `work` is optional. When given, its details are shown beside the enlarged
 * image — beside on a wide screen, below on a narrow one.
 *
 * The description used to sit only under the small grid thumbnail, where it
 * was squeezed into a narrow column and hard to read. Here there is room for
 * it, and it is the moment someone is actually looking at the piece.
 */
export default function PortfolioLightbox({ images, startIndex = 0, work, actions, onClose }) {
  const [idx, setIdx] = useState(startIndex || 0);
  const total = images.length;

  useEffect(() => {
    if (total <= 1) return;
    const onKey = (e) => {
      if (e.key === "Escape") onClose();
      if (e.key === "ArrowRight") setIdx((i) => (i + 1) % total);
      if (e.key === "ArrowLeft") setIdx((i) => (i - 1 + total) % total);
    };
    window.addEventListener("keydown", onKey);
    document.body.style.overflow = "hidden";
    return () => {
      window.removeEventListener("keydown", onKey);
      document.body.style.overflow = "";
    };
  }, [total, onClose]);

  if (!total) return null;

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      className="fixed inset-0 z-[60] bg-background/95 backdrop-blur-sm flex items-center justify-center p-4"
      onClick={onClose}
    >
      <button className="absolute top-5 right-5 p-2 hover:text-primary z-10" onClick={onClose} aria-label="Close">
        <X className="h-5 w-5" />
      </button>

      {total > 1 && (
        <span className="absolute top-5 left-1/2 -translate-x-1/2 font-mono-caps text-[10px] text-muted-foreground">
          {idx + 1} / {total}
        </span>
      )}

      <div
        className={`relative w-full flex flex-col items-center justify-center gap-6 lg:flex-row lg:items-start ${
          work ? "max-w-6xl" : "max-w-5xl"
        }`}
        onClick={(e) => e.stopPropagation()}
      >
        {total > 1 && (
          <>
            <button className="absolute left-0 top-1/2 -translate-y-1/2 p-2 hover:text-primary" onClick={() => setIdx((i) => (i - 1 + total) % total)} aria-label="Previous">
              <ChevronLeft className="h-6 w-6" />
            </button>
            <button className="absolute right-0 top-1/2 -translate-y-1/2 p-2 hover:text-primary" onClick={() => setIdx((i) => (i + 1) % total)} aria-label="Next">
              <ChevronRight className="h-6 w-6" />
            </button>
          </>
        )}
        <AnimatePresence mode="wait">
          <motion.img
            key={idx}
            src={images[idx]}
            alt=""
            initial={{ opacity: 0, scale: 0.98 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.2 }}
            className={`max-w-full object-contain ${work ? "max-h-[70vh] lg:max-h-[82vh]" : "max-h-[82vh]"}`}
          />
        </AnimatePresence>

        {work && (
          <div className="w-full shrink-0 overflow-y-auto lg:max-h-[82vh] lg:w-72">
            <h3 className="font-heading text-2xl tracking-[-0.01em]">{work.title}</h3>
            <p className="mt-2 font-mono-caps text-[11px] text-muted-foreground">
              {[work.medium, work.dimensions, work.year].filter(Boolean).join(" · ")}
            </p>
            {work.available_for_sale && work.price && (
              <p className="mt-3 font-mono-caps text-[13px] text-primary">
                {work.currency || "USD"} {work.price}
              </p>
            )}
            {work.description && (
              <p className="mt-4 whitespace-pre-wrap text-sm leading-relaxed text-foreground/80">
                {work.description}
              </p>
            )}

            {/*
              Like and Collect belong here.

              They lived only in a small row beneath the grid thumbnail, so at
              the moment someone had decided they wanted a piece — looking at
              it properly, enlarged — there was nothing to click. They had to
              close the lightbox and find the link again.
            */}
            {actions && (
              <div className="mt-6 flex flex-wrap items-center gap-x-5 gap-y-3 border-t border-border pt-4">
                {actions}
              </div>
            )}
          </div>
        )}
      </div>

      {total > 1 && (
        <div className="absolute bottom-5 left-1/2 -translate-x-1/2 flex items-center gap-2">
          {images.map((_, i) => (
            <button
              key={i}
              onClick={(e) => { e.stopPropagation(); setIdx(i); }}
              className={`h-2 w-2 rounded-full transition-colors ${i === idx ? "bg-primary" : "bg-foreground/30 hover:bg-foreground/50"}`}
              aria-label={`View ${i + 1}`}
            />
          ))}
        </div>
      )}
    </motion.div>
  );
}