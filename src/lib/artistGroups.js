/**
 * Artists on the map: one marker per chapter city.
 *
 * Artists carry a chapter, not an address, so the honest place to put them is
 * their city — and many would not want a studio address on a public map
 * anyway. Each city becomes ONE row, shaped like a gallery row (id, type,
 * geo_lat/geo_lng), so the shared map, its clustering, the list beside it and
 * the Google/Leaflet fallback all handle it without a second code path.
 *
 * The city positions come from chaptersData.js — the same source as the
 * chapter pages — rather than a second hard-coded table that could drift.
 */
import { CHAPTERS } from "@/lib/chaptersData";

/** The `type` an artist-group row carries, so pins and popups can tell. */
export const ARTISTS_TYPE = "Artists";

export const isArtistGroup = (row) => row?.type === ARTISTS_TYPE;

/** "22.3193°N / 114.1694°E" -> { lat: 22.3193, lng: 114.1694 }; null if unreadable. */
export function parseCoords(text) {
  const m = String(text || "").match(/(-?[\d.]+)\s*°?\s*([NS])\s*\/\s*(-?[\d.]+)\s*°?\s*([EW])/i);
  if (!m) return null;
  const lat = Number(m[1]) * (m[2].toUpperCase() === "S" ? -1 : 1);
  const lng = Number(m[3]) * (m[4].toUpperCase() === "W" ? -1 : 1);
  return Number.isFinite(lat) && Number.isFinite(lng) ? { lat, lng } : null;
}

/** Chapter city -> its position, built once. */
const CITY_POSITION = Object.fromEntries(
  CHAPTERS.map((c) => [c.city, parseCoords(c.coords)]).filter(([, p]) => p)
);

/**
 * Group artists into one map row per city.
 *
 * Returns { groups, unplaced }: `unplaced` are artists with no chapter, or a
 * chapter the map has no position for — counted, not silently dropped.
 */
export function groupArtistsByCity(artists, positions = CITY_POSITION) {
  const byCity = new Map();
  const unplaced = [];
  for (const a of artists) {
    const city = String(a.chapter || "").trim();
    const at = positions[city];
    if (!at) { unplaced.push(a); continue; }
    if (!byCity.has(city)) byCity.set(city, []);
    byCity.get(city).push(a);
  }
  const groups = [...byCity.entries()]
    .sort((a, b) => b[1].length - a[1].length)
    .map(([city, members]) => ({
      id: `artists:${city}`,
      type: ARTISTS_TYPE,
      display_name: city,
      based_in: city,
      geo_lat: positions[city].lat,
      geo_lng: positions[city].lng,
      members: [...members].sort((x, y) => String(x.display_name).localeCompare(String(y.display_name))),
    }));
  return { groups, unplaced };
}

export const artistCountLabel = (n) => `${n} artist${n === 1 ? "" : "s"}`;
