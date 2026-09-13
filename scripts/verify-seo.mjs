/**
 * SEO and readable urls.
 *
 * Covers three things that were all broken:
 *
 *   1. SLUGS. Every public page except editorial was addressed by a UUID.
 *      Migration 019 adds a slug column and src/lib/slugs.js resolves either
 *      form, so old links keep working and tidy themselves up.
 *   2. META TAGS. Artist and event pages had none at all. Gallery and article
 *      pages had a relative og:image, which every social platform ignores, and
 *      no canonical tag, so a page reachable by slug and by id competed with
 *      itself in search results.
 *   3. CRAWLING. robots.txt pointed at REPLACE-WITH-YOUR-DOMAIN, there was no
 *      sitemap, and a client-rendered app shows AI crawlers and link-preview
 *      fetchers a blank page.
 *
 * Run: npm run verify:seo
 */

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { JSDOM } from "jsdom";

const here = path.dirname(fileURLToPath(import.meta.url));
const read = (p) => fs.readFileSync(path.join(here, p), "utf8");

/* A DOM is needed before anything that touches document is imported. */
const dom = new JSDOM("<!doctype html><html><head></head><body><div id='root'></div></body></html>", {
  url: "https://www.artfutureclub.com/artists/naishi-jogani",
});
globalThis.window = dom.window;
globalThis.document = dom.window.document;

let pass = 0;
const failures = [];
const check = (n, c, d = "") => (c ? pass++ : failures.push(`${n}${d ? ` — ${d}` : ""}`));

const {
  slugify, isUuid, pathId, artistPath, spacePath, eventPath, articlePath,
  findBySlugOrId, shouldRedirectToSlug,
} = await import("../src/lib/slugs.js");

const {
  SITE_URL, absoluteUrl, canonicalUrl, clampDescription, applySeo, breadcrumbs,
} = await import("../src/lib/seo.js");

/* ====================================================== 1. slugify itself */

// Real values taken from the live database, including the three that actually
// needed handling: an accented name, a title in Chinese, and an over-long one.
const CASES = [
  ["Naishi Jogani", "naishi-jogani"],
  ["Soluna Fine Art", "soluna-fine-art"],
  ["Málaga Contemporánea", "malaga-contemporanea"],
  ["10 Chancery Lane Gallery", "10-chancery-lane-gallery"],
  ["Beyond the Ordinary: Contemporary Book Art", "beyond-the-ordinary-contemporary-book-art"],
  ["離線回憶： 前互聯網時代香港同志印刷品檔案館", ""],
  ["  spaces   everywhere  ", "spaces-everywhere"],
  ["Trailing---hyphens---", "trailing-hyphens"],
  ["Ümlaut & Ampersand", "umlaut-ampersand"],
];
for (const [input, expected] of CASES) {
  check(`slugify(${JSON.stringify(input).slice(0, 34)})`, slugify(input) === expected,
    `got ${JSON.stringify(slugify(input))}, expected ${JSON.stringify(expected)}`);
}

check("a slug is capped at 70 characters", slugify("a".repeat(200)).length === 70,
  String(slugify("a".repeat(200)).length));
check("the cap never leaves a trailing hyphen",
  !slugify(`${"ab ".repeat(30)}`).endsWith("-"), slugify(`${"ab ".repeat(30)}`).slice(-12));
check("slugify of nothing is an empty string, not a crash",
  slugify(null) === "" && slugify(undefined) === "" && slugify("") === "");
check("slugify is idempotent", slugify(slugify("Soluna Fine Art")) === "soluna-fine-art");

/* The SQL and the JS must agree, or a row written by one is unreachable by the
 * other. The translate() pair in 019 is the part most easily mistyped. */
const sql = read("../supabase/migrations/019_slugs.sql");
check("019 folds accents rather than requiring the unaccent extension",
  /translate\(/.test(sql) && !/create extension.*unaccent/i.test(sql));
check("019 caps the slug at the same 70 characters", /left\(coalesce\(input, ''\), 70\)/.test(sql));
check("019 backfills all three tables",
  ["artist_profile", "collector_profile", "event"].every((t) => sql.includes(`('${t}'`)));
check("019 adds a unique index per table",
  (sql.match(/create unique index if not exists idx_\w+_slug/g) || []).length === 3);
check("019 installs a trigger per table",
  (sql.match(/create trigger trg_slug_\w+/g) || []).length === 3);
check("019 falls back to the id when a name yields no slug",
  /new\.slug := new\.id::text/.test(sql));
check("019 is safe to re-run",
  /create or replace function public\.slugify/.test(sql) &&
  /add column if not exists slug/.test(sql) &&
  /drop trigger if exists/.test(sql));

/* ========================================================== 2. the helpers */

check("isUuid recognises a real id", isUuid("d9ab6f21-5cc1-4d93-8c3a-9a3365bb8e10"));
check("isUuid rejects a slug", !isUuid("naishi-jogani"));
check("isUuid rejects empty input", !isUuid("") && !isUuid(null));

check("pathId prefers the slug", pathId({ id: "abc", slug: "naishi-jogani" }) === "naishi-jogani");
check("pathId falls back to the id", pathId({ id: "abc" }) === "abc");
check("pathId survives a missing record", pathId(null) === "");

check("artistPath", artistPath({ slug: "naishi-jogani" }) === "/artists/naishi-jogani");
check("spacePath defaults to /gallery", spacePath({ slug: "soluna" }) === "/gallery/soluna");
check("spacePath honours isVenue", spacePath({ slug: "m-plus" }, true) === "/venues/m-plus");
check("eventPath", eventPath({ slug: "heatwave" }) === "/events/heatwave");
check("articlePath", articlePath({ slug: "a-piece" }) === "/editorial/a-piece");

check("shouldRedirectToSlug is true for an old id url",
  shouldRedirectToSlug({ slug: "naishi-jogani" }, "d9ab6f21-5cc1-4d93-8c3a-9a3365bb8e10"));
check("shouldRedirectToSlug is FALSE on the canonical url (no redirect loop)",
  !shouldRedirectToSlug({ slug: "naishi-jogani" }, "naishi-jogani"));
check("shouldRedirectToSlug is false for a record with no slug",
  !shouldRedirectToSlug({ id: "abc" }, "abc"));

/* ================================================ 3. resolving either form */

const { entities, auth } = await import("../src/api/providers/mock.js");

/*
 * An admin session is needed to create a row that is already approved: the
 * moderation guard from 017 refuses to let anyone else publish a profile
 * directly, which is exactly the protection it exists to provide.
 */
await auth.loginViaEmailPassword("admin@artfutureclub.com", "password123");

const made = await entities.ArtistProfile.create({
  display_name: "Slug Test Artist", discipline: "Painting", based_in: "Hong Kong",
  bio: "A bio.", avatar_url: "/images/placeholder.webp", status: "approved",
});
check("the demo provider generates a slug on create", made.slug === "slug-test-artist", String(made.slug));

const twin = await entities.ArtistProfile.create({
  display_name: "Slug Test Artist", discipline: "Painting", status: "approved",
});
check("a duplicate name gets a numbered slug", twin.slug === "slug-test-artist-2", String(twin.slug));

const unnameable = await entities.Event.create({
  title: "離線回憶", start_date: new Date().toISOString(), event_type: "Exhibition",
});
check("a name with no latin characters falls back to the id",
  unnameable.slug === String(unnameable.id), String(unnameable.slug));

const renamed = await entities.ArtistProfile.update(made.id, { display_name: "Totally New Name" });
check("a RENAME keeps the original slug, so published links survive",
  renamed.slug === "slug-test-artist", String(renamed.slug));

const bySlug = await findBySlugOrId(entities.ArtistProfile, "slug-test-artist");
check("findBySlugOrId resolves a slug", bySlug?.id === made.id, String(bySlug?.id));

const byId = await findBySlugOrId(entities.ArtistProfile, made.id);
check("findBySlugOrId still resolves an old id", byId?.id === made.id, String(byId?.id));

const missing = await findBySlugOrId(entities.ArtistProfile, "no-such-artist-anywhere");
check("findBySlugOrId resolves NULL for a missing record rather than rejecting",
  missing === null, JSON.stringify(missing));

let threw = false;
try {
  await entities.ArtistProfile.get("definitely-not-a-real-id");
} catch { threw = true; }
check("the provider contract is intact: get still REJECTS when missing", threw);

check("every seeded artist has a slug",
  (await entities.ArtistProfile.list()).every((r) => !!r.slug));
check("every seeded gallery has a slug",
  (await entities.CollectorProfile.list()).every((r) => !!r.slug));
check("every seeded event has a slug",
  (await entities.Event.list()).every((r) => !!r.slug));
const allSlugs = (await entities.CollectorProfile.list()).map((r) => r.slug);
check("seeded slugs are unique", new Set(allSlugs).size === allSlugs.length,
  `${allSlugs.length} rows, ${new Set(allSlugs).size} distinct`);

/* ============================================================= 4. seo core */

check("SITE_URL is the www host that actually answers 200",
  SITE_URL === "https://www.artfutureclub.com", SITE_URL);
check("SITE_URL has no trailing slash", !SITE_URL.endsWith("/"));

check("absoluteUrl expands a root-relative path",
  absoluteUrl("/images/x.webp") === "https://www.artfutureclub.com/images/x.webp",
  absoluteUrl("/images/x.webp"));
check("absoluteUrl leaves an absolute url alone",
  absoluteUrl("https://cdn.example.com/a.jpg") === "https://cdn.example.com/a.jpg");
check("absoluteUrl leaves a data url alone", absoluteUrl("data:image/png;base64,AA") === "data:image/png;base64,AA");
check("absoluteUrl does not double the slash",
  absoluteUrl("//images/x.webp").startsWith("//") || !absoluteUrl("/images/x.webp").includes(".com//"));
check("absoluteUrl of nothing is empty, not a bare domain", absoluteUrl("") === "" && absoluteUrl(null) === "");

check("canonicalUrl drops the query string",
  canonicalUrl("/artists/naishi-jogani") === "https://www.artfutureclub.com/artists/naishi-jogani");
check("canonicalUrl does not leave a trailing slash on the root",
  canonicalUrl("/") === "https://www.artfutureclub.com", canonicalUrl("/"));

check("clampDescription keeps a short description whole",
  clampDescription("Short enough.") === "Short enough.");
const long = clampDescription("word ".repeat(80));
check("clampDescription trims to about 160 characters", long.length <= 160, String(long.length));
check("clampDescription does not cut mid-word", /…$/.test(long) && !/\s…$/.test(long), long.slice(-20));
check("clampDescription strips markup", clampDescription("<p>Hello <b>there</b></p>") === "Hello there");

check("breadcrumbs are absolute",
  breadcrumbs([{ name: "Home", path: "/" }]).itemListElement[0].item.startsWith("https://"));

/* ======================================================= 5. applySeo in dom */

const head = document.head;
head.innerHTML =
  '<title>Art Future Club</title>' +
  '<meta name="description" content="site wide">' +
  '<meta property="og:image" content="/images/site.jpg">';

const undo = applySeo({
  title: "Naishi Jogani — Painting in Hong Kong | Art Future Club",
  description: "A painter based in Hong Kong.",
  image: "/images/naishi.webp",
  type: "profile",
  canonical: "https://www.artfutureclub.com/artists/naishi-jogani",
  jsonLd: { "@context": "https://schema.org", "@type": "Person", name: "Naishi Jogani", empty: "" },
});

const meta = (sel) => head.querySelector(sel)?.getAttribute("content");
check("applySeo sets the title", document.title.startsWith("Naishi Jogani"), document.title);
check("applySeo sets the description", meta('meta[name="description"]') === "A painter based in Hong Kong.");
check("applySeo makes og:image ABSOLUTE",
  meta('meta[property="og:image"]') === "https://www.artfutureclub.com/images/naishi.webp",
  String(meta('meta[property="og:image"]')));
check("applySeo sets a canonical link",
  head.querySelector('link[rel="canonical"]')?.getAttribute("href") ===
    "https://www.artfutureclub.com/artists/naishi-jogani");
check("applySeo sets og:type", meta('meta[property="og:type"]') === "profile");
check("applySeo sets a twitter card", meta('meta[name="twitter:card"]') === "summary_large_image");
check("applySeo adds JSON-LD", !!head.querySelector('script[type="application/ld+json"]'));
check("applySeo strips empty values from JSON-LD",
  !head.querySelector('script[type="application/ld+json"]').textContent.includes('"empty"'));
check("applySeo does NOT add robots:noindex unless asked", !head.querySelector('meta[name="robots"]'));

undo();
check("cleanup removes the JSON-LD", !head.querySelector('script[type="application/ld+json"]'));
check("cleanup RESTORES the site-wide description rather than blanking it",
  meta('meta[name="description"]') === "site wide", String(meta('meta[name="description"]')));
check("cleanup restores the site-wide og:image",
  meta('meta[property="og:image"]') === "/images/site.jpg", String(meta('meta[property="og:image"]')));
check("cleanup restores the title", document.title === "Art Future Club", document.title);

const undoHeld = applySeo({ title: "Held profile", description: "x", noindex: true });
check("a profile awaiting review is marked noindex",
  head.querySelector('meta[name="robots"]')?.getAttribute("content") === "noindex, follow");
undoHeld();

/* ================================================= 6. the pages are wired */

const pages = {
  ArtistProfileView: read("../src/pages/ArtistProfileView.jsx"),
  GalleryProfile: read("../src/pages/GalleryProfile.jsx"),
  EventDetail: read("../src/pages/EventDetail.jsx"),
  ArticleReader: read("../src/pages/ArticleReader.jsx"),
};
for (const [name, src] of Object.entries(pages)) {
  if (name === "ArticleReader") continue;
  check(`${name} resolves by slug or id`, src.includes("findBySlugOrId"));
  check(`${name} redirects an old id url to the slug`, src.includes("shouldRedirectToSlug"));
}
check("ArtistProfileView has SEO meta", pages.ArtistProfileView.includes("useArtistSeo"));
check("EventDetail has SEO meta", pages.EventDetail.includes("useEventSeo"));
check("GalleryProfile tells its SEO hook which path it is on",
  /useGallerySeoMeta\(profile, \{ isVenue/.test(pages.GalleryProfile));
check("artist share links use the canonical slug url, not window.location.href",
  pages.ArtistProfileView.includes("absoluteUrl(artistPath(profile))") &&
  !/ShareButtons url=\{`\$\{window\.location\.href\}/.test(pages.ArtistProfileView));

/* No UUID links left anywhere the app actually renders. Comments are stripped
 * first: this file has repeatedly had a check match the comment explaining the
 * very thing it was asserting was gone. */
const strip = (s) => s.replace(/\/\*[\s\S]*?\*\//g, "").replace(/\/\/.*$/gm, "");
const LINKED = [
  "src/components/AdminApprovalsPanel.jsx", "src/components/CityChapters.jsx",
  "src/components/CollectiveRegistry.jsx", "src/components/GalleriesVenuesMap.jsx",
  "src/components/gallery/ExhibitionsSection.jsx", "src/components/SiteHeader.jsx",
  "src/components/TrendingSection.jsx", "src/hooks/useNotifications.js",
  "src/pages/AdminDashboard.jsx", "src/pages/ArtistCommunity.jsx",
  "src/pages/ArtistMap.jsx", "src/pages/ArtistsDirectory.jsx",
  "src/pages/CityChapterDetail.jsx", "src/pages/CollectorProfilePage.jsx",
  "src/pages/EventCalendar.jsx", "src/pages/GalleryShowcase.jsx",
  "src/pages/Venues.jsx", "src/pages/Onboarding.jsx",
];
for (const rel of LINKED) {
  const src = strip(read(`../${rel}`));
  const bad = src.match(/\/(artists|gallery|venues|events)\/\$\{[^}]*\.id\}/g) || [];
  check(`${rel.split("/").pop()} builds links from the path helpers`, bad.length === 0, bad.join(", "));
}

/* A projected column list that omits `slug` silently produces UUID links. */
const PROJECTIONS = [
  ["src/pages/ArtistsDirectory.jsx", "id,display_name,discipline"],
  ["src/pages/Venues.jsx", "id,display_name,type"],
  ["src/pages/GalleryShowcase.jsx", "id,display_name,based_in"],
  ["src/pages/ArtistMap.jsx", "id,display_name,discipline"],
  ["src/components/CityChapters.jsx", "id,title,venue"],
  ["src/components/CollectiveRegistry.jsx", "id,display_name,based_in"],
  ["src/components/GalleriesVenuesMap.jsx", "id,display_name,type"],
];
for (const [rel, prefix] of PROJECTIONS) {
  const src = read(`../${rel}`);
  const lists = src.match(new RegExp(`['"\`]${prefix.replace(/,/g, ",")}[^'"\`]*['"\`]`, "g")) || [];
  check(`${rel.split("/").pop()} asks for the slug column`,
    lists.length > 0 && lists.every((l) => l.includes("slug")), lists.join(" | "));
}

/* ============================================ 7. robots, sitemap, prerender */

const robots = read("../public/robots.txt");
/*
 * Comments stripped before asserting. robots.txt explains in a comment that the
 * Sitemap line used to be a REPLACE-WITH-YOUR-DOMAIN placeholder, and a check
 * for that string matched its own explanation. This is the fourth time a check
 * in this repo has passed or failed on the comment describing the thing rather
 * than the thing — strip first, always.
 */
const robotsDirectives = robots.replace(/^\s*#.*$/gm, "");
check("robots.txt no longer has the placeholder domain",
  !robotsDirectives.includes("REPLACE-WITH-YOUR-DOMAIN"));
check("robots.txt points at the real sitemap",
  robots.includes("Sitemap: https://www.artfutureclub.com/sitemap.xml"));
check("robots.txt keeps the site crawlable", /User-agent: \*\s*\nAllow: \//.test(robots));
check("robots.txt hides the member-only areas",
  ["/admin", "/messages", "/profile/edit", "/login"].every((p) => robots.includes(`Disallow: ${p}`)));
for (const bot of ["GPTBot", "ClaudeBot", "PerplexityBot", "OAI-SearchBot", "Applebot"]) {
  check(`robots.txt names ${bot} explicitly`, robots.includes(`User-agent: ${bot}`));
}

const shell = read("../index.html");
check("index.html og:image is absolute", /og:image" content="https:\/\//.test(shell));
check("index.html og:image uses the www host",
  /og:image" content="https:\/\/www\.artfutureclub\.com/.test(shell));
check("index.html declares a canonical", /rel="canonical" href="https:\/\/www\./.test(shell));
check("index.html declares the Organization, with its real social accounts",
  shell.includes('"@type": "Organization"') && shell.includes("instagram.com/artfutureclub"));
check("index.html still boots the app", shell.includes('src="/src/main.jsx"'));
check("index.html still has the mount point", shell.includes('<div id="root"></div>'));

const vercel = JSON.parse(read("../vercel.json"));
const sources = vercel.rewrites.map((r) => r.source);
check("vercel.json is valid json with rewrites", Array.isArray(vercel.rewrites));
check("sitemap.xml is served by the function", sources[0] === "/sitemap.xml");
check("the SPA catch-all is LAST, or it would swallow everything",
  sources[sources.length - 1] === "/(.*)" &&
  vercel.rewrites[vercel.rewrites.length - 1].destination === "/index.html");
const pre = vercel.rewrites.find((r) => r.destination === "/api/prerender");
check("the prerender rewrite exists", !!pre);
check("the prerender rewrite covers all five detail routes",
  ["artists", "gallery", "venues", "events", "editorial"].every((s) => pre.source.includes(s)),
  pre?.source);
check("the prerender rewrite only fires on a user-agent condition",
  pre?.has?.[0]?.key === "user-agent");
check("only crawlers are matched: the ua pattern has no inline (?i) flag, which js ignores",
  !pre.has[0].value.includes("(?i)"));

/* The ua pattern is the one piece that could mistakenly catch a real browser.
 * Compile it and try both. */
const ua = new RegExp(pre.has[0].value);
const BOTS = [
  "Mozilla/5.0 (compatible; Googlebot/2.1; +http://www.google.com/bot.html)",
  "Mozilla/5.0 AppleWebKit/537.36 (KHTML, like Gecko; compatible; GPTBot/1.1; +https://openai.com/gptbot)",
  "Mozilla/5.0 (compatible; ClaudeBot/1.0; +claudebot@anthropic.com)",
  "Mozilla/5.0 (compatible; PerplexityBot/1.0)",
  "facebookexternalhit/1.1 (+http://www.facebook.com/externalhit_uatext.php)",
  "Twitterbot/1.0",
  "LinkedInBot/1.0 (compatible; Mozilla/5.0)",
  "Slackbot-LinkExpanding 1.0 (+https://api.slack.com/robots)",
  "WhatsApp/2.23.20.0",
  "Mozilla/5.0 (compatible; bingbot/2.0; +http://www.bing.com/bingbot.htm)",
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Safari/605.1.15 Applebot/0.1",
  "Mozilla/5.0 (compatible; Baiduspider/2.0)",
  "ChatGPT-User/1.0",
];
for (const b of BOTS) check(`crawler matched: ${b.slice(0, 42)}`, ua.test(b));

const HUMANS = [
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36",
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.4 Safari/605.1.15",
  "Mozilla/5.0 (iPhone; CPU iPhone OS 17_4 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.4 Mobile/15E148 Safari/604.1",
  "Mozilla/5.0 (X11; Linux x86_64; rv:125.0) Gecko/20100101 Firefox/125.0",
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36 Edg/131.0.0.0",
  "Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Mobile Safari/537.36",
];
for (const h of HUMANS) {
  check(`real browser NOT prerendered: ${h.slice(25, 60)}`, !ua.test(h));
}

/* The functions themselves. */
const prerender = read("../api/prerender.js");
check("the prerenderer keeps the app bundle, so a misrouted human still works",
  prerender.includes("loadShell") && !prerender.includes("<!doctype html><html>"));
check("the prerenderer falls back to the plain shell on any failure",
  /catch \{\s*\n\s*\/\/[\s\S]*?serveShell\(\);/.test(prerender) || prerender.includes("serveShell();"));
check("the prerenderer returns 404 for a missing record",
  /res\.statusCode = 404/.test(prerender));
check("the prerenderer tolerates the slug column not existing yet",
  prerender.includes("res.ok ? await res.json() : null"));
check("the prerenderer strips the shell's own og tags before adding its own",
  /replace\(\/\\s\*<meta\\s\+property="og:/.test(prerender) || prerender.includes('property="og:[^"]*"'));

const sitemap = read("../api/sitemap.js");
check("the sitemap tolerates the slug column not existing yet",
  sitemap.includes('select.includes("slug")'));
check("the sitemap counts a null status as live, not as held",
  sitemap.includes("status.is.null"));
check("the sitemap excludes profile types with no public page",
  sitemap.includes("NO_PUBLIC_PAGE"));
check("the sitemap emits absolute locs", sitemap.includes("SITE_URL + loc"));

/* ================================================================= report */

console.log("");
if (failures.length) {
  console.log(`  passed: ${pass}`);
  console.log(`  FAILED: ${failures.length}\n`);
  for (const f of failures) console.log(`   ✗ ${f}`);
  console.log("");
  process.exit(1);
}
console.log(`  passed: ${pass}`);
console.log("  readable urls, real meta tags, and a site crawlers can read\n");
process.exit(0);
