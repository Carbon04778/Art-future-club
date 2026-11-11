/**
 * Verifies that event lists load EVERY event, not the first N.
 *
 * The Events page asked for the 200 oldest events. Once the galleries passed
 * 200 (291 on live, 2026-11-11), everything from late September on — every
 * current and upcoming event — was missing. Supabase also stops at 1000 rows
 * a request, so lists now fetch page by page (src/lib/loadAll.js).
 *
 * Run: npm run verify:events-all
 */
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { JSDOM } from "jsdom";

const ROOT = fileURLToPath(new URL("..", import.meta.url));
const dom = new JSDOM("<!doctype html><html><body><div id='root'></div></body></html>", { url: "http://localhost/events", pretendToBeVisual: true });
const { window } = dom;
globalThis.window = window; globalThis.document = window.document;
Object.defineProperty(globalThis, "navigator", { value: window.navigator, configurable: true });
for (const k of ["HTMLElement", "Element", "Node", "Event", "MouseEvent", "KeyboardEvent", "SVGElement", "Image", "HTMLInputElement", "HTMLTextAreaElement", "HTMLSelectElement"]) globalThis[k] = window[k];
globalThis.requestAnimationFrame = (cb) => setTimeout(() => cb(Date.now()), 0);
globalThis.ResizeObserver = window.ResizeObserver = class { observe() {} unobserve() {} disconnect() {} };
globalThis.IntersectionObserver = window.IntersectionObserver = class { observe() {} unobserve() {} disconnect() {} takeRecords() { return []; } };
globalThis.matchMedia = window.matchMedia = () => ({ matches: false, media: "", addListener() {}, removeListener() {}, addEventListener() {}, removeEventListener() {} });
globalThis.IS_REACT_ACT_ENVIRONMENT = false;

const React = (await import("react")).default;
const { createRoot } = await import("react-dom/client");
const { MemoryRouter } = await import("react-router-dom");
const { base44 } = await import("../src/api/base44Client.js");
const { loadAll } = await import("../src/lib/loadAll.js");

let pass = 0;
const fails = [];
const check = (n, c, d = "") => (c ? pass++ : fails.push(`${n}${d ? ` — ${d}` : ""}`));
const tick = (ms = 80) => new Promise((r) => setTimeout(r, ms));

// a table that behaves like Supabase: at most 1000 rows per request
const table = (n) => {
  const all = Array.from({ length: n }, (_, i) => ({ id: `e${i}`, title: `Event ${i}`, start_date: new Date(Date.UTC(2026, 0, 1) + i * 864e5 / 4).toISOString(), chapter: "Hong Kong", event_type: "Exhibition" }));
  const calls = [];
  return { all, calls, page: async ({ limit, offset, sort, columns }) => { calls.push({ limit, offset, sort, columns }); const lim = Math.min(limit, 1000); return { rows: all.slice(offset, offset + lim), count: all.length }; } };
};

// ---- the helper
{
  const t = table(2500);
  const rows = await loadAll(t, { sort: "start_date", columns: "id,title" });
  check("2,500 events: all 2,500 come back", rows.length === 2500, `${rows.length}`);
  check("…in three requests of 1000", t.calls.length === 3 && t.calls.every((c) => c.limit === 1000), JSON.stringify(t.calls.map((c) => c.offset)));
  check("sort and columns are passed on", t.calls.every((c) => c.sort === "start_date" && c.columns === "id,title"));
  const t2 = table(291);
  check("291 events (live today): one request, all 291", (await loadAll(t2)).length === 291 && t2.calls.length === 1);
  const t3 = table(1000);
  check("exactly 1000: stops, no endless asking", (await loadAll(t3)).length === 1000 && t3.calls.length === 1);
  check("an empty table: nothing, no error", (await loadAll(table(0))).length === 0);
  // a row added between pages shifts the next page; it must not appear twice
  const dupe = { page: async ({ offset }) => (offset === 0 ? { rows: [{ id: "a" }, { id: "b" }], count: 3 } : { rows: [{ id: "b" }, { id: "c" }], count: 3 }) };
  const d = await loadAll(dupe, { pageSize: 2 });
  check("a row seen twice while paging is listed once", d.map((r) => r.id).join() === "a,b,c", d.map((r) => r.id).join());
}

// ---- the Events page shows events after the old 200 cut-off
{
  const now = Date.now();
  // 260 past events, then 30 upcoming — the upcoming ones are rows 261–290
  const evs = [
    ...Array.from({ length: 260 }, (_, i) => ({ id: `p${i}`, title: `Past show ${i}`, start_date: new Date(now - (300 - i) * 864e5).toISOString(), chapter: "Hong Kong", event_type: "Exhibition" })),
    ...Array.from({ length: 30 }, (_, i) => ({ id: `u${i}`, title: `Upcoming show ${i}`, start_date: new Date(now + (i + 1) * 864e5).toISOString(), chapter: "Hong Kong", event_type: "Exhibition" })),
  ];
  base44.entities.Event.page = async ({ limit, offset }) => ({ rows: evs.slice(offset, offset + Math.min(limit, 1000)), count: evs.length });
  base44.entities.Event.list = async (sort, limit) => evs.slice(0, limit ?? evs.length); // what the old code called
  base44.auth.me = async () => { throw new Error("signed out"); };
  const EventCalendar = (await import("../src/pages/EventCalendar.jsx")).default;
  const c = document.getElementById("root");
  const root = createRoot(c);
  root.render(React.createElement(MemoryRouter, null, React.createElement(EventCalendar)));
  for (let i = 0; i < 60 && !/Upcoming show 0/.test(c.textContent); i++) await tick(50);
  // Titles as separate elements: the page's text runs together ("show 013Friday"),
  // so matching the whole text cannot tell "show 0" from "show 01".
  const titles = [...c.querySelectorAll("*")].filter((e) => e.children.length === 0).map((e) => e.textContent.trim()).filter((t) => /^(Upcoming|Past) show \d+$/.test(t));
  check("all 290 events are on the page", titles.length === 290, `${titles.length}`);
  check("an upcoming event beyond the first 200 is shown", titles.includes("Upcoming show 0") && titles.includes("Upcoming show 29"));
  check("upcoming events come first", titles.indexOf("Upcoming show 0") < titles.indexOf("Past show 259"));
  check("past events are still listed", titles.includes("Past show 0"));
  root.unmount();
}

// ---- no event list is capped any more
for (const f of ["src/pages/EventCalendar.jsx", "src/components/CityChapters.jsx", "src/pages/CityChapterDetail.jsx", "src/components/SpacesMap.jsx", "src/components/AdminEventsPanel.jsx"]) {
  const s = readFileSync(join(ROOT, f), "utf8");
  check(`${f}: loads every event (loadAll, no Event.list cap)`, /loadAll\(base44\.entities\.Event/.test(s) && !/Event\.list\(/.test(s));
}

console.log(`verify:events-all — ${pass} passed, ${fails.length} failed`);
if (fails.length) { for (const f of fails) console.log("  ✗", f); process.exit(1); }
process.exit(0);
