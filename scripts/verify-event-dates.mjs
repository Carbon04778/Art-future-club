/**
 * Event dates, status and time zones (C10). Run: npm run verify:event-dates
 * The visitor's zone matters, so this runs itself in several.
 */
import { spawnSync } from "node:child_process";
import { readFileSync } from "node:fs";
import * as D from "../src/lib/eventDates.js";

let pass = 0;
const fails = [];
const check = (n, c, d = "") => (c ? pass++ : fails.push(`${process.env.TZ || "default"}: ${n}${d ? ` — ${d}` : ""}`));
const ev = (s, e, x = {}) => ({ start_date: s, end_date: e, ...x });
const only = (s, e) => ev(`${s}T12:00:00Z`, e && `${e}T12:00:00Z`, { date_only: true });

// ---- Julie's example and the other shapes (date-only: the same for everyone)
for (const [x, want] of [
  [only("2026-12-08", "2026-12-15"), "8–15 December 2026"],
  [only("2026-12-08"), "8 December 2026"],
  [only("2026-12-08", "2026-12-08"), "8 December 2026"],
  [only("2026-10-08", "2026-12-15"), "8 October – 15 December 2026"],
  [only("2026-10-22", "2027-01-16"), "22 October 2026 – 16 January 2027"],
  [only("2028-09-22", "2026-09-25"), "22 September 2028"],
]) check(`range ${want}`, D.formatRange(x) === want, D.formatRange(x));
check("no dates: empty, no crash", D.formatRange({}) === "" && D.eventStatus({}) === "upcoming" && D.formatTimes({}) === "" && D.formatRange({ start_date: "junk" }) === "");
check("date-only never shows a time", D.formatTimes(only("2026-12-08")) === "");

// ---- a saved zone reads the same for every visitor
const hk = ev("2026-12-08T10:30:00Z", "2026-12-08T12:00:00Z", { timezone: "Asia/Hong_Kong" });
check("Hong Kong time for everyone", D.formatTimes(hk) === "18:30–20:00 (Hong Kong time)", D.formatTimes(hk));
check("Hong Kong date for everyone", D.formatRange(hk) === "8 December 2026", D.formatRange(hk));
const ny = ev("2026-11-14T00:00:00Z", null, { timezone: "America/New_York" });
check("a New York evening stays on its own day", D.formatRange(ny) === "13 November 2026" && /^19:00 \(New York time\)$/.test(D.formatTimes(ny)), D.formatRange(ny) + D.formatTimes(ny));
check("a bad zone does not crash", D.formatRange(ev("2026-12-08T10:00:00Z", null, { timezone: "Moon/Base" })).includes("2026"));
// ---- no zone (every event before C10): the visitor's own, as before
const old = ev("2026-11-21T03:00:00Z", "2027-02-21T03:00:00Z");
check("old event: same date the page showed before", D.formatPart(old, { day: "numeric" }) === String(new Date(old.start_date).getDate()));

// ---- status
const at = (s) => new Date(s);
check("running show is ongoing until its last day is over", D.eventStatus(old, at("2027-01-01T12:00:00Z")) === "ongoing" && D.eventStatus(old, at("2027-02-23T12:00:00Z")) === "past" && D.eventStatus(old, at("2026-11-01T12:00:00Z")) === "upcoming");
check("last day still counts after closing time", D.eventStatus(hk, at("2026-12-08T15:00:00Z")) === "ongoing" && D.eventStatus(hk, at("2026-12-08T17:00:00Z")) === "past");
check("one-day event: upcoming in the morning, past next day", D.eventStatus(hk, at("2026-12-08T01:00:00Z")) === "upcoming" && D.eventStatus(hk, at("2026-12-09T01:00:00Z")) === "past");
const loc = (y, m, d, h) => new Date(y, m - 1, d, h);
check("date-only follows the visitor's calendar", D.eventStatus(only("2026-12-08", "2026-12-15"), loc(2026, 12, 8, 1)) === "ongoing" && D.eventStatus(only("2026-12-08", "2026-12-15"), loc(2026, 12, 15, 23)) === "ongoing" && D.eventStatus(only("2026-12-08", "2026-12-15"), loc(2026, 12, 16, 1)) === "past" && D.eventStatus(only("2026-12-08", "2026-12-15"), loc(2026, 12, 7, 23)) === "upcoming");
check("end before start is ignored", D.eventStatus(ev("2028-09-22T03:00:00Z", "2026-09-25T03:00:00Z"), at("2026-11-23T00:00:00Z")) === "upcoming");

// ---- forms: what is typed is what is saved and shown again
for (const [text, zone, iso] of [
  ["2026-12-08T18:30", "Asia/Hong_Kong", "2026-12-08T10:30:00.000Z"], ["2026-07-08T18:30", "Europe/London", "2026-07-08T17:30:00.000Z"],
  ["2026-12-08T18:30", "Europe/London", "2026-12-08T18:30:00.000Z"], ["2026-03-29T12:00", "Europe/London", "2026-03-29T11:00:00.000Z"],
  ["2026-03-08T03:30", "America/New_York", "2026-03-08T07:30:00.000Z"], ["2026-11-01T12:00", "America/Los_Angeles", "2026-11-01T20:00:00.000Z"],
]) {
  check(`${text} ${zone}`, D.fromZonedInput(text, zone) === iso, String(D.fromZonedInput(text, zone)));
  check(`…and back`, D.toZonedInput(iso, zone) === text, D.toZonedInput(iso, zone));
}
check("no zone: the viewer's own time, unchanged on reopening", D.toZonedInput(D.fromZonedInput("2026-12-08T18:30", ""), "") === "2026-12-08T18:30");
for (const x of [hk, old, only("2026-12-08", "2026-12-15")]) {
  let w = D.whenFromEvent(x), r;
  for (let i = 0; i < 3; i++) { r = D.whenToEvent(w); w = D.whenFromEvent(r); }
  check("opening and saving three times moves nothing", new Date(r.start_date).getTime() === new Date(x.start_date).getTime() && new Date(r.end_date).getTime() === new Date(x.end_date).getTime() && r.date_only === !!x.date_only && (r.timezone || null) === (x.timezone || null), JSON.stringify(r));
}
const bad = (w) => { try { D.whenToEvent(w); return false; } catch { return true; } };
check("end before start and no start are refused", bad({ start: "2026-12-08T10:00", end: "2026-12-07T10:00", timezone: "" }) && bad({ start: "", end: "" }));
check("no end date is allowed", D.whenToEvent({ start: "2026-12-08T10:00", end: "", timezone: "Asia/Hong_Kong" }).end_date === null);
check("search engines get a plain date when there is no time", D.isoForSeo(only("2026-12-08"), "2026-12-08T12:00:00Z") === "2026-12-08");

// ---- every form and page uses these
const s = (f) => readFileSync(new URL(`../${f}`, import.meta.url), "utf8");
for (const f of ["src/pages/EventCalendar.jsx", "src/components/AdminEventsPanel.jsx", "src/components/gallery/ExhibitionsSection.jsx"]) check(`${f}: shared date fields`, /<EventWhenFields/.test(s(f)) && /whenToEvent\(when\)/.test(s(f)) && !/type="datetime-local"/.test(s(f)));
for (const f of ["src/pages/EventCalendar.jsx", "src/pages/EventDetail.jsx"]) check(`${f}: range and status shown`, /formatRange\(/.test(s(f)) && /STATUS_LABEL\[status\]/.test(s(f)) && !/new Date\((ev|e|event)\.start_date\) < /.test(s(f)));

if (!process.env.AFC_DATES_CHILD) {
  // ---- D4: small pictures
  const { thumb } = await import("../src/lib/thumb.js");
  process.env.VITE_SUPABASE_URL = "https://abc.supabase.co";
  const img = await import("../api/img.js");
  const sharp = (await import("sharp")).default;
  const U = "https://abc.supabase.co/storage/v1/object/public/uploads/a b.webp";
  check("thumb: next size up, address encoded", thumb(U, 192, true) === "/api/img?w=320&src=" + encodeURIComponent(U));
  check("thumb: other pictures and dev untouched", thumb("/images/x.webp", 192, true) === "/images/x.webp" && thumb("https://evil.com/x.png", 192, true) === "https://evil.com/x.png" && thumb(U, 192, false) === U && thumb(null, 192, true) === null);
  const call = async (query) => { const r = { h: {}, setHeader(k, v) { this.h[k] = v; }, status(c) { this.c = c; return this; }, send(b) { this.b = b; } }; await img.default({ query }, r); return r; };
  const real = globalThis.fetch;
  const big = await sharp({ create: { width: 2000, height: 1500, channels: 3, background: "#c33" } }).jpeg().toBuffer();
  let asked = 0;
  globalThis.fetch = async () => { asked++; return new Response(big, { headers: { "content-type": "image/jpeg" } }); };
  let r = await call({ src: U, w: "320" });
  check("img: 320px webp, kept a year", r.c === 200 && (await sharp(r.b).metadata()).width === 320 && r.h["Content-Type"] === "image/webp" && /immutable/.test(r.h["Cache-Control"]), String(r.c));
  asked = 0;
  for (const q of [{ src: "https://evil.com/x.png", w: "320" }, { src: "https://abc.supabase.co/rest/v1/profiles", w: "320" }, { src: "https://abc.supabase.co/storage/v1/object/public/../x", w: "320" }, { src: U, w: "321" }, { src: U }]) check("img: refused " + JSON.stringify(q).slice(0, 60), (await call(q)).c === 400);
  check("img: refused ones are never fetched", asked === 0);
  globalThis.fetch = async () => new Response("<html>", { headers: { "content-type": "text/html" } });
  r = await call({ src: U, w: "320" });
  check("img: a page is not a picture, and the error is not cached", r.c === 415 && r.h["Cache-Control"] === "no-store");
  globalThis.fetch = real;
  check("events page and For you use small pictures", /<ThumbImage/.test(s("src/pages/EventCalendar.jsx")) && /data-pick-image/.test(s("src/components/EventDiscovery.jsx")));

  // Again as a visitor in each of these places.
  for (const TZ of ["Asia/Hong_Kong", "America/Los_Angeles", "Pacific/Auckland", "Africa/Lagos", "UTC"]) {
    const r = spawnSync("npx vite-node --mode test scripts/verify-event-dates.mjs", { shell: true, env: { ...process.env, TZ, AFC_DATES_CHILD: "1" }, encoding: "utf8" });
    const m = /— (\d+) passed, (\d+) failed/.exec(r.stdout || "");
    if (!m) fails.push(`${TZ}: did not run ${(r.stderr || "").slice(0, 200)}`);
    else { pass += +m[1]; if (+m[2]) fails.push(...r.stdout.split("\n").filter((x) => /✗/.test(x))); }
  }
}
console.log(`verify:event-dates — ${pass} passed, ${fails.length} failed`);
if (fails.length) { for (const f of fails) console.log("  ✗", f); process.exit(1); }
process.exit(0);
