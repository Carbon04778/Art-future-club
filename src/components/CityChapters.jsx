import React, { useEffect, useState } from 'react';
import { eventPath } from '@/lib/slugs';
import { Link } from 'react-router-dom';
import { motion } from 'framer-motion';
import { Image } from '@/components/ui/image';
import { ArrowUpRight } from 'lucide-react';
import { base44 } from '@/api/base44Client';
import { CHAPTERS } from '@/lib/chaptersData';

const fmtEventDate = (iso) => {
  if (!iso) return '';
  return new Date(iso)
    .toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' })
    .toUpperCase();
};

function ChapterBlock({ chapter, events }) {
  /*
   * The next three gatherings for this chapter.
   *
   * By DATE, not by when they were added: an event entered last week for next
   * March should not outrank one happening tomorrow. Anything already past is
   * excluded — a chapter advertising last month's opening looks abandoned.
   */
  const upcoming = (events || [])
    // Strictly upcoming: the start date must be in the future. An exhibition
    // already open is deliberately NOT shown here — "Upcoming Gatherings"
    // means what it says.
    .filter((e) => e.start_date && new Date(e.start_date) >= new Date())
    .sort((a, b) => new Date(a.start_date) - new Date(b.start_date))
    .slice(0, 3);
  return (
    <div className="grid grid-cols-1 border-t border-border md:grid-cols-2">
      {/* fixed / sticky pulse */}
      <div className="relative md:sticky md:top-0 md:h-screen md:self-start">
        <div className="flex h-full flex-col justify-between p-6 md:p-10">
          <div>
            <p className="font-mono-caps text-[11px] text-muted-foreground">
              {chapter.chapter} — Chapter Portal
            </p>
            <h3 className="mt-4 font-heading text-[15vw] font-medium leading-[0.9] tracking-[-0.03em] md:text-[8vw]">
              {chapter.city}
            </h3>
            <p className="mt-3 font-mono-caps text-[11px] text-muted-foreground">
              {chapter.coords}
            </p>
          </div>
          <div className="mt-10">
            <p className="font-mono-caps text-[10px] text-muted-foreground">Local Pulse</p>
            <p className="mt-2 font-mono-caps text-[13px] text-primary">{chapter.pulse}</p>
            <Link
              to={`/chapter/${chapter.slug}`}
              className="mt-6 inline-flex items-center gap-2 font-mono-caps text-[11px] text-foreground transition-colors hover:text-primary"
            >
              Enter Chapter <ArrowUpRight className="h-3 w-3" />
            </Link>
          </div>
        </div>
      </div>

      {/* scrolling feed */}
      <div className="p-6 md:p-10">
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true, margin: '-80px' }}
          transition={{ duration: 0.7 }}
          className="overflow-hidden"
          data-artwork
        >
          <Link to={`/chapter/${chapter.slug}`}>
            <Image
              src={chapter.image}
              alt={`${chapter.city} chapter space`}
              fittingType="fill"
              className="aspect-[4/5] w-full transition-transform duration-500 hover:scale-105"
            />
          </Link>
        </motion.div>

        {chapter.image_credit && (
          <p className="mt-3 font-mono-caps text-[10px] text-muted-foreground">
            {chapter.image_credit}
          </p>
        )}

        <div className="mt-10">
          <p className="font-mono-caps text-[11px] text-muted-foreground">Upcoming Gatherings</p>
          <ul className="mt-5 divide-y divide-border">
            {upcoming.length > 0
              ? upcoming.map((e) => (
                  <li key={e.id}>
                    <Link
                      to={eventPath(e)}
                      className="group flex items-baseline justify-between gap-4 py-4 transition-colors hover:text-primary"
                    >
                      <div>
                        <span className="font-mono-caps text-[11px] text-primary">{fmtEventDate(e.start_date)}</span>
                        <p className="mt-1 font-heading text-xl tracking-[-0.01em]">{e.title}</p>
                        <p className="mt-1 text-sm text-muted-foreground">{e.venue}</p>
                      </div>
                      <ArrowUpRight className="h-4 w-4 shrink-0 text-muted-foreground transition-all group-hover:text-primary" />
                    </Link>
                  </li>
                ))
              : (
                  // Say so plainly. A blank gap under the heading reads as a
                  // page that failed to load rather than a chapter with
                  // nothing scheduled.
                  <li className="py-4">
                    <p className="text-sm text-muted-foreground">
                      Nothing scheduled yet — see past gatherings.
                    </p>
                  </li>
                )}
          </ul>
          {/* Straight to the events page, already filtered to this chapter,
              rather than an anchor on the chapter page. */}
          <Link
            to={`/events?chapter=${encodeURIComponent(chapter.city)}`}
            className="mt-5 inline-flex items-center gap-2 font-mono-caps text-[11px] text-muted-foreground transition-colors hover:text-primary"
          >
            All {chapter.city} events <ArrowUpRight className="h-3 w-3" />
          </Link>
        </div>

        <Link
          to={`/chapter/${chapter.slug}#artists`}
          className="group mt-10 block border border-border p-6 transition-colors hover:border-primary"
        >
          <div className="flex items-center justify-between">
            <p className="font-mono-caps text-[10px] text-muted-foreground">Artist Spotlight</p>
            <ArrowUpRight className="h-4 w-4 shrink-0 text-muted-foreground transition-all group-hover:text-primary" />
          </div>
          <p className="mt-2 text-base leading-relaxed">{chapter.spotlight}</p>
          <span className="mt-3 inline-block font-mono-caps text-[11px] text-primary opacity-0 transition-opacity group-hover:opacity-100">
            Meet the chapter artists
          </span>
        </Link>
      </div>
    </div>
  );
}

export default function CityChapters() {
  const [events, setEvents] = useState([]);

  useEffect(() => {
    // Sorted and bounded explicitly. An unsorted, unlimited list left it to
    // the database which rows came back — so a chapter's next gathering could
    // simply be absent from the page with nothing to indicate it.
    // Each chapter block lists at most three upcoming gatherings: a date, a
    // title and a venue. Every column of 72 events was 233 kB and the slowest
    // request on the page at 2.2 s.
    base44.entities.Event.list("start_date", 500, "id,title,venue,chapter,start_date,slug")
      .then(setEvents)
      .catch(() => setEvents([]));
  }, []);

  /*
   * Group events by chapter.
   *
   * Matched case-insensitively on the trimmed name: chapters set from a
   * dropdown are exact, but anything typed by hand — or imported — could
   * differ by case or a stray space, and an exact match dropped those events
   * silently. A chapter with gatherings then looked as though it had none.
   */
  const eventsByChapter = {};
  events.forEach((e) => {
    if (!e.chapter) return;
    const key = String(e.chapter).trim().toLowerCase();
    (eventsByChapter[key] ||= []).push(e);
  });

  return (
    <section id="chapters" className="relative">
      {/* floating request invitation */}
      <Link
        to="/register"
        className="fixed bottom-6 right-6 z-50 flex items-center gap-2 rounded-full bg-primary px-5 py-3 font-mono-caps text-[11px] text-primary-foreground shadow-lg shadow-primary/20 transition-transform hover:scale-105"
      >
        Join our community
      </Link>

      <div className="atmospheric-space px-6 md:px-10">
        <div className="flex flex-col gap-8 md:flex-row md:items-end md:justify-between">
          <div>
            <p className="font-mono-caps text-[11px] text-muted-foreground">
              002 — The Chapter Portal
            </p>
            <h2 className="mt-5 max-w-4xl font-heading text-4xl font-medium leading-[1.05] tracking-[-0.02em] md:text-6xl">
              City-based chapters growing into recognised <span className="text-highlight">cultural platforms</span> within
              their local art ecosystems. <span className="text-accent">Grow with us.</span>
            </h2>
          </div>
        </div>
      </div>

      <div>
        {CHAPTERS.map((ch) => (
          <ChapterBlock key={ch.city} chapter={ch} events={eventsByChapter[ch.city.trim().toLowerCase()]} />
        ))}
      </div>

      {/* start-a-chapter callout */}
      <div className="px-6 py-12 md:px-10">
        <p className="max-w-3xl text-lg text-muted-foreground leading-relaxed">
          Don't see your city among our chapters? If you're ready to lead and build a local community from the ground up, we'd love to hear from you.{' '}
          <Link to="/partnership?type=Start%20a%20Chapter" className="text-primary hover:underline">Start a chapter →</Link>
        </p>
      </div>
    </section>
  );
}