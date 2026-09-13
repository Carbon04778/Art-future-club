/**
 * sitemap.xml, generated from the live database.
 *
 * WHAT WAS THERE BEFORE
 *
 * Nothing. robots.txt pointed at
 * https://REPLACE-WITH-YOUR-DOMAIN/sitemap.xml — a placeholder that was never
 * filled in — and no sitemap.xml existed. Because the SPA fallback rewrites
 * every unmatched path to index.html, a request for /sitemap.xml returned the
 * HTML shell with a 200 OK. A crawler asking for a sitemap got a web page and
 * an encoding error, which is worse than a clean 404: it looks like a broken
 * sitemap rather than an absent one.
 *
 * WHY GENERATED RATHER THAN COMMITTED
 *
 * There are 322 profiles and events and they change constantly. A file written
 * at build time is stale the first time anyone adds a gallery. This reads the
 * database on request and is cached at the edge for six hours.
 *
 * Only PUBLIC rows are listed. A profile still awaiting review is invisible to
 * everyone but its owner, so listing it would be advertising a page that
 * returns "not available" — which is how a site earns a crawl-error report.
 */

const SUPABASE_URL = process.env.VITE_SUPABASE_URL || process.env.SUPABASE_URL || "";
const SUPABASE_KEY = process.env.VITE_SUPABASE_ANON_KEY || process.env.SUPABASE_ANON_KEY || "";
// www, not the apex — the apex 308-redirects to it. See src/lib/seo.js.
const SITE_URL = (process.env.VITE_SITE_URL || "https://www.artfutureclub.com").replace(/\/+$/, "");

/** Types that live on /venues rather than /gallery. Mirrors src/lib/venueTypes.js. */
const VENUE_TYPES = new Set(["Institution", "Museum", "Foundation", "Event Space", "Restaurant"]);

/**
 * Types with NO public page of their own, so they do not belong in a sitemap.
 *
 * Collector, Curator and Advisor are people rather than places. "Other" is
 * listed here too: it is deliberately not a venue type, so an "Other" profile
 * appears neither on /gallery (which filters on Gallery) nor on /venues.
 */
const NO_PUBLIC_PAGE = new Set(["Collector", "Curator", "Advisor", "Other"]);

/** The static pages, with a hand-set priority. */
const STATIC_PAGES = [
  ["/", 1.0, "daily"],
  ["/artists", 0.9, "daily"],
  ["/gallery", 0.9, "daily"],
  ["/venues", 0.8, "weekly"],
  ["/events", 0.9, "daily"],
  ["/editorial", 0.8, "weekly"],
  ["/open-calls", 0.7, "weekly"],
  ["/map", 0.6, "monthly"],
  ["/gallery-map", 0.6, "monthly"],
  ["/about", 0.5, "monthly"],
  ["/partnership", 0.5, "monthly"],
  ["/terms", 0.2, "yearly"],
  ["/privacy", 0.2, "yearly"],
  ["/cookies", 0.2, "yearly"],
  ["/membership-policy", 0.2, "yearly"],
];

const esc = (s) =>
  String(s ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");

const ask = async (table, select, extra) => {
  const res = await fetch(
    `${SUPABASE_URL}/rest/v1/${table}?select=${select}&limit=2000${extra}`,
    { headers: { apikey: SUPABASE_KEY, Authorization: `Bearer ${SUPABASE_KEY}` } }
  );
  if (!res.ok) return null;
  const data = await res.json();
  return Array.isArray(data) ? data : null;
};

/**
 * Read a table, tolerating a missing `slug` column.
 *
 * Selecting a column that does not exist is a hard 400 from PostgREST, not an
 * empty result — so before migration 019 has run, asking for `slug` returned
 * nothing for artists, galleries and events while articles (which always had
 * one) worked. The sitemap silently shrank to the static pages plus editorial.
 *
 * Retrying without `slug` means the sitemap is correct either side of that
 * migration: UUID urls until it runs, readable ones afterwards.
 */
async function rows(table, select, extra = "") {
  if (!SUPABASE_URL || !SUPABASE_KEY) return [];
  const first = await ask(table, select, extra);
  if (first) return first;
  if (!select.includes("slug")) return [];
  const fallback = await ask(table, select.replace(/,?slug/, ""), extra);
  return fallback || [];
}

/** The url segment: the slug, or the id when the row has not got one. */
const seg = (r) => r.slug || r.id;

/** yyyy-mm-dd, the only lastmod format every crawler accepts without argument. */
const day = (v) => {
  if (!v) return "";
  const d = new Date(v);
  return Number.isNaN(d.getTime()) ? "" : d.toISOString().slice(0, 10);
};

const entry = (loc, lastmod, changefreq, priority) =>
  [
    "  <url>",
    `    <loc>${esc(SITE_URL + loc)}</loc>`,
    lastmod ? `    <lastmod>${lastmod}</lastmod>` : "",
    changefreq ? `    <changefreq>${changefreq}</changefreq>` : "",
    priority != null ? `    <priority>${priority.toFixed(1)}</priority>` : "",
    "  </url>",
  ]
    .filter(Boolean)
    .join("\n");

export default async function handler(req, res) {
  const urls = STATIC_PAGES.map(([loc, priority, changefreq]) =>
    entry(loc, "", changefreq, priority)
  );

  try {
    /*
     * `status=neq.pending` is not enough on its own: 017 grandfathered existing
     * rows, and a row predating it can have a null status. PostgREST treats null
     * as not-equal-to-anything, so an `or` covering null explicitly is needed or
     * every grandfathered profile silently drops out of the sitemap.
     */
    const live = "&or=(status.eq.approved,status.is.null)";

    const [artists, spaces, events, articles] = await Promise.all([
      rows("artist_profile", "id,slug,updated_date", live),
      rows("collector_profile", "id,slug,type,updated_date", live),
      rows("event", "id,slug,updated_date,start_date,end_date"),
      rows("article", "id,slug,updated_date,publish_date", "&published=is.true"),
    ]);

    for (const a of artists) {
      urls.push(entry(`/artists/${seg(a)}`, day(a.updated_date), "weekly", 0.8));
    }
    for (const s of spaces) {
      if (NO_PUBLIC_PAGE.has(s.type)) continue;
      const prefix = VENUE_TYPES.has(s.type) ? "/venues" : "/gallery";
      urls.push(entry(`${prefix}/${seg(s)}`, day(s.updated_date), "weekly", 0.8));
    }
    for (const e of events) {
      /*
       * An event that finished long ago is still a real page worth indexing,
       * but it is not worth recrawling — so it keeps a lower priority and a
       * yearly changefreq instead of being dropped.
       */
      const ended = new Date(e.end_date || e.start_date || 0).getTime();
      const past = ended && ended < Date.now();
      urls.push(
        entry(
          `/events/${seg(e)}`,
          day(e.updated_date),
          past ? "yearly" : "daily",
          past ? 0.4 : 0.9
        )
      );
    }
    for (const a of articles) {
      urls.push(
        entry(`/editorial/${seg(a)}`, day(a.updated_date || a.publish_date), "monthly", 0.7)
      );
    }
  } catch {
    // Fall through: a sitemap of just the static pages is still a valid,
    // useful sitemap. Returning a 500 would have the whole thing rejected.
  }

  const xml = `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
${urls.join("\n")}
</urlset>
`;

  res.statusCode = 200;
  res.setHeader("Content-Type", "application/xml; charset=utf-8");
  res.setHeader("Cache-Control", "public, max-age=0, s-maxage=21600, stale-while-revalidate=86400");
  res.end(xml);
}
