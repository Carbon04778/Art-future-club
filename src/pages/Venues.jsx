import React, { useState, useEffect } from "react";
import { spacePath } from "@/lib/slugs";
import { VENUE_TYPES, isVenueType } from "@/lib/venueTypes";
import { Link, useSearchParams } from "react-router-dom";
import { base44 } from "@/api/base44Client";
import { Image } from "@/components/ui/image";
import { MapPin, ExternalLink, Loader2 } from "lucide-react";
import SlimFooter from "@/components/SlimFooter";
import UnpublishedBadge from "@/components/UnpublishedBadge";
import { motion } from "framer-motion";
import { chapterFilterOptions } from "@/lib/chaptersData";
import { useDataRevision } from "@/lib/dataRevision";
import { useProgressiveList, staggerDelay } from "@/hooks/useProgressiveList";

const CHAPTERS = chapterFilterOptions("All");

export default function Venues() {
  const [venues, setVenues] = useState([]);
  const [searchParams] = useSearchParams();
  // Honour ?chapter= from chapter-page venue cards.
  const [chapter, setChapter] = useState(searchParams.get("chapter") || "All");
  const [typeFilter, setTypeFilter] = useState("All");
  const [loading, setLoading] = useState(true);
  const rev = useDataRevision();

  useEffect(() => {
    // Every venue type, not just "Institution". Filtering on that one value
    // meant a Museum, Restaurant or Event Space never appeared here at all.
    // `status` is required — UnpublishedBadge reads it to tell the owner (and
    // an admin) that a listing is not public yet.
    base44.entities.CollectorProfile.list(
      "-updated_date",
      400,
      "id,display_name,type,based_in,address,bio,avatar_url,cover_image_url,partnership_type,website,status,slug"
    )
      .then((rows) => setVenues(rows.filter((r) => isVenueType(r.type))))
      .catch(() => {})
      .finally(() => setLoading(false));
  }, [rev]);

  // Two independent filters: where it is, and what kind of space it is.
  const filtered = venues.filter((v) => {
    const inChapter =
      chapter === "All" ||
      (v.based_in || "").includes(chapter) ||
      (v.address || "").includes(chapter);
    const isType = typeFilter === "All" || v.type === typeFilter;
    return inChapter && isType;
  })
    // Alphabetical, matching the galleries page.
    .sort((a, b) =>
      (a.display_name || "").localeCompare(b.display_name || "", undefined, {
        sensitivity: "base",
        numeric: true,
      })
    );

  // Batched last, on the filtered and sorted list, so the filters still see
  // every venue and only the rendering is staged.
  const { visible, sentinelRef, hasMore, shown, total } = useProgressiveList(filtered);

  // Only offer the types actually present, so the row is not full of filters
  // that return nothing.
  const availableTypes = VENUE_TYPES.filter((t) => venues.some((v) => v.type === t));

  return (
    <>
      <div className="px-6 py-16 md:px-10">
        <p className="font-mono-caps text-[11px] text-muted-foreground">AFC — Directory</p>
        <h1 className="mt-3 font-heading text-5xl font-medium tracking-[-0.02em] md:text-7xl">Venues &amp; Spaces</h1>
        <p className="mt-4 text-lg text-muted-foreground">
          <span className="text-primary">Independent</span> <span className="text-primary">spaces</span>, project rooms and institutions across the{" "}
          <span className="text-accent">network</span>.
        </p>

        {/* chapter filter */}
        <div className="mt-10 flex flex-wrap gap-2">
          {CHAPTERS.map((c) => (
            <button
              key={c}
              onClick={() => setChapter(c)}
              className={`font-mono-caps text-[11px] px-3 py-1.5 border transition-colors ${
                chapter === c ? "border-foreground bg-foreground text-background" : "border-border text-muted-foreground hover:border-foreground"
              }`}
            >
              {c}
            </button>
          ))}
        </div>

        {/* Type filter — so museums can be found on their own rather than
            being mixed in with every other kind of space. Hidden when there
            is only one kind, where it would do nothing. */}
        {availableTypes.length > 1 && (
          <div className="mt-3 flex flex-wrap gap-2">
            {["All", ...availableTypes].map((t) => (
              <button
                key={t}
                onClick={() => setTypeFilter(t)}
                className={`font-mono-caps text-[10px] px-3 py-1.5 border transition-colors ${
                  typeFilter === t
                    ? "border-primary text-primary"
                    : "border-border text-muted-foreground hover:border-foreground"
                }`}
              >
                {t}
              </button>
            ))}
          </div>
        )}

        {loading ? (
          <div className="flex items-center justify-center py-32">
            <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
          </div>
        ) : filtered.length === 0 ? (
          <div className="mt-14 border border-border py-16 text-center">
            <p className="font-mono-caps text-[11px] text-muted-foreground">No venues listed yet.</p>
          </div>
        ) : (
          <div className="mt-14 grid grid-cols-1 gap-8 sm:grid-cols-2 lg:grid-cols-3">
            {visible.map((v, i) => (
              <motion.div
                key={v.id}
                initial={{ opacity: 0, y: 12 }}
                animate={{ opacity: 1, y: 0 }}
                // Capped: i * 0.04 across 136 venues meant the last card did
                // not appear until 5.4 seconds after the page loaded.
                transition={{ duration: 0.4, delay: staggerDelay(i, undefined, 0.04) }}
                className="group"
                data-artwork
              >
                <Link to={spacePath(v, true)} className="block">
                  <div className="aspect-[4/3] overflow-hidden bg-muted">
                    {v.cover_image_url || v.avatar_url ? (
                      <Image
                        src={v.cover_image_url || v.avatar_url}
                        alt={v.display_name}
                        fittingType="fill"
                        className="h-full w-full group-hover:scale-[1.03] transition-transform duration-500"
                      />
                    ) : (
                      <div className="flex h-full w-full items-center justify-center">
                        <span className="font-mono-caps text-6xl text-muted-foreground/40">{v.display_name?.[0]}</span>
                      </div>
                    )}
                  </div>
                  <div className="mt-3">
                    <div className="flex items-center gap-2 flex-wrap">
                      <p className="font-mono-caps text-[10px] text-primary">{v.type || "Venue"}</p>
                      <UnpublishedBadge profile={v} />
                      {v.partnership_type && (
                        <span className={`font-mono-caps text-[8px] px-1.5 py-0.5 ${v.partnership_type === 'Paid Member' ? 'border border-primary text-primary' : 'border border-highlight text-highlight'}`}>
                          {v.partnership_type}
                        </span>
                      )}
                    </div>
                    <h3 className="mt-1 font-heading text-2xl tracking-[-0.01em] group-hover:text-primary transition-colors">
                      {v.display_name}
                    </h3>
                    {v.based_in && (
                      <p className="mt-1 font-mono-caps text-[10px] text-muted-foreground">{v.based_in}</p>
                    )}
                    {v.address && (
                      <p className="mt-1 flex items-center gap-1 font-mono-caps text-[10px] text-muted-foreground">
                        <MapPin className="h-3 w-3" /> {v.address}
                      </p>
                    )}
                    {v.bio && (
                      <p className="mt-2 text-xs text-muted-foreground/70 leading-relaxed line-clamp-2">{v.bio}</p>
                    )}
                    {v.website && (
                      <p className="mt-2 flex items-center gap-1 font-mono-caps text-[10px] text-muted-foreground">
                        <ExternalLink className="h-3 w-3" /> Website
                      </p>
                    )}
                  </div>
                </Link>
              </motion.div>
            ))}
          </div>
        )}

        {/* Requests the next batch 600px before it is reached, so the list has
            already grown by the time they scroll to the bottom. */}
        {hasMore && (
          <>
            <div ref={sentinelRef} aria-hidden="true" className="h-px w-full" />
            <p className="mt-10 text-center font-mono-caps text-[10px] text-muted-foreground">
              Showing {shown} of {total} — keep scrolling
            </p>
          </>
        )}
      </div>
      <SlimFooter />
    </>
  );
}