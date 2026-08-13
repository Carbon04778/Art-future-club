import { useEffect } from "react";

/**
 * Injects SEO + GEO meta tags into the document <head> for a given article,
 * then restores the previous <head> state on unmount (so tags don't leak
 * between articles or back to the rest of the site).
 */
const upsert = (selector, attrs, content) => {
  let el = document.head.querySelector(selector);
  if (!el) {
    el = document.createElement("meta");
    attrs.forEach(([k, v]) => el.setAttribute(k, v));
    document.head.appendChild(el);
  }
  if (content != null) el.setAttribute("content", content);
  return el;
};

const upsertLink = (rel, href) => {
  let el = document.head.querySelector(`link[rel="${rel}"]`);
  if (!el) {
    el = document.createElement("link");
    el.setAttribute("rel", rel);
    document.head.appendChild(el);
  }
  el.setAttribute("href", href);
};

export function useSeoMeta(article) {
  useEffect(() => {
    if (!article) return;
    const prevTitle = document.title;
    const created = [];

    const title = article.seo_title || `${article.title} — Art Future Club Editorial`;
    const desc = article.seo_description || article.subtitle || "";
    const ogImage = article.og_image_url || article.cover_image_url || "";
    const keywords = [article.seo_keywords, ...(article.tags || []), ...(article.categories || [])]
      .filter(Boolean)
      .join(", ");
    const url = article.canonical_url || (typeof window !== "undefined" ? window.location.href : "");

    document.title = title;

    const meta = (name, content) => {
      if (content == null || content === "") return;
      const el = upsert(`meta[name="${name}"]`, [["name", name]], content);
      created.push(() => el.setAttribute("content", ""));
    };
    const prop = (p, content) => {
      if (content == null || content === "") return;
      const el = upsert(`meta[property="${p}"]`, [["property", p]], content);
      created.push(() => el.setAttribute("content", ""));
    };

    meta("description", desc);
    if (keywords) meta("keywords", keywords);
    prop("og:title", title);
    prop("og:description", desc);
    prop("og:image", ogImage);
    prop("og:type", "article");
    prop("og:url", url);
    meta("twitter:card", "summary_large_image");
    meta("twitter:title", title);
    meta("twitter:description", desc);
    meta("twitter:image", ogImage);

    if (article.canonical_url) upsertLink("canonical", article.canonical_url);

    if (article.geo_placename) meta("geo.placename", article.geo_placename);
    if (article.geo_region) meta("geo.region", article.geo_region);
    if (article.geo_lat != null && article.geo_lng != null && !Number.isNaN(Number(article.geo_lat))) {
      meta("geo.position", `${article.geo_lat};${article.geo_lng}`);
      meta("ICBM", `${article.geo_lat}, ${article.geo_lng}`);
    }

    // JSON-LD structured data
    const ld = document.createElement("script");
    ld.type = "application/ld+json";
    ld.text = JSON.stringify({
      "@context": "https://schema.org",
      "@type": "Article",
      headline: article.title,
      description: desc,
      image: ogImage ? [ogImage] : undefined,
      datePublished: article.publish_date || article.created_date,
      author: { "@type": "Person", name: article.author_name || undefined },
      keywords: keywords || undefined,
      ...(article.geo_placename ? { contentLocation: { "@type": "Place", name: article.geo_placename } } : {}),
    });
    document.head.appendChild(ld);

    return () => {
      created.forEach((fn) => fn());
      document.head.removeChild(ld);
      document.title = prevTitle;
    };
  }, [article]);
}