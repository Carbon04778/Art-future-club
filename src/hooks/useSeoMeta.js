import { useEffect } from "react";
import { applySeo, absoluteUrl, breadcrumbs, SITE_NAME } from "@/lib/seo";
import { articlePath } from "@/lib/slugs";

/**
 * SEO + GEO meta for an editorial article.
 *
 * This hook already set a good set of tags. What it got wrong is now handled by
 * src/lib/seo.js:
 *
 *   - og:image used the column value as-is, so a locally hosted cover produced
 *     a root-relative path. Every social platform requires an absolute url and
 *     silently shows no image for a relative one.
 *   - canonical was set ONLY when the article carried an explicit
 *     canonical_url, which almost none do — so the default case, an article
 *     reachable by both slug and id, had no canonical at all.
 */
export function useSeoMeta(article) {
  useEffect(() => {
    if (!article) return undefined;

    const title = article.seo_title || `${article.title} — ${SITE_NAME} Editorial`;
    const description = article.seo_description || article.subtitle || "";
    const image = article.og_image_url || article.cover_image_url || "";
    const keywords = [article.seo_keywords, ...(article.tags || []), ...(article.categories || [])]
      .filter(Boolean)
      .join(", ");

    // An explicit canonical_url still wins — that is what the field is for,
    // e.g. a piece syndicated from somewhere else.
    const canonical = article.canonical_url || absoluteUrl(articlePath(article));

    const cleanup = applySeo({
      title,
      description,
      image,
      type: "article",
      canonical,
      keywords,
      // An unpublished draft must not be indexed.
      noindex: article.published === false,
      geo: {
        placename: article.geo_placename,
        region: article.geo_region,
        lat: article.geo_lat,
        lng: article.geo_lng,
      },
      jsonLd: {
        "@context": "https://schema.org",
        "@type": "Article",
        headline: article.title,
        description: description || undefined,
        image: image ? [absoluteUrl(image)] : undefined,
        url: canonical,
        datePublished: article.publish_date || article.created_date || undefined,
        // Google uses dateModified to decide how fresh a piece is.
        dateModified: article.updated_date || article.publish_date || undefined,
        author: article.author_name
          ? { "@type": "Person", name: article.author_name }
          : undefined,
        publisher: {
          "@type": "Organization",
          name: SITE_NAME,
          url: absoluteUrl("/"),
        },
        keywords: keywords || undefined,
        ...(article.geo_placename
          ? { contentLocation: { "@type": "Place", name: article.geo_placename } }
          : {}),
      },
    });

    const crumbs = document.createElement("script");
    crumbs.type = "application/ld+json";
    crumbs.text = JSON.stringify(
      breadcrumbs([
        { name: "Home", path: "/" },
        { name: "Editorial", path: "/editorial" },
        { name: article.title || "Article", path: articlePath(article) },
      ])
    );
    document.head.appendChild(crumbs);

    return () => {
      cleanup();
      if (crumbs.parentNode) crumbs.parentNode.removeChild(crumbs);
    };
  }, [article]);
}
