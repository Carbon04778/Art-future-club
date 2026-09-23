/**
 * Turns one written address into the queries a geocoder should try, in order.
 *
 * WHY THIS EXISTS
 *
 * "Locate" sent the address to Nominatim exactly as typed, once. That works for
 * a street address in London or Zurich and fails for most of Hong Kong, because
 * gallery addresses there begin with a floor and unit:
 *
 *   9/F, Hang Wai Commercial Building, 231 Hennessy Road, Wan Chai, Hong Kong
 *     -> NOT FOUND
 *   231 Hennessy Road, Wan Chai, Hong Kong
 *     -> 22.27794, 114.17697
 *
 * Same building. Nominatim cannot match "9/F" or a building name, and returns
 * nothing at all rather than falling back to the street. The owner then saw
 * "Address not found. Try a simpler address." and had to guess which words to
 * delete — while the full address is the one they want stored.
 *
 * So the ADDRESS IS NEVER CHANGED. Only the lookup is retried, progressively
 * simplified, until something matches:
 *
 *   1. the address exactly as written        (correct where it works)
 *   2. without any leading floor/unit parts  (drops "9/F", "Unit 1102, 11/F")
 *   3. the street line plus the last part    ("38 Museum Drive, Hong Kong")
 *   4. the last two parts                    ("Wan Chai, Hong Kong")
 *
 * Step 4 deliberately lands on the district rather than nothing: a pin on the
 * right street is better than no pin, and the caller is told which query
 * matched so the page can say the result was approximate.
 *
 * WHAT THIS CANNOT FIX
 *
 * A street absent from OpenStreetMap. "2-8 Watson Road, North Point" is not in
 * the data at any level of simplification. Those need the pin placed by hand.
 */

/** Components that are a floor, unit, block or similar — never geocodable. */
const UNIT_PART =
  /^(?:(?:lg|ug|g|b|m)\/f|\d+\s*\/\s*f|(?:unit|room|rm|shop|suite|flat|studio|office|apt|apartment|block|tower|level|floor|podium|basement)\b|\d+(?:st|nd|rd|th)\s+floor\b)/i;

/** A component that opens with a street number — "231 Hennessy Road". */
const STREET_LINE = /^\d+[\d\s/,-]*\s+\S/;

const clean = (s) => String(s || "").replace(/\s+/g, " ").trim();
const split = (s) => clean(s).split(",").map(clean).filter(Boolean);

/** True if this component is only a floor/unit/block designation. */
export const isUnitPart = (part) => UNIT_PART.test(clean(part));

/**
 * The queries to try, best first. Always at least one entry (the address
 * itself), never any duplicates, and the original is always first so a
 * well-formed address is unaffected by any of this.
 *
 * @param {string} address  as the owner wrote it
 * @returns {string[]}
 */
export function addressCandidates(address) {
  const parts = split(address);
  if (!parts.length) return [];

  // Normalised, not raw: "231 Hennessy Road , Hong Kong" is the same address
  // as "231 Hennessy Road, Hong Kong" and should not be sent with the stray
  // space, which Nominatim treats as part of the component.
  const out = [parts.join(", ")];
  if (parts.length < 2) return out;

  const add = (q) => {
    const v = clean(q);
    if (v && v.length > 2 && !out.includes(v)) out.push(v);
  };

  // 2. Drop leading floor/unit components.
  let i = 0;
  while (i < parts.length - 1 && isUnitPart(parts[i])) i += 1;
  if (i > 0) add(parts.slice(i).join(", "));

  // 3. The street line plus the last component (usually the city or country).
  //    "38 Museum Drive, West Kowloon Cultural District, Hong Kong" fails while
  //    "38 Museum Drive, Hong Kong" resolves — an intervening district can be
  //    as unmatchable as a floor.
  const street = parts.findIndex((p) => STREET_LINE.test(p));
  const last = parts[parts.length - 1];
  if (street >= 0 && street < parts.length - 1) {
    // From the street number to the end, keeping the district. This is the
    // query that resolved 231 Hennessy Road when the building name did not,
    // so it is tried before dropping anything further.
    add(parts.slice(street).join(", "));
    add(`${parts[street]}, ${last}`);
    // A building name sits immediately before the street line often enough to
    // be worth one attempt: "M+, Hong Kong" resolves exactly.
    if (street > 0 && !isUnitPart(parts[street - 1])) add(`${parts[street - 1]}, ${last}`);
  }

  // 4. Last resort: the district and city. An approximate pin, flagged as such.
  if (parts.length >= 2) add(parts.slice(-2).join(", "));

  return out;
}

/**
 * How exact a result from `addressCandidates[index]` is.
 * Index 0 matched the address as written; anything else was simplified, and the
 * pin may be the street or the district rather than the door.
 */
export const matchPrecision = (index) => (index === 0 ? "exact" : "approximate");
