import React, { useState, useEffect } from "react";
import { X, ChevronLeft, ChevronRight } from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";

/**
 * Full-screen artwork viewer. Scrolls through multiple views of a single work.
 */
export default function PortfolioLightbox({ images, startIndex = 0, onClose }) {
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

      <div className="relative max-w-5xl w-full flex items-center justify-center" onClick={(e) => e.stopPropagation()}>
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
            className="max-h-[82vh] max-w-full object-contain"
          />
        </AnimatePresence>
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