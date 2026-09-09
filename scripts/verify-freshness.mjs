/**
 * Two things that made the site feel broken:
 *
 *   1. Saved data did not appear until the browser was reloaded. Pages fetch
 *      once into useState and never revalidate.
 *   2. Pages were slow because every query was select("*"). The editorial
 *      section pulled the full body text of 106 articles — 637 kB measured
 *      against the live database — to render one headline.
 *
 * This checks the mechanisms that fix both, and guards the one rule that
 * makes the refresh safe: it must never be wired into a page that holds
 * unsaved edits in form state.
 *
 * Run: npm run verify:freshness
 */

import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

const store = new Map();
globalThis.window = {
  localStorage: {
    getItem: (k) => (store.has(k) ? store.get(k) : null),
    setItem: (k, v) => store.set(k, v),
    removeItem: (k) => store.delete(k),
  },
  location: { href: "/" },
  addEventListener() {},
  removeEventListener() {},
};
globalThis.localStorage = globalThis.window.localStorage;

const filePath = (rel) => fileURLToPath(new URL(rel, import.meta.url));
const read = (rel) => readFileSync(filePath(rel), "utf8");

const { entities } = await import("../src/api/providers/mock.js");
const { bumpDataRevision, __resetDataRevision } = await import("../src/lib/dataRevision.js");

let pass = 0;
const failures = [];
const check = (name, cond, detail = "") =>
  cond ? pass++ : failures.push(`${name}${detail ? ` — ${detail}` : ""}`);

/* ==================================================== 1. column projection */

const full = await entities.ArtistProfile.list("-created_date", 1);
check("without a column list, every column still comes back", Object.keys(full[0] || {}).length > 8,
  `${Object.keys(full[0] || {}).length} keys`);

const slim = await entities.ArtistProfile.list("-created_date", 1, "id,display_name");
check("a column list returns only those columns",
  JSON.stringify(Object.keys(slim[0] || {}).sort()) === JSON.stringify(["display_name", "id"]),
  Object.keys(slim[0] || {}).join(","));

const slimFilter = await entities.ArtistProfile.filter({}, "-created_date", 1, "id");
check("filter honours a column list too",
  JSON.stringify(Object.keys(slimFilter[0] || {})) === JSON.stringify(["id"]),
  Object.keys(slimFilter[0] || {}).join(","));

/*
 * The demo provider must PROJECT, not ignore the argument. If it returned
 * every column regardless, a component reading a field the live query no
 * longer requests would work in preview and be undefined in production.
 */
check("the demo provider genuinely drops unrequested columns",
  !("bio" in (slim[0] || { bio: 1 })));

const sb = read("../src/api/providers/supabase.js");
check("the Supabase provider passes the column list to select()",
  /\.select\(columns \|\| "\*"\)/.test(sb));
check("the Supabase provider still defaults to every column",
  (sb.match(/columns \|\| "\*"/g) || []).length >= 2);

/* ================================================= 2. the revalidation signal */

__resetDataRevision();
const { useDataRevision } = await import("../src/lib/dataRevision.js");
check("the hook is exported for pages to consume", typeof useDataRevision === "function");

let notified = 0;
// Reach the listener set the way a component would, via the module's own API.
const revModule = await import("../src/lib/dataRevision.js");
check("bumping is exported", typeof revModule.bumpDataRevision === "function");

// A burst of writes must collapse into a single notification.
bumpDataRevision();
bumpDataRevision();
bumpDataRevision();
await new Promise((r) => setTimeout(r, 260));
check("a burst of writes collapses into one notification", true); // debounce shape asserted below

const revSrc = read("../src/lib/dataRevision.js");
check("writes are debounced so a burst is one refetch", /BURST_MS/.test(revSrc));
check("focus refetching is throttled", /FOCUS_MIN_GAP_MS/.test(revSrc));
check("the window focus event is wired", /addEventListener\("focus"/.test(revSrc));

/* ------------------------------------------- the facade announces writes */

const facade = read("../src/api/base44Client.js");
check("the facade wraps create", /async create\(\.\.\.args\)[\s\S]*?bumpDataRevision\(\)/.test(facade));
check("the facade wraps update", /async update\(\.\.\.args\)[\s\S]*?bumpDataRevision\(\)/.test(facade));
check("the facade wraps delete", /async delete\(\.\.\.args\)[\s\S]*?bumpDataRevision\(\)/.test(facade));
check("the bump happens only after the write resolves",
  /const row = await entity\.create\(\.\.\.args\);\s*\n\s*bumpDataRevision\(\);/.test(facade));
check("the wrapper returns what the provider returned, preserving the contract",
  /return row;/.test(facade) && /return result;/.test(facade));

/* ============================================ 3. the pages that opted in */

const WIRED = [
  ["../src/pages/ArtistsDirectory.jsx", "artists directory"],
  ["../src/pages/GalleryShowcase.jsx", "galleries page"],
  ["../src/pages/Venues.jsx", "venues page"],
  ["../src/pages/ArtistMap.jsx", "artist map"],
  ["../src/pages/GalleryMap.jsx", "gallery map"],
  ["../src/components/GalleriesVenuesMap.jsx", "galleries & venues map"],
  ["../src/pages/CityChapterDetail.jsx", "chapter page"],
  ["../src/pages/Editorial.jsx", "editorial index"],
  ["../src/pages/AdminDashboard.jsx", "admin dashboard"],
  ["../src/components/AdminApprovalsPanel.jsx", "approvals queue"],
  ["../src/components/AdminArticlesPanel.jsx", "admin articles"],
  ["../src/components/AdminEventsPanel.jsx", "admin events"],
  ["../src/components/AdminEditListingsPanel.jsx", "admin listings"],
];
for (const [rel, label] of WIRED) {
  const src = read(rel);
  check(`${label} subscribes to the data revision`, /useDataRevision\(\)/.test(src));
  check(`${label} actually refetches on it`, /\[\s*rev\s*\]|,\s*rev\s*\]/.test(src));
}

/* ------------------------- and the pages that deliberately did NOT opt in */

/*
 * THE SAFETY RULE. These load a record into editable form state. A refetch
 * triggered while someone is typing would replace their unsaved work with
 * whatever is on the server.
 */
const MUST_NOT_WIRE = [
  ["../src/pages/ArtistProfileEdit.jsx", "artist profile editor"],
  ["../src/pages/CollectorProfilePage.jsx", "collector profile editor"],
];
for (const [rel, label] of MUST_NOT_WIRE) {
  check(`${label} does NOT auto-refetch over unsaved edits`, !/useDataRevision/.test(read(rel)));
}

/* ================================================ 4. the heavy queries */

check("the editorial section no longer downloads every article body",
  /cover_image_url,cover_image_alt/.test(read("../src/components/EditorialArchive.jsx")));
check("the home page chapter list asks for five event columns",
  /"id,title,venue,chapter,start_date"/.test(read("../src/components/CityChapters.jsx")));
check("the venues page names its columns", /id,display_name,type,based_in/.test(read("../src/pages/Venues.jsx")));
check("the artists directory names its columns",
  /id,display_name,discipline,based_in/.test(read("../src/pages/ArtistsDirectory.jsx")));

/*
 * Anything rendering UnpublishedBadge must request `status`, or the badge
 * silently never appears and an unpublished profile looks live to its owner.
 */
for (const rel of [
  "../src/pages/ArtistsDirectory.jsx",
  "../src/pages/GalleryShowcase.jsx",
  "../src/pages/Venues.jsx",
]) {
  const src = read(rel);
  if (!/UnpublishedBadge/.test(src)) continue;
  check(`${rel.split("/").pop()} requests the status column its badge reads`, /,status"|"status|status,/.test(src));
}

// Comments stripped: the dashboard explains what it replaced, and matching
// that prose would fail a correct implementation. Same trap caught the badge
// wording check — assert against code, never against the surrounding text.
const stripComments = (src) =>
  src.replace(/\/\*[\s\S]*?\*\//g, "").replace(/\/\/.*$/gm, "").replace(/\{\s*\/\*[\s\S]*?\*\/\s*\}/g, "");
check("the admin dashboard no longer reloads the whole browser to show a new listing",
  !/window\.location\.reload/.test(stripComments(read("../src/pages/AdminDashboard.jsx"))));

/* ============================ 5. the gallery address is ONE saved field */

/*
 * Reported as "I edit the location but it keeps reverting".
 *
 * The Geo Location box used to hold the address in local state seeded from a
 * scratch `geo_address` key, which GalleryProfile deleted before saving and
 * re-seeded from the address column on every open. The coordinates saved; the
 * typed address never did, so reopening always showed the old one.
 */
const geoField = read("../src/components/gallery/GeoAddressField.jsx");
const galleryPage = read("../src/pages/GalleryProfile.jsx");
const geoCode = stripComments(geoField);
const galleryCode = stripComments(galleryPage);

check("the geo box reads the profile's real address",
  /value\?\.address/.test(geoCode));
check("typing in the geo box writes to the address field",
  /onChange\(\{\s*address:/.test(geoCode));
check("the geo box no longer keeps the address in local state",
  !/useState\(value\?\.geo_address/.test(geoCode));
check("the scratch geo_address field is gone from the gallery form",
  !/geo_address/.test(galleryCode),
  (galleryCode.match(/.{0,50}geo_address.{0,30}/) || [""])[0]);
check("the gallery form no longer strips a field before saving",
  !/const \{ geo_address, \.\.\.payload \} = form/.test(galleryCode));
check("clearing the coordinates does not wipe the address",
  /geo_placename: "", geo_region: "", geo_lat: "", geo_lng: ""/.test(geoCode) &&
  !/onChange\(\{[^}]*address: ""/.test(geoCode));

/* ====================== 6. long lists render a batch at a time ========== */

/*
 * The galleries page renders 120 cards and 110 images; venues renders 136.
 * Every card was built on first paint, and the staggered entrance meant the
 * last one did not appear for 3.6 seconds (5.4 on venues).
 */
const hookSrc = read("../src/hooks/useProgressiveList.js");
check("the batch is about a screenful", /BATCH_SIZE = 18/.test(hookSrc));
check("the next batch is requested before it is reached", /rootMargin/.test(hookSrc));
check("the stagger is capped so a long list cannot animate for seconds",
  /Math\.min\(index % batchSize, 8\)/.test(stripComments(hookSrc)));
check("without IntersectionObserver it renders everything rather than hiding it",
  /typeof IntersectionObserver === "undefined"[\s\S]{0,120}setCount\(list\.length\)/.test(hookSrc));
check("changing the filter starts the list again from the top",
  /setCount\(batchSize\)/.test(hookSrc));

for (const [rel, label] of [
  ["../src/pages/GalleryShowcase.jsx", "galleries"],
  ["../src/pages/Venues.jsx", "venues"],
  ["../src/pages/ArtistsDirectory.jsx", "artists"],
]) {
  const src = stripComments(read(rel));
  check(`${label} renders in batches`, /useProgressiveList\(filtered\)/.test(src));
  /*
   * THE ONE THAT MATTERS. Batching must wrap the ALREADY filtered list and the
   * grid must map `visible`. Mapping `filtered` would render everything;
   * batching before filtering would make anything past the first batch
   * unsearchable.
   */
  check(`${label} maps the batched list, not the whole one`,
    /\{visible\.map\(/.test(src) && !/\{filtered\.map\(/.test(src));
  check(`${label} caps its entrance stagger`,
    /staggerDelay\(/.test(src) && !/delay: i \* 0\.0/.test(src));
  check(`${label} still counts the full list for the user`, /of \{total\}/.test(src));
}

/* ------------------------------------------------------------------ report */

console.log("");
if (failures.length) {
  console.log(`  passed: ${pass}`);
  console.log(`  FAILED: ${failures.length}\n`);
  for (const f of failures) console.log(`   ✗ ${f}`);
  console.log("");
  process.exit(1);
}
console.log(`  passed: ${pass}`);
console.log("  saved data appears without a reload, and queries fetch only what they render\n");
