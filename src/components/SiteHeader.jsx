import React, { useEffect, useState } from "react";
import { Link, useLocation } from "react-router-dom";
import { base44 } from "@/api/base44Client";
import { Menu, X, ChevronDown } from "lucide-react";
import NotificationBell from "@/components/NotificationBell";
import { CHAPTERS } from "@/lib/chaptersData";

const NAV = [
  { to: "/artists", label: "Artists" },
  { to: "/gallery", label: "Galleries" },
  { to: "/venues", label: "Venues" },
  { to: "/events", label: "Events" },
  { to: "/open-calls", label: "Open Calls" },
  { to: "/editorial", label: "Editorial" },
  { to: "/map", label: "Map" },
  { to: "/community", label: "Community" },
  { to: "/about", label: "About" },
];

export default function SiteHeader() {
  const { pathname } = useLocation();
  const [user, setUser] = useState(null);
  const [profileLink, setProfileLink] = useState("/profile/edit");
  const [open, setOpen] = useState(false);
  const [chaptersOpen, setChaptersOpen] = useState(false);

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
        // "My Profile" links to the public preview of the user's profile.
        const gallery = collectors.find((c) => c.type === "Gallery");
        const venue = collectors.find((c) => c.type === "Institution");
        if (gallery) setProfileLink(`/gallery/${gallery.id}`);
        else if (venue) setProfileLink(`/venues/${venue.id}`);
        else if (artists.length > 0) setProfileLink(`/artists/${artists[0].id}`);
        else if (collectors.length > 0) setProfileLink("/collector-profile/view");
        else setProfileLink("/onboarding");
      } catch {}
    }).catch(() => {});
    return () => { alive = false; };
    // Re-resolve when the route changes so the link updates right after
    // onboarding creates a profile (e.g. a brand-new artist profile).
  }, [pathname]);

  useEffect(() => { setOpen(false); setChaptersOpen(false); }, [pathname]);

  const isActive = (to) => to === "/" ? pathname === "/" : pathname === to || pathname.startsWith(to + "/");

  const chaptersActive = pathname.startsWith("/chapter/");

  return (
    <header className="sticky top-0 z-50 border-b border-border bg-background/95 backdrop-blur-sm">
      <div className="flex items-center justify-between px-6 py-3.5 md:px-10">
        <Link to="/" className="flex items-center" aria-label="Art Future Club — home">
          <img
            src="/images/artfuture.png"
            alt="Art Future Club"
            className="h-9 w-auto md:h-10"
          />
        </Link>

        <nav className="hidden items-center gap-6 lg:flex">
          <div
            className="relative"
            onMouseEnter={() => setChaptersOpen(true)}
            onMouseLeave={() => setChaptersOpen(false)}
          >
            <button
              className={`flex items-center gap-1 font-mono-caps text-[11px] transition-colors ${chaptersActive ? "text-primary" : "text-muted-foreground hover:text-foreground"}`}
              onClick={() => setChaptersOpen((v) => !v)}
            >
              Chapters <ChevronDown className="h-3 w-3" />
            </button>
            {chaptersOpen && (
              <div className="absolute left-0 top-full pt-2 w-56">
                <div className="border border-border bg-card shadow-lg">
                  {CHAPTERS.map((c) => (
                    <Link
                      key={c.slug}
                      to={`/chapter/${c.slug}`}
                      onClick={() => setChaptersOpen(false)}
                      className={`block px-4 py-2.5 font-mono-caps text-[10px] transition-colors hover:bg-foreground hover:text-background ${pathname === `/chapter/${c.slug}` ? "text-primary" : "text-muted-foreground"}`}
                    >
                      <span className="text-foreground/80">{c.chapter}</span> · {c.city}
                    </Link>
                  ))}
                </div>
              </div>
            )}
          </div>
          {NAV.map((n) => (
            <Link
              key={n.to}
              to={n.to}
              className={`font-mono-caps text-[11px] transition-colors ${isActive(n.to) ? "text-primary" : "text-muted-foreground hover:text-foreground"}`}
            >
              {n.label}
            </Link>
          ))}
        </nav>

        <div className="flex flex-wrap items-center gap-4">
          {user ? (
            <div className="hidden items-center gap-4 md:flex">
              {user.role === "admin" && (
                <Link to="/admin" className={`font-mono-caps text-[11px] transition-colors ${isActive("/admin") ? "text-primary" : "text-accent hover:text-foreground"}`}>Admin</Link>
              )}
              <Link to="/messages" className={`font-mono-caps text-[11px] transition-colors ${isActive("/messages") ? "text-primary" : "text-muted-foreground hover:text-foreground"}`}>Messages</Link>
              <NotificationBell userId={user.id} />
              <Link to={profileLink} className={`font-mono-caps text-[11px] transition-colors ${isActive("/profile/edit") || isActive("/collector-profile") || pathname.includes("/gallery/") || pathname.includes("/collector-profile/view") ? "text-primary" : "text-muted-foreground hover:text-foreground"}`}>My Profile</Link>
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
          {NAV.map((n) => (
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