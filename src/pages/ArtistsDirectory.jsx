import React, { useState, useEffect } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { base44 } from "@/api/base44Client";
import { Image } from "@/components/ui/image";
import { ArrowUpRight, Search } from "lucide-react";
import { motion } from "framer-motion";
import SlimFooter from "@/components/SlimFooter";
import { chapterFilterOptions } from "@/lib/chaptersData";

const DISCIPLINES = ["All", "Painting", "Sculpture", "Photography", "Installation", "Video Art", "Performance", "Drawing", "Ceramics", "Sound Art", "Digital Art", "Mixed Media", "Other"];
const CHAPTERS = chapterFilterOptions("All Chapters");
const SEEKING_OPTIONS = ["Exhibition Opportunities", "Collectors", "Collaborators", "Residencies", "Representation", "Press"];

export default function ArtistsDirectory() {
  const [artists, setArtists] = useState([]);
  const [filter, setFilter] = useState("All");
  const [searchParams] = useSearchParams();
  // Honour ?chapter= so "See all artists" from a chapter page lands filtered.
  const [chapter, setChapter] = useState(searchParams.get("chapter") || "All Chapters");
  const [seekingFilter, setSeekingFilter] = useState("");
  const [premiumOnly, setPremiumOnly] = useState(false);
  const [forSaleOnly, setForSaleOnly] = useState(false);
  const [search, setSearch] = useState("");
  const [hovered, setHovered] = useState(null);

  useEffect(() => {
    base44.entities.ArtistProfile.list("-created_date", 200).then(setArtists);
  }, []);

  const filtered = artists.filter((a) => {
    if (filter !== "All" && a.discipline !== filter) return false;
    if (chapter !== "All Chapters" && a.chapter !== chapter) return false;
    if (seekingFilter && !(a.seeking || []).includes(seekingFilter)) return false;
    if (premiumOnly && !a.is_premium) return false;
    if (forSaleOnly && !a.portfolio_works?.some((w) => w.available_for_sale)) return false;
    if (search) {
      const q = search.toLowerCase();
      if (!a.display_name?.toLowerCase().includes(q) && !a.discipline?.toLowerCase().includes(q) && !a.based_in?.toLowerCase().includes(q)) return false;
    }
    return true;
  });

  return (
    <>
      <div className="px-6 py-16 md:px-10">
        <p className="font-mono-caps text-[11px] text-primary">The Collective Registry</p>
        <h1 className="mt-3 font-heading text-5xl font-medium tracking-[-0.02em] md:text-7xl">Artists</h1>
        <p className="mt-4 text-lg text-muted-foreground">
          {filtered.length} artist{filtered.length !== 1 ? "s" : ""} in the <span className="text-accent">network</span>
        </p>

        {/* Search */}
        <div className="mt-8 relative max-w-md">
          <Search className="absolute left-4 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <input
            className="w-full border border-border bg-transparent pl-11 pr-4 py-3 text-base outline-none focus:border-foreground"
            placeholder="Search by name, discipline, location…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>

        {/* Discipline filter */}
        <div className="mt-8 flex flex-wrap gap-2">
          {DISCIPLINES.map((d) => (
            <button key={d} onClick={() => setFilter(d)}
              className={`font-mono-caps text-[11px] px-3 py-1.5 border transition-colors ${filter === d ? "border-foreground bg-foreground text-background" : "border-border text-muted-foreground hover:border-foreground"}`}>
              {d}
            </button>
          ))}
        </div>

        {/* Advanced filters row */}
        <div className="mt-4 flex flex-wrap items-center gap-3">
          <select
            className="border border-border bg-background px-3 py-2 font-mono-caps text-[11px] text-muted-foreground outline-none focus:border-foreground"
            value={chapter}
            onChange={(e) => setChapter(e.target.value)}
          >
            {CHAPTERS.map((c) => <option key={c}>{c}</option>)}
          </select>

          <select
            className="border border-border bg-background px-3 py-2 font-mono-caps text-[11px] text-muted-foreground outline-none focus:border-foreground"
            value={seekingFilter}
            onChange={(e) => setSeekingFilter(e.target.value)}
          >
            <option value="">Any seeking</option>
            {SEEKING_OPTIONS.map((s) => <option key={s}>{s}</option>)}
          </select>

          <button
            onClick={() => setPremiumOnly((v) => !v)}
            className={`font-mono-caps text-[11px] px-3 py-2 border transition-colors ${premiumOnly ? "border-primary bg-primary text-primary-foreground" : "border-border text-muted-foreground hover:border-primary"}`}>
            Premium Only
          </button>

          <button
            onClick={() => setForSaleOnly((v) => !v)}
            className={`font-mono-caps text-[11px] px-3 py-2 border transition-colors ${forSaleOnly ? "border-primary bg-primary text-primary-foreground" : "border-border text-muted-foreground hover:border-primary"}`}>
            Work for Sale
          </button>

          {(search || filter !== "All" || chapter !== "All Chapters" || seekingFilter || premiumOnly || forSaleOnly) && (
            <button
              onClick={() => { setSearch(""); setFilter("All"); setChapter("All Chapters"); setSeekingFilter(""); setPremiumOnly(false); setForSaleOnly(false); }}
              className="font-mono-caps text-[11px] text-muted-foreground hover:text-foreground underline">
              Clear filters
            </button>
          )}
        </div>

        {/* gallery grid */}
        <div className="mt-12 grid grid-cols-1 gap-8 sm:grid-cols-2 lg:grid-cols-3">
          {filtered.map((a, i) => (
            <motion.div
              key={a.id}
              initial={{ opacity: 0, y: 12 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.4, delay: i * 0.03 }}
              className="group"
              onMouseEnter={() => setHovered(a)}
              onMouseLeave={() => setHovered(null)}
              data-artwork
            >
              <Link to={`/artists/${a.id}`} className="block">
                <div className="aspect-[4/3] overflow-hidden bg-muted">
                  {a.portfolio_works?.[0]?.image_url || a.avatar_url ? (
                    <Image
                      src={a.portfolio_works?.[0]?.image_url || a.avatar_url}
                      alt={a.display_name}
                      fittingType="fill"
                      className="h-full w-full group-hover:scale-[1.03] transition-transform duration-500"
                    />
                  ) : (
                    <div className="flex h-full w-full items-center justify-center">
                      <span className="font-mono-caps text-6xl text-muted-foreground/40">{a.display_name?.[0]}</span>
                    </div>
                  )}
                </div>
                <div className="mt-3 flex items-start justify-between gap-2">
                  <div>
                    <div className="flex items-center gap-1.5">
                      <p className="font-mono-caps text-[10px] text-primary">{a.discipline}</p>
                      {a.is_premium && <span className="font-mono-caps text-[9px] border border-primary px-1 py-0.5 text-primary">Premium</span>}
                      {a.is_featured && <span className="font-mono-caps text-[9px] border border-yellow-500 px-1 py-0.5 text-yellow-600">Featured</span>}
                    </div>
                    <h3 className="mt-1 font-heading text-2xl tracking-[-0.01em] group-hover:text-primary transition-colors">
                      {a.display_name}
                    </h3>
                    {a.based_in && <p className="mt-1 font-mono-caps text-[10px] text-muted-foreground">{a.based_in}</p>}
                    {a.bio && <p className="mt-2 text-xs text-muted-foreground/70 leading-relaxed line-clamp-2">{a.bio}</p>}
                    {(a.seeking || []).length > 0 && (
                      <div className="mt-2 flex flex-wrap gap-1.5">
                        {(a.seeking || []).slice(0, 2).map((s) => (
                          <span key={s} className="font-mono-caps text-[9px] border border-accent px-1.5 py-0.5 text-accent">{s}</span>
                        ))}
                      </div>
                    )}
                  </div>
                  <ArrowUpRight className="h-4 w-4 shrink-0 text-muted-foreground group-hover:text-primary transition-colors" />
                </div>
              </Link>
            </motion.div>
          ))}
        </div>
        {filtered.length === 0 && (
          <div className="mt-12 py-16 text-center border border-border">
            <p className="font-mono-caps text-[11px] text-muted-foreground">No artists match your filters.</p>
            <button onClick={() => { setSearch(""); setFilter("All"); setChapter("All Chapters"); setSeekingFilter(""); setPremiumOnly(false); setForSaleOnly(false); }}
              className="mt-4 font-mono-caps text-[11px] text-primary hover:underline">Clear filters</button>
          </div>
        )}
      </div>

      {/* hover preview */}
      {hovered?.avatar_url && (
        <div className="pointer-events-none fixed bottom-8 right-8 z-30 h-48 w-48 overflow-hidden shadow-lg">
          <Image src={hovered.avatar_url} alt={hovered.display_name} fittingType="fill" className="h-full w-full object-cover" />
        </div>
      )}
      <SlimFooter />
    </>
  );
}