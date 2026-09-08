import React, { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { motion, AnimatePresence } from 'framer-motion';
import { Image } from '@/components/ui/image';
import { base44 } from '@/api/base44Client';
import { isVenueType } from '@/lib/venueTypes';

const FALLBACK = '/images/placeholder.webp';

export default function CollectiveRegistry() {
  const [entries, setEntries] = useState([]);
  const [hovered, setHovered] = useState(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      // Named columns: this index renders a name, a type, a city and a hover
      // image. Pulling every column meant 233 kB of gallery records to show
      // four rows.
      const ARTIST_COLS = 'id,display_name,based_in,chapter,avatar_url,is_featured';
      const SPACE_COLS = 'id,display_name,type,based_in,avatar_url';

      const [featuredArtists, recentArtists, profiles] = await Promise.all([
        base44.entities.ArtistProfile.filter({ is_featured: true }, '-updated_date', 5, ARTIST_COLS).catch(() => []),
        base44.entities.ArtistProfile.list('-updated_date', 6, ARTIST_COLS).catch(() => []),
        // Every collector profile, split into galleries and venues below.
        // The third list used to be Event.list() — so an EVENT held at a
        // gallery appeared as though it were a venue, carrying the event's
        // image, the event's chapter as its city, and linking to /events.
        // That is why "10 Chancery Lane Gallery" showed up as VENUE / OTHER.
        base44.entities.CollectorProfile.list('-created_date', 100, SPACE_COLS).catch(() => []),
      ]);

      const galleries = profiles.filter((p) => p.type === 'Gallery');
      const venues = profiles.filter((p) => isVenueType(p.type));

      const artistMap = new Map();
      // featured artists win priority; fall back to most recent non-featured
      [...featuredArtists, ...recentArtists].forEach((a) => {
        if (!artistMap.has(a.id)) artistMap.set(a.id, a);
      });

      const artistEntries = [...artistMap.values()].slice(0, 4).map((a) => ({
        id: a.id,
        name: a.display_name,
        type: 'Artist',
        city: a.based_in || a.chapter || '—',
        image: a.avatar_url || FALLBACK,
        to: `/artists/${a.id}`,
      }));

      const galleryEntries = galleries.slice(0, 4).map((g) => ({
        id: g.id,
        name: g.display_name,
        type: 'Gallery',
        city: g.based_in || '—',
        image: g.avatar_url || FALLBACK,
        to: `/gallery/${g.id}`,
      }));

      // Real venue profiles — labelled with their actual kind, so a museum
      // reads "Museum" rather than being flattened to "Venue".
      const venueEntries = venues.slice(0, 4).map((v) => ({
        id: v.id,
        name: v.display_name,
        type: v.type || 'Venue',
        city: v.based_in || '—',
        image: v.avatar_url || FALLBACK,
        to: `/venues/${v.id}`,
      }));

      const combined = [...artistEntries, ...galleryEntries, ...venueEntries].slice(0, 9);
      if (!cancelled) setEntries(combined);
    })();
    return () => { cancelled = true; };
  }, []);

  return (
    <section id="registry" className="atmospheric-space bg-foreground text-background">
      <div className="px-6 md:px-10">
        <p className="font-mono-caps text-[11px] text-background/50">
          004 — The Collective Registry
        </p>
        <h2 className="mt-5 max-w-4xl font-heading text-4xl font-medium leading-[1.05] tracking-[-0.02em] md:text-6xl">
          A high-density index of the <span className="text-primary">galleries</span>, artists and venues composing the{" "}
          <span className="text-accent">network</span>.
        </h2>
      </div>

      {/* index header */}
      <div className="mt-20 px-6 md:px-10">
        <div className="flex items-center justify-between border-y border-border py-3 font-mono-caps text-[10px] text-background/50">
          <span>№</span>
          <span className="flex-1 px-4">Name</span>
          <span className="hidden md:block md:w-32">Discipline</span>
          <span className="w-24 text-right md:w-32">City</span>
        </div>

        <ul>
          {entries.map((entry, i) => (
            <li
              key={entry.id}
              className="group relative border-b border-border"
              onMouseEnter={() => setHovered(i)}
              onMouseLeave={() => setHovered(null)}
            >
              <Link
                to={entry.to}
                className="flex items-center justify-between py-5 transition-colors hover:text-primary"
              >
                <span className="font-mono-caps w-8 text-[11px] text-background/50">
                  {String(i + 1).padStart(2, '0')}
                </span>
                <span className="flex-1 px-4 font-heading text-xl tracking-[-0.01em] md:text-2xl">
                  {entry.name}
                </span>
                <span className="hidden font-mono-caps text-[11px] text-background/50 md:block md:w-32">
                  {entry.type}
                </span>
                <span className="font-mono-caps w-24 text-right text-[11px] md:w-32">
                  {entry.city}
                </span>
              </Link>
            </li>
          ))}
        </ul>
      </div>

      {/* hover preview — center peek */}
      <div className="pointer-events-none fixed inset-0 z-30 flex items-center justify-center">
        <AnimatePresence>
          {hovered !== null && entries[hovered] && (
            <motion.div
              key={hovered}
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 0.9, scale: 1 }}
              exit={{ opacity: 0, scale: 0.95 }}
              transition={{ duration: 0.3 }}
              className="relative h-[50vh] w-[80vw] max-w-lg overflow-hidden"
              data-artwork
            >
              <Image
                src={entries[hovered].image}
                alt={entries[hovered].name}
                fittingType="fill"
                className="h-full w-full"
              />
              <div className="absolute bottom-0 left-0 bg-black/80 px-4 py-2 font-mono-caps text-[10px] text-foreground">
                {entries[hovered].name} — {entries[hovered].city}
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </section>
  );
}