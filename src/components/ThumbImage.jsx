import React, { useEffect, useState } from "react";
import { thumb } from "@/lib/thumb";

/**
 * An uploaded picture at the size it is shown (D4). If the small copy does not
 * arrive, the original is tried, and only then the placeholder — one dropped
 * request on a slow connection used to lose the picture for good.
 */
export default function ThumbImage({ src, width, alt, className = "", style }) {
  const [step, setStep] = useState(0);
  useEffect(() => setStep(0), [src]);
  const small = thumb(src, width);
  const url = step === 0 ? small : step === 1 ? src : "/images/placeholder.webp";
  return (
    <img
      src={url}
      alt={alt}
      loading="lazy"
      decoding="async"
      className={`object-cover ${className}`}
      style={style}
      onError={() => setStep((s) => (s === 0 && small === src ? 2 : Math.min(2, s + 1)))}
    />
  );
}
