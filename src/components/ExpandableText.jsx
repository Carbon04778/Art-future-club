import React, { useState } from "react";

/**
 * Long text collapsed to a few lines, with a control to expand it.
 *
 * A gallery or artist statement can run to several hundred words. Rendered in
 * full it pushed everything else — address, works, exhibitions — below the
 * fold, so a visitor saw nothing but prose.
 *
 * Short text is rendered plainly with no control, so the button only appears
 * when there is genuinely something hidden.
 */
export default function ExpandableText({
  text,
  lines = 4,
  className = "",
  moreLabel = "Read more",
  lessLabel = "Show less",
}) {
  const [open, setOpen] = useState(false);
  if (!text) return null;


  // Roughly how much fits in the collapsed height. Only used to decide whether
  // to offer the control at all — the clamp itself is done in CSS, which is
  // accurate regardless of this estimate.
  const isLong = String(text).trim().split(/\s+/).length > lines * 18;

  return (
    <div>
      <p
        className={className}
        style={
          // Only clamp when there is genuinely something to hide. Applying it
          // to short text is invisible, but it means the markup claims to be
          // truncating when it is not.
          open || !isLong
            ? undefined
            : {
                display: "-webkit-box",
                WebkitLineClamp: lines,
                WebkitBoxOrient: "vertical",
                overflow: "hidden",
              }
        }
      >
        {text}
      </p>

      {isLong && (
        <button
          type="button"
          onClick={() => setOpen((v) => !v)}
          aria-expanded={open}
          className="mt-2 font-mono-caps text-[11px] text-primary transition-opacity hover:opacity-70"
        >
          {open ? lessLabel : moreLabel} →
        </button>
      )}
    </div>
  );
}
