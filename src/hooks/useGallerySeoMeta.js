import { useEffect } from "react";
import { applySeo, absoluteUrl, breadcrumbs, SITE_NAME } from "@/lib/seo";
import { spacePath } from "@/lib/slugs";
import { STATUS, effectiveStatus } from "@/lib/profileReadiness";

/**
 * SEO for a gallery / museum / venue profile.
 *
 * This hook already existed and set a good set of tags. Two things were wrong
 * with it, and both are handled by src/lib/seo.js now:
 *
 *   - og:image was whatever the column held, which for every locally hosted
 *     cover is a root-relative path. Every social platform requires an absolute
 *     url and shows nothing at all for a relative one.
 *   - There was no canonical tag. The same gallery is reachable by slug and by
 *     id, and on both /gallery/:id and /venues/:id, so search engines had four
 *     addresses for one page and no way to know which to rank.
 *
 * @param profile the collector_profile row
 * @param opts.isVenue true on /venues/:id, so the canonical url keeps that path
 */
export function useGallerySeoMeta(profile, { isVenue = false } = {}) {
  useEffect(() => {
    if (!profile) return undefined;

    const name = profile.display_name || "Gallery";
    const typeLabel = profile.type || "Gallery";
    const where = profile.based_in || "";

    const title =
      profile.seo_title || `${name} — ${typeLabel}${where ? ` in ${where}` : ""} | ${SITE_NAME}`;
    const description = profile.seo_description || profile.bio || "";
    const image = profile.cover_image_url || profile.avatar_url || "";

    const keywords = [
      profile.seo_keywords,
      name,
      typeLabel,
      where,
      ...(profile.interests || []),
      ...(profile.seeking || []),
    ]
      .filter(Boolean)
      .join(", ");

    const hasGeo =
      profile.geo_lat != null &&
      profile.geo_lng != null &&
      !Number.isNaN(Number(profile.geo_lat)) &&
      !Number.isNaN(Number(profile.geo_lng));

    // A space still awaiting review is not public, so keep it out of search.
    const held = effectiveStatus(profile) !== STATUS.APPROVED;

    const canonical = absoluteUrl(spacePath(profile, isVenue));

    const cleanup = applySeo({
      title,
      description,
      image,
      type: "profile",
      canonical,
      keywords,
      noindex: held,
      geo: {
        placename: profile.geo_placename || where,
        region: profile.geo_region,
        lat: profile.geo_lat,
        lng: profile.geo_lng,
      },
      jsonLd: {
        "@context": "https://schema.org",
        /*
         * Map each profile type to the closest schema.org type.
         *
         * This only special-cased "Institution", so the nine real Museum
         * profiles were declaring themselves to search engines as art
         * galleries. Museum is a recognised schema.org type; the rest have no
         * better match than a general place, and Gallery stays the default.
         */
        "@type":
          profile.type === "Museum" || profile.type === "Institution"
            ? "Museum"
            : profile.type === "Foundation"
            ? "Organization"
            : profile.type === "Restaurant"
            ? "Restaurant"
            : profile.type === "Event Space"
            ? "EventVenue"
            : "Gallery",
        name,
        description: description || undefined,
        image: image ? [absoluteUrl(image)] : undefined,
        url: canonical,
        telephone: profile.phone || undefined,
        email: profile.email || undefined,
        // Real opening hours are a ranking signal for a physical place and show
        // up directly in a local search panel.
        openingHours: profile.opening_hours || undefined,
        ...(profile.website ? { sameAs: [profile.website] } : {}),
        address: profile.address
          ? {
              "@type": "PostalAddress",
              streetAddress: profile.address,
              addressLocality: where || undefined,
            }
          : undefined,
        ...(hasGeo
          ? {
              geo: {
                "@type": "GeoCoordinates",
                latitude: Number(profile.geo_lat),
                longitude: Number(profile.geo_lng),
              },
            }
          : {}),
      },
    });

    const crumbs = document.createElement("script");
    crumbs.type = "application/ld+json";
    crumbs.text = JSON.stringify(
      breadcrumbs([
        { name: "Home", path: "/" },
        isVenue ? { name: "Venues", path: "/venues" } : { name: "Gallery", path: "/gallery" },
        { name, path: spacePath(profile, isVenue) },
      ])
    );
    document.head.appendChild(crumbs);

    return () => {
      cleanup();
      if (crumbs.parentNode) crumbs.parentNode.removeChild(crumbs);
    };
  }, [profile, isVenue]);
}
