import React from 'react';
import { motion } from 'framer-motion';
import { Link } from 'react-router-dom';

const SOCIALS = ['Instagram', 'LinkedIn', 'Are.na', 'Xiaohongshu', 'Substack', 'Facebook', 'YouTube', 'Threads', 'Newsletter'];

export default function ManifestoFooter() {
  return (
    <section
      id="manifesto"
      className="relative flex min-h-screen flex-col justify-between overflow-hidden bg-black px-6 py-20 text-foreground md:px-10"
    >
      <p className="font-mono-caps text-[11px] text-highlight">
        005 — The Manifesto
      </p>

      {/* massive outlined statement */}
      <div className="flex flex-1 flex-col justify-center py-16">
        <motion.h2
          initial={{ opacity: 0 }}
          whileInView={{ opacity: 1 }}
          viewport={{ once: true }}
          transition={{ duration: 1 }}
          className="font-heading text-[10vw] font-medium leading-[0.92] tracking-[-0.03em] md:text-[7vw]"
        >
          <span className="outlined-text-light">We treat the city</span>
          <br />
          <span className="text-foreground">as a canvas</span>
          <br />
          <span className="outlined-text-light">and the network</span>
          <br />
          <span className="text-foreground">as a <span className="text-highlight">masterpiece</span>.</span>
        </motion.h2>

        <p className="mt-12 max-w-xl text-lg leading-relaxed text-foreground/70">
          <span className="text-primary">Art Future Club</span> is not a static archive. It is a <span className="text-muted-foreground">high-velocity</span> engine
          for the global <span className="text-accent">contemporary art</span> dialogue — curating monthly gatherings,
          editorial features and collaborative exhibitions that grow into
          recognised <span className="text-highlight">cultural platforms</span>, city by city.
        </p>
      </div>

      {/* contact + socials */}
      <div className="grid grid-cols-1 gap-10 border-t border-foreground/15 pt-10 md:grid-cols-4">
        <div>
          <p className="font-mono-caps text-[10px] text-highlight">Contact</p>
          <a
            href="mailto:hello@artfuture.club"
            className="mt-2 block text-lg hover:text-primary"
          >
            hello@artfuture.club
          </a>
        </div>
        <div>
          <p className="font-mono-caps text-[10px] text-highlight">Chapters</p>
          <ul className="mt-2 space-y-1 text-sm text-foreground/70">
            <li>Hong Kong · London · New York</li>
            <li>Los Angeles · Bangkok · Milano</li>
            <li>Toronto · Zurich</li>
          </ul>
        </div>
        <div>
          <p className="font-mono-caps text-[10px] text-highlight">Platform</p>
          <ul className="mt-2 space-y-1">
            {[
              { to: "/artists", label: "Artists Directory" },
              { to: "/gallery", label: "Gallery" },
              { to: "/events", label: "Events" },
              { to: "/open-calls", label: "Open Calls" },
              { to: "/editorial", label: "Editorial" },
              { to: "/map", label: "Artist Map" },
              { to: "/community", label: "Community" },
              { to: "/upgrade", label: "Membership" },
              { to: "/partnership", label: "Partnership & Patronage" },
            ].map(({ to, label }) => (
              <li key={to}><Link to={to} className="text-sm text-foreground/70 hover:text-primary transition-colors">{label}</Link></li>
            ))}
          </ul>
        </div>
        <div>
          <p className="font-mono-caps text-[10px] text-highlight">Follow</p>
          <ul className="mt-2 flex flex-wrap gap-x-5 gap-y-1">
            {SOCIALS.map((s) => (
              <li key={s}>
                <a
                  href="#manifesto"
                  className="text-sm text-foreground/70 transition-colors hover:text-primary"
                >
                  {s}
                </a>
              </li>
            ))}
          </ul>
        </div>
      </div>

      <div className="mt-10 border-t border-foreground/15 pt-8 flex flex-col gap-4">
        <div className="flex flex-wrap gap-x-6 gap-y-2">
          {[
            { to: "/partnership", label: "Partnership & Patronage" },
            { to: "/about", label: "About Us" },
            { to: "/terms", label: "Terms & Conditions" },
            { to: "/privacy", label: "Privacy Policy" },
            { to: "/cookies", label: "Cookie Policy" },
            { to: "/membership-policy", label: "Membership Policy" },
          ].map(({ to, label }) => (
            <Link key={to} to={to} className="font-mono-caps text-[10px] text-foreground/40 hover:text-primary transition-colors">
              {label}
            </Link>
          ))}
        </div>
        <div className="flex flex-col items-start justify-between gap-2 font-mono-caps text-[10px] text-foreground/40 md:flex-row md:items-center">
          <span>© MMXXVI Art Future Club — Radical Connectivity</span>
          <span>Built as a Cultural Synapse</span>
        </div>
      </div>
    </section>
  );
}