import React, { useState, useEffect } from "react";
import { spacePath } from "@/lib/slugs";
import { DIRECTORY_TYPES, isDirectoryType } from "@/lib/venueTypes";
import { Link, useSearchParams } from "react-router-dom";
import { base44 } from "@/api/base44Client";
import { Image } from "@/components/ui/image";
import { MapPin, ExternalLink, Loader2, Search, Map } from "lucide-react";
import SlimFooter from "@/components/SlimFooter";
import UnpublishedBadge from "@/components/UnpublishedBadge";
import { motion } from "framer-motion";
import { chapterFilterOptions } from "@/lib/chaptersData";
import { useDataRevision } from "@/lib/dataRevision";
import { useProgressiveList, staggerDelay } from "@/hooks/useProgressiveList";

const CHAPTERS = chapterFilterOptions("All");
const PLURAL = { "Art Store": "Art Stores", Framer: "Framers", Printer: "Printers" };

/**
 * The Directory (B11 in docs/CLIENT-REQUESTS.md).
 *
 * Julie: "Similar to venues, this is where we can list places of interest
 * like art stores, framers, printers etc. They only need a profile image and
 * a bio (along with social media, website address etc)." Built like the
 * Venues page: the database is asked for the directory types only, listings
 * are held for approval like galleries and venues (migration 028), and
 * businesses can claim theirs.
 */
export default function Directory() {
  const [rows, setRows] = useState([]);
  const [searchParams] = useSearchParams();
  const [chapter, setChapter] = useState(searchParams.get("chapter") || "All");
  const [category, setCategory] = useState(searchParams.get("category") || "All");
  const [query, setQuery] = useState("");
  const [loading, setLoading] = useState(true);
  const rev = useDataRevision();

  useEffect(() => {
    // Constrained in the query, as on the Venues page — never fetch-then-filter.
    base44.entities.CollectorProfile.filter(
      { type: { $in: DIRECTORY_TYPES } },
      "display_name",
      1000,
      "id,display_name,type,based_in,address,bio,avatar_url,website,instagram,partnership_type,status,slug"
    )
      .then((r) => setRows(r.filter((x) => isDirectoryType(x.type))))
      .catch(() => setRows([]))
      .finally(() => setLoading(false));
  }, [rev]);

  const q = query.trim().toLowerCase();
  const filtered = rows
    .filter((v) => {
      const inChapter = chapter === "All" || (v.based_in || "").includes(chapter) || (v.address || "").includes(chapter);
      const inCategory = category === "All" || v.type === category;
      const matches = !q || [v.display_name, v.based_in, v.address, v.bio, v.type].filter(Boolean).some((s) => s.toLowerCase().includes(q));
      return inChapter && inCategory && matches;
    })
    .sort((a, b) => (a.display_name || "").localeCompare(b.display_name || "", undefined, { sensitivity: "base", numeric: true }));

  const { visible, sentinelRef, hasMore, shown, total } = useProgressiveList(filtered);

  return (
    <>
      <div className="px-6 py-16 md:px-10">
        <p className="font-mono-caps text-[11px] text-muted-foreground">AFC — Directory</p>
        <h1 className="mt-3 font-heading text-5xl font-medium tracking-[-0.02em] md:text-7xl">Directory</h1>
        <p className="mt-4 text-lg text-muted-foreground">
          <span className="text-primary">Art stores</span>, <span className="text-accent">framers</span> and{" "}
          <span className="text-highlight">printers</span> — the places artists and collectors rely on.
        </p>

        {/* category */}
        <div className="mt-10 flex flex-wrap gap-2" role="group" aria-label="Category">
          {["All", ...DIRECTORY_TYPES].map((t) => (
            <button key={t} type="button" onClick={() => setCategory(t)} aria-pressed={category === t}
              className={`font-mono-caps text-[11px] px-3 py-1.5 border transition-colors ${category === t ? "border-foreground bg-foreground text-background" : "border-border text-muted-foreground hover:border-foreground"}`}>
              {t === "All" ? "All" : PLURAL[t]}
            </button>
          ))}
        </div>

        {/* chapter */}
        <div className="mt-3 flex flex-wrap gap-2" role="group" aria-label="Chapter">
          {CHAPTERS.map((c) => (
            <button key={c} type="button" onClick={() => setChapter(c)} aria-pressed={chapter === c}
              className={`font-mono-caps text-[10px] px-3 py-1.5 border transition-colors ${chapter === c ? "border-primary text-primary" : "border-border text-muted-foreground hover:border-foreground"}`}>
              {c}
            </button>
          ))}
        </div>

        <div className="mt-6 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
            <input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Search by name, area…"
              className="w-full sm:w-72 border border-border bg-transparent pl-9 pr-3 py-2 text-sm outline-none focus:border-foreground" />
          </div>
          <Link to="/map?show=directory" className="inline-flex items-center gap-1.5 font-mono-caps text-[11px] text-primary hover:underline">
            <Map className="h-3.5 w-3.5" /> View on the map
          </Link>
        </div>

        {loading ? (
          <div className="flex items-center justify-center py-32">
            <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
          </div>
        ) : filtered.length === 0 ? (
          <div className="mt-14 border border-border py-16 text-center" data-testid="directory-empty">
            <p className="font-mono-caps text-[11px] text-muted-foreground">
              {rows.length === 0 ? "The Directory is coming soon." : "Nothing matches — try another category or chapter."}
            </p>
          </div>
        ) : (
          <div className="mt-14 grid grid-cols-1 gap-8 sm:grid-cols-2 lg:grid-cols-3">
            {visible.map((v, i) => (
              <motion.div key={v.id} initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.4, delay: staggerDelay(i, undefined, 0.04) }} className="group" data-testid="directory-card">
                <Link to={spacePath(v)} className="block border border-border p-5 hover:border-foreground transition-colors">
                  <div className="flex flex-wrap items-center gap-4">
                    <div className="h-16 w-16 shrink-0 overflow-hidden rounded-full bg-muted flex items-center justify-center">
                      {v.avatar_url
                        ? <Image src={v.avatar_url} alt={v.display_name} fittingType="fill" className="h-full w-full object-cover" />
                        : <span className="font-mono-caps text-2xl text-muted-foreground/60">{v.display_name?.[0]}</span>}
                    </div>
                    <div className="min-w-0">
                      <div className="flex flex-wrap items-center gap-2">
                        <p className="font-mono-caps text-[10px] text-primary">{v.type}</p>
                        <UnpublishedBadge profile={v} />
                      </div>
                      <h3 className="mt-1 font-heading text-xl tracking-[-0.01em] group-hover:text-primary transition-colors truncate">{v.display_name}</h3>
                      {v.based_in && <p className="font-mono-caps text-[10px] text-muted-foreground">{v.based_in}</p>}
                    </div>
                  </div>
                  {v.address && (
                    <p className="mt-3 flex items-center gap-1 font-mono-caps text-[10px] text-muted-foreground"><MapPin className="h-3 w-3" /> {v.address}</p>
                  )}
                  {v.bio && <p className="mt-2 text-xs text-muted-foreground/80 leading-relaxed line-clamp-3">{v.bio}</p>}
                  {v.website && (
                    <p className="mt-2 flex items-center gap-1 font-mono-caps text-[10px] text-muted-foreground"><ExternalLink className="h-3 w-3" /> Website</p>
                  )}
                </Link>
              </motion.div>
            ))}
          </div>
        )}

        {hasMore && (
          <>
            <div ref={sentinelRef} aria-hidden="true" className="h-px w-full" />
            <p className="mt-10 text-center font-mono-caps text-[10px] text-muted-foreground">Showing {shown} of {total} — keep scrolling</p>
          </>
        )}

        {/* Businesses list or claim themselves (Julie: "less admin for us"). */}
        <div className="mt-20 border-t border-border pt-10 text-center" data-testid="directory-join">
          <p className="font-mono-caps text-[11px] text-muted-foreground">Run an art store, framing or print studio?</p>
          <p className="mt-2 text-sm text-muted-foreground">
            <Link to="/onboarding" className="text-primary underline">List your business</Link>
            {" "}— or, if it is already here, sign up with the email address the AFC team has on file and it becomes yours.
          </p>
        </div>
      </div>
      <SlimFooter />
    </>
  );
}
