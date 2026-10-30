import { base44 } from "@/api/base44Client";

/**
 * Where an event is, for the map (B7 in docs/CLIENT-REQUESTS.md).
 *
 * In order of trust:
 *   1. `pin` — the gallery's own position, when a gallery adds an exhibition.
 *   2. The pin of the listing whose name IS the venue (ignoring capitals and
 *      spaces). On live this places 52 of 53 upcoming events — on the very
 *      pin the venue's own page uses.
 *   3. The address, looked up the same way the gallery editor's Locate
 *      button does (the geocodeAddress function).
 *
 * Returns { geo_lat, geo_lng }, or {} when nothing can place it. Never
 * throws: an event that cannot be placed is still saved — it just is not on
 * the map until its venue or address is.
 */
export async function placeEvent({ venue, address, pin } = {}) {
  const num = (v) => (v == null || v === "" ? null : Number(v));
  if (pin && num(pin.geo_lat) != null && num(pin.geo_lng) != null) {
    return { geo_lat: num(pin.geo_lat), geo_lng: num(pin.geo_lng) };
  }

  const name = String(venue || "").trim().toLowerCase();
  if (name) {
    try {
      const { rows } = await base44.entities.CollectorProfile.page({
        where: { status: "approved" },
        search: { q: String(venue).trim(), columns: ["display_name"] },
        columns: "id,display_name,geo_lat,geo_lng",
        limit: 25,
      });
      const same = (rows || []).filter((r) => String(r.display_name || "").trim().toLowerCase() === name && r.geo_lat != null && r.geo_lng != null);
      // Two listings of the same name in different places: ambiguous, so
      // fall through to the address rather than guess.
      const places = new Set(same.map((r) => `${r.geo_lat},${r.geo_lng}`));
      if (places.size === 1) return { geo_lat: Number(same[0].geo_lat), geo_lng: Number(same[0].geo_lng) };
    } catch {
      /* fall through to the address */
    }
  }

  const addr = String(address || "").trim();
  if (addr) {
    try {
      const res = await base44.functions.invoke("geocodeAddress", { address: addr });
      const hit = res?.data || res;
      const lat = num(hit?.lat), lng = num(hit?.lng);
      if (!res?.error && lat != null && lng != null && Number.isFinite(lat) && Number.isFinite(lng)) {
        return { geo_lat: lat, geo_lng: lng };
      }
    } catch {
      /* not placed */
    }
  }
  return {};
}

/**
 * The position to save with an event, given what changed. A new event, or
 * one whose venue or address changed, is placed again; an edit that leaves
 * both alone keeps the position it has (an admin may have corrected it).
 */
export async function eventPosition(next, prev = null, pin = null) {
  const moved = !prev
    || String(prev.venue || "").trim() !== String(next.venue || "").trim()
    || String(prev.address || "").trim() !== String(next.address || "").trim()
    || prev.geo_lat == null;
  if (!moved) return {};
  const place = await placeEvent({ venue: next.venue, address: next.address, pin });
  // Moved but now unplaceable: clear the old position rather than leave the
  // event on the map somewhere it no longer is.
  return Object.keys(place).length ? place : prev ? { geo_lat: null, geo_lng: null } : {};
}
