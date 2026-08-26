import React, { useState, useEffect } from "react";
import { Link } from "react-router-dom";
import { base44 } from "@/api/base44Client";
import { Image } from "@/components/ui/image";
import { Heart, TrendingUp } from "lucide-react";
import { motion } from "framer-motion";
import { subDays } from "date-fns";

export default function TrendingSection() {
  const [topArtists, setTopArtists] = useState([]);
  const [topWorks, setTopWorks] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const since = subDays(new Date(), 7).toISOString();

    Promise.all([
      base44.entities.Like.filter({ target_type: "artist_profile" }, "-created_date", 200),
      base44.entities.Like.filter({ target_type: "gallery_work" }, "-created_date", 200),
      base44.entities.ArtistProfile.list("-created_date", 100),
      base44.entities.GalleryWork.list("-created_date", 100),
      // Artist portfolio works were never included, so the section could only
      // ever show gallery pieces.
      base44.entities.Like.filter({ target_type: "portfolio_work" }, "-created_date", 200),
    ]).then(([artistLikes, workLikes, artists, works, portfolioLikes]) => {
      // Count likes per target in the last 7 days
      const recentArtistLikes = artistLikes.filter((l) => !l.created_date || l.created_date >= since);
      const recentWorkLikes = workLikes.filter((l) => !l.created_date || l.created_date >= since);

      const artistLikeCounts = recentArtistLikes.reduce((acc, l) => { acc[l.target_id] = (acc[l.target_id] || 0) + 1; return acc; }, {});
      const workLikeCounts = recentWorkLikes.reduce((acc, l) => { acc[l.target_id] = (acc[l.target_id] || 0) + 1; return acc; }, {});

      const sortedArtists = artists
        .map((a) => ({ ...a, likeCount: artistLikeCounts[a.id] || 0 }))
        .filter((a) => a.likeCount > 0)
        .sort((a, b) => b.likeCount - a.likeCount)
        .slice(0, 4);

      // Portfolio works are liked as "<profileId>-work-<n>", so unpack that
      // reference back into the artist's own work.
      const recentPortfolioLikes = portfolioLikes.filter((l) => !l.created_date || l.created_date >= since);
      const portfolioCounts = recentPortfolioLikes.reduce((acc, l) => {
        acc[l.target_id] = (acc[l.target_id] || 0) + 1;
        return acc;
      }, {});

      const portfolioWorks = artists.flatMap((a) =>
        (a.portfolio_works || []).map((w, i) => ({
          ...w,
          id: `${a.id}-work-${i}`,
          artist_id: a.id,
          artist_name: a.display_name,
          likeCount: portfolioCounts[`${a.id}-work-${i}`] || 0,
        }))
      );

      const galleryWorks = works.map((w) => ({ ...w, likeCount: workLikeCounts[w.id] || 0 }));

      /*
       * Most-liked first, then the newest to make up the numbers.
       *
       * Previously this required at least one like in the last seven days, so
       * on a young site the whole section collapsed to a single item — or
       * disappeared entirely. Filling the remaining slots keeps the grid full
       * while still leading with whatever is genuinely popular.
       */
      const liked = [...portfolioWorks, ...galleryWorks]
        .filter((w) => w.likeCount > 0 && w.image_url)
        .sort((a, b) => b.likeCount - a.likeCount);

      const filler = [...portfolioWorks, ...galleryWorks]
        .filter((w) => w.likeCount === 0 && w.image_url)
        .filter((w) => !liked.some((l) => l.id === w.id));

      const sortedWorks = [...liked, ...filler].slice(0, 4);

      setTopArtists(sortedArtists);
      setTopWorks(sortedWorks);
      setLoading(false);
    });
  }, []);

  if (loading || (topArtists.length === 0 && topWorks.length === 0)) return null;

  return (
    <section className="atmospheric-space border-t border-border">
      <div className="px-6 md:px-10">
        <div className="flex items-center gap-3 mb-2">
          <TrendingUp className="h-4 w-4 text-primary" />
          <p className="font-mono-caps text-[11px] text-muted-foreground">This Week</p>
        </div>
        <h2 className="font-heading text-4xl font-medium tracking-[-0.02em] md:text-5xl">Trending Now</h2>

        {topWorks.length > 0 && (
          <div className="mt-14">
            <p className="font-mono-caps text-[11px] text-muted-foreground mb-8">Most-liked Works</p>
            <div className="grid grid-cols-2 gap-5 md:grid-cols-4">
              {topWorks.map((work, i) => (
                <motion.div key={work.id} initial={{ opacity: 0, y: 12 }} whileInView={{ opacity: 1, y: 0 }}
                  viewport={{ once: true }} transition={{ delay: i * 0.08 }}>
                  <Link to="/gallery" className="group block">
                    <div className="overflow-hidden bg-muted aspect-square">
                      <Image src={work.image_url} alt={work.title} fittingType="fill" className="h-full w-full object-cover group-hover:scale-[1.03] transition-transform duration-500" />
                    </div>
                    <div className="mt-2">
                      <p className="font-heading text-lg tracking-[-0.01em]">{work.title}</p>
                      <p className="font-mono-caps text-[10px] text-muted-foreground">{work.artist_name}</p>
                      <div className="flex items-center gap-1 mt-1">
                        <Heart className="h-3 w-3 text-red-400 fill-red-400" />
                        <span className="font-mono-caps text-[10px] text-muted-foreground">{work.likeCount}</span>
                      </div>
                    </div>
                  </Link>
                </motion.div>
              ))}
            </div>
          </div>
        )}

        {topArtists.length > 0 && (
          <div className="mt-14">
            <p className="font-mono-caps text-[11px] text-muted-foreground mb-8">Most-followed Artists</p>
            <div className="grid grid-cols-2 gap-5 md:grid-cols-4">
              {topArtists.map((artist, i) => (
                <motion.div key={artist.id} initial={{ opacity: 0, y: 12 }} whileInView={{ opacity: 1, y: 0 }}
                  viewport={{ once: true }} transition={{ delay: i * 0.08 }}>
                  <Link to={`/artists/${artist.id}`} className="group flex items-center gap-3">
                    <div className="h-14 w-14 shrink-0 overflow-hidden rounded-full bg-muted flex items-center justify-center">
                      {artist.avatar_url
                        ? <Image src={artist.avatar_url} alt={artist.display_name} fittingType="fill" className="h-full w-full object-cover" />
                        : <span className="font-heading text-xl text-muted-foreground">{artist.display_name?.[0]}</span>
                      }
                    </div>
                    <div>
                      <p className="font-heading text-lg tracking-[-0.01em] group-hover:text-primary transition-colors">{artist.display_name}</p>
                      <p className="font-mono-caps text-[10px] text-muted-foreground">{artist.discipline}</p>
                      <div className="flex items-center gap-1 mt-0.5">
                        <Heart className="h-3 w-3 text-red-400 fill-red-400" />
                        <span className="font-mono-caps text-[10px] text-muted-foreground">{artist.likeCount}</span>
                      </div>
                    </div>
                  </Link>
                </motion.div>
              ))}
            </div>
          </div>
        )}
      </div>
    </section>
  );
}