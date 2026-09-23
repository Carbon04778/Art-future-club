/**
 * Verifies the admin "Add Listing" panel.
 *
 * Covers three client reports:
 *   - no way to attach gallery / venue images
 *   - the panel's fields did not match what the public pages filter on
 *   - no way to add an artist's artwork
 *
 * Run: npm run verify:adminpanel
 */

import { readFileSync } from "node:fs";
import { JSDOM } from "jsdom";

const dom = new JSDOM("<!doctype html><html><body><div id='root'></div></body></html>", {
  url: "http://localhost/",
  pretendToBeVisual: true,
});
const { window } = dom;
globalThis.window = window;
globalThis.document = window.document;
Object.defineProperty(globalThis, "navigator", { value: window.navigator, configurable: true });
for (const k of ["HTMLElement", "Element", "Node", "File", "Blob", "Event"]) globalThis[k] = window[k];
window.URL.createObjectURL = () => "blob:preview";
globalThis.requestAnimationFrame = (cb) => setTimeout(() => cb(Date.now()), 0);
globalThis.ResizeObserver = window.ResizeObserver = class { observe() {} unobserve() {} disconnect() {} };

const React = (await import("react")).default;
const { createRoot } = await import("react-dom/client");
const Panel = (await import("../src/components/AdminCreatePanel.jsx")).default;

let pass = 0;
const failures = [];
const check = (name, cond, detail = "") =>
  cond ? pass++ : failures.push(`${name}${detail ? ` — ${detail}` : ""}`);

/**
 * Mounts the panel fresh. Always unmount before mounting again — two React
 * roots in one container detach each other and throw.
 */
async function mount() {
  const container = document.getElementById("root");
  container.innerHTML = "";
  const root = createRoot(container);
  await new Promise((r) => {
    root.render(React.createElement(Panel, {}));
    setTimeout(r, 200);
  });
  return { container, root };
}

async function click(container, label) {
  const btn = [...container.querySelectorAll("button")].find(
    (b) => b.textContent.trim() === label
  );
  if (!btn) return false;
  await new Promise((r) => {
    btn.dispatchEvent(new window.MouseEvent("click", { bubbles: true }));
    setTimeout(r, 200);
  });
  return true;
}

const files = (c) => c.querySelectorAll('input[type="file"]');
const placeholders = (c) =>
  [...c.querySelectorAll("input")].map((i) => i.getAttribute("placeholder") || "");

/* ============================ single mount, walked across all three tabs === */

const { container, root } = await mount();

// --- Gallery (default tab) ---
check("gallery tab has two image inputs (logo + cover)", files(container).length === 2, `found ${files(container).length}`);
check("gallery tab labels the cover image", /Cover image/i.test(container.textContent));
check("gallery tab labels the logo", /Logo \/ profile photo/i.test(container.textContent));
check("gallery tab shows discipline chips", /Disciplines shown/i.test(container.textContent));
check("gallery tab shows partnership status", /Partnership status/i.test(container.textContent));
check("all file inputs accept images only",
  [...files(container)].every((i) => i.getAttribute("accept") === "image/*"));

// --- Venue ---
await click(container, "Venue");
check("venue tab has two image inputs", files(container).length === 2, `found ${files(container).length}`);
check("venue tab HIDES disciplines (Venues.jsx never reads interests)",
  !/Disciplines shown/i.test(container.textContent));
check("venue tab keeps partnership status (rendered as a badge)",
  /Partnership status/i.test(container.textContent));
check("venue tab keeps Based in", /Based in/i.test(container.textContent));

// --- Artist ---
await click(container, "Artist");
check("artist tab hides the cover image", !/Cover image/i.test(container.textContent));
check("artist tab hides disciplines", !/Disciplines shown/i.test(container.textContent));
check("artist tab hides partnership status", !/Partnership status/i.test(container.textContent));
check("artist tab says 'Profile photo'", /Profile photo/i.test(container.textContent));
check("artist tab has an Artwork section", /Artwork/i.test(container.textContent));

const beforeWork = files(container).length;
const added = await click(container, "Add work");
check("artist tab has an 'Add work' button", added);

if (added) {
  const p = placeholders(container);
  check("adding a work reveals Title", p.some((x) => /^Title$/i.test(x)));
  check("adding a work reveals Year", p.some((x) => /^Year$/i.test(x)));
  check("adding a work reveals Medium", p.some((x) => /Medium/i.test(x)));
  check("adding a work reveals Dimensions", p.some((x) => /Dimensions/i.test(x)));
  check("adding a work reveals its own image input",
    files(container).length === beforeWork + 1,
    `${beforeWork} -> ${files(container).length}`);
  check("adding a work reveals 'Available for sale'",
    [...container.querySelectorAll("input")].some((i) => i.type === "checkbox"));

  await click(container, "Add work");
  check("a second work can be added", files(container).length === beforeWork + 2);
}

root.unmount();

/* ============================================== source-level contracts === */

const src = readFileSync(new URL("../src/components/AdminCreatePanel.jsx", import.meta.url), "utf8");
const showcase = readFileSync(new URL("../src/pages/GalleryShowcase.jsx", import.meta.url), "utf8");
const venues = readFileSync(new URL("../src/pages/Venues.jsx", import.meta.url), "utf8");
const artistView = readFileSync(new URL("../src/pages/ArtistProfileView.jsx", import.meta.url), "utf8");

// --- uploads ---
check("uploads via the shared UploadFile integration", /integrations\.Core\.UploadFile/.test(src));
check("collector payload carries cover_image_url", /CollectorProfile\.create\(\{[\s\S]*?cover_image_url/.test(src));
check("collector payload carries avatar_url", /CollectorProfile\.create\(\{[\s\S]*?avatar_url/.test(src));
check("artist payload carries avatar_url", /ArtistProfile\.create\(\{[\s\S]*?avatar_url/.test(src));
check("uploads happen BEFORE the record is created",
  src.indexOf("UploadFile") > -1 && src.indexOf("UploadFile") < src.indexOf(".create("));
check("file selections clear after a successful save",
  /setAvatarFile\(null\)/.test(src) && /setCoverFile\(null\)/.test(src) && /setWorks\(\[\]\)/.test(src));

// --- crop control ---
check("avatar uses the shared crop/zoom control", /ImageCropBox/.test(src));
check("the cropped result is what gets uploaded",
  /onChange=\{\(cropped\) => setAvatarFile\(cropped\)\}/.test(src));
check("raw pick still uploads if cropping never emits",
  /setAvatarRaw\(f\);[\s\S]{0,220}setAvatarFile\(f\);/.test(src));

// --- artwork ---
check("panel saves portfolio_works rather than an empty array",
  /portfolio_works,/.test(src) && !/portfolio_works: \[\]/.test(src));
check("each work's image is uploaded", /UploadFile\(\{ file: w\.file \}\)/.test(src));
// Scope this to the push block only: Tailwind's file:mr-4 classes elsewhere
// in the file would otherwise match and report a false failure.
const pushBlock = (src.match(/portfolio_works\.push\(\{([\s\S]*?)\}\);/) || [])[1] || "";
check("a work is actually assembled for saving", pushBlock.length > 0);
check("the local `file` key is not written to the database",
  !/\bfile\s*:/.test(pushBlock));

for (const f of ["title", "year", "medium", "dimensions", "image_url", "available_for_sale", "price", "currency"]) {
  const readByPage = new RegExp(`work\\.${f}\\b`).test(artistView);
  // Accept both `image_url,` shorthand and `title: ...` longhand.
  const savedByPanel =
    new RegExp(`\\b${f}\\s*[:,]`).test(pushBlock) ||
    new RegExp(`\\b${f}\\s*[:,]`).test(src);
  check(`work.${f}: saved by the panel because the profile page reads it`,
    !readByPage || savedByPanel,
    readByPage && !savedByPanel ? "page reads it, panel never saves it" : "");
}

// --- must stay in step with the public filter pages ---
/*
 * Asserted as separate facts rather than one exact expression: the page must
 * read g.interests with a default, and must match the chosen chip against that
 * list. The single regex this replaced pinned the precise spelling, so adding
 * the Uncategorised branch failed it without anything actually being broken.
 */
check("galleries page reads `interests` with a default", showcase.includes("g.interests || []"));
check("galleries page matches the chosen discipline", showcase.includes(".includes(filter)"));
/*
 * Uncategorised selects the galleries with no disciplines at all. It is why a
 * listing with an empty list stays reachable: before it existed such a gallery
 * vanished the moment any chip was pressed, which hid all 302 rows of the
 * September 2026 gallery import.
 */
check("galleries page offers an Uncategorised chip", showcase.includes('"Uncategorised"'));
check(
  "Uncategorised selects the galleries with no disciplines",
  showcase.includes('filter === "Uncategorised"') && showcase.includes("disciplines.length")
);
check("panel collects `interests`", /interests,/.test(src));

/*
 * "All" and "Uncategorised" are selectors, not disciplines — neither is ever
 * stored on a profile, so neither belongs in the cross-check below.
 */
const SENTINELS = ["All", "Uncategorised"];
const listOf = (t) =>
  (t.match(/"([^"]+)"/g) || []).map((x) => x.slice(1, -1)).filter((x) => !SENTINELS.includes(x));
const panelInterests = listOf((src.match(/const INTERESTS = \[([\s\S]*?)\]/) || [])[1] || "");
const pageInterests = listOf((showcase.match(/const INTERESTS = \[([\s\S]*?)\]/) || [])[1] || "");
const missing = pageInterests.filter((d) => !panelInterests.includes(d));
check("every discipline on the galleries page is offered in the panel",
  missing.length === 0, `missing: ${missing.join(", ")}`);

check("galleries page matches chapter against based_in", /based_in && !g\.based_in\.includes\(chapter\)/.test(showcase));
check("venues page matches chapter against based_in", /based_in \|\| ""\)\.includes\(chapter\)/.test(venues));
check("panel uses a chapter dropdown for based_in, not free text",
  /value=\{form\.based_in\}[\s\S]{0,220}CHAPTER_OPTIONS\.map/.test(src));
/*
 * Venues.jsx used to fetch the 400 most recently updated collector_profile
 * rows and pick the venue types out of them in the browser. That held only
 * while the table was smaller than the cap: the September 2026 gallery import
 * added 350 rows in four days and pushed 17 of the 19 venues out of the
 * window, so the Venues page showed two of nineteen and could not tell.
 *
 * Ask the database for the kind you want. Never sieve a capped page.
 */
check("venues page asks the database for venue types",
  venues.includes("$in: VENUE_TYPES"),
  "Venues.jsx must constrain type in the query, not after it");
/*
 * The unconstrained fetch is the fault, not client-side filtering as such:
 * Venues.jsx keeps an isVenueType() guard at render time so the query and the
 * helper must agree, and a row the query wrongly returned is dropped rather
 * than shown as a venue. What must never come back is a capped page of
 * everything.
 */
check("venues page does not fetch an unconstrained page of every space",
  !venues.includes("CollectorProfile.list("),
  "found an unconstrained .list() — the cap decides which rows arrive");
check("venues page genuinely does not filter on interests", !/interests/.test(venues));
check("venues page renders partnership_type", /v\.partnership_type/.test(venues));
check("panel collects partnership_type", /partnership_type: form\.partnership_type/.test(src));
check("panel sets type Gallery for the Gallery tab", /set\("type", "Gallery"\)/.test(src));
check("panel sets type Institution for the Venue tab", /set\("type", "Institution"\)/.test(src));
check("galleries page queries type Gallery", /type: "Gallery"/.test(showcase));
// The venues page no longer queries a single type: Museum, Restaurant and
// Event Space are venues too, so it loads all of them and filters with the
// shared isVenueType helper.
check("venues page includes every venue type", /isVenueType\(r\.type\)/.test(venues));

/* ------------------------------------------- the maps plot real coordinates */

/*
 * THE BUG THIS EXISTS TO CATCH.
 *
 * Every map on the site drew EIGHT dots — one per chapter city, from a
 * hardcoded coordinate table — and decided which dot a listing belonged to by
 * testing whether its address text contained a chapter name. So 46 Zurich
 * galleries were one point in the middle of Zurich, zooming in found nothing,
 * and the 139 listings whose address matched no chapter name never appeared at
 * all. Every listing already carried its own geo_lat/geo_lng, resolved from its
 * address by the Locate button, and no map read them.
 *
 * A map of a directory plots the entries. If these checks ever fail, the map
 * has gone back to plotting cities.
 */

const mapSrc = readFileSync(new URL("../src/components/SpacesMap.jsx", import.meta.url), "utf8");
const galleryMapSrc = readFileSync(new URL("../src/pages/GalleryMap.jsx", import.meta.url), "utf8");

check("the map reads each listing's own coordinates", mapSrc.includes("r.geo_lat") && mapSrc.includes("r.geo_lng"));
check(
  "no hardcoded table of city coordinates survives in the map",
  !mapSrc.includes("CHAPTER_COORDS"),
  "a coordinate table is back — listings would collapse onto city centres"
);
check(
  "the gallery map page no longer plots chapter dots",
  !galleryMapSrc.includes("CHAPTER_COORDS"),
  "GalleryMap is plotting cities again"
);
const artistMapSrc = readFileSync(new URL("../src/pages/ArtistMap.jsx", import.meta.url), "utf8");
/*
 * /map opened with GalleriesVenuesMap and then showed a second map below it —
 * two maps on one page, neither of which located anything, both drawing the
 * same eight chapter dots.
 */
check(
  "the artist map page uses the real map, not the old chapter one",
  // The import and the element, not the file: the comment there names the old
  // component to explain why it went, and a whole-file match caught that.
  artistMapSrc.includes("import SpacesMap") &&
    !artistMapSrc.includes("import GalleriesVenuesMap") &&
    !artistMapSrc.includes("<GalleriesVenuesMap"),
  "GalleriesVenuesMap is back on /map"
);
check(
  "/map shows one galleries map, not two",
  (artistMapSrc.match(/<SpacesMap/g) || []).length === 1,
  "more than one SpacesMap on the page"
);
check(
  "every filtered listing is fed to the map",
  mapSrc.includes("sc.load(") && mapSrc.includes("matching.map((r) =>"),
  "the plotted set is not driven by the filtered listings"
);
check(
  "pins are drawn from the cluster index, so nothing is plotted twice",
  mapSrc.includes("index.getClusters(") && mapSrc.includes("<Marker"),
  "markers are not coming from the index"
);
/*
 * Clustering is computed with supercluster rather than a Leaflet plugin:
 * react-leaflet-markercluster hangs outright under jsdom and took the render
 * smoke test with it. supercluster is arithmetic over coordinates with no DOM,
 * so it runs anywhere, and the bubbles are drawn in the site's own black.
 */
check("markers are clustered", mapSrc.includes("new Supercluster("), "498 pins with no clustering is a blot");
check(
  "a cluster opens when tapped instead of being a dead end",
  mapSrc.includes("getClusterExpansionZoom"),
  "tapping a cluster must zoom into it"
);
check(
  "the view is framed on the data, not a fixed world view",
  mapSrc.includes("fitBounds"),
  "a fixed centre/zoom cannot suit six countries"
);

/* The list beside the map — "points are not listed" was the other complaint. */
check("the map has a list beside it", mapSrc.includes("inView"), "no list panel");
check(
  "the list shows what is in view, so map and list cannot disagree",
  mapSrc.includes("bounds.contains"),
  "the list is not tied to the viewport"
);
check("choosing from the list moves the map", mapSrc.includes("flyTo"));

/* Reachability, which is what a visitor actually wants from it. */
check("each pin offers directions", mapSrc.includes("directionsUrl"));
check(
  "directions prefer the written address over bare coordinates",
  mapSrc.includes("row.address"),
  "an approximate pin would send someone to the wrong door"
);
check("the map offers find-my-location", mapSrc.includes("navigator.geolocation"));
check(
  "pins are drawn differently for galleries and venues",
  mapSrc.includes("isVenueType(type)"),
  "a museum and a commercial gallery look identical"
);

/* Every listing, not a capped page — the fault that hid 17 of 19 venues. */
check(
  "the map pages through every listing rather than taking one capped page",
  mapSrc.includes("offset += PAGE") && mapSrc.includes("all.length >= count"),
  "a single capped request would silently drop listings"
);
check(
  "the map asks only for approved listings of the kinds it plots",
  mapSrc.includes('status: "approved"') && mapSrc.includes("$in: kinds"),
  "unapproved or irrelevant rows would be pinned"
);

/* Tiles: the old ones were rate-limited, which is why zooming felt broken. */
check(
  "tiles come from CARTO, not the rate-limited OSM endpoint",
  // The tile URL itself, not the file: the comment above it names the old
  // endpoint to explain why it went, and a whole-file match caught that.
  mapSrc.includes('url="https://{s}.basemaps.cartocdn.com') &&
    !mapSrc.includes('url="https://{s}.tile.openstreetmap.org'),
  "raw OSM tiles are rate-limited and made zooming feel broken"
);

/* ================================================================ report === */

console.log(`\n  passed: ${pass}`);
if (failures.length) {
  console.log(`  FAILED: ${failures.length}\n`);
  failures.forEach((f) => console.log(`   ✗ ${f}`));
  window.close();
  process.exit(1);
}
console.log("  admin panel: images, artwork, and fields matching the public pages\n");
window.close();
process.exit(0);
