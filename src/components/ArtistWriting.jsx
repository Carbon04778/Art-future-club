import React, { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { format } from "date-fns";
import { useDataRevision } from "@/lib/dataRevision";
import { loadPublishedArticles, articleHref } from "@/lib/publishedArticles";
import { articlesBy, writerPath } from "@/lib/writers";

/**
 * "Writing" on an artist page: the AFC Editorial articles this artist wrote
 * (B3 in docs/CLIENT-REQUESTS.md) — the other half of the byline link.
 *
 * Matched by name, as bylines are typed text (see lib/writers.js). Renders
 * nothing at all for an artist who has written nothing, so every other
 * artist page is exactly as it was.
 */
const SHOWN = 6;

export default function ArtistWriting({ name }) {
  const rev = useDataRevision();
  const [mine, setMine] = useState([]);

  useEffect(() => {
    if (!name?.trim()) return undefined;
    let alive = true;
    loadPublishedArticles()
      .then((all) => { if (alive) setMine(articlesBy(all, name)); })
      .catch(() => {});
    return () => { alive = false; };
  }, [name, rev]);

  if (mine.length === 0) return null;

  return (
    <div className="mx-auto max-w-5xl px-6 pb-4 md:px-10">
      <div className="border-t border-border pt-12">
        <div className="mb-8 flex flex-wrap items-baseline justify-between gap-3">
          <p className="font-mono-caps text-[11px] text-muted-foreground">
            Writing · {mine.length} article{mine.length === 1 ? "" : "s"} for AFC Editorial
          </p>
          {mine.length > SHOWN && (
            <Link to={writerPath(name)} className="font-mono-caps text-[11px] text-primary hover:underline">
              All {mine.length} articles →
            </Link>
          )}
        </div>
        <ul className="divide-y divide-border border-y border-border">
          {mine.slice(0, SHOWN).map((a) => (
            <li key={a.id}>
              <Link to={articleHref(a)} className="group flex flex-wrap items-baseline justify-between gap-x-6 gap-y-1 py-4">
                <span className="font-heading text-xl tracking-[-0.01em] transition-colors group-hover:text-primary">{a.title}</span>
                <span className="font-mono-caps text-[10px] text-muted-foreground">
                  {[a.category, (a.publish_date || a.created_date) && format(new Date(a.publish_date || a.created_date), "d MMM yyyy")]
                    .filter(Boolean).join(" · ")}
                </span>
              </Link>
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}
