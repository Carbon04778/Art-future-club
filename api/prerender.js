/**
 * Crawler prerendering.
 *
 * THE PROBLEM
 *
 * This site is a client-rendered React app. The HTML a request actually
 * receives is the shell in index.html — an empty <div id="root"> plus a script
 * tag. Everything a search engine would want to read is produced by JavaScript
 * after the bundle has downloaded, parsed and fetched from Supabase.
 *
 * Googlebot does render JavaScript, eventually, on a second pass. Almost
 * nothing else does:
 *
 *   - GPTBot, ClaudeBot, PerplexityBot and the other AI crawlers do not execute
 *     JavaScript at all. They see an empty page.
 *   - Facebook, LinkedIn, X, Slack, WhatsApp and iMessage read only the raw
 *     HTML when building a link preview. Every shared link showed the generic
 *     site title and no image, because the real tags were injected later by a
 *     hook that a preview crawler never runs.
 *
 * So 322 profiles and events were, to everything except Google, one identical
 * blank page.
 *
 * THE APPROACH
 *
 * For a crawler, fetch the record server-side and return the shell with the
 * real <title>, description, canonical, Open Graph tags, JSON-LD and a readable
 * block of body text already in it.
 *
 * IT DEGRADES SAFELY. The response is the REAL index.html shell with the app's
 * own script tag intact, so a browser that lands here still boots the full
 * React app and replaces the prerendered block. That matters: if the
 * user-agent matching in vercel.json is ever too broad, a human gets a working
 * site rather than a dead static page. On any failure at all it serves the
 * untouched shell, which is exactly the behaviour before this file existed.
 */

const SUPABASE_URL = process.env.VITE_SUPABASE_URL || process.env.SUPABASE_URL || "";
const SUPABASE_KEY = process.env.VITE_SUPABASE_ANON_KEY || process.env.SUPABASE_ANON_KEY || "";
// www, not the apex: the apex answers 308 and redirects to www, so www is the
// address that actually serves the page. See the note in src/lib/seo.js.
const SITE_URL = (process.env.VITE_SITE_URL || "https://www.artfutureclub.com").replace(/\/+$/, "");
const SITE_NAME = "Art Future Club";

/** Which table and shape each public route maps to. */
const ROUTES = [
  { prefix: "/artists",   table: "artist_profile",    kind: "artist" },
  { prefix: "/gallery",   table: "collector_profile", kind: "space" },
  { prefix: "/venues",    table: "collector_profile", kind: "space", venue: true },
  { prefix: "/events",    table: "event",             kind: "event" },
  { prefix: "/editorial", table: "article",           kind: "article" },
];

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

const esc = (s) =>
  String(s ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");

const absolute = (v) => {
  const s = String(v || "").trim();
  if (!s) return "";
  if (/^(https?:)?\/\//i.test(s) || s.startsWith("data:")) return s;
  return `${SITE_URL}/${s.replace(/^\/+/, "")}`;
};

const clamp = (text, max = 160) => {
  const flat = String(text || "").replace(/<[^>]*>/g, " ").replace(/\s+/g, " ").trim();
  return flat.length <= max ? flat : `${flat.slice(0, max - 1).replace(/\s+\S*$/, "")}…`;
};

/* ------------------------------------------------------------------ data */

async function fetchRecord(table, segment) {
  if (!SUPABASE_URL || !SUPABASE_KEY) return null;
  // A slug first, then the id — the same order the app itself resolves in, so a
  // crawler following an old UUID link still gets the right record.
  const column = UUID.test(segment) ? "id" : "slug";
  const url =
    `${SUPABASE_URL}/rest/v1/${table}` +
    `?select=*&${column}=eq.${encodeURIComponent(segment)}&limit=1`;

  const res = await fetch(url, {
    headers: { apikey: SUPABASE_KEY, Authorization: `Bearer ${SUPABASE_KEY}` },
  });
  /*
   * Deliberately NOT bailing out on a non-ok response. Filtering on a column
   * that does not exist is a hard 400, and before migration 019 has run that is
   * exactly what a `slug` filter is — so a 400 here has to fall through to the
   * retry below rather than return null.
   */
  const rows = res.ok ? await res.json() : null;
  if (Array.isArray(rows) && rows[0]) return rows[0];

  /*
   * No slug column yet, or a slug that looks like a UUID. Retry on the other
   * column rather than giving up — this is what keeps the prerenderer working
   * both before and after migration 019 has been run.
   */
  const other = column === "slug" ? "id" : "slug";
  if (other === "id" && !UUID.test(segment)) return null;
  const retry = await fetch(
    `${SUPABASE_URL}/rest/v1/${table}?select=*&${other}=eq.${encodeURIComponent(segment)}&limit=1`,
    { headers: { apikey: SUPABASE_KEY, Authorization: `Bearer ${SUPABASE_KEY}` } }
  );
  if (!retry.ok) return null;
  const more = await retry.json();
  return (Array.isArray(more) && more[0]) || null;
}

/* --------------------------------------------------------------- page SEO */

/**
 * Build the tags and the visible text for one record.
 *
 * Deliberately mirrors src/hooks/useEntitySeo.js, useGallerySeoMeta.js and
 * useSeoMeta.js — a crawler and a browser must be shown the same thing, or the
 * page is cloaking and gets penalised for it.
 */
function describe(route, row, path) {
  const canonical = `${SITE_URL}${path}`;

  if (route.kind === "artist") {
    const name = row.display_name || "Artist";
    const where = row.based_in || row.chapter || "";
    const discipline = row.discipline || "";
    const works = Array.isArray(row.portfolio_works) ? row.portfolio_works : [];
    const subtitle = [discipline, where && `in ${where}`].filter(Boolean).join(" ");
    return {
      title: `${[name, subtitle].filter(Boolean).join(" — ")} | ${SITE_NAME}`,
      description:
        row.bio ||
        [name, discipline && `${discipline} artist`, where && `based in ${where}`]
          .filter(Boolean)
          .join(", "),
      image: row.avatar_url || works.find((w) => w?.image_url)?.image_url || "",
      type: "profile",
      canonical,
      noindex: row.status && row.status !== "approved",
      heading: name,
      sub: subtitle,
      body: row.bio || "",
      items: works.filter((w) => w?.image_url).slice(0, 24).map((w) => ({
        title: w.title || "Untitled",
        meta: [w.medium, w.year, w.dimensions].filter(Boolean).join(", "),
        image: w.image_url,
      })),
      jsonLd: {
        "@context": "https://schema.org",
        "@type": "Person",
        name,
        description: row.bio || undefined,
        image: row.avatar_url ? absolute(row.avatar_url) : undefined,
        url: canonical,
        jobTitle: discipline ? `${discipline} Artist` : "Artist",
        homeLocation: where ? { "@type": "Place", name: where } : undefined,
        sameAs: [row.website, row.instagram, row.twitter, row.linkedin].filter(Boolean),
        workExample: works.filter((w) => w?.image_url).slice(0, 12).map((w) => ({
          "@type": "VisualArtwork",
          name: w.title || undefined,
          image: absolute(w.image_url),
          artMedium: w.medium || undefined,
          dateCreated: w.year || undefined,
          creator: { "@type": "Person", name },
        })),
      },
    };
  }

  if (route.kind === "space") {
    const name = row.display_name || "Gallery";
    const typeLabel = row.type || "Gallery";
    const where = row.based_in || "";
    const schemaType =
      row.type === "Museum" || row.type === "Institution"
        ? "Museum"
        : row.type === "Foundation"
        ? "Organization"
        : row.type === "Restaurant"
        ? "Restaurant"
        : row.type === "Event Space"
        ? "EventVenue"
        : "Gallery";
    const hasGeo = row.geo_lat != null && row.geo_lng != null;
    return {
      title: row.seo_title || `${name} — ${typeLabel}${where ? ` in ${where}` : ""} | ${SITE_NAME}`,
      description: row.seo_description || row.bio || "",
      image: row.cover_image_url || row.avatar_url || "",
      type: "profile",
      canonical,
      noindex: row.status && row.status !== "approved",
      heading: name,
      sub: [typeLabel, where].filter(Boolean).join(" · "),
      body: row.bio || "",
      facts: [
        row.address && ["Address", row.address],
        row.opening_hours && ["Opening hours", row.opening_hours],
        row.phone && ["Telephone", row.phone],
        row.website && ["Website", row.website],
      ].filter(Boolean),
      jsonLd: {
        "@context": "https://schema.org",
        "@type": schemaType,
        name,
        description: row.seo_description || row.bio || undefined,
        image: row.cover_image_url ? [absolute(row.cover_image_url)] : undefined,
        url: canonical,
        telephone: row.phone || undefined,
        email: row.email || undefined,
        openingHours: row.opening_hours || undefined,
        sameAs: row.website ? [row.website] : undefined,
        address: row.address
          ? { "@type": "PostalAddress", streetAddress: row.address, addressLocality: where || undefined }
          : undefined,
        geo: hasGeo
          ? { "@type": "GeoCoordinates", latitude: Number(row.geo_lat), longitude: Number(row.geo_lng) }
          : undefined,
      },
    };
  }

  if (route.kind === "event") {
    const city = row.chapter || "";
    const starts = row.start_date
      ? new Date(row.start_date).toLocaleDateString("en-GB", {
          day: "numeric", month: "long", year: "numeric",
        })
      : "";
    return {
      title: `${row.title || "Event"}${city ? ` — ${city}` : ""} | ${SITE_NAME}`,
      description:
        row.description || [row.event_type, row.venue, city, starts].filter(Boolean).join(" · "),
      image: row.image_url || "",
      type: "article",
      canonical,
      heading: row.title || "Event",
      sub: [row.event_type, row.venue, city].filter(Boolean).join(" · "),
      body: row.description || "",
      facts: [
        starts && ["Date", starts],
        row.venue && ["Venue", row.venue],
        row.address && ["Address", row.address],
        row.is_free ? ["Admission", "Free"] : row.ticket_price && ["Tickets", row.ticket_price],
      ].filter(Boolean),
      jsonLd: {
        "@context": "https://schema.org",
        "@type": "Event",
        name: row.title,
        description: row.description || undefined,
        image: row.image_url ? [absolute(row.image_url)] : undefined,
        url: canonical,
        startDate: row.start_date || undefined,
        endDate: row.end_date || row.start_date || undefined,
        eventAttendanceMode: "https://schema.org/OfflineEventAttendanceMode",
        eventStatus: "https://schema.org/EventScheduled",
        location:
          row.venue || row.address || city
            ? {
                "@type": "Place",
                name: row.venue || city || undefined,
                address: {
                  "@type": "PostalAddress",
                  streetAddress: row.address || undefined,
                  addressLocality: city || undefined,
                },
              }
            : undefined,
        organizer: row.organizer_name
          ? { "@type": "Organization", name: row.organizer_name }
          : undefined,
        offers: {
          "@type": "Offer",
          url: row.external_link || canonical,
          price: row.is_free ? "0" : row.ticket_price || undefined,
          priceCurrency: row.is_free || row.ticket_price ? "HKD" : undefined,
          availability: "https://schema.org/InStock",
        },
      },
    };
  }

  // article
  return {
    title: row.seo_title || `${row.title} — ${SITE_NAME} Editorial`,
    description: row.seo_description || row.subtitle || "",
    image: row.og_image_url || row.cover_image_url || "",
    type: "article",
    canonical: row.canonical_url || canonical,
    noindex: row.published === false,
    heading: row.title || "Article",
    sub: row.subtitle || "",
    body: row.body || row.content || "",
    jsonLd: {
      "@context": "https://schema.org",
      "@type": "Article",
      headline: row.title,
      description: row.seo_description || row.subtitle || undefined,
      image: row.cover_image_url ? [absolute(row.cover_image_url)] : undefined,
      url: row.canonical_url || canonical,
      datePublished: row.publish_date || row.created_date || undefined,
      dateModified: row.updated_date || undefined,
      author: row.author_name ? { "@type": "Person", name: row.author_name } : undefined,
      publisher: { "@type": "Organization", name: SITE_NAME, url: `${SITE_URL}/` },
    },
  };
}

/* ---------------------------------------------------------------- markup */

function headTags(seo, crumbs) {
  const img = absolute(seo.image);
  const desc = clamp(seo.description);
  const out = [
    `<title>${esc(seo.title)}</title>`,
    `<meta name="description" content="${esc(desc)}">`,
    `<link rel="canonical" href="${esc(seo.canonical)}">`,
    `<meta property="og:site_name" content="${esc(SITE_NAME)}">`,
    `<meta property="og:title" content="${esc(seo.title)}">`,
    `<meta property="og:description" content="${esc(desc)}">`,
    `<meta property="og:type" content="${esc(seo.type)}">`,
    `<meta property="og:url" content="${esc(seo.canonical)}">`,
    `<meta name="twitter:card" content="summary_large_image">`,
    `<meta name="twitter:title" content="${esc(seo.title)}">`,
    `<meta name="twitter:description" content="${esc(desc)}">`,
  ];
  if (img) {
    out.push(`<meta property="og:image" content="${esc(img)}">`);
    out.push(`<meta name="twitter:image" content="${esc(img)}">`);
  }
  if (seo.noindex) out.push(`<meta name="robots" content="noindex, follow">`);
  out.push(
    `<script type="application/ld+json">${JSON.stringify(seo.jsonLd, (_k, v) =>
      v == null || v === "" ? undefined : v
    )}</script>`
  );
  if (crumbs) out.push(`<script type="application/ld+json">${JSON.stringify(crumbs)}</script>`);
  return out.join("\n    ");
}

/**
 * A readable version of the page for a crawler that cannot run the app.
 *
 * Placed INSIDE #root, so React replaces it the moment the real app mounts.
 * There is nothing here a human visitor does not also get from the rendered
 * page — the same name, the same text, the same images.
 */
function bodyMarkup(seo) {
  const parts = [`<h1>${esc(seo.heading)}</h1>`];
  if (seo.sub) parts.push(`<p>${esc(seo.sub)}</p>`);
  if (seo.body) parts.push(`<p>${esc(clamp(seo.body, 2000))}</p>`);
  if (seo.facts?.length) {
    parts.push(
      `<dl>${seo.facts
        .map(([k, v]) => `<dt>${esc(k)}</dt><dd>${esc(v)}</dd>`)
        .join("")}</dl>`
    );
  }
  if (seo.items?.length) {
    parts.push(
      `<ul>${seo.items
        .map(
          (w) =>
            `<li><img src="${esc(absolute(w.image))}" alt="${esc(
              `${w.title} by ${seo.heading}`
            )}" width="600" height="600" loading="lazy"><span>${esc(w.title)}</span>${
              w.meta ? `<span>${esc(w.meta)}</span>` : ""
            }</li>`
        )
        .join("")}</ul>`
    );
  }
  return parts.join("\n      ");
}

function crumbTrail(route, seo, path) {
  const label =
    route.kind === "artist"
      ? ["Artists", "/artists"]
      : route.kind === "event"
      ? ["Events", "/events"]
      : route.kind === "article"
      ? ["Editorial", "/editorial"]
      : route.venue
      ? ["Venues", "/venues"]
      : ["Gallery", "/gallery"];
  return {
    "@context": "https://schema.org",
    "@type": "BreadcrumbList",
    itemListElement: [
      { "@type": "ListItem", position: 1, name: "Home", item: `${SITE_URL}/` },
      { "@type": "ListItem", position: 2, name: label[0], item: `${SITE_URL}${label[1]}` },
      { "@type": "ListItem", position: 3, name: seo.heading, item: `${SITE_URL}${path}` },
    ],
  };
}

/* --------------------------------------------------------------- handler */

/** The deployed shell, with the real hashed bundle filenames in it. */
async function loadShell(host) {
  const res = await fetch(`https://${host}/index.html`);
  if (!res.ok) throw new Error(`shell ${res.status}`);
  return res.text();
}

export default async function handler(req, res) {
  const host = req.headers["x-forwarded-host"] || req.headers.host || "www.artfutureclub.com";
  const path = (req.url || "/").split("?")[0].replace(/\/+$/, "") || "/";

  let shell = "";
  try {
    shell = await loadShell(host);
  } catch {
    /*
     * Cannot even reach the shell. Redirect rather than serve something broken:
     * the rewrite is invisible to the client, so ?__noprerender is enough to
     * come back and be served the static file directly.
     */
    res.statusCode = 302;
    res.setHeader("Location", `${path}?__noprerender=1`);
    res.end();
    return;
  }

  // Serve the shell untouched unless this is a route we know how to describe.
  const serveShell = () => {
    res.statusCode = 200;
    res.setHeader("Content-Type", "text/html; charset=utf-8");
    res.setHeader("Cache-Control", "public, max-age=0, s-maxage=60");
    res.end(shell);
  };

  try {
    const route = ROUTES.find(
      (r) => path === r.prefix || path.startsWith(`${r.prefix}/`)
    );
    const segment = route ? path.slice(route.prefix.length + 1) : "";
    // A listing page (/artists) has no segment, and a nested path is not a
    // detail page either — both just get the shell.
    if (!route || !segment || segment.includes("/")) return serveShell();

    const row = await fetchRecord(route.table, decodeURIComponent(segment));
    if (!row) {
      // Genuinely missing: say 404 so it is not indexed, but still return the
      // app so a human sees the real "not available" screen.
      res.statusCode = 404;
      res.setHeader("Content-Type", "text/html; charset=utf-8");
      res.end(shell);
      return;
    }

    const seo = describe(route, row, path);
    const html = shell
      // Drop the shell's own site-wide tags so they cannot compete with the
      // page-specific ones. Title, description, og:* and twitter:* only.
      .replace(/\s*<title>[\s\S]*?<\/title>/i, "")
      .replace(/\s*<meta\s+name="description"[^>]*>/gi, "")
      .replace(/\s*<meta\s+property="og:[^"]*"[^>]*>/gi, "")
      .replace(/\s*<meta\s+name="twitter:[^"]*"[^>]*>/gi, "")
      .replace("</head>", `  ${headTags(seo, crumbTrail(route, seo, path))}\n  </head>`)
      .replace('<div id="root"></div>', `<div id="root">\n      ${bodyMarkup(seo)}\n    </div>`);

    res.statusCode = 200;
    res.setHeader("Content-Type", "text/html; charset=utf-8");
    // Cached at the edge for an hour; a crawler revisit is cheap and an edit
    // shows up for humans immediately because they render the live app anyway.
    res.setHeader("Cache-Control", "public, max-age=0, s-maxage=3600, stale-while-revalidate=86400");
    res.end(html);
  } catch {
    // Any failure at all falls back to the plain shell, which is exactly the
    // behaviour before this file existed.
    serveShell();
  }
}
