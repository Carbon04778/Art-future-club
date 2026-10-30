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

/**
 * The Directory (B11): places of interest that are not exhibition spaces —
 * Julie: "art stores, framers and printers would be the start". Their own
 * page (/directory), held for approval like galleries and venues.
 */
export const DIRECTORY_TYPES = ["Art Store", "Framer", "Printer"];

/** Everything a collector_profile may be. */
export const COLLECTOR_TYPES = [
  "Gallery",
  ...VENUE_TYPES,
  ...DIRECTORY_TYPES,
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

/**
 * People, not places (B10): the Collectors page. Everything that is not a
 * gallery, venue or Directory listing — the same rule as is_people_type in
 * migration 029.
 */
export const PEOPLE_TYPES = ["Collector", "Curator", "Advisor", "Other"];
export const isPeopleType = (type) => PEOPLE_TYPES.includes(type);

/** Does this profile belong on the Directory page? */
export const isDirectoryType = (type) => DIRECTORY_TYPES.includes(type);
