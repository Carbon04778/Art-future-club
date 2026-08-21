/**
 * Venue and space classifications.
 *
 * "Institution" alone was too broad: museums, restaurants and event spaces
 * were all filed under it and appeared together on the venues page with no
 * way to tell them apart.
 *
 * VENUE_TYPES are the kinds that appear on the Venues page. Gallery has its
 * own page, and Collector / Curator / Advisor are people rather than places.
 */
export const VENUE_TYPES = [
  "Institution",
  "Museum",
  "Foundation",
  "Event Space",
  "Restaurant",
  "Other",
];

/** Everything a collector_profile may be. */
export const COLLECTOR_TYPES = [
  "Gallery",
  ...VENUE_TYPES.filter((t) => t !== "Other"),
  "Collector",
  "Curator",
  "Advisor",
  "Other",
];

/**
 * Does this profile belong on the Venues page?
 *
 * Used by every page that lists venues. Filtering on `type === "Institution"`
 * in each of them is what made adding a new type silently hide those venues.
 */
export const isVenueType = (type) => VENUE_TYPES.includes(type);
