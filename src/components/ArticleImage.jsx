import React, { useState } from "react";
import { Maximize2, Minimize2 } from "lucide-react";

/**
 * Editorial image: contained by default (never stretched/deformed) on a
 * black background, with a toggle to expand it to fill the box (object-cover).
 * Uses a plain <img> so object-fit applies to every URL type (Wix, external,
 * and local object-URL previews alike). Optionally renders a caption beneath.
 */
export default function ArticleImage({ src, alt = "", caption = "", className = "" }) {
  const [expanded, setExpanded] = useState(false);
  if (!src) return null;
  // Margin classes belong on the <figure> (spacing around the whole unit);
  // aspect ratio + width stay on the box so the image keeps a definite height
  // and the caption sits flush against it.
  const mgn = (className.match(/(?:my|mb|mt|mx|ml|mr)-\S+/g) || []).join(" ");
  const box = (className.replace(/(?:my|mb|mt|mx|ml|mr)-\S+/g, "") + " w-full").replace(/\s+/g, " ").trim();
  return (
    <figure className={mgn}>
      <div className={`relative group overflow-hidden bg-black ${box}`}>
        <img
          src={src}
          alt={alt}
          loading="lazy"
          className={`absolute inset-0 h-full w-full ${expanded ? "object-cover" : "object-contain"}`}
        />
        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation();
            setExpanded((v) => !v);
          }}
          className="absolute right-2 top-2 z-10 flex items-center gap-1 bg-foreground/80 px-2 py-1 font-mono-caps text-[10px] text-background opacity-0 transition-opacity hover:bg-foreground group-hover:opacity-100"
          title={expanded ? "Fit to box" : "Expand to fill"}
        >
          {expanded ? <Minimize2 className="h-3 w-3" /> : <Maximize2 className="h-3 w-3" />}
          <span>{expanded ? "Fit" : "Expand"}</span>
        </button>
      </div>
      {caption ? (
        <figcaption className="text-center font-mono-caps text-[10px] text-muted-foreground">{caption}</figcaption>
      ) : null}
    </figure>
  );
}