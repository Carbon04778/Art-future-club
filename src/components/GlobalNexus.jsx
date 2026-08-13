import React, { useState, useEffect } from 'react';
import { motion } from 'framer-motion';
import { Image } from '@/components/ui/image';
import { ArrowDown } from 'lucide-react';

const CITIES = [
  { name: 'London', coords: '51.5074°N / 0.1278°W' },
  { name: 'Tokyo', coords: '35.6762°N / 139.6503°E' },
  { name: 'Berlin', coords: '52.5200°N / 13.4050°E' },
  { name: 'Seoul', coords: '37.5665°N / 126.9780°E' },
  { name: 'Mexico City', coords: '19.4326°N / 99.1332°W' },
];

export default function GlobalNexus({ heroImage }) {
  const [tickerIndex, setTickerIndex] = useState(0);

  useEffect(() => {
    const t = setInterval(() => setTickerIndex((i) => (i + 1) % CITIES.length), 2600);
    return () => clearInterval(t);
  }, []);

  return (
    <section className="relative min-h-[100svh] w-full overflow-hidden">
      {/* full-bleed image */}
      <div className="absolute inset-0">
        <Image
          src={heroImage}
          alt="Global cityscape at dusk"
          fittingType="fill"
          className="h-full w-full object-cover object-center"
        />
        <div className="absolute inset-0 bg-gradient-to-b from-background/30 via-background/40 to-background/90" />
        <div className="absolute inset-0 bg-black/20" />
      </div>

      {/* hero typography */}
      <div className="relative z-20 flex min-h-[calc(100svh-5rem)] flex-col justify-between px-6 pb-16 pt-8 md:px-10">
        <motion.div
          initial={{ opacity: 0, y: 24 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.9, ease: 'easeOut' }}
          className="max-w-3xl"
        >
          <p className="font-mono-caps text-[11px] text-foreground/70">
            001 — The Global Community
          </p>
        </motion.div>

        <div>
          <motion.h1
            initial={{ opacity: 0, y: 30 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 1, ease: 'easeOut', delay: 0.1 }}
            className="m-0"
          >
            {/* The wordmark is the brand lockup, so it ships as artwork rather
                than styled text. The alt text keeps the H1 meaningful for
                search engines and screen readers. */}
            <img
              src="/images/afc-wordmark.svg"
              alt="Art Future Club"
              className="w-[62vw] max-w-[520px]"
            />
          </motion.h1>
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ duration: 1, delay: 0.5 }}
            className="mt-6 flex flex-col gap-4 md:flex-row md:items-end md:justify-between"
          >
            <p className="max-w-md text-base text-foreground/85 md:text-lg">
              An international <span className="text-primary">contemporary art</span> network building connected
              communities across global cities — <span className="text-accent">artists, galleries, collectors</span>&nbsp;
              and cultural professionals in borderless <span className="text-highlight">connectivity</span>.
            </p>
            <a
              href="#chapters"
              className="group inline-flex items-center gap-2 font-mono-caps text-[11px] text-foreground"
            >
              <span className="h-px w-8 bg-foreground transition-all group-hover:w-12" />
              Enter the <span className="text-primary">Network</span>
            </a>
          </motion.div>
        </div>
      </div>

      {/* horizontal city scroll */}
      <div className="absolute bottom-0 left-0 z-20 w-full border-t border-foreground/20 bg-black/30 backdrop-blur-sm">
        <div className="flex items-center gap-8 overflow-x-auto px-6 py-4 md:px-10 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
          <span className="font-mono-caps whitespace-nowrap text-[10px] text-foreground/50">
            Chapters →
          </span>
          {CITIES.map((c, i) => (
            <a
              key={c.name}
              href="#chapters"
              className={`font-mono-caps whitespace-nowrap text-[11px] transition-colors ${
                i === tickerIndex ? 'text-foreground' : 'text-foreground/45'
              }`}
            >
              {c.name}
              <span className="ml-2 hidden text-foreground/40 lg:inline">
                / {c.coords}
              </span>
            </a>
          ))}
          <ArrowDown className="ml-auto h-4 w-4 shrink-0 text-foreground/70" />
        </div>
      </div>
    </section>
  );
}