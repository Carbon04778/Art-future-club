import React from 'react';
import { Link } from 'react-router-dom';
import SocialLinks from '@/components/SocialLinks';

const NAV_LINKS = [
  { to: "/artists", label: "Artists" },
  { to: "/gallery", label: "Gallery" },
  { to: "/venues", label: "Venues" },
  { to: "/events", label: "Events" },
  { to: "/open-calls", label: "Open Calls" },
  { to: "/editorial", label: "Editorial" },
  { to: "/map", label: "Artist Map" },
  { to: "/community", label: "Community" },
  { to: "/upgrade", label: "Membership" },
  { to: "/partnership", label: "Partnership" },
  { to: "/about", label: "About" },
];

const LEGAL_LINKS = [
  { to: "/terms", label: "Terms" },
  { to: "/privacy", label: "Privacy" },
  { to: "/cookies", label: "Cookies" },
  { to: "/membership-policy", label: "Membership Policy" },
];

export default function SlimFooter() {
  return (
    <footer className="border-t border-border bg-background px-6 py-10 md:px-10">
      <div className="flex flex-wrap gap-x-5 gap-y-2 mb-6">
        {NAV_LINKS.map(({ to, label }) => (
          <Link key={to} to={to} className="font-mono-caps text-[11px] text-muted-foreground hover:text-primary transition-colors">
            {label}
          </Link>
        ))}
      </div>
      {/* The social accounts were only ever on the home and about pages, and
          even there they linked to an anchor on the same page. This footer
          covers the other twenty-six. */}
      <div className="flex flex-wrap items-center gap-x-6 gap-y-3 border-t border-border pt-6 pb-1">
        <span className="font-mono-caps text-[10px] text-muted-foreground/60">Follow</span>
        <SocialLinks compact linkClass="text-muted-foreground hover:text-primary" />
      </div>

      <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between border-t border-border pt-6 mt-5">
        <div className="flex flex-wrap gap-x-5 gap-y-1">
          {LEGAL_LINKS.map(({ to, label }) => (
            <Link key={to} to={to} className="font-mono-caps text-[10px] text-muted-foreground/60 hover:text-primary transition-colors">
              {label}
            </Link>
          ))}
        </div>
        <span className="font-mono-caps text-[10px] text-muted-foreground/60">
          © MMXXVI Art Future Club — Radical Connectivity
        </span>
      </div>
    </footer>
  );
}