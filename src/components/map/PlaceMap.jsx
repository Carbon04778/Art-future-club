import React, { useEffect, useRef, useState } from "react";
import { MapContainer, TileLayer, Marker } from "react-leaflet";
import L from "leaflet";
import "leaflet/dist/leaflet.css";
import { loadGoogleMaps, MONOCHROME_STYLE, hasGoogleMaps } from "@/lib/googleMaps";
import { isVenueType } from "@/lib/venueTypes";

/**
 * One place, on a map. Used on a gallery or venue profile.
 *
 * Google where there is a key, Leaflet where there is not — the same pair as
 * SpacesMap, so a profile map and the big map look like the same product.
 *
 * WHY THE COORDINATES COME FROM THE PROFILE
 *
 * This used to geocode the address through Nominatim on EVERY page view, even
 * though the listing already stores geo_lat and geo_lng, resolved once by the
 * Locate button. Three things wrong with that: it is a network round trip per
 * visitor for an answer we already have, Nominatim's policy is about one
 * request a second so any real traffic would be throttled or blocked, and its
 * result could differ from the pin an admin had deliberately placed.
 *
 * So: the stored coordinates are used. Geocoding remains only as a fallback
 * for a listing that has an address but was never located — 19 of those were
 * backfilled on 2026-09-23, but a new one can be created at any time.
 */

const pinSvg = (type) => {
  const venue = isVenueType(type);
  const glyph = venue
    ? `<path d="M4 9h12M5 9v5M9 9v5M13 9v5M3.5 15h13M10 3.5 16 8H4z" fill="none" stroke="#111" stroke-width="1.4" stroke-linecap="round"/>`
    : `<path d="m10 4.2 1.8 3.7 4 .6-2.9 2.8.7 4-3.6-1.9-3.6 1.9.7-4L4.2 8.5l4-.6z" fill="#111"/>`;
  return (
    `<svg width="30" height="38" viewBox="0 0 30 38" xmlns="http://www.w3.org/2000/svg" style="display:block">` +
    `<path d="M15 37C15 37 28 22.5 28 14A13 13 0 1 0 2 14c0 8.5 13 23 13 23z" fill="#fff" stroke="#111" stroke-width="1.6"/>` +
    `<g transform="translate(5 4)">${glyph}</g></svg>`
  );
};

function GooglePlace({ lat, lng, type, onUnavailable }) {
  const hostRef = useRef(null);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    let alive = true;
    loadGoogleMaps()
      .then(({ maps }) => {
        if (!alive || !hostRef.current) return;
        const map = new maps.Map(hostRef.current, {
          center: { lat, lng },
          zoom: 16,
          styles: MONOCHROME_STYLE,
          mapTypeControl: false,
          streetViewControl: false,
          fullscreenControl: false,
          clickableIcons: false,
        });
        const el = document.createElement("div");
        el.innerHTML = pinSvg(type);
        new window.google.maps.marker.AdvancedMarkerElement({
          map,
          position: { lat, lng },
          content: el,
        });
        setReady(true);
      })
      .catch((err) => alive && onUnavailable?.(err));
    return () => { alive = false; };
  }, [lat, lng, type, onUnavailable]);

  return (
    <div className="relative h-full w-full">
      <div ref={hostRef} className="h-full w-full" />
      {!ready && (
        <div className="absolute inset-0 flex items-center justify-center font-mono-caps text-[11px] text-muted-foreground">
          Loading map…
        </div>
      )}
    </div>
  );
}

function LeafletPlace({ lat, lng, type }) {
  const icon = L.divIcon({
    className: "afc-pin",
    html: pinSvg(type),
    iconSize: [30, 38],
    iconAnchor: [15, 37],
  });
  return (
    <MapContainer center={[lat, lng]} zoom={16} scrollWheelZoom={false} style={{ height: "100%", width: "100%" }}>
      <TileLayer
        url="https://server.arcgisonline.com/ArcGIS/rest/services/Canvas/World_Light_Gray_Base/MapServer/tile/{z}/{y}/{x}"
        attribution="Tiles &copy; Esri &mdash; Esri, DeLorme, NAVTEQ"
        maxZoom={19}
      />
      <TileLayer
        url="https://server.arcgisonline.com/ArcGIS/rest/services/Canvas/World_Light_Gray_Reference/MapServer/tile/{z}/{y}/{x}"
        maxZoom={19}
      />
      <Marker position={[lat, lng]} icon={icon} />
    </MapContainer>
  );
}

export default function PlaceMap({ lat, lng, type }) {
  const [googleFailed, setGoogleFailed] = useState(false);
  if (lat == null || lng == null) return null;
  if (hasGoogleMaps() && !googleFailed) {
    return <GooglePlace lat={lat} lng={lng} type={type} onUnavailable={() => setGoogleFailed(true)} />;
  }
  return <LeafletPlace lat={lat} lng={lng} type={type} />;
}
