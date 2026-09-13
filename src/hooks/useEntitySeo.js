import { useEffect } from "react";
import { applySeo, absoluteUrl, breadcrumbs, SITE_NAME } from "@/lib/seo";
import { artistPath, eventPath } from "@/lib/slugs";
import { STATUS, effectiveStatus } from "@/lib/profileReadiness";

/** Append a JSON-LD block and hand back the function that removes it. */
function addJsonLd(data) {
  const el = document.createElement("script");
  el.type = "application/ld+json";
  el.text = JSON.stringify(data);
  document.head.appendChild(el);
  return () => {
    if (el.parentNode) el.parentNode.removeChild(el);
  };
}

/**
 * SEO for an artist profile.
 *
 * An artist page had NO meta tags whatsoever — no title of its own, no
 * description, no share image, no structured data. Shared anywhere it appeared
 * as "Art Future Club — Global Artist Community" with no picture, and all
 * twenty artists looked identical in search results.
 *
 * Field names are the real ones: `discipline` is a single text column and the
 * portfolio lives in `portfolio_works`, whose items are
 * { title, year, medium, dimensions, description, image_url }.
 */
export function useArtistSeo(profile) {
  useEffect(() => {
    if (!profile) return undefined;

    const name = profile.display_name || "Artist";
    const where = profile.based_in || profile.chapter || "";
    const discipline = profile.discipline || "";
    const works = Array.isArray(profile.portfolio_works) ? profile.portfolio_works : [];

    /*
     * Built from real fields rather than a fixed template, because
     * "Kprod — Painting in Hong Kong" earns a click and "Kprod — Profile" does
     * not. Each clause drops out when empty, so a sparse profile never
     * produces "Name —  in ".
     */
    const subtitle = [discipline, where && `in ${where}`].filter(Boolean).join(" ");
    const title = `${[name, subtitle].filter(Boolean).join(" — ")} | ${SITE_NAME}`;

    const description =
      profile.bio ||
      [name, discipline && `${discipline} artist`, where && `based in ${where}`]
        .filter(Boolean)
        .join(", ");

    const image = profile.avatar_url || works.find((w) => w?.image_url)?.image_url || "";

    // A profile still awaiting review is not public, so keep it out of search.
    const held = effectiveStatus(profile) !== STATUS.APPROVED;

    const cleanup = applySeo({
      title,
      description,
      image,
      type: "profile",
      /*
       * Derived from the record, NOT from window.location. The redirect from an
       * old UUID url to the slug is asynchronous, so reading the address bar
       * here would sometimes declare the UUID url canonical — the exact
       * duplicate this is meant to collapse.
       */
      canonical: absoluteUrl(artistPath(profile)),
      keywords: [name, discipline, where, "artist", SITE_NAME].filter(Boolean).join(", "),
      noindex: held,
      geo: { placename: where },
      jsonLd: {
        "@context": "https://schema.org",
        "@type": "Person",
        name,
        description: profile.bio || undefined,
        image: image ? absoluteUrl(image) : undefined,
        url: absoluteUrl(artistPath(profile)),
        jobTitle: discipline ? `${discipline} Artist` : "Artist",
        homeLocation: where ? { "@type": "Place", name: where } : undefined,
        sameAs: [
          profile.website,
          profile.instagram,
          profile.twitter,
          profile.linkedin,
          profile.tiktok,
        ].filter(Boolean),
        /*
         * The portfolio as VisualArtwork entries, capped at twelve so the tag
         * stays a reasonable size. This is what lets a piece appear in image
         * search with its real title, medium and creator attached rather than
         * as an anonymous file.
         */
        ...(works.length
          ? {
              workExample: works
                .filter((w) => w?.image_url)
                .slice(0, 12)
                .map((w) => ({
                  "@type": "VisualArtwork",
                  name: w.title || undefined,
                  image: absoluteUrl(w.image_url),
                  artMedium: w.medium || undefined,
                  dateCreated: w.year || undefined,
                  creator: { "@type": "Person", name },
                })),
            }
          : {}),
      },
    });

    const removeCrumbs = addJsonLd(
      breadcrumbs([
        { name: "Home", path: "/" },
        { name: "Artists", path: "/artists" },
        { name, path: artistPath(profile) },
      ])
    );

    return () => {
      cleanup();
      removeCrumbs();
    };
  }, [profile]);
}

/**
 * SEO for an event.
 *
 * schema.org/Event is one of the few types that earns a rich result: the date,
 * venue and ticket status show up directly in the search listing. No event page
 * had any structured data, so 160 real exhibitions were invisible as events.
 *
 * Real column names: `event_type`, `chapter` (which holds the city), `venue`,
 * `external_link`, and `is_free` / `ticket_price`.
 */
export function useEventSeo(event) {
  useEffect(() => {
    if (!event) return undefined;

    const city = event.chapter || "";
    const title = `${event.title || "Event"}${city ? ` — ${city}` : ""} | ${SITE_NAME}`;

    const starts = event.start_date
      ? new Date(event.start_date).toLocaleDateString("en-GB", {
          day: "numeric",
          month: "long",
          year: "numeric",
        })
      : "";

    const description =
      event.description ||
      [event.event_type, event.venue, city, starts].filter(Boolean).join(" · ");

    const image = event.image_url || "";

    const cleanup = applySeo({
      title,
      description,
      image,
      // og:type "article" rather than "website": this is a dated piece of
      // content, which is how a share card should treat it.
      type: "article",
      // From the record, not the address bar — see the note on the artist hook.
      canonical: absoluteUrl(eventPath(event)),
      keywords: [event.title, event.event_type, city, "art event", "exhibition"]
        .filter(Boolean)
        .join(", "),
      geo: { placename: event.venue || city, region: city },
      jsonLd: {
        "@context": "https://schema.org",
        "@type": "Event",
        name: event.title,
        description: event.description || undefined,
        image: image ? [absoluteUrl(image)] : undefined,
        url: absoluteUrl(eventPath(event)),
        startDate: event.start_date || undefined,
        // A missing endDate is read as a single instant, so falling back to the
        // start keeps a one-day show showing the right date.
        endDate: event.end_date || event.start_date || undefined,
        /*
         * Both of these are REQUIRED for an Event rich result, and omitting
         * either costs the rich result entirely. Every event here is a real
         * show at a real address, so offline is the correct default.
         */
        eventAttendanceMode: "https://schema.org/OfflineEventAttendanceMode",
        eventStatus: "https://schema.org/EventScheduled",
        location:
          event.venue || event.address || city
            ? {
                "@type": "Place",
                name: event.venue || city || undefined,
                address: {
                  "@type": "PostalAddress",
                  streetAddress: event.address || undefined,
                  addressLocality: city || undefined,
                },
              }
            : undefined,
        organizer: event.organizer_name
          ? { "@type": "Organization", name: event.organizer_name }
          : undefined,
        /*
         * A free show still needs an Offer — price 0 is what marks it free in a
         * search listing. With no offer at all the listing says nothing about
         * admission, which reads as "unknown" rather than "free".
         */
        offers: {
          "@type": "Offer",
          url: event.external_link || absoluteUrl(eventPath(event)),
          price: event.is_free ? "0" : event.ticket_price || undefined,
          priceCurrency: event.is_free || event.ticket_price ? "HKD" : undefined,
          availability: "https://schema.org/InStock",
        },
        ...(event.external_link ? { sameAs: event.external_link } : {}),
      },
    });

    const removeCrumbs = addJsonLd(
      breadcrumbs([
        { name: "Home", path: "/" },
        { name: "Events", path: "/events" },
        { name: event.title || "Event", path: eventPath(event) },
      ])
    );

    return () => {
      cleanup();
      removeCrumbs();
    };
  }, [event]);
}
