/**
 * Events as map rows (B7 in docs/CLIENT-REQUESTS.md).
 *
 * The map draws rows that look like listings: an id, a type, a name and a
 * position. An event becomes one such row, typed EVENT_TYPE so the map can
 * give it its own pin and popup. Only events that are on now or coming up,
 * and that have a position (migration 030, or placed when saved).
 */
export const EVENT_TYPE = "Event";
export const isEventRow = (row) => row?.type === EVENT_TYPE;

/** "12 Nov 2026", or "12 Nov – 3 Dec 2026" for a run. */
export function eventDateLabel(ev) {
  const start = ev?.start_date ? new Date(ev.start_date) : null;
  if (!start || isNaN(start)) return "";
  const end = ev?.end_date ? new Date(ev.end_date) : null;
  const day = (d, withYear) => d.toLocaleDateString("en-GB", { day: "numeric", month: "short", ...(withYear ? { year: "numeric" } : {}) });
  if (!end || isNaN(end) || end.toDateString() === start.toDateString()) return day(start, true);
  return `${day(start, start.getFullYear() !== end.getFullYear())} – ${day(end, true)}`;
}

/**
 * Events placed on their venue's pin all sit on the SAME point — six at the
 * Hong Kong Palace Museum on live — and pins on one point never come apart
 * however far you zoom, so none of them could be opened. Each event that
 * shares its point with another pin (another event, or the venue itself) is
 * moved a few metres onto a small circle around it. Directions still use the
 * event's exact position.
 */
export function spreadSharedPoints(rows, radius = 0.00018) {
  const key = (r) => `${Number(r.geo_lat).toFixed(6)},${Number(r.geo_lng).toFixed(6)}`;
  const taken = {};
  for (const r of rows) if (!isEventRow(r)) taken[key(r)] = (taken[key(r)] || 0) + 1;
  const groups = {};
  for (const r of rows) if (isEventRow(r)) (groups[key(r)] ||= []).push(r);
  const moved = new Map();
  for (const [k, evs] of Object.entries(groups)) {
    const n = evs.length + (taken[k] ? 1 : 0); // the venue keeps the centre
    if (n < 2) continue;
    evs.forEach((r, i) => {
      const angle = (2 * Math.PI * i) / evs.length;
      const lat = Number(r.geo_lat), lng = Number(r.geo_lng);
      moved.set(r, {
        ...r,
        geo_lat: lat + radius * Math.sin(angle),
        geo_lng: lng + (radius * Math.cos(angle)) / Math.max(0.2, Math.cos((lat * Math.PI) / 180)),
        exact: { geo_lat: lat, geo_lng: lng },
      });
    });
  }
  return rows.map((r) => moved.get(r) || r);
}

/** Upcoming or running events with a position, as map rows. */
export function toEventRows(events, now = new Date()) {
  return (events || [])
    .filter((e) => e && e.geo_lat != null && e.geo_lng != null)
    .filter((e) => {
      const until = new Date(e.end_date || e.start_date);
      return !isNaN(until) && until >= now;
    })
    .map((e) => ({
      id: `event-${e.id}`,
      type: EVENT_TYPE,
      display_name: e.title,
      // the chapter stands in for the city, for the city filter
      based_in: e.chapter && e.chapter !== "Other" ? e.chapter : "",
      address: [e.venue, e.address].filter(Boolean).join(" — "),
      geo_lat: Number(e.geo_lat),
      geo_lng: Number(e.geo_lng),
      avatar_url: e.image_url || "",
      event: e,
    }));
}
