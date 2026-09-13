/**
 * The three detail pages, driven for real on both url forms.
 *
 * verify:seo proves the helpers and the tags in isolation. This mounts the
 * actual pages and answers the only question that matters to a visitor:
 *
 *   - a readable url opens the right record
 *   - an OLD UUID url still opens it, and tidies itself to the slug
 *   - arriving already on the slug does NOT redirect (no loop)
 *   - a nonexistent url says so instead of spinning forever
 *   - the head really ends up with the title, canonical and absolute og:image
 *
 * Run: npm run verify:slug-routes
 */

import { JSDOM } from "jsdom";

const dom = new JSDOM("<!doctype html><html><head></head><body><div id='root'></div></body></html>", {
  url: "http://localhost/",
  pretendToBeVisual: true,
});
const { window } = dom;
globalThis.window = window;
globalThis.document = window.document;
Object.defineProperty(globalThis, "navigator", { value: window.navigator, configurable: true });
for (const k of ["HTMLElement", "Element", "Node", "File", "Blob", "Event", "MouseEvent", "SVGElement", "DOMRect"]) {
  globalThis[k] = window[k];
}
window.URL.createObjectURL = () => "blob:x";
window.URL.revokeObjectURL = () => {};
globalThis.URL.createObjectURL = () => "blob:x";
globalThis.URL.revokeObjectURL = () => {};
globalThis.requestAnimationFrame = (cb) => setTimeout(() => cb(Date.now()), 0);
globalThis.ResizeObserver = window.ResizeObserver = class { observe() {} unobserve() {} disconnect() {} };
globalThis.IntersectionObserver = window.IntersectionObserver = class {
  constructor(cb) { this.cb = cb; }
  observe(el) { this.cb([{ target: el, isIntersecting: true, intersectionRatio: 1 }], this); }
  unobserve() {} disconnect() {} takeRecords() { return []; }
};
window.scrollTo = () => {};
window.matchMedia = window.matchMedia || ((q) => ({
  matches: false, media: q, addEventListener() {}, removeEventListener() {},
  addListener() {}, removeListener() {},
}));

const React = (await import("react")).default;
const { createRoot } = await import("react-dom/client");
const { MemoryRouter, Routes, Route, useLocation } = await import("react-router-dom");
const { auth, entities } = await import("../src/api/providers/mock.js");

const ArtistProfileView = (await import("../src/pages/ArtistProfileView.jsx")).default;
const GalleryProfile = (await import("../src/pages/GalleryProfile.jsx")).default;
const EventDetail = (await import("../src/pages/EventDetail.jsx")).default;

let pass = 0;
const failures = [];
const check = (n, c, d = "") => (c ? pass++ : failures.push(`${n}${d ? ` — ${d}` : ""}`));
const settle = (ms) => new Promise((r) => setTimeout(r, ms));

/* ------------------------------------------------------------- fixtures */
await auth.loginViaEmailPassword("admin@artfutureclub.com", "password123");

const artist = await entities.ArtistProfile.create({
  display_name: "Ada Ruiz Moréno", discipline: "Painting", based_in: "Hong Kong",
  bio: "Paints large, slow canvases about weather and memory.",
  avatar_url: "/images/placeholder.webp", status: "approved",
  portfolio_works: [
    { title: "Low Pressure", year: "2025", medium: "Oil on linen",
      dimensions: "180 x 140 cm", image_url: "/images/placeholder.webp" },
  ],
});
const gallery = await entities.CollectorProfile.create({
  display_name: "Soluna Fine Art", type: "Gallery", based_in: "Hong Kong",
  bio: "A gallery on Hollywood Road.", avatar_url: "/images/placeholder.webp",
  cover_image_url: "/images/placeholder.webp", address: "52 Sai Street",
  status: "approved",
});
const museum = await entities.CollectorProfile.create({
  display_name: "Tai Kwun Contemporary", type: "Museum", based_in: "Hong Kong",
  bio: "A heritage site and art centre.", avatar_url: "/images/placeholder.webp",
  status: "approved",
});
const event = await entities.Event.create({
  title: "Heatwave: A Group Show", event_type: "Exhibition", chapter: "Hong Kong",
  venue: "10 Chancery Lane Gallery", address: "6 Chancery Lane",
  description: "Six artists on the subject of heat.",
  start_date: new Date(Date.now() + 864e5).toISOString(),
  end_date: new Date(Date.now() + 864e5 * 30).toISOString(),
  image_url: "/images/placeholder.webp", is_free: true,
});

check("the artist fixture got a readable slug", artist.slug === "ada-ruiz-moreno", String(artist.slug));
check("an accent in a name does not leak into the url", !/[^a-z0-9-]/.test(artist.slug || "x!"));
check("the gallery fixture got a readable slug", gallery.slug === "soluna-fine-art", String(gallery.slug));
check("the event fixture got a readable slug", event.slug === "heatwave-a-group-show", String(event.slug));

/* --------------------------------------------------------------- harness */

let container;
let seenPath = "";

/** Reports the url the router actually settled on, after any redirect. */
function PathSpy() {
  const loc = useLocation();
  seenPath = loc.pathname;
  return null;
}

async function open(routePath, initialUrl, Page) {
  document.head.innerHTML = "";
  document.body.innerHTML = "<div id='root'></div>";
  container = document.getElementById("root");
  seenPath = "";
  const root = createRoot(container);
  let captured = null;
  const orig = console.error;
  console.error = (...a) => {
    if (!captured) captured = a.map((x) => x?.message || String(x)).join(" ").slice(0, 300);
  };
  root.render(
    React.createElement(
      MemoryRouter,
      { initialEntries: [initialUrl] },
      React.createElement(PathSpy),
      React.createElement(
        Routes,
        null,
        React.createElement(Route, { path: routePath, element: React.createElement(Page) })
      )
    )
  );
  await settle(1500);
  console.error = orig;
  return captured;
}

const text = () => container.textContent || "";
const head = (sel, attr = "content") => document.head.querySelector(sel)?.getAttribute(attr) || "";

/* ============================================ 1. artist, on its slug url */

let err = await open("/artists/:id", `/artists/${artist.slug}`, ArtistProfileView);
check("artist page opens on a slug url", !err, err || "");
check("it shows the right artist", text().includes("Ada Ruiz Moréno"), text().slice(0, 120));
check("a correct url does NOT redirect", seenPath === `/artists/${artist.slug}`, seenPath);
check("the title is the artist's, not the site's",
  document.title.startsWith("Ada Ruiz Moréno"), document.title);
check("the title names the discipline and city",
  /Painting/.test(document.title) && /Hong Kong/.test(document.title), document.title);
check("there is a real description",
  head('meta[name="description"]').includes("slow canvases"), head('meta[name="description"]'));
check("canonical points at the slug url",
  head('link[rel="canonical"]', "href") === `https://www.artfutureclub.com/artists/${artist.slug}`,
  head('link[rel="canonical"]', "href"));
check("og:image is absolute",
  head('meta[property="og:image"]').startsWith("https://"), head('meta[property="og:image"]'));
const artistLd = [...document.head.querySelectorAll('script[type="application/ld+json"]')]
  .map((s) => JSON.parse(s.textContent));
check("Person structured data is present", artistLd.some((d) => d["@type"] === "Person"));
check("breadcrumbs are present", artistLd.some((d) => d["@type"] === "BreadcrumbList"));
check("the portfolio is described as artwork",
  artistLd.find((d) => d["@type"] === "Person")?.workExample?.[0]?.["@type"] === "VisualArtwork");
check("artwork images in structured data are absolute",
  artistLd.find((d) => d["@type"] === "Person")?.workExample?.[0]?.image?.startsWith("https://"));

/* ======================================== 2. artist, on the OLD uuid url */

err = await open("/artists/:id", `/artists/${artist.id}`, ArtistProfileView);
check("an old id url still opens the artist", !err && text().includes("Ada Ruiz Moréno"),
  err || text().slice(0, 100));
check("an old id url REDIRECTS to the slug", seenPath === `/artists/${artist.slug}`, seenPath);
check("canonical is the slug even when arriving by id",
  head('link[rel="canonical"]', "href").endsWith(`/artists/${artist.slug}`),
  head('link[rel="canonical"]', "href"));

/* ============================================= 3. artist, missing record */

err = await open("/artists/:id", "/artists/nobody-by-that-name", ArtistProfileView);
check("a missing artist says so rather than spinning forever",
  /not available/i.test(text()), text().slice(0, 140));
check("a missing artist does not redirect anywhere", seenPath === "/artists/nobody-by-that-name", seenPath);

/* ================================================= 4. gallery and venue */

err = await open("/gallery/:id", `/gallery/${gallery.slug}`, GalleryProfile);
check("gallery page opens on a slug url", !err, err || "");
check("it shows the right gallery", text().includes("Soluna Fine Art"), text().slice(0, 120));
check("gallery canonical is the /gallery path",
  head('link[rel="canonical"]', "href") === `https://www.artfutureclub.com/gallery/${gallery.slug}`,
  head('link[rel="canonical"]', "href"));
const galleryLd = [...document.head.querySelectorAll('script[type="application/ld+json"]')]
  .map((s) => JSON.parse(s.textContent));
check("a Gallery declares itself a Gallery", galleryLd.some((d) => d["@type"] === "Gallery"),
  galleryLd.map((d) => d["@type"]).join(", "));

err = await open("/gallery/:id", `/gallery/${gallery.id}`, GalleryProfile);
check("an old gallery id url redirects to the slug", seenPath === `/gallery/${gallery.slug}`, seenPath);

/* The same component serves /venues/:id, and the canonical must follow the
 * path the visitor is actually on rather than always claiming /gallery. */
err = await open("/venues/:id", `/venues/${museum.slug}`, GalleryProfile);
check("venue page opens on a slug url", !err && text().includes("Tai Kwun"), err || text().slice(0, 100));
check("a venue canonical keeps the /venues path",
  head('link[rel="canonical"]', "href") === `https://www.artfutureclub.com/venues/${museum.slug}`,
  head('link[rel="canonical"]', "href"));
const museumLd = [...document.head.querySelectorAll('script[type="application/ld+json"]')]
  .map((s) => JSON.parse(s.textContent));
check("a Museum declares itself a Museum, not a Gallery",
  museumLd.some((d) => d["@type"] === "Museum"), museumLd.map((d) => d["@type"]).join(", "));

err = await open("/venues/:id", `/venues/${museum.id}`, GalleryProfile);
check("an old venue id url redirects within /venues, not to /gallery",
  seenPath === `/venues/${museum.slug}`, seenPath);

/* ============================================================ 5. events */

err = await open("/events/:id", `/events/${event.slug}`, EventDetail);
check("event page opens on a slug url", !err, err || "");
check("it shows the right event", text().includes("Heatwave"), text().slice(0, 120));
check("the event title names the city", /Hong Kong/.test(document.title), document.title);
check("event canonical is the slug url",
  head('link[rel="canonical"]', "href") === `https://www.artfutureclub.com/events/${event.slug}`,
  head('link[rel="canonical"]', "href"));
const eventLd = [...document.head.querySelectorAll('script[type="application/ld+json"]')]
  .map((s) => JSON.parse(s.textContent));
const ev = eventLd.find((d) => d["@type"] === "Event");
check("Event structured data is present", !!ev);
check("it carries the two fields a rich result requires",
  ev?.eventAttendanceMode?.includes("Offline") && ev?.eventStatus?.includes("Scheduled"),
  JSON.stringify({ mode: ev?.eventAttendanceMode, status: ev?.eventStatus }));
check("it carries both dates", !!ev?.startDate && !!ev?.endDate);
check("it carries the venue as a Place", ev?.location?.["@type"] === "Place", JSON.stringify(ev?.location));
check("a free event is priced at zero rather than left unstated",
  ev?.offers?.price === "0", JSON.stringify(ev?.offers));

err = await open("/events/:id", `/events/${event.id}`, EventDetail);
check("an old event id url redirects to the slug", seenPath === `/events/${event.slug}`, seenPath);

err = await open("/events/:id", "/events/no-such-event", EventDetail);
check("a missing event shows its 404, not a spinner", /not found/i.test(text()), text().slice(0, 120));

/* ====================================== 6. a held profile stays unindexed */

const held = await entities.ArtistProfile.create({
  display_name: "Not Yet Public", discipline: "Sculpture", bio: "Draft.",
});
check("a new profile starts unapproved", held.status !== "approved", String(held.status));
await open("/artists/:id", `/artists/${held.slug}`, ArtistProfileView);
check("an unapproved profile is marked noindex for crawlers",
  head('meta[name="robots"]') === "noindex, follow", head('meta[name="robots"]') || "(no robots tag)");

/* ======================================= 7. tags do not leak between pages */

await open("/artists/:id", `/artists/${artist.slug}`, ArtistProfileView);
const beforeTitle = document.title;
await open("/events/:id", `/events/${event.slug}`, EventDetail);
check("moving to another page replaces the title rather than keeping the old one",
  document.title !== beforeTitle && document.title.includes("Heatwave"), document.title);
check("only one canonical tag exists at a time",
  document.head.querySelectorAll('link[rel="canonical"]').length === 1,
  String(document.head.querySelectorAll('link[rel="canonical"]').length));
check("structured data does not accumulate across navigations",
  document.head.querySelectorAll('script[type="application/ld+json"]').length === 2,
  String(document.head.querySelectorAll('script[type="application/ld+json"]').length));

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
console.log("  readable urls open, old links redirect, and every page describes itself\n");
process.exit(0);
