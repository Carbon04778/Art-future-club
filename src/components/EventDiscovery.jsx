import React, { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { Search, X, MapPin } from "lucide-react";
import { base44 } from "@/api/base44Client";
import { eventPath } from "@/lib/slugs";
import { chapterFor } from "@/lib/aiEvents";
import { describeQuery, recommendEvents } from "@/lib/eventSearch";

/** Plain-language search and "For you" on the Events page (C8). */
export default function EventDiscovery({ user, events, query, setQuery, parsed, near, setNear, count }) {
  const [me, setMe] = useState(null);
  const [locating, setLocating] = useState("");

  useEffect(() => {
    if (!user?.id) { setMe(null); return undefined; }
    let alive = true;
    Promise.all([
      base44.entities.Follow.filter({ follower_id: user.id }, "-created_date", 200).catch(() => []),
      base44.entities.CollectorProfile.filter({ user_id: user.id }, "-created_date", 5).catch(() => []),
      base44.entities.ArtistProfile.filter({ user_id: user.id }, "-created_date", 5).catch(() => []),
    ]).then(([follows, spaces, artists]) => {
      if (!alive) return;
      const p = [...artists, ...spaces];
      const interests = p.flatMap((x) => [
        ...(Array.isArray(x.interests) ? x.interests : []),
        ...(Array.isArray(x.disciplines) ? x.disciplines : []),
        x.discipline,
      ]).filter((x) => typeof x === "string" && x);
      setMe({
        followedIds: follows.map((f) => f.following_id),
        followedNames: follows.map((f) => f.following_name),
        chapter: p.map((x) => chapterFor(x.chapter) || chapterFor(x.based_in)).find(Boolean) || null,
        interests: [...new Set(interests)],
      });
    });
    return () => { alive = false; };
  }, [user?.id]);

  // "near me": the member's own city if we know it; otherwise they are asked.
  useEffect(() => {
    if (parsed.near && !near && me?.chapter) setNear({ chapter: me.chapter });
  }, [parsed.near, near, me, setNear]);

  const locate = () => {
    if (!navigator.geolocation) { setLocating("Your browser cannot share a location. Try adding a city."); return; }
    setLocating("Finding you…");
    navigator.geolocation.getCurrentPosition(
      (g) => { setNear({ lat: g.coords.latitude, lng: g.coords.longitude }); setLocating(""); },
      () => setLocating("Location not shared. Try adding a city, for example “in Hong Kong”."),
      { timeout: 10000 }
    );
  };

  const picks = me ? recommendEvents(events, me) : [];

  return (
    <div className="mt-10" data-testid="event-discovery">
      <div className="relative max-w-2xl">
        <Search className="pointer-events-none absolute left-4 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
        <input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          aria-label="Search events"
          placeholder="Try “painting workshops near me this weekend”"
          className="w-full border border-border bg-transparent py-4 pl-11 pr-11 text-base outline-none focus:border-primary"
        />
        {query && (
          <button type="button" onClick={() => setQuery("")} aria-label="Clear search" className="absolute right-3 top-1/2 -translate-y-1/2 p-1 text-muted-foreground hover:text-foreground">
            <X className="h-4 w-4" />
          </button>
        )}
      </div>
      {!parsed.empty && (
        <p className="mt-3 text-sm text-muted-foreground" role="status">
          {count} event{count === 1 ? "" : "s"}{describeQuery(parsed) ? ` for ${describeQuery(parsed)}` : ""}
          {parsed.near && near?.chapter ? ` (${near.chapter})` : ""}
        </p>
      )}
      {parsed.near && !near && (
        <p className="mt-2 text-sm text-muted-foreground">
          <button type="button" onClick={locate} className="inline-flex items-center gap-1 text-primary underline">
            <MapPin className="h-3 w-3" /> Use my location
          </button>{" "}
          to search near you. {locating}
        </p>
      )}

      {parsed.empty && picks.length > 0 && (
        <div className="mt-10">
          <p className="font-mono-caps text-[11px] text-primary">For you</p>
          <div className="mt-4 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {picks.map(({ event, why }) => (
              <Link key={event.id} to={eventPath(event)} className="min-w-0 border border-border p-5 transition-colors hover:border-primary">
                <p className="break-words font-heading text-xl">{event.title}</p>
                <p className="mt-1 font-mono-caps text-[10px] text-muted-foreground [overflow-wrap:anywhere]">
                  {new Date(event.start_date).toLocaleDateString("en-GB", { day: "numeric", month: "short" })}
                  {event.end_date ? ` – ${new Date(event.end_date).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" })}` : ""}
                  {event.venue ? ` · ${event.venue}` : ""}
                </p>
                <p className="mt-3 text-xs text-muted-foreground">{why.join(" · ")}</p>
              </Link>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
