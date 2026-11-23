/**
 * How an event's dates are read and shown (C10) — one place for every page.
 *
 *   date_only  the organiser gave no time: stored at midday UTC, so its date
 *              is read in UTC and no time is shown.
 *   timezone   where the times are meant. Shown in that zone for everyone.
 *              Empty on events made before C10: the visitor's own zone, as
 *              before.
 */

export const zoneOf = (ev) => (ev?.date_only ? "UTC" : ev?.timezone || undefined);

const valid = (v) => { const d = v ? new Date(v) : null; return d && !Number.isNaN(d.getTime()) ? d : null; };

function fmt(d, opts, zone) {
  try { return new Intl.DateTimeFormat("en-GB", { ...opts, timeZone: zone }).format(d); } catch { return new Intl.DateTimeFormat("en-GB", opts).format(d); }
}
function parts(d, zone) {
  let p;
  const o = { year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", hourCycle: "h23" };
  try { p = new Intl.DateTimeFormat("en-GB", { ...o, timeZone: zone }).formatToParts(d); } catch { p = new Intl.DateTimeFormat("en-GB", o).formatToParts(d); }
  const g = (t) => p.find((x) => x.type === t).value;
  return { y: g("year"), m: g("month"), d: g("day"), h: g("hour"), min: g("minute") };
}
/** "2026-12-08" in the event's zone. */
export const dayKey = (v, zone) => { const d = valid(v); if (!d) return ""; const p = parts(d, zone); return `${p.y}-${p.m}-${p.d}`; };

export const eventStart = (ev) => valid(ev?.start_date);
/** The end, unless it is missing or before the start (a typing mistake). */
export function eventEnd(ev) {
  const s = eventStart(ev), e = valid(ev?.end_date);
  return s && e && e >= s ? e : null;
}

/** "upcoming" | "ongoing" | "past". An event lasts until the end of its last day. */
export function eventStatus(ev, now = new Date()) {
  const s = eventStart(ev);
  if (!s) return "upcoming";
  const zone = zoneOf(ev);
  const last = eventEnd(ev) || s;
  // A date-only event's "today" is the visitor's own calendar day.
  const today = dayKey(now, ev.date_only ? undefined : zone);
  if (dayKey(last, zone) < today) return "past";
  if (ev.date_only) return dayKey(s, zone) <= today ? "ongoing" : "upcoming";
  return s <= now ? "ongoing" : "upcoming";
}
export const STATUS_LABEL = { upcoming: "Upcoming", ongoing: "Ongoing", past: "Past" };

/** "8 December 2026", "8–15 December 2026", "22 October 2026 – 16 January 2027". */
export function formatRange(ev, { month = "long" } = {}) {
  const s = eventStart(ev);
  if (!s) return "";
  const zone = zoneOf(ev), e = eventEnd(ev);
  const f = (d, o) => fmt(d, o, zone);
  const full = { day: "numeric", month, year: "numeric" };
  if (!e || dayKey(s, zone) === dayKey(e, zone)) return f(s, full);
  const a = dayKey(s, zone), b = dayKey(e, zone);
  if (a.slice(0, 7) === b.slice(0, 7)) return `${Number(a.slice(8))}–${f(e, full)}`;
  if (a.slice(0, 4) === b.slice(0, 4)) return `${f(s, { day: "numeric", month })} – ${f(e, full)}`;
  return `${f(s, full)} – ${f(e, full)}`;
}

export const formatPart = (ev, opts) => { const s = eventStart(ev); return s ? fmt(s, opts, zoneOf(ev)) : ""; };
export const monthKey = (ev) => formatPart(ev, { month: "long", year: "numeric" });

/** "18:30" or "18:30–20:00", with the place when a zone is saved; "" without a time. */
export function formatTimes(ev) {
  const s = eventStart(ev);
  if (!s || ev.date_only) return "";
  const zone = zoneOf(ev), e = eventEnd(ev);
  const t = (d) => fmt(d, { hour: "2-digit", minute: "2-digit", hourCycle: "h23" }, zone);
  const sameDay = e && dayKey(e, zone) === dayKey(s, zone) && e > s;
  const place = ev.timezone ? ` (${zoneLabel(ev.timezone)} time)` : "";
  return `${t(s)}${sameDay ? `–${t(e)}` : ""}${place}`;
}
export const zoneLabel = (z) => String(z || "").split("/").pop().replace(/_/g, " ");

/** Date for search engines: a plain date when there is no time. */
export const isoForSeo = (ev, v) => (v ? (ev.date_only ? dayKey(v, "UTC") : v) : undefined);

/* ------------------------------------------------------------------ forms */

/** A stored time as "YYYY-MM-DDTHH:mm" in `zone` (or the viewer's). */
export function toZonedInput(value, zone) {
  const d = valid(value);
  if (!d) return "";
  const p = parts(d, zone || undefined);
  return `${p.y}-${p.m}-${p.d}T${p.h}:${p.min}`;
}
/** "YYYY-MM-DDTHH:mm" meant in `zone` (or the viewer's), as an ISO time. */
export function fromZonedInput(text, zone) {
  if (!text) return null;
  if (!zone) { const d = new Date(text); return Number.isNaN(d.getTime()) ? null : d.toISOString(); }
  const want = Date.parse(`${text.slice(0, 16)}:00Z`);
  if (Number.isNaN(want)) return null;
  // Find the instant whose clock in that zone reads `text`. Twice: the first
  // guess can land on the other side of a daylight-saving change.
  let t = want;
  for (let i = 0; i < 2; i++) t += want - Date.parse(`${toZonedInput(new Date(t).toISOString(), zone)}:00Z`);
  return new Date(t).toISOString();
}

/** The date fields of a form, from an event (or a new one). */
export function whenFromEvent(ev) {
  const only = !!ev?.date_only;
  return {
    date_only: only,
    timezone: ev?.timezone || "",
    start: only ? dayKey(ev.start_date, "UTC") : toZonedInput(ev?.start_date, ev?.timezone),
    end: only ? dayKey(ev.end_date, "UTC") : toZonedInput(ev?.end_date, ev?.timezone),
  };
}
/** The event columns, from those fields. Throws a readable error. */
export function whenToEvent(w) {
  if (!w.start) throw new Error("Add the start date.");
  if (w.end && w.end.slice(0, w.date_only ? 10 : 16) < w.start.slice(0, w.date_only ? 10 : 16)) throw new Error("The end date is before the start date.");
  if (w.date_only) {
    return { date_only: true, timezone: null, start_date: `${w.start.slice(0, 10)}T12:00:00.000Z`, end_date: w.end ? `${w.end.slice(0, 10)}T12:00:00.000Z` : null };
  }
  return { date_only: false, timezone: w.timezone || null, start_date: fromZonedInput(w.start, w.timezone), end_date: fromZonedInput(w.end, w.timezone) };
}
