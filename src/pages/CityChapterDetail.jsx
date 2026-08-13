import React, { useState, useEffect } from 'react';
import { useParams, Link } from 'react-router-dom';
import { motion } from 'framer-motion';
import { Image } from '@/components/ui/image';
import { ArrowLeft, ArrowUpRight, MapPin } from 'lucide-react';
import { base44 } from '@/api/base44Client';
import { CHAPTERS } from '@/lib/chaptersData';
import SlimFooter from '@/components/SlimFooter';
import VerticalMetadata from '@/components/VerticalMetadata';

const TYPE_COLORS = {
  Salon: 'bg-primary/10 text-primary',
  Exhibition: 'bg-foreground/8 text-foreground',
  'Studio Visit': 'bg-foreground/8 text-foreground',
  Networking: 'bg-foreground/8 text-foreground',
  Critique: 'bg-primary/10 text-primary',
  'Gallery Crawl': 'bg-foreground/8 text-foreground',
  Debate: 'bg-primary/10 text-primary',
  Residency: 'bg-primary/10 text-primary',
};

const PARTNERSHIP_WEIGHT = {
  'Founding Partner': 'text-foreground',
  'Cultural Partner': 'text-muted-foreground',
  'Venue Partner': 'text-muted-foreground',
  'Studio Partner': 'text-muted-foreground',
};

const fmtEventDate = (d) => {
  const dt = new Date(d);
  if (Number.isNaN(dt.getTime())) return '';
  const day = String(dt.getDate()).padStart(2, '0');
  const mon = dt.toLocaleString('en', { month: 'short' }).toUpperCase();
  return `${day} ${mon} ${dt.getFullYear()}`;
};

const SPOTLIGHT_LIMIT = 10;
const EVENT_LIMIT = 10;

export default function CityChapterDetail() {
  const { slug } = useParams();
  const chapter = CHAPTERS.find((c) => c.slug === slug);
  const [spotlight, setSpotlight] = useState([]);
  const [venueLinks, setVenueLinks] = useState({});
  const [events, setEvents] = useState([]);
  const [eventTotal, setEventTotal] = useState(0);
  const [artistTotal, setArtistTotal] = useState(0);

  useEffect(() => {
    if (!chapter) return;
    // Fetch more than we display so we know whether to offer "See all".
    base44.entities.ArtistProfile.filter({ chapter: chapter.city }, '-created_date', 200)
      .then((artists) => {
        setArtistTotal(artists.length);
        setSpotlight(artists.slice(0, SPOTLIGHT_LIMIT));
      })
      .catch(() => { setSpotlight([]); setArtistTotal(0); });

    // Venue cards link to any matching profile, not just Institutions —
    // partner venues are just as often galleries.
    base44.entities.CollectorProfile.list('-updated_date', 500)
      .then((rows) => {
        const map = {};
        rows.forEach((r) => {
          if (r.display_name) map[r.display_name.trim().toLowerCase()] = r.id;
        });
        setVenueLinks(map);
      })
      .catch(() => setVenueLinks({}));

    base44.entities.Event.filter({ chapter: chapter.city }, 'start_date', 200)
      .then((rows) => {
        const now = new Date();
        const upcoming = rows
          .filter((e) => new Date(e.end_date || e.start_date) >= now)
          .sort((a, b) => new Date(a.start_date) - new Date(b.start_date));
        setEventTotal(upcoming.length);
        setEvents(upcoming.slice(0, EVENT_LIMIT));
      })
      .catch(() => { setEvents([]); setEventTotal(0); });
  }, [chapter?.city]);

  if (!chapter) {
    return (
      <div className="flex min-h-screen items-center justify-center px-6">
        <div>
          <p className="font-mono-caps text-[11px] text-muted-foreground">404 — Not Found</p>
          <Link to="/#chapters" className="mt-4 block font-heading text-2xl hover:text-primary">
            ← Return to Chapters
          </Link>
        </div>
      </div>
    );
  }

  return (
    <>
      <VerticalMetadata
        leftText={`${chapter.chapter} — ${chapter.city} Chapter`}
        rightText={`${chapter.coords} · ${chapter.timezone}`}
      />

      {/* ── HERO ─────────────────────────────────────────── */}
      <section className="relative h-[65vh] min-h-[480px] w-full overflow-hidden">
        <Image
          src={chapter.image}
          alt={`${chapter.city} chapter space`}
          fittingType="fill"
          className="h-full w-full"
        />
        <div className="absolute inset-0 bg-gradient-to-b from-background/20 via-background/50 to-background" />

        {/* back link */}
        <div className="absolute left-6 top-6 md:left-10 md:top-8">
          <Link
            to="/#chapters"
            className="inline-flex items-center gap-2 font-mono-caps text-[11px] text-foreground/80 transition-colors hover:text-foreground"
          >
            <ArrowLeft className="h-3 w-3" />
            All Chapters
          </Link>
        </div>

        {/* nav */}
        <div className="absolute right-6 top-6 hidden gap-7 md:right-10 md:top-8 md:flex">
          {['Programme', 'Artists', 'Venues'].map((item) => (
            <a
              key={item}
              href={`#${item.toLowerCase()}`}
              className="font-mono-caps text-[11px] text-foreground/80 hover:text-foreground"
            >
              {item}
            </a>
          ))}
          <a
            href="#request"
            className="font-mono-caps text-[11px] text-primary"
          >
            Become a Host
          </a>
        </div>

        {/* title block */}
        <div className="absolute bottom-0 left-0 px-6 pb-10 md:px-10">
          <p className="font-mono-caps text-[11px] text-muted-foreground">
            {chapter.chapter} · {chapter.coords}
          </p>
          <motion.h1
            initial={{ opacity: 0, y: 16 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.8 }}
            className="mt-2 font-heading text-[15vw] font-medium leading-[0.88] tracking-[-0.03em] md:text-[9vw]"
          >
            {chapter.city}
          </motion.h1>
          <p className="mt-3 max-w-xl text-base text-muted-foreground md:text-lg">
            {chapter.tagline}
          </p>
        </div>
      </section>

      {/* ── ABOUT ────────────────────────────────────────── */}
      <section className="atmospheric-space grid grid-cols-1 gap-10 px-6 md:grid-cols-[1fr_2fr] md:px-10">
        <div>
          <p className="font-mono-caps text-[11px] text-muted-foreground">Local Pulse</p>
          <p className="mt-2 font-mono-caps text-[13px] text-primary">{chapter.pulse}</p>
        </div>
        <div>
          <p className="font-mono-caps text-[11px] text-muted-foreground">About the Chapter</p>
          <p className="mt-4 text-lg leading-relaxed">{chapter.about}</p>
        </div>
      </section>

      {/* ── PROGRAMME ────────────────────────────────────── */}
      <section id="programme" className="border-t border-border px-6 py-16 md:px-10">
        <p className="font-mono-caps text-[11px] text-muted-foreground">Full Programme</p>
        <h2 className="mt-4 font-heading text-3xl font-medium tracking-[-0.02em] md:text-5xl">
          Upcoming Gatherings
        </h2>
        {events.length === 0 ? (
          <p className="mt-12 py-6 font-mono-caps text-[11px] text-muted-foreground">
            New gatherings will be announced here.
          </p>
        ) : (
          <ul className="mt-12 divide-y divide-border">
            {events.map((e, i) => (
              <motion.li
                key={e.id}
                initial={{ opacity: 0, y: 12 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true, margin: '-60px' }}
                transition={{ duration: 0.5, delay: i * 0.07 }}
              >
                <Link
                  to={`/events/${e.id}`}
                  className="group grid grid-cols-1 gap-4 py-8 md:grid-cols-[14rem_1fr_auto]"
                >
                  <div>
                    <span className="font-mono-caps text-[11px] text-primary">{fmtEventDate(e.start_date)}</span>
                    <div className="mt-2 flex items-center gap-2">
                      <span
                        className={`rounded px-2 py-0.5 font-mono-caps text-[10px] ${TYPE_COLORS[e.event_type] ?? 'bg-foreground/8 text-foreground'}`}
                      >
                        {e.event_type}
                      </span>
                    </div>
                  </div>
                  <div>
                    <h3 className="font-heading text-xl tracking-[-0.01em] md:text-2xl group-hover:text-primary transition-colors">{e.title}</h3>
                    {e.description && <p className="mt-2 text-sm leading-relaxed text-muted-foreground line-clamp-2">{e.description}</p>}
                    <div className="mt-3 flex flex-wrap items-center gap-4">
                      {e.venue && (
                        <span className="flex items-center gap-1.5 font-mono-caps text-[11px] text-muted-foreground">
                          <MapPin className="h-3 w-3" />
                          {e.venue}
                        </span>
                      )}
                      {e.address && (
                        <span className="flex items-center gap-1.5 font-mono-caps text-[11px] text-muted-foreground">
                          <MapPin className="h-3 w-3" />
                          {e.address}
                        </span>
                      )}
                    </div>
                  </div>
                  <div className="flex items-start">
                    <span className="inline-flex items-center gap-1.5 font-mono-caps text-[11px] text-primary transition-opacity group-hover:opacity-70">
                      View Event <ArrowUpRight className="h-3 w-3" />
                    </span>
                  </div>
                </Link>
              </motion.li>
            ))}
          </ul>
        )}
        {eventTotal > EVENT_LIMIT && (
          <Link
            to={`/events?chapter=${encodeURIComponent(chapter.city)}`}
            className="mt-10 inline-flex items-center gap-2 border border-border px-6 py-3 font-mono-caps text-[11px] text-foreground transition-colors hover:border-primary hover:text-primary"
          >
            See all {eventTotal} gatherings <ArrowUpRight className="h-3 w-3" />
          </Link>
        )}
      </section>

      {/* ── ARTIST SPOTLIGHTS ────────────────────────────── */}
      <section id="artists" className="border-t border-border px-6 py-16 md:px-10">
        <p className="font-mono-caps text-[11px] text-muted-foreground">Artist Spotlights</p>
        <h2 className="mt-4 font-heading text-3xl font-medium tracking-[-0.02em] md:text-5xl">
          Voices of the Chapter
        </h2>
        <ul className="mt-12 divide-y divide-border">
          {spotlight.length === 0 ? (
            <li className="py-6 font-mono-caps text-[11px] text-muted-foreground">
              New members will appear here.
            </li>
          ) : (
            spotlight.map((a, i) => (
              <li key={a.id} className="py-6">
                <Link
                  to={`/artists/${a.id}`}
                  className="group flex items-baseline justify-between gap-6"
                >
                  <div>
                    <span className="font-mono-caps text-[11px] text-muted-foreground">
                      {String(i + 1).padStart(2, '0')}
                    </span>
                    <h3 className="mt-1 font-heading text-2xl tracking-[-0.01em] md:text-3xl group-hover:text-primary transition-colors">
                      {a.display_name}
                    </h3>
                    <p className="mt-1 text-sm text-muted-foreground">
                      {a.based_in || 'New member'}
                    </p>
                  </div>
                  <span className="font-mono-caps text-[11px] text-muted-foreground">
                    {a.discipline} <ArrowUpRight className="inline h-3 w-3 text-primary" />
                  </span>
                </Link>
              </li>
            ))
          )}
        </ul>
        {artistTotal > SPOTLIGHT_LIMIT && (
          <Link
            to={`/artists?chapter=${encodeURIComponent(chapter.city)}`}
            className="mt-10 inline-flex items-center gap-2 border border-border px-6 py-3 font-mono-caps text-[11px] text-foreground transition-colors hover:border-primary hover:text-primary"
          >
            See all {artistTotal} artists <ArrowUpRight className="h-3 w-3" />
          </Link>
        )}
      </section>

      {/* ── VENUE PARTNERS ───────────────────────────────── */}
      <section id="venues" className="border-t border-border px-6 py-16 md:px-10">
        <p className="font-mono-caps text-[11px] text-muted-foreground">Partner Venues</p>
        <h2 className="mt-4 font-heading text-3xl font-medium tracking-[-0.02em] md:text-5xl">
          Where We Gather
        </h2>
        <div className="mt-12 grid grid-cols-1 gap-px bg-border md:grid-cols-2">
          {chapter.venues.map((v) => {
            const pid = venueLinks[v.name.toLowerCase()];
            const inner = (
              <>
                <p className="font-mono-caps text-[10px] text-primary">{v.partnership}</p>
                <h3 className="mt-2 font-heading text-2xl tracking-[-0.01em]">{v.name}</h3>
                <p className="mt-1 text-sm text-muted-foreground">{v.type}</p>
                <p className="mt-3 flex items-center gap-1.5 font-mono-caps text-[11px] text-muted-foreground">
                  <MapPin className="h-3 w-3" />
                  {v.address}
                </p>
              </>
            );
            // A venue with a matching profile opens that profile; one without
            // still links to the venues directory rather than being a dead card.
            return (
              <Link
                key={v.name}
                to={pid ? `/venues/${pid}` : "/venues"}
                className="block bg-background p-8 transition-colors hover:bg-muted/40"
              >
                {inner}
              </Link>
            );
          })}
        </div>
      </section>

      {/* ── REQUEST INVITATION CTA ───────────────────────── */}
      <section
        id="request"
        className="border-t border-border bg-black px-6 py-20 text-foreground md:px-10"
      >
        <div className="max-w-2xl">
          <p className="font-mono-caps text-[11px] text-foreground/50">Chapter Leadership</p>
          <h2 className="mt-4 font-heading text-4xl font-medium leading-[1.05] tracking-[-0.02em] md:text-6xl">
            Lead the {chapter.city} Chapter
          </h2>
          <p className="mt-6 text-lg text-foreground/70">
            Art Future Club is built by its hosts. If you are invested in your city's art
            community — as a curator, collector, gallerist or artist — express your interest in
            becoming a Chapter Host or Chairperson for {chapter.city}. You'll shape the local
            programme, convene gatherings and steward the chapter's cultural direction.
          </p>
          <a
            href="mailto:hello@artfuture.club"
            className="mt-8 inline-flex items-center gap-2 bg-primary px-7 py-4 font-mono-caps text-[11px] text-primary-foreground transition-opacity hover:opacity-80"
          >
            Apply to host {chapter.city} <ArrowUpRight className="h-4 w-4" />
          </a>
        </div>
        <div className="mt-16 border-t border-foreground/15 pt-8 font-mono-caps text-[10px] text-foreground/40">
          © MMXXVI Art Future Club · {chapter.city} Chapter · {chapter.coords}
        </div>
      </section>
      <SlimFooter />
    </>
  );
}