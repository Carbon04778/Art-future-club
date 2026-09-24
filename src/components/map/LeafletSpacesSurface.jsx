import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { MapContainer, TileLayer, Marker, Popup, useMap, useMapEvents } from "react-leaflet";
import Supercluster from "supercluster";
import L from "leaflet";
import "leaflet/dist/leaflet.css";
import { Crosshair, Loader2 } from "lucide-react";
import { isVenueType } from "@/lib/venueTypes";

/**
 * The map surface, on Leaflet — used when there is no Google Maps key.
 *
 * WHEN THIS DRAWS
 *
 * The test environment, a developer without a key, or a deploy where the
 * variable was not set. Also whenever Google refuses at runtime: a referrer
 * that is not on the key's list, or a quota that has run out. A missing key
 * degrades the map; it never empties the page.
 *
 * Same props as GoogleSpacesSurface, so SpacesMap does not care which is
 * drawing. The data, filters and list live there, not here.
 *
 * TILES
 *
 * Esri's World Light Gray Canvas, base plus a labels overlay. NOT CARTO, which
 * now requires a key and serves tiles with API KEY REQUIRED painted across
 * them — at HTTP 200, so no status check could tell. NOT raw
 * tile.openstreetmap.org either: rate-limited for exactly this use, which is
 * what made zooming feel broken.
 */

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

function FlyTo({ target }) {
  const map = useMap();
  useEffect(() => {
    if (target) map.flyTo([target.geo_lat, target.geo_lng], Math.max(map.getZoom(), 16), { duration: 0.8 });
  }, [map, target]);
  return null;
}

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

/**
 * Clustering with supercluster, not a Leaflet plugin.
 * react-leaflet-markercluster hangs outright under jsdom and took the whole
 * render smoke test with it; supercluster is arithmetic over coordinates with
 * no DOM, so it runs anywhere.
 */
function Pins({ index, bounds, zoom, selected, onSelect, markers, renderPopup }) {
  const map = useMap();

  const cells = useMemo(() => {
    if (!index || !bounds) return [];
    const west = bounds.getWest();
    const south = bounds.getSouth();
    const east = bounds.getEast();
    const north = bounds.getNorth();
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
                click: () =>
                  map.flyTo([lat, lng], Math.min(index.getClusterExpansionZoom(c.id), 18), { duration: 0.6 }),
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
            eventHandlers={{ click: () => onSelect?.(r) }}
          >
            <Popup>{renderPopup(r)}</Popup>
          </Marker>
        );
      })}
    </>
  );
}

export default function LeafletSpacesSurface({
  rows,
  fitKey,
  selected,
  onSelect,
  onViewportChange,
  onLocated,
  renderPopup,
  markers,
}) {
  const [bounds, setBounds] = useState(null);
  const [zoom, setZoom] = useState(2);
  const fallbackMarkers = useRef({});
  const markerStore = markers || fallbackMarkers;

  const index = useMemo(() => {
    const sc = new Supercluster({ radius: 60, maxZoom: 17, minPoints: 2 });
    sc.load(
      rows.map((r) => ({
        type: "Feature",
        properties: { row: r },
        geometry: { type: "Point", coordinates: [r.geo_lng, r.geo_lat] },
      }))
    );
    return sc;
  }, [rows]);

  /*
   * Stable, or ReportViewport never stops. Its effect depends on this
   * callback; as a plain function it was rebuilt every render, so the effect
   * re-ran, set state, re-rendered, and went round again — "Maximum update
   * depth exceeded", and both map routes failed the render smoke test.
   */
  const report = useCallback(
    (b, z) => {
      setBounds(b);
      setZoom(z);
      onViewportChange?.(b, z);
    },
    [onViewportChange]
  );

  return (
    <MapContainer center={[20, 0]} zoom={2} scrollWheelZoom style={{ height: "100%", width: "100%" }}>
      <TileLayer
        url="https://server.arcgisonline.com/ArcGIS/rest/services/Canvas/World_Light_Gray_Base/MapServer/tile/{z}/{y}/{x}"
        attribution="Tiles &copy; Esri &mdash; Esri, DeLorme, NAVTEQ"
        maxZoom={19}
      />
      {/* Street and place names, so a visitor can actually navigate. */}
      <TileLayer
        url="https://server.arcgisonline.com/ArcGIS/rest/services/Canvas/World_Light_Gray_Reference/MapServer/tile/{z}/{y}/{x}"
        maxZoom={19}
      />
      <FitToRows rows={rows} fitKey={fitKey} />
      <ReportViewport onChange={report} />
      <FlyTo target={selected} />
      <LocateMe onFound={onLocated} />
      <Pins
        index={index}
        bounds={bounds}
        zoom={zoom}
        selected={selected}
        onSelect={onSelect}
        markers={markerStore}
        renderPopup={renderPopup}
      />
    </MapContainer>
  );
}
