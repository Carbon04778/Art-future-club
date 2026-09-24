/**
 * Links that hand a listing over to the visitor's own map app.
 *
 * WHY WE SEND THE ORIGIN
 *
 * The directions link used to name only the destination, leaving Google to
 * work out where the visitor was. On a phone that usually works. On a desktop
 * it often does not, and Google answers:
 *
 *   Sorry, we could not calculate directions from "Your location" to
 *   "3311 E Pico Blvd, Los Angeles, CA 90023, USA"
 *
 * The destination was resolved perfectly — it was the origin Google could not
 * fill in. So we fill it in: the browser gives us the visitor's coordinates
 * and we put them in the URL, and Google has nothing left to guess.
 *
 * Asking is the visitor's choice, and the caller only asks when they press
 * Directions — never on page load. If they decline, the link is built without
 * an origin, which is exactly what it did before: no worse, and still fine on
 * a phone.
 */

const GOOGLE_DIRECTIONS = "https://www.google.com/maps/dir/";

/**
 * Where to send someone. The written address is preferred over our own
 * coordinates: Google's address data is far better than ours, and for a
 * gallery on the ninth floor of a Hong Kong tower our pin is only the street
 * while Google knows the building. Coordinates are the fallback for a listing
 * with no address.
 */
export const destinationOf = (row) =>
  row?.address?.trim() ? row.address.trim() : `${row?.geo_lat},${row?.geo_lng}`;

/**
 * A Google Maps directions link.
 *
 * @param {object} row            the listing
 * @param {[number, number]|null} origin  the visitor's [lat, lng], if known
 * @returns {string}
 */
export function directionsUrl(row, origin) {
  const params = new URLSearchParams({ api: "1", destination: destinationOf(row) });
  if (Array.isArray(origin) && Number.isFinite(origin[0]) && Number.isFinite(origin[1])) {
    params.set("origin", `${origin[0]},${origin[1]}`);
  }
  return `${GOOGLE_DIRECTIONS}?${params.toString()}`;
}
