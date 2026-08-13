import React, { useState, useEffect } from "react";
import { Link } from "react-router-dom";
import { base44 } from "@/api/base44Client";
import { Image } from "@/components/ui/image";
import { ArrowUpRight, Search } from "lucide-react";
import { motion } from "framer-motion";
import SlimFooter from "@/components/SlimFooter";
import { chapterFilterOptions } from "@/lib/chaptersData";

const INTERESTS = ["All", "Painting", "Sculpture", "Photography", "Installation", "Video Art", "Performance", "Drawing", "Ceramics", "Digital Art", "Mixed Media"];
const CHAPTERS = chapterFilterOptions("All Chapters");

export default function GalleryShowcase() {
  const [galleries, setGalleries] = useState([]);
  const [works, setWorks] = useState([]);
  const [filter, setFilter] = useState("All");
  const [chapter, setChapter] = useState("All Chapters");
  const [forSaleOnly, setForSaleOnly] = useState(false);
  const [search, setSearch] = useState("");
  const [hovered, setHovered] = useState(null);

  useEffect(() => {
    base44.entities.CollectorProfile.filter({ type: "Gallery" }).then(setGalleries);
    base44.entities.GalleryWork.list("-created_date", 500).then(setWorks);
  }, []);

  const saleByGallery = works.reduce((acc, w) => {
    if (w.available_for_sale) acc.add(w.artist_id);
    return acc;
  }, new Set());

  const filtered = galleries.filter((g) => {
    if (filter !== "All" && !(g.interests || []).includes(filter)) return false;
    if (chapter !== "All Chapters" && g.based_in && !g.based_in.includes(chapter)) return false;
    if (forSaleOnly && !saleByGallery.has(g.user_id)) return false;
    if (search) {
      const q = search.toLowerCase();
      if (!g.display_name?.toLowerCase().includes(q) && !g.based_in?.toLowerCase().includes(q) && !g.bio?.toLowerCase().includes(q)) return false;
    }
    return true;
  });

  return (
    <>
      <div className="px-6 py-16 md:px-10">
        <p className="font-mono-caps text-[11px] text-primary">The Gallery Registry</p>
        <h1 className="mt-3 font-heading text-5xl font-medium tracking-[-0.02em] md:text-7xl">Galleries &amp; Museums</h1>
        <p className="mt-4 text-lg text-muted-foreground">
          {filtered.length} galler{filtered.length !== 1 ? "ies" : "y"} &amp; muse{filtered.length !== 1 ? "ums" : "um"} in the <span className="text-accent">network</span>
        </p>

        {/* Search */}
        <div className="mt-8 relative max-w-md">
          <Search className="absolute left-4 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <input
            className="w-full border border-border bg-transparent pl-11 pr-4 py-3 text-base outline-none focus:border-foreground"
            placeholder="Search by name, location…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>

        {/* Discipline filter */}
        <div className="mt-8 flex flex-wrap gap-2">
          {INTERESTS.map((d) => (
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

          <button
            onClick={() => setForSaleOnly((v) => !v)}
            className={`font-mono-caps text-[11px] px-3 py-2 border transition-colors ${forSaleOnly ? "border-primary bg-primary text-primary-foreground" : "border-border text-muted-foreground hover:border-primary"}`}>
            Work for Sale
          </button>

          {(search || filter !== "All" || chapter !== "All Chapters" || forSaleOnly) && (
            <button
              onClick={() => { setSearch(""); setFilter("All"); setChapter("All Chapters"); setForSaleOnly(false); }}
              className="font-mono-caps text-[11px] text-muted-foreground hover:text-foreground underline">
              Clear filters
            </button>
          )}
        </div>

        {/* gallery grid */}
        <div className="mt-12 grid grid-cols-1 gap-8 sm:grid-cols-2 lg:grid-cols-3">
          {filtered.map((g, i) => (
            <motion.div
              key={g.id}
              initial={{ opacity: 0, y: 12 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.4, delay: i * 0.03 }}
              className="group"
              onMouseEnter={() => setHovered(g)}
              onMouseLeave={() => setHovered(null)}
              data-artwork
            >
              <Link to={`/gallery/${g.id}`} className="block">
                <div className="aspect-[4/3] overflow-hidden bg-muted">
                  {g.cover_image_url || g.avatar_url ? (
                    <Image
                      src={g.cover_image_url || g.avatar_url}
                      alt={g.display_name}
                      fittingType="fill"
                      className="h-full w-full group-hover:scale-[1.03] transition-transform duration-500"
                    />
                  ) : (
                    <div className="flex h-full w-full items-center justify-center">
                      <span className="font-mono-caps text-6xl text-muted-foreground/40">{g.display_name?.[0]}</span>
                    </div>
                  )}
                </div>
                <div className="mt-3 flex items-start justify-between gap-2">
                  <div>
                    <p className="font-mono-caps text-[10px] text-primary">Gallery &amp; Museum</p>
                    <h3 className="mt-1 font-heading text-2xl tracking-[-0.01em] group-hover:text-primary transition-colors">
                      {g.display_name}
                    </h3>
                    {g.based_in && <p className="mt-1 font-mono-caps text-[10px] text-muted-foreground">{g.based_in}</p>}
                    {g.bio && <p className="mt-2 text-xs text-muted-foreground/70 leading-relaxed line-clamp-2">{g.bio}</p>}
                    {(g.interests || []).length > 0 && (
                      <div className="mt-2 flex flex-wrap gap-1.5">
                        {(g.interests || []).slice(0, 3).map((t) => (
                          <span key={t} className="font-mono-caps text-[9px] border border-border px-1.5 py-0.5 text-muted-foreground/70">{t}</span>
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
            <p className="font-mono-caps text-[11px] text-muted-foreground">No galleries match your filters.</p>
            <button onClick={() => { setSearch(""); setFilter("All"); setChapter("All Chapters"); setForSaleOnly(false); }}
              className="mt-4 font-mono-caps text-[11px] text-primary hover:underline">Clear filters</button>
          </div>
        )}
      </div>

      {hovered?.avatar_url && (
        <div className="pointer-events-none fixed bottom-8 right-8 z-30 h-48 w-48 overflow-hidden shadow-lg">
          <Image src={hovered.avatar_url} alt={hovered.display_name} fittingType="fill" className="h-full w-full object-cover" />
        </div>
      )}
      <SlimFooter />
    </>
  );
}