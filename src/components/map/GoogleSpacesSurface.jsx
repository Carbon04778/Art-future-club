import React, { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { MarkerClusterer } from "@googlemaps/markerclusterer";
import { Crosshair, Loader2 } from "lucide-react";
import { loadGoogleMaps, MONOCHROME_STYLE, onGoogleAuthFailure } from "@/lib/googleMaps";
import { isVenueType } from "@/lib/venueTypes";

/**
 * The map itself, on Google Maps.
 *
 * Only the SURFACE lives here — the pins, the clustering and the viewport. The
 * data, the filters and the list beside it stay in SpacesMap, which is where
 * they were, so there is one copy of that logic whichever map is drawing.
 * LeafletSpacesSurface answers the same props for the no-key case.
 *
 * WHY GOOGLE AT ALL
 *
 * Because the owner asked for directions that are exact, and Google knows the
 * buildings. Our own geocoder can place a Hong Kong gallery on the right
 * street; Google knows which tower it is in. The map people already recognise
 * is also the one they trust to walk them there.
 *
 * WHAT IS DELIBERATELY NOT HERE
 *
 * Routes drawn on the page. That needs the Routes API, a second paid service,
 * and it competes with the phone's own Maps app, which does it better with
 * voice and live rerouting. The Directions button hands off instead, and
 * carries the visitor's own position as the origin.
 */

/** A pin, drawn to match the Leaflet one so the two maps look like one product. */
function pinElement(row, active) {
  const venue = isVenueType(row.type);
  const fill = active ? "#000" : "#fff";
  const stroke = active ? "#fff" : "#111";
  const glyph = venue
    ? `<path d="M4 9h12M5 9v5M9 9v5M13 9v5M3.5 15h13M10 3.5 16 8H4z" fill="none" stroke="${stroke}" stroke-width="1.4" stroke-linecap="round"/>`
    : `<path d="m10 4.2 1.8 3.7 4 .6-2.9 2.8.7 4-3.6-1.9-3.6 1.9.7-4L4.2 8.5l4-.6z" fill="${stroke}"/>`;
  const el = document.createElement("div");
  el.innerHTML =
    `<svg width="30" height="38" viewBox="0 0 30 38" xmlns="http://www.w3.org/2000/svg" style="display:block">` +
    `<path d="M15 37C15 37 28 22.5 28 14A13 13 0 1 0 2 14c0 8.5 13 23 13 23z" fill="${fill}" stroke="#111" stroke-width="1.6"/>` +
    `<g transform="translate(5 4)">${glyph}</g></svg>`;
  return el;
}

/** A cluster bubble, in the site's black rather than Google's defaults. */
function clusterElement(count) {
  const size = count < 10 ? 34 : count < 100 ? 42 : 52;
  const el = document.createElement("div");
  el.style.cssText =
    `width:${size}px;height:${size}px;border-radius:50%;background:#111;color:#fff;` +
    `display:flex;align-items:center;justify-content:center;` +
    `font:600 ${count < 100 ? 13 : 12}px/1 ui-sans-serif,system-ui;` +
    `box-shadow:0 0 0 4px rgba(17,17,17,0.15)`;
  el.textContent = String(count);
  return el;
}

export default function GoogleSpacesSurface({
  rows,
  fitKey,
  selected,
  onSelect,
  onViewportChange,
  onLocated,
  renderPopup,
  onUnavailable,
}) {
  const hostRef = useRef(null);
  const mapRef = useRef(null);
  const gRef = useRef(null);
  const markersRef = useRef(new Map());
  const clustererRef = useRef(null);
  const infoRef = useRef(null);
  const [ready, setReady] = useState(false);
  const [locating, setLocating] = useState(false);
  /* The InfoWindow's content is a real DOM node we own, so the popup can stay
   * React — with working <Link>s — instead of an HTML string that would force
   * a full page load on every click. */
  const [popupHost, setPopupHost] = useState(null);
  const [popupRow, setPopupRow] = useState(null);

  /*
   * Google refuses the key AFTER the library has loaded — a wrong referrer,
   * no billing, an unactivated API. The loader resolves, then Google covers
   * the map with its own error box. This is the only hook that hears it.
   */
  useEffect(() => onGoogleAuthFailure(() => onUnavailable?.(new Error("Google refused the key"))), [onUnavailable]);

  /* Create the map once. */
  useEffect(() => {
    let alive = true;
    loadGoogleMaps()
      .then(({ maps }) => {
        if (!alive || !hostRef.current) return;
        gRef.current = window.google.maps;
        mapRef.current = new maps.Map(hostRef.current, {
          center: { lat: 20, lng: 0 },
          zoom: 2,
          styles: MONOCHROME_STYLE,
          mapTypeControl: false,
          streetViewControl: false,
          fullscreenControl: false,
          clickableIcons: false,
        });
        infoRef.current = new gRef.current.InfoWindow();
        infoRef.current.addListener("closeclick", () => setPopupRow(null));

        const report = () => {
          const b = mapRef.current.getBounds();
          if (b) onViewportChange?.(b, mapRef.current.getZoom());
        };
        mapRef.current.addListener("idle", report);
        setReady(true);
      })
      .catch((err) => {
        // No key, refused referrer, network — fall back rather than show a hole.
        if (alive) onUnavailable?.(err);
      });
    return () => { alive = false; };
  }, [onViewportChange, onUnavailable]);

  /* Markers and clustering, rebuilt when the plotted set changes. */
  useEffect(() => {
    if (!ready || !mapRef.current) return;
    const g = gRef.current;
    clustererRef.current?.clearMarkers();
    markersRef.current.clear();

    const markers = rows.map((row) => {
      const marker = new g.marker.AdvancedMarkerElement({
        position: { lat: row.geo_lat, lng: row.geo_lng },
        content: pinElement(row, selected?.id === row.id),
      });
      marker.addListener("gmp-click", () => onSelect?.(row));
      markersRef.current.set(row.id, marker);
      return marker;
    });

    clustererRef.current = new MarkerClusterer({
      map: mapRef.current,
      markers,
      renderer: {
        render: ({ count, position }) =>
          new g.marker.AdvancedMarkerElement({ position, content: clusterElement(count) }),
      },
    });

    return () => clustererRef.current?.clearMarkers();
  }, [ready, rows, selected, onSelect]);

  /* Frame the map on what it is showing. */
  useEffect(() => {
    if (!ready || !mapRef.current || !rows.length) return;
    const g = gRef.current;
    const bounds = new g.LatLngBounds();
    rows.forEach((r) => bounds.extend({ lat: r.geo_lat, lng: r.geo_lng }));
    if (rows.length === 1) {
      mapRef.current.setCenter(bounds.getCenter());
      mapRef.current.setZoom(16);
    } else {
      mapRef.current.fitBounds(bounds, 48);
    }
  }, [ready, fitKey, rows]);

  /* Open the chosen listing: fly to it, and show its popup. */
  useEffect(() => {
    if (!ready || !selected || !mapRef.current) return;
    mapRef.current.panTo({ lat: selected.geo_lat, lng: selected.geo_lng });
    if (mapRef.current.getZoom() < 16) mapRef.current.setZoom(16);

    const host = document.createElement("div");
    infoRef.current.setContent(host);
    infoRef.current.setPosition({ lat: selected.geo_lat, lng: selected.geo_lng });
    infoRef.current.open(mapRef.current);
    setPopupHost(host);
    setPopupRow(selected);
  }, [ready, selected]);

  const locate = () => {
    if (!navigator.geolocation) return;
    setLocating(true);
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        setLocating(false);
        const at = [pos.coords.latitude, pos.coords.longitude];
        onLocated?.(at);
        mapRef.current?.setCenter({ lat: at[0], lng: at[1] });
        mapRef.current?.setZoom(14);
      },
      () => setLocating(false),
      { enableHighAccuracy: true, timeout: 10000 }
    );
  };

  return (
    <div className="relative h-full w-full">
      <div ref={hostRef} className="h-full w-full" />
      {!ready && (
        <div className="absolute inset-0 flex items-center justify-center bg-background/60">
          <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
        </div>
      )}
      <button
        type="button"
        onClick={locate}
        aria-label="Show my location"
        className="absolute bottom-6 right-6 z-10 flex h-11 w-11 items-center justify-center border border-border bg-background shadow-sm transition-colors hover:border-primary hover:text-primary"
      >
        {locating ? <Loader2 className="h-4 w-4 animate-spin" /> : <Crosshair className="h-4 w-4" />}
      </button>
      {/* The popup, rendered by React into the InfoWindow's own node. */}
      {popupHost && popupRow && createPortal(renderPopup(popupRow), popupHost)}
    </div>
  );
}
