import React, { useState, useEffect } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { base44 } from "@/api/base44Client";
import { Image } from "@/components/ui/image";
import { MapPin, ExternalLink, Loader2 } from "lucide-react";
import SlimFooter from "@/components/SlimFooter";
import { motion } from "framer-motion";
import { chapterFilterOptions } from "@/lib/chaptersData";

const CHAPTERS = chapterFilterOptions("All");

export default function Venues() {
  const [venues, setVenues] = useState([]);
  const [searchParams] = useSearchParams();
  // Honour ?chapter= from chapter-page venue cards.
  const [chapter, setChapter] = useState(searchParams.get("chapter") || "All");
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    base44.entities.CollectorProfile.filter({ type: "Institution" }, "-updated_date", 200)
      .then(setVenues)
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  const filtered = venues.filter((v) =>
    chapter === "All" ? true : (v.based_in || "").includes(chapter) || (v.address || "").includes(chapter)
  );

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
            {filtered.map((v, i) => (
              <motion.div
                key={v.id}
                initial={{ opacity: 0, y: 12 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.4, delay: i * 0.04 }}
                className="group"
                data-artwork
              >
                <Link to={`/venues/${v.id}`} className="block">
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
                      <p className="font-mono-caps text-[10px] text-primary">Institution</p>
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
      </div>
      <SlimFooter />
    </>
  );
}