import { useEffect } from "react";

/**
 * Injects SEO + GEO meta tags into the document <head> for a gallery /
 * institution profile, then restores the previous <head> state on unmount
 * so tags don't leak between profiles or back to the rest of the site.
 */
const upsert = (selector) => {
  let el = document.head.querySelector(selector);
  if (!el) {
    el = document.createElement("meta");
    document.head.appendChild(el);
  }
  return el;
};

export function useGallerySeoMeta(profile) {
  useEffect(() => {
    if (!profile) return;
    const prevTitle = document.title;
    const touched = [];

    const title = profile.seo_title || `${profile.display_name} — Art Future Club`;
    const desc = profile.seo_description || profile.bio || "";
    const ogImage = profile.cover_image_url || profile.avatar_url || "";
    const keywords = [profile.seo_keywords, ...(profile.interests || []), ...(profile.seeking || [])]
      .filter(Boolean)
      .join(", ");
    const url = typeof window !== "undefined" ? window.location.href : "";

    document.title = title;

    const meta = (name, content) => {
      if (content == null || content === "") return;
      const el = upsert(`meta[name="${name}"]`);
      el.setAttribute("name", name);
      el.setAttribute("content", content);
      touched.push(() => el.setAttribute("content", ""));
    };
    const prop = (p, content) => {
      if (content == null || content === "") return;
      const el = upsert(`meta[property="${p}"]`);
      el.setAttribute("property", p);
      el.setAttribute("content", content);
      touched.push(() => el.setAttribute("content", ""));
    };

    meta("description", desc);
    if (keywords) meta("keywords", keywords);
    prop("og:title", title);
    prop("og:description", desc);
    prop("og:image", ogImage);
    prop("og:type", "profile");
    prop("og:url", url);
    meta("twitter:card", "summary_large_image");
    meta("twitter:title", title);
    meta("twitter:description", desc);
    meta("twitter:image", ogImage);

    if (profile.geo_placename) meta("geo.placename", profile.geo_placename);
    if (profile.geo_region) meta("geo.region", profile.geo_region);
    if (profile.geo_lat != null && profile.geo_lng != null && !Number.isNaN(Number(profile.geo_lat)) && !Number.isNaN(Number(profile.geo_lng))) {
      meta("geo.position", `${profile.geo_lat};${profile.geo_lng}`);
      meta("ICBM", `${profile.geo_lat}, ${profile.geo_lng}`);
    }

    // JSON-LD structured data — a museum/gallery profile
    const ld = document.createElement("script");
    ld.type = "application/ld+json";
    ld.text = JSON.stringify({
      "@context": "https://schema.org",
      "@type": profile.type === "Institution" ? "Museum" : "Gallery",
      name: profile.display_name,
      description: desc || undefined,
      image: ogImage ? [ogImage] : undefined,
      url: url || undefined,
      ...(profile.website ? { sameAs: [profile.website] } : {}),
      address: profile.address
        ? { "@type": "PostalAddress", streetAddress: profile.address }
        : undefined,
      ...(profile.geo_lat != null && profile.geo_lng != null && !Number.isNaN(Number(profile.geo_lat)) && !Number.isNaN(Number(profile.geo_lng))
        ? { geo: { "@type": "GeoCoordinates", latitude: Number(profile.geo_lat), longitude: Number(profile.geo_lng) } }
        : {}),
    });
    document.head.appendChild(ld);

    return () => {
      touched.forEach((fn) => fn());
      document.head.removeChild(ld);
      document.title = prevTitle;
    };
  }, [profile]);
}