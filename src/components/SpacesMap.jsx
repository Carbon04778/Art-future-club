import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Link } from "react-router-dom";
import { CornerUpRight, Search, X, Loader2 } from "lucide-react";
import { spacePath, artistPath, eventPath } from "@/lib/slugs";
import { isEventRow, toEventRows, eventDateLabel, spreadSharedPoints } from "@/lib/mapEvents";
import { isVenueType, isDirectoryType, VENUE_TYPES, DIRECTORY_TYPES } from "@/lib/venueTypes";
import { groupArtistsByCity, isArtistGroup, artistCountLabel } from "@/lib/artistGroups";
import { Image } from "@/components/ui/image";
import { base44 } from "@/api/base44Client";
import { directionsUrl } from "@/lib/mapLinks";
import { hasGoogleMaps, googleAuthFailed } from "@/lib/googleMaps";
import { useDataRevision } from "@/lib/dataRevision";
import GoogleSpacesSurface from "@/components/map/GoogleSpacesSurface";
import LeafletSpacesSurface from "@/components/map/LeafletSpacesSurface";
import { disciplineLabel } from "@/lib/disciplines";

/**
 * Every gallery and venue, pinned where it actually is.
 *
 * WHAT THIS REPLACED
 *
 * The old maps drew EIGHT dots — one per chapter city, from a hardcoded table
 * of coordinates — and bucketed listings by testing whether their address text
 * contained a chapter name. So 46 Zurich galleries collapsed onto one point in
 * the middle of Zurich, zooming in found nothing, and the 139 listings whose
 * address matched no chapter were dropped from the map entirely. Every listing
 * already carried its own geo_lat/geo_lng, and no map read them.
 *
 * TWO SURFACES, ONE MAP
 *
 * Google where there is a key, Leaflet where there is not. Only the surface
 * differs: the data, the filters and the list beside the map live here, so
 * there is one copy of them whichever is drawing, and the site cannot end up
 * with two maps that behave differently.
 *
 * The fallback is not only for a missing key. A referrer the key does not
 * allow, or an exhausted quota, both fail after the page has loaded; the
 * surface reports it and Leaflet takes over. A map the visitor can still use,
 * rather than a blank rectangle.
 *
 * THE LIST IS PART OF THE MAP
 *
 * The panel beside it shows exactly what is in view, and the two are linked
 * both ways: click a row and the map flies to that pin and opens it; pan the
 * map and the list follows. A map you cannot read as a list is no use for
 * planning a visit, which is the point of the thing.
 */

/* Fetched in pages, because a single capped request silently drops rows once
 * the table outgrows the cap — see rule 8 in docs/ARTFUTURE-FULL-TEST.md. */
const PAGE = 500;
const COLUMNS =
  "id,display_name,type,based_in,address,avatar_url,slug,status,geo_lat,geo_lng";

/*
 * At module scope, so the default is the SAME array on every render. As a
 * default parameter it was rebuilt each time, and being an effect dependency
 * that re-ran the fetch, which set state, which re-rendered — an infinite loop
 * that hung verify:render outright.
 */
const DEFAULT_KINDS = ["Gallery", ...VENUE_TYPES, ...DIRECTORY_TYPES];

/*
 * `based_in` is free text and wildly inconsistent — 90 distinct values across
 * 498 listings, many of them lists of cities: "New York, Los Angeles",
 * "Paris, New York, Tokyo, Seoul, Los Angeles, and other cities". A dropdown
 * built straight from it is unusable, most entries having one listing.
 *
 * The first component is the one that matters — a gallery based in several
 * places names its home first — so group on that, drop any parenthetical, and
 * only offer cities with enough listings to be worth a row. The rest fall under
 * "Other", which is honest: they are real places, just not clusters.
 */
const MIN_CITY_LISTINGS = 3;
const OTHER_CITIES = "Other";
const cityOf = (row) => {
  const first = String(row.based_in || "").split(",")[0].trim();
  // "Zurich (Kusnacht)" and "Boston (Allston)" are the same city as their parent.
  const paren = first.indexOf(" (");
  return (paren > 0 ? first.slice(0, paren) : first).trim();
};

/**
 * Directions, with the visitor's own position as the starting point.
 *
 * Asked for on the CLICK, never on page load: a site that demands your location
 * the moment it opens is the thing everyone resents, and pressing Directions is
 * a clear enough request. Once given it is remembered for the session, so this
 * asks at most once. Declining costs nothing — the link is then built without
 * an origin, exactly as before, which still works on a phone.
 */
function DirectionsLink({ row, here, onLocated }) {
  const [asking, setAsking] = useState(false);
  const href = directionsUrl(row, here);

  const handle = (e) => {
    // Already known, or the browser cannot tell us: behave as a plain link.
    if (here || !navigator.geolocation) return;
    e.preventDefault();
    setAsking(true);

    /*
     * The tab is opened NOW, synchronously, and its address filled in when the
     * browser answers. Opening it inside the callback instead would be a popup
     * the browser did not connect to a click, and it would be blocked.
     * `noopener` is left off so the reference survives; opener is cleared by
     * hand immediately after, which is what noopener would have done.
     */
    const tab = window.open("", "_blank");
    if (tab) tab.opener = null;
    const go = (url) => {
      setAsking(false);
      if (tab) tab.location = url;
      else window.open(url, "_blank", "noopener,noreferrer");
    };

    navigator.geolocation.getCurrentPosition(
      (pos) => {
        const at = [pos.coords.latitude, pos.coords.longitude];
        onLocated?.(at);
        go(directionsUrl(row, at));
      },
      // Refused, or it timed out. Send them anyway, without an origin.
      () => go(href),
      { enableHighAccuracy: true, timeout: 10000, maximumAge: 300000 }
    );
  };

  return (
    <a
      href={href}
      onClick={handle}
      target="_blank"
      rel="noopener noreferrer"
      className="mt-3 inline-flex items-center gap-1.5 border border-border px-3 py-1.5 font-mono-caps text-[10px] hover:border-primary hover:text-primary"
    >
      {asking ? <Loader2 className="h-3 w-3 animate-spin" /> : <CornerUpRight className="h-3 w-3" />}
      {asking ? "Locating" : "Directions"}
    </a>
  );
}

/*
 * Artists, for the one map (B1 in docs/CLIENT-REQUESTS.md). Paged like the
 * listings above: the old artist map read only the newest 200 and would have
 * dropped everyone after that without a word.
 */
const ARTIST_COLUMNS = "id,display_name,discipline,disciplines,chapter,slug,avatar_url";

/** An artist-group pin: the city, how many, and every artist as a link. */
function ArtistGroupPopup({ row }) {
  return (
    <div className="min-w-[200px]">
      <p className="font-body text-sm font-medium leading-tight">{row.display_name}</p>
      <p className="mt-0.5 font-mono-caps text-[10px] text-muted-foreground">
        {artistCountLabel(row.members.length)}
      </p>
      <ul className="mt-2 max-h-56 divide-y divide-border overflow-y-auto">
        {row.members.map((a) => (
          <li key={a.id}>
            <Link to={artistPath(a)} className="block py-1.5 hover:underline">
              <span className="block text-sm leading-tight">{a.display_name}</span>
              {a.discipline && (
                <span className="block font-mono-caps text-[9px] text-muted-foreground">{a.discipline}</span>
              )}
            </Link>
          </li>
        ))}
      </ul>
    </div>
  );
}

/** An event pin (B7): what, when, where, and how to get there. */
function EventPopup({ row: r, here, onLocated }) {
  const e = r.event;
  return (
    <div className="min-w-[200px]">
      <Link to={eventPath(e)} className="block font-body text-sm font-medium leading-tight hover:underline">{e.title}</Link>
      <p className="mt-0.5 font-mono-caps text-[10px] text-primary">{eventDateLabel(e)}</p>
      <p className="mt-1 text-xs leading-snug text-muted-foreground">{[e.venue, e.address].filter(Boolean).join(", ")}</p>
      {/* The exact venue, not the few metres the pin was moved to stay tappable. */}
      <DirectionsLink row={r.exact ? { ...r, ...r.exact } : r} here={here} onLocated={onLocated} />
    </div>
  );
}

/** What a pin shows when tapped: who it is, where, and how to get there. */
function SpacePopup({ row: r, here, onLocated }) {
  return (
    <div className="min-w-[190px]">
      <div className="flex items-start gap-3">
        {r.avatar_url && (
          <Image src={r.avatar_url} alt="" className="h-12 w-12 shrink-0 object-cover" />
        )}
        <div className="min-w-0">
          <Link
            to={spacePath(r, isVenueType(r.type))}
            className="block font-body text-sm font-medium leading-tight hover:underline"
          >
            {r.display_name}
          </Link>
          <p className="mt-0.5 font-mono-caps text-[10px] text-muted-foreground">
            {r.type}{r.based_in ? ` · ${r.based_in}` : ""}
          </p>
        </div>
      </div>
      {r.address && (
        <p className="mt-2 text-xs leading-snug text-muted-foreground">{r.address}</p>
      )}
      <DirectionsLink row={r} here={here} onLocated={onLocated} />
    </div>
  );
}

/**
 * includeArtists: also plot artists, one pin per chapter city, with an
 * "Artists" filter. initialKind: which filter is selected on arrival
 * (/gallery-map opens on "Galleries").
 */
export default function SpacesMap({ kinds = DEFAULT_KINDS, title = "Map", includeArtists = false, initialKind = "All" }) {
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(true);
  const [artists, setArtists] = useState([]);
  const [artistsLoading, setArtistsLoading] = useState(includeArtists);
  // B7: events on the main map (the one that includes artists).
  const [events, setEvents] = useState([]);
  const [eventsLoading, setEventsLoading] = useState(includeArtists);
  const [query, setQuery] = useState("");
  const [city, setCity] = useState("All");
  const [kind, setKind] = useState(initialKind);
  // "Directory" (B11): art stores, framers, printers.
  const KIND_FILTERS = includeArtists ? ["All", "Artists", "Galleries", "Venues", "Directory", "Events"] : ["All", "Galleries", "Venues", "Directory"];
  const [bounds, setBounds] = useState(null);
  const [selected, setSelected] = useState(null);
  /* The visitor's own position, once they have offered it — from the find-me
   * control or from pressing Directions. Held for the session so neither asks
   * twice. */
  const [here, setHere] = useState(null);
  /* Google was possible but failed at runtime: a referrer the key does not
   * allow, or an exhausted quota. Fall back rather than leave a blank box. */
  const [googleFailed, setGoogleFailed] = useState(false);
  const markers = useRef({});
  /* The contents, not the array identity: a caller passing an inline array
   * would otherwise hand the effect a new dependency on every render. */
  const kindsKey = kinds.join(",");
  const rev = useDataRevision();

  useEffect(() => {
    let alive = true;
    (async () => {
      /* Every page, not the first one. */
      const all = [];
      for (let offset = 0; ; offset += PAGE) {
        const { rows: page, count } = await base44.entities.CollectorProfile.page({
          where: { type: { $in: kindsKey.split(",") }, status: "approved" },
          sort: "display_name",
          limit: PAGE,
          offset,
          columns: COLUMNS,
        });
        all.push(...page);
        if (page.length < PAGE || all.length >= count) break;
      }
      if (!alive) return;
      setRows(all.filter((r) => r.geo_lat != null && r.geo_lng != null));
      setLoading(false);
    })().catch(() => alive && setLoading(false));
    return () => { alive = false; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [kindsKey, rev]);

  /* Every published artist, every page. */
  useEffect(() => {
    if (!includeArtists) return undefined;
    let alive = true;
    (async () => {
      const all = [];
      for (let offset = 0; ; offset += PAGE) {
        const { rows: page, count } = await base44.entities.ArtistProfile.page({
          where: { status: "approved" },
          sort: "display_name",
          limit: PAGE,
          offset,
          columns: ARTIST_COLUMNS,
        });
        all.push(...page);
        if (page.length < PAGE || all.length >= count) break;
      }
      if (!alive) return;
      setArtists(all);
      setArtistsLoading(false);
    })().catch(() => alive && setArtistsLoading(false));
    return () => { alive = false; };
  }, [includeArtists, rev]);

  /* B7: upcoming and running events that have a position. */
  useEffect(() => {
    if (!includeArtists) return undefined;
    let alive = true;
    base44.entities.Event.list("start_date", 1000,
      "id,title,slug,venue,address,chapter,start_date,end_date,image_url,geo_lat,geo_lng")
      .then((evs) => alive && setEvents(toEventRows(evs)))
      .catch(() => {})
      .finally(() => alive && setEventsLoading(false));
    return () => { alive = false; };
  }, [includeArtists, rev]);

  /*
   * Artists matching the search, grouped into one row per city. A search for an
   * artist's name keeps their city's pin and narrows its list to the match.
   */
  const artistGroups = useMemo(() => {
    const q = query.trim().toLowerCase();
    const hits = q
      ? artists.filter((a) => `${a.display_name} ${disciplineLabel(a, " ")} ${a.chapter || ""}`.toLowerCase().includes(q))
      : artists;
    return groupArtistsByCity(hits);
  }, [artists, query]);

  /* Cities worth a row, biggest first — that is where the galleries are. */
  const cities = useMemo(() => {
    const counts = {};
    for (const r of rows) {
      const c = cityOf(r);
      if (c) counts[c] = (counts[c] || 0) + 1;
    }
    // An artist city is always worth a row: it is a chapter.
    for (const g of groupArtistsByCity(artists).groups) {
      counts[g.display_name] = Math.max(counts[g.display_name] || 0, MIN_CITY_LISTINGS);
    }
    const big = Object.entries(counts)
      .filter(([, n]) => n >= MIN_CITY_LISTINGS)
      .sort((a, b) => b[1] - a[1])
      .map(([c]) => c);
    const hasOther = Object.values(counts).some((n) => n < MIN_CITY_LISTINGS);
    return ["All", ...big, ...(hasOther ? [OTHER_CITIES] : [])];
  }, [rows, artists]);

  const inCity = useCallback((r) => {
    if (city === OTHER_CITIES) return !cities.includes(cityOf(r));
    return city === "All" || cityOf(r) === city;
  }, [city, cities]);

  /* What the map should show. The list then narrows this to the viewport. */
  const matching = useMemo(() => {
    const q = query.trim().toLowerCase();
    const spaces = kind === "Artists" || kind === "Events" ? [] : rows.filter((r) => {
      if (!inCity(r)) return false;
      if (kind === "Galleries" && (isVenueType(r.type) || isDirectoryType(r.type))) return false;
      if (kind === "Venues" && !isVenueType(r.type)) return false;
      if (kind === "Directory" && !isDirectoryType(r.type)) return false;
      if (q && !`${r.display_name} ${r.based_in || ""} ${r.address || ""}`.toLowerCase().includes(q))
        return false;
      return true;
    });
    const groups = includeArtists && (kind === "All" || kind === "Artists")
      ? artistGroups.groups.filter(inCity)
      : [];
    const evs = includeArtists && (kind === "All" || kind === "Events")
      ? events.filter((r) => inCity(r) && (!q || `${r.display_name} ${r.address}`.toLowerCase().includes(q)))
      : [];
    // Artist cities first in the list: one row each, so they never bury the listings.
    // Events sharing a point are spread a few metres so each can be opened.
    return spreadSharedPoints([...groups, ...spaces, ...evs]);
  }, [rows, query, kind, inCity, includeArtists, artistGroups, events]);

  /*
   * A filter that hides the selected pin also drops the selection. Otherwise
   * the map kept flying back to it: pick Hong Kong's artists, switch to
   * Galleries, and the view stayed parked on Hong Kong instead of fitting the
   * galleries — the list read "0 in view".
   */
  useEffect(() => {
    if (selected && !matching.some((r) => r.id === selected.id)) setSelected(null);
  }, [matching, selected]);

  /* Totals for the line under the title — what is plotted, by kind. */
  const shown = useMemo(() => {
    const groups = matching.filter(isArtistGroup);
    const evs = matching.filter(isEventRow).length;
    return {
      artists: groups.reduce((n, g) => n + g.members.length, 0),
      spaces: matching.length - groups.length - evs,
      events: evs,
    };
  }, [matching]);

  /*
   * The list shows what is on screen — the map and the list never disagree.
   *
   * Leaflet's bounds take [lat, lng]; Google's take {lat, lng}. Both are given
   * a plain object, which Leaflet also accepts, so one call covers either
   * surface rather than the list needing to know which map is drawing.
   */
  const inView = useMemo(() => {
    if (!bounds || typeof bounds.contains !== "function") return matching;
    return matching.filter((r) => bounds.contains({ lat: r.geo_lat, lng: r.geo_lng }));
  }, [matching, bounds]);

  const onViewport = useCallback((b) => setBounds(b), []);
  const onGoogleUnavailable = useCallback(() => setGoogleFailed(true), []);
  const fitKey = `${city}|${kind}|${query.trim()}`;

  const choose = (row) => {
    setSelected(row);
    // Leaflet only: opening the popup waits for the fly and the cluster split.
    // Google opens its own InfoWindow from the selection.
    setTimeout(() => markers.current[row.id]?.openPopup?.(), 900);
  };

  const renderPopup = useCallback(
    (row) => isArtistGroup(row)
      ? <ArtistGroupPopup row={row} />
      : isEventRow(row)
      ? <EventPopup row={row} here={here} onLocated={setHere} />
      : <SpacePopup row={row} here={here} onLocated={setHere} />,
    [here]
  );
  const busy = loading || artistsLoading || eventsLoading;

  /* googleAuthFailed(): if Google has already refused the key on this page,
   * skip it rather than mount a map that will draw an error box and fall back. */
  const Surface =
    hasGoogleMaps() && !googleFailed && !googleAuthFailed()
      ? GoogleSpacesSurface
      : LeafletSpacesSurface;

  return (
    <div className="px-6 py-12 md:px-10">
      <p className="font-mono-caps text-[11px] text-muted-foreground">AFC — {title}</p>
      <h1 className="mt-3 font-heading text-5xl font-medium tracking-[-0.02em] md:text-6xl">
        {title}
      </h1>
      <p className="mt-3 font-mono-caps text-[11px] text-muted-foreground">
        {busy
          ? "Loading…"
          : includeArtists
            ? `${artistCountLabel(shown.artists)} · ${shown.spaces} places · ${shown.events} event${shown.events === 1 ? "" : "s"}`
            : `${matching.length} of ${rows.length} pinned`}
        {!busy && bounds && inView.length !== matching.length && ` · ${inView.length} in view`}
      </p>

      {/* filters */}
      <div className="mt-8 flex flex-wrap items-center gap-3">
        <div className="relative min-w-[240px] flex-1">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search by name, city or address"
            className="w-full border border-border bg-background py-3 pl-10 pr-4 text-base outline-none focus:border-primary"
          />
        </div>
        <select
          value={city}
          onChange={(e) => setCity(e.target.value)}
          className="border border-border bg-background px-3 py-3 font-mono-caps text-[11px] outline-none focus:border-primary"
        >
          {cities.map((c) => <option key={c} value={c}>{c === "All" ? "All cities" : c}</option>)}
        </select>
        {/* Wraps on a phone. With Directory (B11) and Events (B7) the row no
            longer fits 390px, and the page scrolled sideways. */}
        <div className="flex flex-wrap gap-2">
          {KIND_FILTERS.map((k) => (
            <button
              key={k}
              type="button"
              onClick={() => setKind(k)}
              className={`border px-3 py-2 font-mono-caps text-[10px] transition-colors ${
                kind === k
                  ? "border-foreground bg-foreground text-background"
                  : "border-border text-muted-foreground hover:border-foreground"
              }`}
            >
              {k}
            </button>
          ))}
        </div>
        {(query || city !== "All" || kind !== "All") && (
          <button
            type="button"
            onClick={() => { setQuery(""); setCity("All"); setKind("All"); }}
            className="flex items-center gap-1.5 border border-border px-3 py-2 font-mono-caps text-[10px] text-muted-foreground hover:border-primary hover:text-primary"
          >
            <X className="h-3 w-3" /> Clear
          </button>
        )}
      </div>

      <div className="mt-6 grid grid-cols-1 gap-6 lg:grid-cols-[1fr_360px]">
        {/* the map */}
        <div className="relative h-[520px] border border-border lg:h-[680px]">
          {busy ? (
            <div className="flex h-full items-center justify-center">
              <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
            </div>
          ) : (
            <Surface
              rows={matching}
              fitKey={fitKey}
              selected={selected}
              onSelect={setSelected}
              onViewportChange={onViewport}
              onLocated={setHere}
              renderPopup={renderPopup}
              markers={markers}
              onUnavailable={onGoogleUnavailable}
            />
          )}
        </div>

        {/* the list — the same rows, in view */}
        <div className="flex h-[520px] flex-col border border-border lg:h-[680px]">
          <p className="border-b border-border px-4 py-3 font-mono-caps text-[10px] text-muted-foreground">
            {busy ? "…" : `${inView.length} in view`}
          </p>
          <ul className="flex-1 divide-y divide-border overflow-y-auto">
            {!busy && inView.length === 0 && (
              <li className="px-4 py-6 text-sm text-muted-foreground">
                Nothing in view. Zoom out, or clear the filters.
              </li>
            )}
            {inView.map((r) => (
              <li key={r.id}>
                <button
                  type="button"
                  onClick={() => choose(r)}
                  className={`flex w-full items-start gap-3 px-4 py-3 text-left transition-colors hover:bg-muted/40 ${
                    selected?.id === r.id ? "bg-muted/60" : ""
                  }`}
                >
                  {r.avatar_url && (
                    <Image src={r.avatar_url} alt="" className="h-10 w-10 shrink-0 object-cover" />
                  )}
                  <span className="min-w-0 flex-1">
                    <span className="block truncate font-body text-sm">{r.display_name}</span>
                    <span className="block truncate font-mono-caps text-[10px] text-muted-foreground">
                      {isArtistGroup(r)
                        ? `Artists · ${artistCountLabel(r.members.length)}`
                        : isEventRow(r)
                        ? `Event · ${eventDateLabel(r.event)}`
                        : `${r.type}${r.based_in ? ` · ${r.based_in}` : ""}`}
                    </span>
                    {r.address && (
                      <span className="mt-0.5 block truncate text-xs text-muted-foreground/80">
                        {r.address}
                      </span>
                    )}
                  </span>
                </button>
              </li>
            ))}
          </ul>
          {/* Counted, never silently dropped: artists the map cannot place. */}
          {includeArtists && !busy && (kind === "All" || kind === "Artists") && artistGroups.unplaced.length > 0 && (
            <p className="border-t border-border px-4 py-3 font-mono-caps text-[10px] text-muted-foreground">
              + {artistCountLabel(artistGroups.unplaced.length)} without a chapter city
            </p>
          )}
        </div>
      </div>
    </div>
  );
}
