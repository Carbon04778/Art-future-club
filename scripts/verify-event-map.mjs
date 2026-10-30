/**
 * Verifies events on the map (B7 in docs/CLIENT-REQUESTS.md): which events
 * become pins, how an event is placed when saved, the three event forms, and
 * migration 030.
 *
 * Run: npm run verify:eventmap
 */
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = fileURLToPath(new URL("..", import.meta.url));
const src = (f) => readFileSync(join(ROOT, f), "utf8");
const { base44 } = await import("../src/api/base44Client.js");
const M = await import("../src/lib/mapEvents.js");
const P = await import("../src/lib/eventPlace.js");

let pass = 0;
const fails = [];
const check = (n, c, d = "") => (c ? pass++ : fails.push(`${n}${d ? ` — ${d}` : ""}`));
const eq = (a, b) => JSON.stringify(a) === JSON.stringify(b);

// ---- which events become pins
const now = new Date("2026-11-01T12:00:00Z");
const rows = M.toEventRows([
  { id: "a", title: "Running", start_date: "2026-10-01T10:00:00Z", end_date: "2026-11-20T10:00:00Z", geo_lat: 22.3, geo_lng: 114.2, chapter: "Hong Kong", venue: "V", address: "1 Rd" },
  { id: "b", title: "Coming", start_date: "2026-11-05T10:00:00Z", geo_lat: "51.5", geo_lng: "-0.1", chapter: "London" },
  { id: "c", title: "Over", start_date: "2026-10-01T10:00:00Z", end_date: "2026-10-02T10:00:00Z", geo_lat: 1, geo_lng: 1 },
  { id: "d", title: "No position", start_date: "2026-11-05T10:00:00Z" },
  { id: "e", title: "Other chapter", start_date: "2026-11-05T10:00:00Z", geo_lat: 1, geo_lng: 2, chapter: "Other" },
], now);
check("on now and coming up are pinned; finished and unplaced are not", eq(rows.map((r) => r.display_name), ["Running", "Coming", "Other chapter"]), rows.map((r) => r.display_name).join());
check("each is an Event row with numbers for a position", rows.every((r) => r.type === M.EVENT_TYPE && typeof r.geo_lat === "number"));
check("rows have their own ids, never a listing's", rows.every((r) => r.id.startsWith("event-")));
check("the chapter stands in for the city ('Other' is no city)", rows[0].based_in === "Hong Kong" && rows[2].based_in === "");
check("venue and address shown together", rows[0].address === "V — 1 Rd");
check("date label: one day", M.eventDateLabel({ start_date: "2026-11-05T10:00:00Z" }) === "5 Nov 2026");
check("date label: a run", M.eventDateLabel({ start_date: "2026-11-05T10:00:00Z", end_date: "2026-12-03T10:00:00Z" }) === "5 Nov – 3 Dec 2026", M.eventDateLabel({ start_date: "2026-11-05T10:00:00Z", end_date: "2026-12-03T10:00:00Z" }));

// ---- events on one point are spread so each can be opened
{
  const venue = { id: "v", type: "Museum", geo_lat: 22.3, geo_lng: 114.2 };
  const evs = [1, 2, 3].map((i) => ({ id: `event-${i}`, type: M.EVENT_TYPE, geo_lat: 22.3, geo_lng: 114.2 }));
  const lone = { id: "event-9", type: M.EVENT_TYPE, geo_lat: 10, geo_lng: 10 };
  const out = M.spreadSharedPoints([venue, ...evs, lone]);
  const points = new Set(out.map((r) => `${r.geo_lat},${r.geo_lng}`));
  check("three events at a museum's pin: four distinct points (the museum keeps the centre)", points.size === 5 && out[0].geo_lat === 22.3 && out[0].geo_lng === 114.2, [...points].join(" | "));
  check("…each only a few metres away", out.slice(1, 4).every((r) => Math.abs(r.geo_lat - 22.3) < 0.0003 && Math.abs(r.geo_lng - 114.2) < 0.0004));
  check("…and directions keep the exact venue", out.slice(1, 4).every((r) => r.exact.geo_lat === 22.3 && r.exact.geo_lng === 114.2));
  check("an event alone at its point is not moved", out[4] === lone);
}

check("choosing an event zooms in far enough for its pin to leave the cluster", /target\.type === EVENT_TYPE \? 18 : 16/.test(src("src/components/map/LeafletSpacesSurface.jsx")) && /selected\.type === EVENT_TYPE \? 19 : 16/.test(src("src/components/map/GoogleSpacesSurface.jsx")));

// ---- how an event is placed
let LISTINGS = [], GEO = null, geoCalls = 0;
base44.entities.CollectorProfile.page = async () => ({ rows: LISTINGS, count: LISTINGS.length });
base44.functions.invoke = async (name, { address }) => { geoCalls++; if (name !== "geocodeAddress") throw new Error("wrong function"); if (!GEO) return { error: "not found" }; return { data: { ...GEO, matched: address } }; };
LISTINGS = [{ display_name: "Kwai Fung Hin Art Gallery", geo_lat: 22.28, geo_lng: 114.15 }];
check("1. a gallery's own pin wins", eq(await P.placeEvent({ venue: "Kwai Fung Hin Art Gallery", pin: { geo_lat: 1, geo_lng: 2 } }), { geo_lat: 1, geo_lng: 2 }));
check("2. the venue's listing pin, ignoring capitals and spaces", eq(await P.placeEvent({ venue: "  kwai fung hin art gallery " }), { geo_lat: 22.28, geo_lng: 114.15 }));
geoCalls = 0;
LISTINGS = [{ display_name: "Twin", geo_lat: 1, geo_lng: 1 }, { display_name: "Twin", geo_lat: 9, geo_lng: 9 }];
GEO = { lat: 50, lng: 5 };
check("two listings with the same name in different places: not guessed — the address is used", eq(await P.placeEvent({ venue: "Twin", address: "5 Street" }), { geo_lat: 50, geo_lng: 5 }) && geoCalls === 1);
LISTINGS = [{ display_name: "Kwai Fung Hin Art Gallery Annex", geo_lat: 3, geo_lng: 3 }];
check("a name that only CONTAINS the venue is not a match", eq(await P.placeEvent({ venue: "Kwai Fung Hin Art Gallery", address: "x" }), { geo_lat: 50, geo_lng: 5 }));
GEO = null; LISTINGS = [];
check("nothing to place it by: {} (the event still saves)", eq(await P.placeEvent({ venue: "Nowhere", address: "??" }), {}));
base44.entities.CollectorProfile.page = async () => { throw new Error("offline"); };
base44.functions.invoke = async () => { throw new Error("offline"); };
check("a failure never stops the save", eq(await P.placeEvent({ venue: "X", address: "Y" }), {}));
base44.entities.CollectorProfile.page = async () => ({ rows: [{ display_name: "Here", geo_lat: 7, geo_lng: 8 }] });
check("edit that leaves venue and address alone keeps its position (an admin may have fixed it)", eq(await P.eventPosition({ venue: "Here", address: "a" }, { venue: "Here", address: "a", geo_lat: 1, geo_lng: 1 }), {}));
check("edit that changes the venue is placed again", eq(await P.eventPosition({ venue: "Here", address: "a" }, { venue: "Old", address: "a", geo_lat: 1, geo_lng: 1 }), { geo_lat: 7, geo_lng: 8 }));
base44.entities.CollectorProfile.page = async () => ({ rows: [] });
check("moved somewhere unplaceable: the old pin is cleared, not left wrong", eq(await P.eventPosition({ venue: "Gone", address: "" }, { venue: "Old", address: "", geo_lat: 1, geo_lng: 1 }), { geo_lat: null, geo_lng: null }));
base44.entities.CollectorProfile.page = async () => ({ rows: [{ display_name: "Here", geo_lat: 7, geo_lng: 8 }] });
check("an event saved before positions existed gets one on its next save", eq(await P.eventPosition({ venue: "Here", address: "a" }, { venue: "Here", address: "a", geo_lat: null }), { geo_lat: 7, geo_lng: 8 }));

// ---- the three forms
const cal = src("src/pages/EventCalendar.jsx");
check("event form: placed when created", /const position = await eventPosition\(form\);[\s\S]{0,200}\.\.\.position/.test(cal));
check("event form: the organiser's own time, and no end date is allowed", /start_date: fromLocalInput\(form\.start_date\),\s*end_date: fromLocalInput\(form\.end_date\)/.test(cal));
check("event form: a refused save says so", /catch \(err\) \{\s*setError\(/.test(cal) && /role="alert">\{error\}/.test(cal));
check("admin Events tab: placed again when venue/address change", /eventPosition\(\{ \.\.\.ev, \.\.\.patch \}, ev\)/.test(src("src/components/AdminEventsPanel.jsx")));
check("gallery exhibition: the gallery's own pin, unless elsewhere", /eventPosition\(payload, isEdit \? exhibition : null, elsewhere \? null : profile\)/.test(src("src/components/gallery/ExhibitionsSection.jsx")));
check("map page understands ?show=events", /events: "Events"/.test(src("src/pages/ArtistMap.jsx")));
for (const f of ["src/components/map/GoogleSpacesSurface.jsx", "src/components/map/LeafletSpacesSurface.jsx"]) {
  check(`${f.split("/").pop()}: a calendar pin for events`, /type === EVENT_TYPE\s*\?\s*`<rect x="4\.5" y="5\.5"/.test(src(f)));
}

// ---- the database file
const mig = src("supabase/migrations/030_event_map.sql");
check("030: two new columns on event", /add column if not exists geo_lat double precision,\s*add column if not exists geo_lng double precision/.test(mig));
check("030: filled only from an exact, unambiguous listing name", /p\.places = 1\s*and lower\(trim\(e\.venue\)\) = p\.name\s*and e\.geo_lat is null/.test(mig));
check("030: only approved, pinned listings", /where geo_lat is not null and geo_lng is not null and status = 'approved'/.test(mig));
check("030: set_updated_date paused around the fill", /disable trigger set_updated_date[\s\S]*update public\.event e[\s\S]*enable trigger set_updated_date/.test(mig));
check("030: writes only the two new columns", /set geo_lat = p\.lat, geo_lng = p\.lng\s*from/.test(mig) && (mig.replace(/--.*$/gm, "").match(/\bupdate\b/gi) || []).length === 1);
check("undo removes only the two columns", /drop column if exists geo_lat;\s*alter table public\.event drop column if exists geo_lng;/.test(src("supabase/migrations/030_event_map.revert.sql")));

console.log(`verify:eventmap — ${pass} passed, ${fails.length} failed`);
if (fails.length) { for (const f of fails) console.log("  ✗", f); process.exit(1); }
process.exit(0);
