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
 * TWO SURFACES, ONE MAP. Google where there is a key, Leaflet where there is
 * not. The data, the filters and the list live in SpacesMap so there is one
 * copy whichever is drawing — the site must not end up with two maps that
 * behave differently.
 */

const mapSrc = readFileSync(new URL("../src/components/SpacesMap.jsx", import.meta.url), "utf8");
const googleSurface = readFileSync(new URL("../src/components/map/GoogleSpacesSurface.jsx", import.meta.url), "utf8");
const leafletSurface = readFileSync(new URL("../src/components/map/LeafletSpacesSurface.jsx", import.meta.url), "utf8");
const placeMap = readFileSync(new URL("../src/components/map/PlaceMap.jsx", import.meta.url), "utf8");
const googleLib = readFileSync(new URL("../src/lib/googleMaps.js", import.meta.url), "utf8");
const galleryMapSrc = readFileSync(new URL("../src/pages/GalleryMap.jsx", import.meta.url), "utf8");
const artistMapSrc = readFileSync(new URL("../src/pages/ArtistMap.jsx", import.meta.url), "utf8");
const addressMap = readFileSync(new URL("../src/components/gallery/GalleryAddressMap.jsx", import.meta.url), "utf8");

/* --- real coordinates, never a table of city centres --- */

check(
  "the map reads each listing's own coordinates",
  mapSrc.includes("r.geo_lat") && mapSrc.includes("r.geo_lng"),
  "the plotted set is not built from stored coordinates"
);
for (const [name, src] of [["SpacesMap", mapSrc], ["the Google surface", googleSurface], ["the Leaflet surface", leafletSurface]]) {
  check(
    `no hardcoded table of city coordinates in ${name}`,
    !src.includes("CHAPTER_COORDS"),
    "listings would collapse onto city centres again"
  );
}
check(
  "the gallery map page no longer plots chapter dots",
  !galleryMapSrc.includes("CHAPTER_COORDS"),
  "GalleryMap is plotting cities again"
);

/* --- choosing a surface --- */

check(
  "a Google key is what selects the Google surface",
  mapSrc.includes("hasGoogleMaps()") && mapSrc.includes("GoogleSpacesSurface"),
  "the Google map is not wired in"
);
check(
  "without a key the Leaflet surface draws instead",
  mapSrc.includes("LeafletSpacesSurface"),
  "a missing key would leave no map at all"
);
check(
  "a runtime failure falls back too, not just a missing key",
  mapSrc.includes("googleFailed") && googleSurface.includes("onUnavailable"),
  "a refused referrer or spent quota would leave a blank rectangle"
);
check(
  "the key is read from the environment, never written into the source",
  googleLib.includes("import.meta.env.VITE_GOOGLE_MAPS_API_KEY") && !googleLib.includes("AIza"),
  "a key committed to the repo cannot be rotated"
);

/* --- both surfaces must behave the same --- */

for (const [name, src] of [["Google", googleSurface], ["Leaflet", leafletSurface]]) {
  check(`the ${name} surface clusters its pins`, src.includes("luster"), "hundreds of pins with no clustering is a blot");
  check(
    `the ${name} surface distinguishes galleries from venues`,
    src.includes("isVenueType"),
    "a museum and a commercial gallery would look identical"
  );
  check(
    `the ${name} surface frames itself on the data`,
    src.includes("fitBounds") || src.includes("LatLngBounds"),
    "a fixed centre and zoom cannot suit six countries"
  );
  check(
    `the ${name} surface offers find-my-location`,
    src.includes("navigator.geolocation"),
    "the visitor cannot place themselves"
  );
  check(
    `the ${name} surface reports its viewport so the list can follow`,
    src.includes("onViewportChange"),
    "the map and the list would disagree"
  );
}

/* --- the list beside the map: "points are not listed" was the complaint --- */

check("the map has a list beside it", mapSrc.includes("inView"), "no list panel");
check(
  "the list shows what is in view, so map and list cannot disagree",
  mapSrc.includes("bounds.contains"),
  "the list is not tied to the viewport"
);
check(
  "the viewport test works for either surface's bounds",
  // Leaflet takes [lat, lng] or {lat, lng}; Google takes {lat, lng}. One shape
  // covers both, so the list never needs to know which map is drawing.
  mapSrc.includes("bounds.contains({ lat:"),
  "an array would work on Leaflet and silently fail on Google"
);

/* --- getting there --- */

check(
  "the map builds its directions link with the shared builder",
  mapSrc.includes("directionsUrl") && !mapSrc.includes("google.com/maps/dir"),
  "a second hand-rolled link would drift from the tested one"
);
check(
  "the map offers the visitor's position as the directions origin",
  mapSrc.includes("onLocated") && mapSrc.includes("getCurrentPosition"),
  "without an origin Google cannot route from a desktop"
);

/* --- tiles on the fallback: a 200 is not proof the tile is usable --- */

const KEYED_TILE_HOSTS = ["basemaps.cartocdn.com", "api.mapbox.com", "tiles.stadiamaps.com", "api.maptiler.com"];
for (const src of [leafletSurface, placeMap, artistMapSrc]) {
  for (const host of KEYED_TILE_HOSTS) {
    check(
      `tiles do not come from ${host}, which requires an API key`,
      !src.includes(`url="https://${host}`) && !src.includes(`url="https://{s}.${host}`),
      "that provider watermarks or refuses tiles without a key"
    );
  }
  check(
    "tiles do not come from the rate-limited OSM endpoint",
    !src.includes('url="https://{s}.tile.openstreetmap.org') &&
      !src.includes('url="https://tile.openstreetmap.org'),
    "raw OSM tiles are rate-limited and made zooming feel broken"
  );
}
check(
  "the fallback map carries a base layer and a labels layer",
  (leafletSurface.match(/<TileLayer/g) || []).length >= 2,
  "a base map with no street names cannot be used to walk between galleries"
);
check("the tile provider is attributed", leafletSurface.includes("attribution="), "every free tile provider requires attribution");

/* --- the profile map: it had been re-geocoding an answer it already had --- */

check(
  "a profile map uses the listing's stored coordinates",
  addressMap.includes("profile?.geo_lat != null"),
  "it would geocode the same address on every page view"
);
check(
  "geocoding survives only as a fallback for an unlocated listing",
  addressMap.includes("nominatim.openstreetmap.org"),
  "a listing with an address but no pin would show no map at all"
);
check(
  "the profile map shares the same surfaces as the big map",
  addressMap.includes("PlaceMap") && placeMap.includes("hasGoogleMaps"),
  "two maps built differently will drift apart"
);

/* --- /map: one galleries map, not two --- */

check(
  "the artist map page uses the real map, not the old chapter one",
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


/* ------------------------------------------------ Trending Now, on the home page */

/*
 * Every card under "Trending Now" linked to /gallery — the galleries index,
 * the same destination for all four, whichever piece was clicked. A trending
 * work should lead to the artist whose work it is.
 *
 * `artist_id` is a profile id on newer rows and a user_id on older ones, so the
 * lookup has to accept both; keying on one alone silently drops half.
 */
const trending = readFileSync(new URL("../src/components/TrendingSection.jsx", import.meta.url), "utf8");

check(
  "a trending work links to its artist",
  trending.includes("artistPath(work.artist)"),
  "trending works are not linking to an artist"
);
check(
  "no card points at the galleries index any more",
  !trending.includes('to="/gallery"'),
  "a hardcoded /gallery link is back — every card would share one destination"
);
check(
  "a work whose artist cannot be resolved still goes somewhere sensible",
  trending.includes('"/artists"'),
  "an unresolved artist would produce a dead link"
);
check(
  "the artist lookup accepts both a profile id and a user_id",
  trending.includes("byArtist[a.id]") && trending.includes("byArtist[a.user_id]"),
  "older rows carry a user_id and would not resolve"
);
check(
  "gallery works resolve an artist too, not just portfolio works",
  trending.includes("byArtist[w.artist_id]"),
  "only portfolio works would link correctly"
);


/* ------------------------------------------------- the Google sign-in button */

/*
 * "Continue with Google" sat at the top of both the sign-in and join pages,
 * above the email form, and returned an error to anyone who pressed it: the
 * button calls signInWithOAuth({ provider: "google" }) and Google is not among
 * the providers enabled on the Supabase project. Checked 2026-09-24 against
 * /auth/v1/settings — email was the only one on.
 *
 * It is hidden behind a flag rather than deleted, so turning it on later is one
 * line once Google is enabled in Supabase. What must not happen is the button
 * reappearing while the provider is still off.
 */
const limits = readFileSync(new URL("../src/lib/featureLimits.js", import.meta.url), "utf8");
const login = readFileSync(new URL("../src/pages/Login.jsx", import.meta.url), "utf8");
const register = readFileSync(new URL("../src/pages/Register.jsx", import.meta.url), "utf8");

check(
  "there is a single flag for the Google sign-in button",
  limits.includes("export const GOOGLE_SIGN_IN_ENABLED"),
  "the pages would each need editing to bring it back"
);

for (const [name, src] of [["sign-in", login], ["join", register]]) {
  check(
    `the ${name} page gates the Google button on that flag`,
    src.includes("{GOOGLE_SIGN_IN_ENABLED && ("),
    "the button is rendered unconditionally"
  );
  check(
    `the ${name} page hides the "or" divider with it`,
    // Both inside one conditional: hiding the button alone leaves "or" above
    // nothing, which looks like a rendering fault.
    src.indexOf("{GOOGLE_SIGN_IN_ENABLED && (") < src.indexOf('className="relative mb-6"'),
    "the divider is outside the flag and would be orphaned"
  );
  check(
    `the ${name} page still offers email sign-in`,
    src.includes("type=\"email\"") || src.includes("email"),
    "email is the only working provider — it must not be gated too"
  );
}

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
