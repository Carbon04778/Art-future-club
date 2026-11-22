import React, { useEffect, useRef, useState } from "react";
import { artistPath, spacePath } from "@/lib/slugs";
import { isVenueType, isDirectoryType } from "@/lib/venueTypes";
import { Link, useLocation } from "react-router-dom";
import { base44 } from "@/api/base44Client";
import { Menu, X, ChevronDown } from "lucide-react";
import NotificationBell from "@/components/NotificationBell";
import { CHAPTERS } from "@/lib/chaptersData";

const NAV = [
  { to: "/artists", label: "Artists" },
  { to: "/gallery", label: "Galleries" },
  { to: "/venues", label: "Venues" },
  { to: "/directory", label: "Directory" },
  { to: "/events", label: "Events" },
  { to: "/open-calls", label: "Open Calls" },
  { to: "/editorial", label: "Editorial" },
  { to: "/map", label: "Map" },
];

// Owner, 2026-11-22: at 100% zoom the bar was too long and crowded, so these
// moved under "More ⌄". Messages and Admin join them when signed in.
const MORE = [
  { to: "/community", label: "Community" },
  { to: "/about", label: "About" },
];

/**
 * A menu button with a small arrow (Chapters, More). Opens on hover or click,
 * works from the keyboard (Enter/Space opens, Esc closes and returns focus),
 * and closes on a click anywhere else.
 */
function NavDropdown({ label, active, open, setOpen, width = "w-56", align = "left", testId, children }) {
  const wrap = useRef(null);
  const button = useRef(null);
  useEffect(() => {
    if (!open) return;
    const onDown = (e) => { if (wrap.current && !wrap.current.contains(e.target)) setOpen(false); };
    const onKey = (e) => { if (e.key === "Escape") { setOpen(false); button.current?.focus(); } };
    document.addEventListener("mousedown", onDown);
    document.addEventListener("keydown", onKey);
    return () => { document.removeEventListener("mousedown", onDown); document.removeEventListener("keydown", onKey); };
  }, [open, setOpen]);
  return (
    <div
      ref={wrap}
      className="relative"
      data-testid={testId}
      onMouseEnter={() => setOpen(true)}
      onMouseLeave={() => setOpen(false)}
      onBlur={(e) => { if (!e.currentTarget.contains(e.relatedTarget)) setOpen(false); }}
    >
      <button
        ref={button}
        type="button"
        aria-haspopup="true"
        aria-expanded={open}
        className={`flex items-center gap-1 whitespace-nowrap font-mono-caps text-[11px] transition-colors ${active ? "text-primary" : "text-muted-foreground hover:text-foreground"}`}
        onClick={() => setOpen((v) => !v)}
      >
        {label} <ChevronDown className={`h-3 w-3 transition-transform ${open ? "rotate-180" : ""}`} aria-hidden="true" />
      </button>
      {open && (
        <div className={`absolute top-full pt-2 ${width} ${align === "right" ? "right-0" : "left-0"}`}>
          <div className="border border-border bg-card shadow-lg">{children}</div>
        </div>
      )}
    </div>
  );
}

export default function SiteHeader() {
  const { pathname } = useLocation();
  const [user, setUser] = useState(null);
  const [profileLink, setProfileLink] = useState("/profile/edit");
  // B10: "Collectors" is shown only to those allowed to see collectors.
  const [seesCollectors, setSeesCollectors] = useState(false);
  const [open, setOpen] = useState(false);
  const [chaptersOpen, setChaptersOpen] = useState(false);
  const [moreOpen, setMoreOpen] = useState(false);

  useEffect(() => {
    let alive = true;
    base44.auth.me().then(async (u) => {
      if (!alive) return;
      setUser(u);
      try {
        const [artists, collectors] = await Promise.all([
          base44.entities.ArtistProfile.filter({ user_id: u.id }),
          base44.entities.CollectorProfile.filter({ user_id: u.id }),
        ]);
        if (!alive) return;
        base44.auth.canSeeCollectors?.().then((a) => alive && setSeesCollectors(!!a?.allowed)).catch(() => {});
        // "My Profile" links to the public preview of the user's profile.
        const gallery = collectors.find((c) => c.type === "Gallery");
        const venue = collectors.find((c) => isVenueType(c.type));
        const listing = collectors.find((c) => isDirectoryType(c.type)); // B11
        if (gallery) setProfileLink(spacePath(gallery, false));
        else if (venue) setProfileLink(spacePath(venue, true));
        else if (listing) setProfileLink(spacePath(listing));
        else if (artists.length > 0) setProfileLink(artistPath(artists[0]));
        else if (collectors.length > 0) setProfileLink("/collector-profile/view");
        else setProfileLink("/onboarding");
      } catch {}
    }).catch(() => {});
    return () => { alive = false; };
    // Re-resolve when the route changes so the link updates right after
    // onboarding creates a profile (e.g. a brand-new artist profile).
  }, [pathname]);

  useEffect(() => { setOpen(false); setChaptersOpen(false); setMoreOpen(false); }, [pathname]);

  const isActive = (to) => to === "/" ? pathname === "/" : pathname === to || pathname.startsWith(to + "/");

  const chaptersActive = pathname.startsWith("/chapter/");

  const mainNav = seesCollectors ? [...NAV, { to: "/collectors", label: "Collectors" }] : NAV;
  const moreNav = [
    ...MORE,
    ...(user ? [{ to: "/messages", label: "Messages" }] : []),
    ...(user?.role === "admin" ? [{ to: "/admin", label: "Admin", accent: true }] : []),
  ];
  const moreActive = moreNav.some((n) => isActive(n.to));
  const itemClass = (to, accent) => `block px-4 py-2.5 font-mono-caps text-[10px] transition-colors hover:bg-foreground hover:text-background focus:bg-foreground focus:text-background focus:outline-none ${isActive(to) ? "text-primary" : accent ? "text-accent" : "text-muted-foreground"}`;

  return (
    <header className="sticky top-0 z-50 border-b border-border bg-background/95 backdrop-blur-sm">
      <div className="flex items-center justify-between px-6 py-3.5 md:px-10">
        <Link to="/" className="flex items-center" aria-label="Art Future Club — home">
          <img
            src="/images/artfuture.webp"
            alt="Art Future Club"
            className="h-9 w-auto md:h-10"
          />
        </Link>

        {/* gap-4 on small laptops (1024–1279px), gap-6 from 1280px: at 1024px
            the admin's bar (with Collectors) was 41px too wide at gap-6. */}
        <nav className="hidden items-center gap-4 lg:flex xl:gap-6" data-testid="main-nav">
          <NavDropdown label="Chapters" active={chaptersActive} open={chaptersOpen} setOpen={setChaptersOpen} testId="nav-chapters">
            {CHAPTERS.map((c) => (
              <Link
                key={c.slug}
                to={`/chapter/${c.slug}`}
                onClick={() => setChaptersOpen(false)}
                className={`block px-4 py-2.5 font-mono-caps text-[10px] transition-colors hover:bg-foreground hover:text-background focus:bg-foreground focus:text-background focus:outline-none ${pathname === `/chapter/${c.slug}` ? "text-primary" : "text-muted-foreground"}`}
              >
                <span className="text-foreground/80">{c.chapter}</span> · {c.city}
              </Link>
            ))}
          </NavDropdown>
          {mainNav.map((n) => (
            <Link
              key={n.to}
              to={n.to}
              className={`whitespace-nowrap font-mono-caps text-[11px] transition-colors ${isActive(n.to) ? "text-primary" : "text-muted-foreground hover:text-foreground"}`}
            >
              {n.label}
            </Link>
          ))}
          <NavDropdown label="More" active={moreActive} open={moreOpen} setOpen={setMoreOpen} width="w-44" testId="nav-more">
            {moreNav.map((n) => (
              <Link key={n.to} to={n.to} onClick={() => setMoreOpen(false)} className={itemClass(n.to, n.accent)}>
                {n.label}
              </Link>
            ))}
          </NavDropdown>
        </nav>

        <div className="flex flex-wrap items-center gap-4">
          {user ? (
            <div className="hidden items-center gap-4 md:flex">
              <NotificationBell userId={user.id} isAdmin={user.role === "admin"} />
              <Link to={profileLink} className={`whitespace-nowrap font-mono-caps text-[11px] transition-colors ${isActive("/profile/edit") || isActive("/collector-profile") || pathname.includes("/gallery/") || pathname.includes("/collector-profile/view") ? "text-primary" : "text-muted-foreground hover:text-foreground"}`}>My Profile</Link>
            </div>
          ) : (
            <Link to="/login" className="font-mono-caps text-[11px] text-primary">Sign in →</Link>
          )}
          <button className="lg:hidden" onClick={() => setOpen((v) => !v)} aria-label="Toggle menu">
            {open ? <X className="h-4 w-4" /> : <Menu className="h-4 w-4" />}
          </button>
        </div>
      </div>

      {open && (
        <div className="border-t border-border px-6 py-4 flex flex-col gap-3 lg:hidden">
          <p className="font-mono-caps text-[10px] text-foreground/80">Chapters</p>
          <div className="grid grid-cols-2 gap-2">
            {CHAPTERS.map((c) => (
              <Link key={c.slug} to={`/chapter/${c.slug}`} className="font-mono-caps text-[10px] text-muted-foreground hover:text-primary">{c.city}</Link>
            ))}
          </div>
          <div className="border-t border-border my-1" />
          {[...mainNav, ...MORE].map((n) => (
            <Link key={n.to} to={n.to} className="font-mono-caps text-[11px] text-muted-foreground hover:text-primary">{n.label}</Link>
          ))}
          {user ? (
            <>
              {user.role === "admin" && (
                <Link to="/admin" className="font-mono-caps text-[11px] text-accent hover:text-primary">Admin</Link>
              )}
              <Link to="/messages" className="font-mono-caps text-[11px] text-muted-foreground hover:text-primary">Messages</Link>
              <Link to={profileLink} className="font-mono-caps text-[11px] text-muted-foreground hover:text-primary">My Profile</Link>
            </>
          ) : (
            <Link to="/login" className="font-mono-caps text-[11px] text-primary">Sign in →</Link>
          )}
        </div>
      )}
    </header>
  );
}