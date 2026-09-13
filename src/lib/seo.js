/**
 * SEO plumbing shared by every public page.
 *
 * TWO THINGS WERE WRONG EVERYWHERE
 *
 * 1. og:image was a root-relative path ("/images/x.jpg"). Facebook, LinkedIn,
 *    Slack and X all require an ABSOLUTE url and silently show nothing for a
 *    relative one — so no link to this site has ever had a preview image.
 *
 * 2. No page set a canonical url. The same profile is reachable by slug and by
 *    id (and now redirects between them), so search engines needed telling
 *    which address is the real one or they split the ranking between both.
 *
 * Everything here is also what the crawler prerenderer in api/prerender.js
 * reads, so the tags a bot sees and the tags a browser sees come from one
 * definition rather than drifting apart.
 */

/**
 * The canonical origin, no trailing slash.
 *
 * WWW, NOT THE APEX. Verified against the live site: https://artfutureclub.com
 * answers 308 and redirects to https://www.artfutureclub.com, which is the
 * address that actually returns 200. A canonical tag, an og:url or a sitemap
 * entry has to name the final url rather than one that redirects — otherwise
 * every canonical on the site points one hop away from the page it describes.
 *
 * Overridable so a Vercel preview deployment describes itself rather than
 * claiming to be production, which would have previews competing with the real
 * site in search results.
 */
export const SITE_URL = (
  (typeof import.meta !== "undefined" && import.meta.env?.VITE_SITE_URL) ||
  "https://www.artfutureclub.com"
).replace(/\/+$/, "");

export const SITE_NAME = "Art Future Club";

/** Turn "/images/x.webp" into "https://artfutureclub.com/images/x.webp". */
export function absoluteUrl(pathOrUrl) {
  const v = String(pathOrUrl || "").trim();
  if (!v) return "";
  // Already absolute, or a protocol-relative / data url — leave it alone.
  if (/^(https?:)?\/\//i.test(v) || v.startsWith("data:")) return v;
  return `${SITE_URL}/${v.replace(/^\/+/, "")}`;
}

/**
 * The canonical address of the page being viewed.
 *
 * Built from the path rather than from window.location.href so that query
 * strings and hashes are dropped: "?ref=newsletter" is the same page and must
 * not be indexed as a second one.
 */
export function canonicalUrl(pathname) {
  const path =
    pathname != null
      ? pathname
      : typeof window !== "undefined"
      ? window.location.pathname
      : "/";
  return `${SITE_URL}${path === "/" ? "" : path.replace(/\/+$/, "")}`;
}

/** Trim a description to the ~160 characters search results actually show. */
export function clampDescription(text, max = 160) {
  const flat = String(text || "")
    .replace(/<[^>]*>/g, " ")
    .replace(/\s+/g, " ")
    .trim();
  if (flat.length <= max) return flat;
  // Cut on a word boundary so it does not end mid-word.
  return `${flat.slice(0, max - 1).replace(/\s+\S*$/, "")}…`;
}

/* --------------------------------------------------------------- the DOM */

const head = () => document.head;

const upsertMeta = (attr, key, content) => {
  const sel = `meta[${attr}="${key}"]`;
  let el = head().querySelector(sel);
  let mine = false;
  if (!el) {
    el = document.createElement("meta");
    el.setAttribute(attr, key);
    head().appendChild(el);
    mine = true;
  }
  const prev = el.getAttribute("content");
  el.setAttribute("content", content);
  // Restore rather than remove when the tag was already in index.html, so
  // leaving a profile page puts the site-wide description back instead of
  // blanking it.
  return () => (mine ? el.remove() : el.setAttribute("content", prev ?? ""));
};

const upsertLink = (rel, href) => {
  let el = head().querySelector(`link[rel="${rel}"]`);
  let mine = false;
  if (!el) {
    el = document.createElement("link");
    el.setAttribute("rel", rel);
    head().appendChild(el);
    mine = true;
  }
  const prev = el.getAttribute("href");
  el.setAttribute("href", href);
  return () => (mine ? el.remove() : el.setAttribute("href", prev ?? ""));
};

/**
 * Apply a page's SEO tags and return the function that undoes them.
 *
 * @param {object}  seo
 * @param {string}  seo.title
 * @param {string}  seo.description
 * @param {string}  seo.image       relative or absolute; made absolute here
 * @param {string}  seo.type        og:type — "website" | "article" | "profile"
 * @param {string}  seo.canonical   defaults to the current path
 * @param {string}  seo.keywords
 * @param {object}  seo.jsonLd      structured data, or null
 * @param {object}  seo.geo         { placename, region, lat, lng }
 * @param {boolean} seo.noindex     true for a page that must stay out of search
 * @returns {() => void} cleanup
 */
export function applySeo({
  title,
  description,
  image,
  type = "website",
  canonical,
  keywords,
  jsonLd,
  geo,
  noindex = false,
} = {}) {
  if (typeof document === "undefined") return () => {};

  const undo = [];
  const prevTitle = document.title;
  const desc = clampDescription(description);
  const img = absoluteUrl(image);
  const url = canonical || canonicalUrl();

  if (title) document.title = title;

  const meta = (name, content) => {
    if (content) undo.push(upsertMeta("name", name, content));
  };
  const prop = (p, content) => {
    if (content) undo.push(upsertMeta("property", p, content));
  };

  meta("description", desc);
  meta("keywords", keywords);

  prop("og:site_name", SITE_NAME);
  prop("og:title", title);
  prop("og:description", desc);
  prop("og:type", type);
  prop("og:url", url);
  prop("og:image", img);

  meta("twitter:card", "summary_large_image");
  meta("twitter:title", title);
  meta("twitter:description", desc);
  meta("twitter:image", img);

  undo.push(upsertLink("canonical", url));

  /*
   * A held or unpublished profile must not be indexed: it is visible only to
   * its owner and an admin, and a crawler that somehow reached it would index
   * a page everyone else gets a "not available" for.
   */
  if (noindex) meta("robots", "noindex, follow");

  if (geo?.placename) meta("geo.placename", geo.placename);
  if (geo?.region) meta("geo.region", geo.region);
  const lat = Number(geo?.lat);
  const lng = Number(geo?.lng);
  if (geo?.lat != null && geo?.lng != null && !Number.isNaN(lat) && !Number.isNaN(lng)) {
    meta("geo.position", `${lat};${lng}`);
    meta("ICBM", `${lat}, ${lng}`);
  }

  let ld = null;
  if (jsonLd) {
    ld = document.createElement("script");
    ld.type = "application/ld+json";
    // Drop undefined values rather than letting JSON.stringify leave holes.
    ld.text = JSON.stringify(jsonLd, (_k, v) => (v == null || v === "" ? undefined : v));
    head().appendChild(ld);
  }

  return () => {
    undo.forEach((fn) => {
      try { fn(); } catch { /* node already gone */ }
    });
    if (ld?.parentNode) ld.parentNode.removeChild(ld);
    document.title = prevTitle;
  };
}

/**
 * schema.org breadcrumbs, so a search result shows
 * "artfutureclub.com › Artists › Naishi Jogani" instead of a bare url.
 */
export function breadcrumbs(trail) {
  return {
    "@context": "https://schema.org",
    "@type": "BreadcrumbList",
    itemListElement: trail.map(({ name, path }, i) => ({
      "@type": "ListItem",
      position: i + 1,
      name,
      item: absoluteUrl(path),
    })),
  };
}
