import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Link } from "react-router-dom";
import { MapContainer, TileLayer, Marker, Popup, useMap, useMapEvents } from "react-leaflet";
import Supercluster from "supercluster";
import L from "leaflet";
import "leaflet/dist/leaflet.css";
import { Crosshair, CornerUpRight, Search, X, Loader2 } from "lucide-react";
import { spacePath } from "@/lib/slugs";
import { isVenueType, VENUE_TYPES } from "@/lib/venueTypes";
import { Image } from "@/components/ui/image";
import { base44 } from "@/api/base44Client";
import { useDataRevision } from "@/lib/dataRevision";

/**
 * Every gallery and venue, pinned where it actually is.
 *
 * WHAT THIS REPLACES
 *
 * The old maps drew EIGHT dots — one per chapter city, from a hardcoded table
 * of coordinates — and bucketed listings by testing whether their address text
 * contained a chapter name. So 46 Zurich galleries collapsed onto one point in
 * the middle of Zurich, zooming in found nothing, and the 139 listings whose
 * address matched no chapter were dropped from the map entirely. Meanwhile
 * every listing already carried its own geo_lat/geo_lng, resolved from its
 * address by the Locate button, and no map read them.
 *
 * So: one marker per listing, at its own coordinates. Clustered, because 113
 * galleries in Los Angeles is a solid blot otherwise, and because a cluster
 * that says "113" tells you something a blot does not.
 *
 * THE LIST IS PART OF THE MAP
 *
 * The panel beside the map shows exactly what is in view, and the two are
 * linked both ways: click a row and the map flies to that pin and opens it;
 * pan the map and the list follows. A map you cannot read as a list is no use
 * for planning a visit — which is the point of the thing.
 *
 * TILES
 *
 * CARTO Positron, not raw OpenStreetMap. Pale grey suits the site, matches the
 * reference apps, and is far quicker than tile.openstreetmap.org, which is
 * rate-limited for exactly this kind of use and made zooming feel broken.
 */

/* Fetched in pages, because a single capped request silently drops rows once
 * the table outgrows the cap — see rule 8 in docs/ARTFUTURE-FULL-TEST.md. */
const PAGE = 500;
const COLUMNS =
  "id,display_name,type,based_in,address,avatar_url,slug,status,geo_lat,geo_lng";

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
/*
 * At module scope, so the default is the SAME array on every render. As a
 * default parameter it was rebuilt each time, and being an effect dependency
 * that re-ran the fetch, which set state, which re-rendered — an infinite
 * loop that hung verify:render outright.
 */
const DEFAULT_KINDS = ["Gallery", ...VENUE_TYPES];

const MIN_CITY_LISTINGS = 3;
const OTHER_CITIES = "Other";
const cityOf = (row) => {
  const first = String(row.based_in || "").split(",")[0].trim();
  // "Zurich (Kusnacht)" and "Boston (Allston)" are the same city as their parent.
  const paren = first.indexOf(" (");
  return (paren > 0 ? first.slice(0, paren) : first).trim();
};

/** Gallery or venue: the two icons the reference apps use. */
const pinIcon = (type, active) => {
  const venue = isVenueType(type);
  const fill = active ? "#000" : "#fff";
  const stroke = active ? "#fff" : "#111";
  const glyph = venue
    ? `<path d="M4 9h12M5 9v5M9 9v5M13 9v5M3.5 15h13M10 3.5 16 8H4z" fill="none" stroke="${stroke}" stroke-width="1.4" stroke-linecap="round"/>`
    : `<path d="m10 4.2 1.8 3.7 4 .6-2.9 2.8.7 4-3.6-1.9-3.6 1.9.7-4L4.2 8.5l4-.6z" fill="${stroke}"/>`;
  return L.divIcon({
    className: "afc-pin",
    html:
      `<svg width="30" height="38" viewBox="0 0 30 38" xmlns="http://www.w3.org/2000/svg">` +
      `<path d="M15 37C15 37 28 22.5 28 14A13 13 0 1 0 2 14c0 8.5 13 23 13 23z" fill="${fill}" stroke="#111" stroke-width="1.6"/>` +
      `<g transform="translate(5 4)">${glyph}</g></svg>`,
    iconSize: [30, 38],
    iconAnchor: [15, 37],
    popupAnchor: [0, -32],
  });
};

/**
 * A cluster bubble. Drawn here rather than by a plugin: the site is black and
 * white, and the count is the point — "113" tells a visitor something that a
 * coloured blob does not.
 */
const clusterIcon = (count) => {
  const size = count < 10 ? 34 : count < 100 ? 42 : 52;
  return L.divIcon({
    className: "afc-cluster",
    html:
      `<div style="width:${size}px;height:${size}px;border-radius:50%;background:#111;color:#fff;` +
      `display:flex;align-items:center;justify-content:center;font:600 ${count < 100 ? 13 : 12}px/1 ui-sans-serif,system-ui;` +
      `box-shadow:0 0 0 4px rgba(17,17,17,0.15)">${count}</div>`,
    iconSize: [size, size],
    iconAnchor: [size / 2, size / 2],
  });
};

/** Opens the visitor's own map app — Apple Maps on iOS, Google elsewhere. */
const directionsUrl = (row) =>
  row.address
    ? `https://www.google.com/maps/dir/?api=1&destination=${encodeURIComponent(row.address)}`
    : `https://www.google.com/maps/dir/?api=1&destination=${row.geo_lat},${row.geo_lng}`;

/** Frames the map on the rows it has, instead of a fixed world view. */
function FitToRows({ rows, fitKey }) {
  const map = useMap();
  useEffect(() => {
    if (!rows.length) return;
    const bounds = L.latLngBounds(rows.map((r) => [r.geo_lat, r.geo_lng]));
    // A single pin has no extent, so bounds would zoom to maximum.
    if (rows.length === 1) map.setView(bounds.getCenter(), 16, { animate: true });
    else map.fitBounds(bounds, { padding: [48, 48], maxZoom: 15, animate: true });
  }, [map, fitKey, rows]);
  return null;
}

/** Reports what is on screen, so the list can show the same rows. */
function ReportViewport({ onChange }) {
  const map = useMapEvents({
    moveend: () => onChange(map.getBounds(), map.getZoom()),
    zoomend: () => onChange(map.getBounds(), map.getZoom()),
  });
  useEffect(() => {
    onChange(map.getBounds(), map.getZoom());
    // Once, after mount: fitBounds fires moveend for every change after that.
  }, [map, onChange]);
  return null;
}

/** What a pin shows when tapped: who it is, where, and how to get there. */
function SpacePopup({ row: r }) {
  return (
  <div className="min-w-[190px]">
    <div className="flex items-start gap-3">
      {r.avatar_url && (
        <Image
          src={r.avatar_url}
          alt=""
          className="h-12 w-12 shrink-0 object-cover"
        />
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
    <a
      href={directionsUrl(r)}
      target="_blank"
      rel="noopener noreferrer"
      className="mt-3 inline-flex items-center gap-1.5 border border-border px-3 py-1.5 font-mono-caps text-[10px] hover:border-primary hover:text-primary"
    >
      <CornerUpRight className="h-3 w-3" /> Directions
    </a>
  </div>
  );
}

/** Zooming into a cluster, when one is tapped. */
function useZoomTo() {
  const map = useMap();
  return (lat, lng, zoom) => map.flyTo([lat, lng], zoom, { duration: 0.6 });
}

/** The cluster and pin layer. Kept inside MapContainer so it can use the map. */
function Pins({ index, bounds, zoom, matching, selected, setSelected, markers }) {
  const zoomTo = useZoomTo();

  const cells = useMemo(() => {
    if (!index || !bounds) return [];
    const west = bounds.getWest();
    const south = bounds.getSouth();
    const east = bounds.getEast();
    const north = bounds.getNorth();
    // getClusters wants a plain bbox; clamp so a world-wrapped view is still valid.
    return index.getClusters(
      [Math.max(west, -180), Math.max(south, -85), Math.min(east, 180), Math.min(north, 85)],
      Math.round(zoom)
    );
  }, [index, bounds, zoom]);

  return (
    <>
      {cells.map((c) => {
        const [lng, lat] = c.geometry.coordinates;
        if (c.properties.cluster) {
          const count = c.properties.point_count;
          return (
            <Marker
              key={`c${c.id}`}
              position={[lat, lng]}
              icon={clusterIcon(count)}
              eventHandlers={{
                click: () => zoomTo(lat, lng, Math.min(index.getClusterExpansionZoom(c.id), 18)),
              }}
            />
          );
        }
        const r = c.properties.row;
        return (
          <Marker
            key={r.id}
            position={[lat, lng]}
            icon={pinIcon(r.type, selected?.id === r.id)}
            ref={(m) => { if (m) markers.current[r.id] = m; }}
            eventHandlers={{ click: () => setSelected(r) }}
          >
            <Popup>
              <SpacePopup row={r} />
            </Popup>
          </Marker>
        );
      })}
    </>
  );
}

/** The "find me" control, kept out of the map's own control cluster. */
function LocateMe({ onFound }) {
  const map = useMap();
  const [busy, setBusy] = useState(false);
  const locate = () => {
    if (!navigator.geolocation) return;
    setBusy(true);
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        setBusy(false);
        const here = [pos.coords.latitude, pos.coords.longitude];
        map.setView(here, 14, { animate: true });
        onFound?.(here);
      },
      () => setBusy(false),
      { enableHighAccuracy: true, timeout: 10000 }
    );
  };
  return (
    <button
      type="button"
      onClick={locate}
      aria-label="Show my location"
      className="absolute bottom-6 right-6 z-[1000] flex h-11 w-11 items-center justify-center border border-border bg-background shadow-sm transition-colors hover:border-primary hover:text-primary"
    >
      {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Crosshair className="h-4 w-4" />}
    </button>
  );
}

/** Flies to one listing when it is chosen from the list. */
function FlyTo({ target }) {
  const map = useMap();
  useEffect(() => {
    if (target) map.flyTo([target.geo_lat, target.geo_lng], Math.max(map.getZoom(), 16), { duration: 0.8 });
  }, [map, target]);
  return null;
}

export default function SpacesMap({ kinds = DEFAULT_KINDS, title = "Map" }) {
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(true);
  const [query, setQuery] = useState("");
  const [city, setCity] = useState("All");
  const [kind, setKind] = useState("All");
  const [bounds, setBounds] = useState(null);
  const [zoom, setZoom] = useState(2);
  const [selected, setSelected] = useState(null);
  const markers = useRef({});
  /* The contents, not the array identity: a caller passing an inline array
   * would otherwise hand the effect a new dependency on every render. */
  const kindsKey = kinds.join(",");

  /* A read-only listing, so it refetches on any write and on regaining focus.
   * No editable form state here, so the warning in dataRevision.js about
   * refetching under a form does not apply. */
  const rev = useDataRevision();

  useEffect(() => {
    let alive = true;
    (async () => {
      /* Every page, not the first one. */
      const all = [];
      for (let offset = 0; ; offset += PAGE) {
        const { rows: page, count } = await base44.entities.CollectorProfile.page({
          where: { type: { $in: kinds }, status: "approved" },
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

  /* Cities worth a row, biggest first — that is where the galleries are. */
  const cities = useMemo(() => {
    const counts = {};
    for (const r of rows) {
      const c = cityOf(r);
      if (c) counts[c] = (counts[c] || 0) + 1;
    }
    const big = Object.entries(counts)
      .filter(([, n]) => n >= MIN_CITY_LISTINGS)
      .sort((a, b) => b[1] - a[1])
      .map(([c]) => c);
    const hasOther = Object.values(counts).some((n) => n < MIN_CITY_LISTINGS);
    return ["All", ...big, ...(hasOther ? [OTHER_CITIES] : [])];
  }, [rows]);

  /* What the map should show. The list then narrows this to the viewport. */
  const matching = useMemo(() => {
    const q = query.trim().toLowerCase();
    return rows.filter((r) => {
      if (city === OTHER_CITIES) {
        if (cities.includes(cityOf(r))) return false;
      } else if (city !== "All" && cityOf(r) !== city) return false;
      if (kind === "Galleries" && isVenueType(r.type)) return false;
      if (kind === "Venues" && !isVenueType(r.type)) return false;
      if (q && !`${r.display_name} ${r.based_in || ""} ${r.address || ""}`.toLowerCase().includes(q))
        return false;
      return true;
    });
  }, [rows, query, city, kind, cities]);

  /* The list shows what is on screen — the map and the list never disagree. */
  const inView = useMemo(() => {
    if (!bounds) return matching;
    return matching.filter((r) => bounds.contains([r.geo_lat, r.geo_lng]));
  }, [matching, bounds]);

  const onViewport = useCallback((b, z) => {
    setBounds(b);
    setZoom(z);
  }, []);
  /*
   * Clustering is computed here rather than by a Leaflet plugin.
   * react-leaflet-markercluster hangs outright under jsdom, which took the
   * whole render smoke test with it; supercluster is plain arithmetic over
   * coordinates with no DOM at all, so it runs anywhere and lets the bubbles
   * be drawn in the site's own black and white.
   */
  const index = useMemo(() => {
    const sc = new Supercluster({ radius: 60, maxZoom: 17, minPoints: 2 });
    sc.load(
      matching.map((r) => ({
        type: "Feature",
        properties: { row: r },
        geometry: { type: "Point", coordinates: [r.geo_lng, r.geo_lat] },
      }))
    );
    return sc;
  }, [matching]);

  const fitKey = `${city}|${kind}|${query.trim()}`;

  const choose = (row) => {
    setSelected(row);
    // Opening the popup has to wait for flyTo, and for the cluster to split.
    setTimeout(() => markers.current[row.id]?.openPopup?.(), 900);
  };

  return (
    <div className="px-6 py-12 md:px-10">
      <p className="font-mono-caps text-[11px] text-muted-foreground">AFC — {title}</p>
      <h1 className="mt-3 font-heading text-5xl font-medium tracking-[-0.02em] md:text-6xl">
        {title}
      </h1>
      <p className="mt-3 font-mono-caps text-[11px] text-muted-foreground">
        {loading ? "Loading…" : `${matching.length} of ${rows.length} pinned`}
        {!loading && bounds && inView.length !== matching.length && ` · ${inView.length} in view`}
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
        <div className="flex gap-2">
          {["All", "Galleries", "Venues"].map((k) => (
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
          {loading ? (
            <div className="flex h-full items-center justify-center">
              <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
            </div>
          ) : (
            <MapContainer
              center={[20, 0]}
              zoom={2}
              scrollWheelZoom
              style={{ height: "100%", width: "100%" }}
            >
              <TileLayer
                url="https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}{r}.png"
                attribution='&copy; <a href="https://openstreetmap.org/copyright">OpenStreetMap</a> &copy; <a href="https://carto.com/attributions">CARTO</a>'
                maxZoom={20}
              />
              <FitToRows rows={matching} fitKey={fitKey} />
              <ReportViewport onChange={onViewport} />
              <FlyTo target={selected} />
              <LocateMe />
              <Pins
                index={index}
                bounds={bounds}
                zoom={zoom}
                matching={matching}
                selected={selected}
                setSelected={setSelected}
                markers={markers}
              />
            </MapContainer>
          )}
        </div>

        {/* the list — the same rows, in view */}
        <div className="flex h-[520px] flex-col border border-border lg:h-[680px]">
          <p className="border-b border-border px-4 py-3 font-mono-caps text-[10px] text-muted-foreground">
            {loading ? "…" : `${inView.length} in view`}
          </p>
          <ul className="flex-1 divide-y divide-border overflow-y-auto">
            {!loading && inView.length === 0 && (
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
                      {r.type}{r.based_in ? ` · ${r.based_in}` : ""}
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
        </div>
      </div>
    </div>
  );
}
