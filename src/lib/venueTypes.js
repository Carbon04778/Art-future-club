/**
 * Venue and space classifications.
 *
 * "Institution" alone was too broad: museums, restaurants and event spaces
 * were all filed under it and appeared together on the venues page with no
 * way to tell them apart.
 *
 * VENUE_TYPES are the kinds that appear on the Venues page. Gallery has its
 * own page, and Collector / Curator / Advisor are people rather than places.
 *
 * "Other" is deliberately NOT a venue type. It was, and the result was that a
 * collector or curator saved as "Other" turned up on the venues page as
 * though they were a building. A space of uncertain kind should be filed as
 * Event Space or Institution; "Other" belongs to the people categories only.
 */
export const VENUE_TYPES = [
  "Institution",
  "Museum",
  "Foundation",
  "Event Space",
  "Restaurant",
];

/** Everything a collector_profile may be. */
export const COLLECTOR_TYPES = [
  "Gallery",
  ...VENUE_TYPES,
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
