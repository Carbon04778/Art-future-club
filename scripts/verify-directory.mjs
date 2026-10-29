/**
 * Verifies the Directory (B11 in docs/CLIENT-REQUESTS.md): the three types,
 * their addresses, the Directory page, the listing page without photos, the
 * map, sign-up, what Google sees, and migration 028.
 *
 * Run: npm run verify:directory
 */
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { JSDOM } from "jsdom";

const ROOT = fileURLToPath(new URL("..", import.meta.url));
const dom = new JSDOM("<!doctype html><html><body><div id='root'></div></body></html>", { url: "http://localhost/directory", pretendToBeVisual: true });
const { window } = dom;
globalThis.window = window; globalThis.document = window.document;
Object.defineProperty(globalThis, "navigator", { value: window.navigator, configurable: true });
for (const k of ["HTMLElement", "Element", "Node", "Event", "MouseEvent", "SVGElement", "Image", "HTMLInputElement"]) globalThis[k] = window[k];
globalThis.requestAnimationFrame = (cb) => setTimeout(() => cb(Date.now()), 0);
globalThis.ResizeObserver = window.ResizeObserver = class { observe() {} unobserve() {} disconnect() {} };
globalThis.matchMedia = window.matchMedia = () => ({ matches: false, media: "", addListener() {}, removeListener() {}, addEventListener() {}, removeEventListener() {} });
globalThis.IS_REACT_ACT_ENVIRONMENT = false;

const React = (await import("react")).default;
const { createRoot } = await import("react-dom/client");
const { MemoryRouter } = await import("react-router-dom");
const VT = await import("../src/lib/venueTypes.js");
const { spacePath } = await import("../src/lib/slugs.js");
const { MODERATED_COLLECTOR_TYPES } = await import("../src/lib/profileReadiness.js");
const { base44 } = await import("../src/api/base44Client.js");
const Directory = (await import("../src/pages/Directory.jsx")).default;

let pass = 0;
const fails = [];
const check = (n, c, d = "") => (c ? pass++ : fails.push(`${n}${d ? ` — ${d}` : ""}`));
const tick = (ms = 80) => new Promise((r) => setTimeout(r, ms));
const eq = (a, b) => JSON.stringify(a) === JSON.stringify(b);
const src = (f) => readFileSync(join(ROOT, f), "utf8");

// ---- types and addresses
check("three Directory types, as Julie asked", eq(VT.DIRECTORY_TYPES, ["Art Store", "Framer", "Printer"]));
check("they are profile types members and admins can choose", VT.DIRECTORY_TYPES.every((t) => VT.COLLECTOR_TYPES.includes(t)));
check("they are neither galleries nor venues", VT.DIRECTORY_TYPES.every((t) => !VT.isVenueType(t) && t !== "Gallery"));
check("they are held for approval like galleries and venues", VT.DIRECTORY_TYPES.every((t) => MODERATED_COLLECTOR_TYPES.includes(t)));
check("a framer's address is /directory/…", spacePath({ type: "Framer", slug: "frame-co" }) === "/directory/frame-co");
check("…whatever an older caller passes", spacePath({ type: "Printer", slug: "p" }, true) === "/directory/p" && spacePath({ type: "Art Store", slug: "s" }, false) === "/directory/s");
check("galleries and venues keep their addresses", spacePath({ type: "Gallery", slug: "g" }) === "/gallery/g" && spacePath({ type: "Museum", slug: "m" }, true) === "/venues/m");

// ---- the Directory page
const ROWS = [
  { id: "1", slug: "brush-co", display_name: "Brush Co", type: "Art Store", based_in: "Hong Kong", bio: "Paints and brushes", status: "approved" },
  { id: "2", slug: "frame-it", display_name: "Frame It", type: "Framer", based_in: "London", status: "approved" },
  { id: "3", slug: "giclee-lab", display_name: "Giclee Lab", type: "Printer", based_in: "Hong Kong", status: "approved" },
  { id: "4", slug: "a-gallery", display_name: "A Gallery", type: "Gallery", based_in: "Hong Kong", status: "approved" }, // must never show
];
let asked = null;
base44.entities.CollectorProfile.filter = async (where) => { asked = where; return ROWS; };
const c = document.getElementById("root");
const names = () => [...c.querySelectorAll('[data-testid="directory-card"] h3')].map((h) => h.textContent).sort();
const press = async (label) => { [...c.querySelectorAll("button")].find((b) => b.textContent.trim() === label)?.click(); await tick(150); };
{
  const root = createRoot(c);
  root.render(React.createElement(MemoryRouter, null, React.createElement(Directory)));
  for (let i = 0; i < 40 && !c.querySelector('[data-testid="directory-card"]'); i++) await tick(50);
  check("the page asks the database for Directory types only", eq(asked?.type?.$in, VT.DIRECTORY_TYPES), JSON.stringify(asked));
  check("lists the three businesses, never a gallery", eq(names(), ["Brush Co", "Frame It", "Giclee Lab"]), names().join());
  check("each card opens /directory/…", !!c.querySelector('a[href="/directory/frame-it"]'));
  check("offers 'View on the map' (Directory filter)", !!c.querySelector('a[href="/map?show=directory"]'));
  check("invites businesses to list or claim themselves", /list your business/i.test(c.textContent) && !!c.querySelector('a[href="/onboarding"]'));
  await press("Framers");
  check("category: Framers", eq(names(), ["Frame It"]), names().join());
  await press("All");
  await press("Hong Kong");
  check("chapter: Hong Kong", eq(names(), ["Brush Co", "Giclee Lab"]), names().join());
  const box = c.querySelector('input[placeholder^="Search"]');
  Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, "value").set.call(box, "brushes");
  box.dispatchEvent(new window.Event("input", { bubbles: true }));
  await tick(150);
  check("search reaches the bio too", eq(names(), ["Brush Co"]), names().join());
  Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, "value").set.call(box, "zzz");
  box.dispatchEvent(new window.Event("input", { bubbles: true }));
  await tick(150);
  check("no match: says so", /nothing matches/i.test(c.textContent));
  root.unmount();
}
{
  base44.entities.CollectorProfile.filter = async () => [];
  const root = createRoot(c);
  root.render(React.createElement(MemoryRouter, null, React.createElement(Directory)));
  for (let i = 0; i < 40 && !c.querySelector('[data-testid="directory-empty"]'); i++) await tick(50);
  check("empty Directory: 'coming soon', not an error", /coming soon/i.test(c.textContent));
  root.unmount();
}

// ---- the listing page, sign-up, header, map, Google
const gp = src("src/pages/GalleryProfile.jsx");
check("listing page: no photos, exhibitions or works for Directory types", /\{!isDirectoryType\(profile\.type\) && \(<>\s*<SpaceGallery[\s\S]*?<\/>\)\}\s*<div className="mt-16">\s*<GalleryAddressMap/.test(gp));
check("listing page: back link 'The Directory'", /isDirectoryType\(profile\.type\) \? "\/directory"/.test(gp));
check("routes /directory and /directory/:id", /path="\/directory" element=\{<Directory \/>\}/.test(src("src/App.jsx")) && /path="\/directory\/:id" element=\{<GalleryProfile \/>\}/.test(src("src/App.jsx")));
check("'Directory' in the main menu", /\{ to: "\/directory", label: "Directory" \}/.test(src("src/components/SiteHeader.jsx")));
check("'My Profile' for a business opens their listing", /const listing = collectors\.find\(\(c\) => isDirectoryType\(c\.type\)\)/.test(src("src/components/SiteHeader.jsx")));
const onb = src("src/pages/Onboarding.jsx");
check("sign-up: 'Art store / Framer / Printer' choice with a required type", /key: "business"/.test(onb) && /role === "business" \? form\.business_type/.test(onb) && /role === "business" && !form\.business_type/.test(onb));
check("sign-up: an artist's sign-up never sends business_type (artist_profile has no such column)", /const \{ business_type: _businessType, \.\.\.artistFields \} = form;\s*await base44\.entities\.ArtistProfile\.create\(\{ \.\.\.artistFields/.test(onb));
check("sign-up: an existing profile's type is never changed here (A1 queue instead)", /CollectorProfile\.update\(existing\[0\]\.id, \{ display_name: form\.display_name \}\)/.test(onb));
check("after claiming, sign-up takes a business to its listing", /const listing = collectors\.find\(\(c\) => isDirectoryType\(c\.type\)\);\s*if \(listing\) return navigate\(spacePath\(listing\)/.test(onb));
check("claiming refreshes the data cache", /"claimMyProfile",\s*"requestProfileSwitch"/.test(src("src/api/base44Client.js")));
check("collector editor sends a business to its listing", /isDirectoryType\(p\.type\)\);\s*if \(listing\) \{ navigate\(spacePath\(listing\)/.test(src("src/pages/CollectorProfilePage.jsx")));
const map = src("src/components/SpacesMap.jsx");
check("map: Directory filter, and directory pins loaded", /"Directory"\]/.test(map) && /\.\.\.DIRECTORY_TYPES\]/.test(map));
for (const f of ["src/components/map/GoogleSpacesSurface.jsx", "src/components/map/LeafletSpacesSurface.jsx"]) {
  check(`${f.split("/").pop()}: its own pin for Directory businesses`, /isDirectoryType\(type\)\s*\?\s*`<path d="M5\.2 8\.2h9\.6/.test(src(f)));
}
check("the small map on a listing page uses the Directory pin too", /isDirectoryType\(type\)\s*\?\s*`<path d="M5\.2 8\.2h9\.6/.test(src("src/components/map/PlaceMap.jsx")));
check("map page understands ?show=directory", /directory: "Directory"/.test(src("src/pages/ArtistMap.jsx")));
check("Google: /directory pages are pre-rendered for crawlers", /artists\|gallery\|venues\|directory\|events\|editorial/.test(src("vercel.json")) && /prefix: "\/directory", table: "collector_profile", kind: "space", directory: true/.test(src("api/prerender.js")));
check("Google: a framer is a LocalBusiness, an art store a Store — not a 'Gallery'", /"Art Store"\s*\?\s*"Store"[\s\S]{0,80}"Framer" \|\| row\.type === "Printer"\s*\?\s*"LocalBusiness"/.test(src("api/prerender.js")) && /"Art Store"\s*\?\s*"Store"/.test(src("src/hooks/useGallerySeoMeta.js")));
const sm = src("api/sitemap.js");
check("sitemap: /directory and each listing under /directory", /\["\/directory", 0\.7/.test(sm) && /DIRECTORY_TYPES\.has\(s\.type\) \? "\/directory"/.test(sm) && /new Set\(\["Art Store", "Framer", "Printer"\]\)/.test(sm));

// ---- the database file
const mig = src("supabase/migrations/028_directory.sql");
check("028: Directory types held for approval", /'Art Store', 'Framer', 'Printer'\s*\);/.test(mig));
check("028: members may switch to a Directory type", /switch_target_types[\s\S]*'Art Store', 'Framer', 'Printer'\]/.test(mig));
check("028: open calls stay galleries and venues only", /can_post_open_call[\s\S]*c\.type in \('Gallery', 'Institution', 'Museum', 'Foundation', 'Event Space', 'Restaurant'\)/.test(mig) && !/is_moderated_space/.test(mig.match(/function public\.can_post_open_call\(\)[\s\S]*?\$\$;/)[0].replace(/--.*$/gm, "")));
check("028: changes no rows", !/\b(update|delete|insert into)\b/i.test(mig.replace(/--.*$/gm, "")));
const undo = src("supabase/migrations/028_directory.revert.sql");
check("undo restores the three lists as before", /'Gallery', 'Institution', 'Museum', 'Foundation', 'Event Space', 'Restaurant'\s*\);/.test(undo) && /public\.is_moderated_space\(c\.type\)/.test(undo));

console.log(`verify:directory — ${pass} passed, ${fails.length} failed`);
if (fails.length) { for (const f of fails) console.log("  ✗", f); process.exit(1); }
process.exit(0);
