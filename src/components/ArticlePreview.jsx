import React from "react";
import { format } from "date-fns";
import ArticleBody from "@/components/ArticleBody";

/**
 * Live, read-only preview of how a drafted article will render.
 */
export default function ArticlePreview({ data }) {
  const { title, subtitle, body, category, author_name, cover_image_url, images, layout, publish_date, closing_image_url, tags, categories } = data;
  const wordCount = (body || "").trim().split(/\s+/).filter(Boolean).length;
  const reading_time_mins = Math.max(1, Math.round(wordCount / 200));
  const date = publish_date ? new Date(publish_date) : new Date();
  const allTags = [...(categories || []), ...(tags || [])];

  return (
    <div className="bg-background">
      {cover_image_url ? (
        <img src={cover_image_url} alt={title || "Cover"} loading="lazy" className="aspect-[16/7] w-full object-cover mb-8" />
      ) : (
        <div className="aspect-[16/7] w-full mb-8 border border-dashed border-border flex items-center justify-center">
          <span className="font-mono-caps text-[10px] text-muted-foreground">No cover image</span>
        </div>
      )}
      <span className="font-mono-caps text-[10px] border border-primary px-2 py-0.5 text-primary">{category || "Feature"}</span>
      <h1 className="mt-4 font-heading text-4xl font-medium tracking-[-0.02em] md:text-5xl">{title || "Untitled article"}</h1>
      {subtitle && <p className="mt-3 text-lg text-muted-foreground">{subtitle}</p>}
      <div className="mt-4 flex flex-wrap items-center gap-x-4 gap-y-1">
        <p className="font-mono-caps text-[11px] text-muted-foreground">By {author_name || "—"}</p>
        <p className="font-mono-caps text-[11px] text-muted-foreground">· {reading_time_mins} min read</p>
        <p className="font-mono-caps text-[11px] text-muted-foreground">· {format(date, "d MMM yyyy")}</p>
      </div>
      {allTags.length > 0 && (
        <div className="mt-3 flex flex-wrap gap-1.5">
          {allTags.map((t) => (
            <span key={t} className="font-mono-caps text-[9px] border border-border px-1.5 py-0.5 text-muted-foreground">{t}</span>
          ))}
        </div>
      )}
      <ArticleBody article={{ body: body || "", images: images || [], layout: layout || "cover_top", closing_image_url: closing_image_url || "", title: title || "Untitled" }} />
    </div>
  );
}