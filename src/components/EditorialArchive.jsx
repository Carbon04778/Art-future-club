import React, { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { motion } from 'framer-motion';
import { Image } from '@/components/ui/image';
import { base44 } from '@/api/base44Client';

export default function EditorialArchive({ portrait1, portrait2, detail }) {
  const [latest, setLatest] = useState(null);
  const [count, setCount] = useState(0);

  useEffect(() => {
    base44.entities.Article.filter({ published: true }, '-created_date', 200)
      .then((arts) => {
        const now = new Date();
        const when = (a) => new Date(a.publish_date || a.created_date || 0);
        // Sort by the date the article is presented as having (publish_date),
        // falling back to created_date. The query can only sort on one column,
        // so ordering is finished here: an article given an earlier or later
        // publish date was otherwise ranked by when its row happened to be
        // written, which is not the date shown to readers.
        const visible = arts
          .filter((a) => !a.publish_date || new Date(a.publish_date) <= now)
          .sort((a, b) => when(b) - when(a));
        setLatest(visible[0] || null);
        setCount(visible.length);
      })
      .catch(() => {});
  }, []);

  return (
    <section id="editorial" className="atmospheric-space bg-foreground text-background">
      {/* section header */}
      <div className="px-6 md:px-10">
        <p className="font-mono-caps text-[11px] text-background/50">
          003 — The Editorial Archive
        </p>
        <h2 className="mt-5 max-w-4xl font-heading text-4xl font-medium leading-[1.05] tracking-[-0.02em] md:text-6xl">
          Thought <span className="text-primary">leadership</span> from the curators, artists and critics shaping the
          <span className="text-background"> contemporary</span> <span className="text-accent">dialogue</span>.
        </h2>
      </div>

      {/* feature: full-bleed image */}
      <div className="mt-20 px-6 md:px-10">
        <motion.div
          initial={{ opacity: 0, y: 30 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true, margin: '-80px' }}
          transition={{ duration: 0.8 }}
          data-artwork
        >
          <Image
            src={detail}
            alt="Portrait of a curator shaping the contemporary dialogue"
            fittingType="fill"
            focalPointX={0.6}
            focalPointY={0.34}
            className="aspect-[16/7] w-full"
          />
        </motion.div>
        <div className="mt-5 flex flex-col gap-2 md:flex-row md:justify-between">
          <p className="font-mono-caps text-[11px] text-background/50">
            Feature №1 · The Surface as Subject
          </p>
          <p className="font-mono-caps text-[11px] text-background/50">
            Reading time — 9 min
          </p>
        </div>
      </div>

      {/* Q/A immersive interview */}
      <article className="mx-auto mt-32 max-w-2xl px-6 md:px-0">
        <h3 className="font-heading text-3xl font-medium tracking-[-0.02em] md:text-4xl">
          “We didn’t build a <span className="text-primary">network</span>. We built a <span className="text-accent">conversation</span> that refused to end.”
        </h3>
        <p className="mt-3 font-mono-caps text-[11px] text-background/50">
          An interview with Julie Petris — Co-founder, Art Future Club
        </p>

        <div className="mt-12 grid grid-cols-1 gap-12 md:grid-cols-[auto_1fr] md:gap-10">
          <span className="font-mono-caps text-[11px] text-primary">Q.</span>
          <div>
            <p className="text-lg leading-relaxed">
              Art Future Club spans eight cities already. What was the first
              principle you and your co-founders agreed on before any chapter
              opened?
            </p>
          </div>
        </div>

        <div className="mt-12 grid grid-cols-1 gap-12 md:grid-cols-[auto_1fr] md:gap-10">
          <span className="font-mono-caps text-[11px] text-background/50">A.</span>
          <div>
            <p className="text-lg leading-relaxed">
              <span className="float-left mr-2 font-heading text-6xl leading-[0.8]">
                T
              </span>
              hat a chapter had to answer to its own city before it answered to
              us. We refused the franchise model from day one. Hong Kong should
              feel like Hong Kong, not like a branch office of elsewhere. The
              Club is the connective tissue; the city is the organ.
            </p>
            <blockquote className="my-10 border-l-2 border-primary pl-6 font-heading text-2xl font-medium italic leading-snug tracking-[-0.01em]">
              “The Club is the connective tissue; the city is the organ.”
            </blockquote>
            <p className="text-lg leading-relaxed">
              That sounds simple until you try it — every chapter has its own
              cadence, its own blind spots, its own definition of what
              “contemporary” even means. Holding the whole together without
              flattening the local is the daily work.
            </p>
          </div>
        </div>

        {/* inset portrait */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true, margin: '-80px' }}
          transition={{ duration: 0.7 }}
          className="mt-16 md:ml-[3.5rem]"
          data-artwork
        >
          <Image
            src={portrait2}
            alt="Portrait of Julie Petris, Co-founder of Art Future Club"
            fittingType="fill"
            className="aspect-[4/5] w-full max-w-sm"
          />
        </motion.div>

        <div className="mt-16 grid grid-cols-1 gap-12 md:grid-cols-[auto_1fr] md:gap-10">
          <span className="font-mono-caps text-[11px] text-primary">Q.</span>
          <div>
            <p className="text-lg leading-relaxed">
              Why connect artists, galleries and collectors under one roof
              rather than letting each operate in its own lane?
            </p>
          </div>
        </div>
        <div className="mt-12 grid grid-cols-1 gap-12 md:grid-cols-[auto_1fr] md:gap-10">
          <span className="font-mono-caps text-[11px] text-background/50">A.</span>
          <div>
            <p className="text-lg leading-relaxed">
              Because the silos are where the field goes stale. A collector in
              Milano should be able to meet a painter in Bangkok before the
              gallery intervenes, and a curator in London should hear what a
              collector in Toronto is actually looking for. When those
              conversations happen in public, the whole ecosystem gets more
              honest — and more generous.
            </p>
          </div>
        </div>

        <div className="mt-16 grid grid-cols-1 gap-12 md:grid-cols-[auto_1fr] md:gap-10">
          <span className="font-mono-caps text-[11px] text-primary">Q.</span>
          <div>
            <p className="text-lg leading-relaxed">
              What is the long-term ambition — where does Art Future Club go
              from here?
            </p>
          </div>
        </div>
        <div className="mt-12 grid grid-cols-1 gap-12 md:grid-cols-[auto_1fr] md:gap-10">
          <span className="font-mono-caps text-[11px] text-background/50">A.</span>
          <div>
            <p className="text-lg leading-relaxed">
              To become the platform each city already needed — not a franchise,
              but a rooted institution that grew from its own soil and happens to
              be in constant dialogue with seven others. When the next wave of
              artists names “community” as their medium, I want them to mean us.
            </p>
          </div>
        </div>
      </article>

      {/* second feature — most recent article */}
      {latest && (
        <div className="mt-32 px-6 md:px-10">
          <Link to={`/editorial/${latest.slug || latest.id}`} className="block group">
            <motion.div
              initial={{ opacity: 0, y: 30 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true, margin: '-80px' }}
              transition={{ duration: 0.8 }}
              data-artwork
            >
              <Image
                src={latest.cover_image_url || portrait1}
                alt={latest.cover_image_alt || latest.title}
                fittingType="fill"
                className="aspect-[16/9] w-full"
              />
            </motion.div>
            <div className="mt-5 flex justify-between">
              <p className="font-mono-caps text-[11px] text-background/50">
                Feature №{count} · {latest.title}{latest.subtitle ? ` — ${latest.subtitle}` : ''}
              </p>
              <p className="font-mono-caps text-[11px] text-background/50 group-hover:text-primary transition-colors">
                → Read
              </p>
            </div>
          </Link>
        </div>
      )}
    </section>
  );
}