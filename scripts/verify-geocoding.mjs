/**
 * Address -> geocoder query contract.
 *
 * "Locate" on a gallery or venue profile sent the address to Nominatim exactly
 * as typed, once. That resolves a street address in London or Zurich and fails
 * for most of Hong Kong, where a gallery address opens with a floor and unit.
 * Verified against Nominatim on 2026-09-23:
 *
 *   9/F, Hang Wai Commercial Building, 231 Hennessy Road, Wan Chai, Hong Kong
 *     -> NOT FOUND
 *   231 Hennessy Road, Wan Chai, Hong Kong
 *     -> 22.27794, 114.17697          (the same building)
 *
 *   M+, 38 Museum Drive, West Kowloon Cultural District, Hong Kong
 *     -> NOT FOUND
 *   38 Museum Drive, Hong Kong
 *     -> 22.30105, 114.15915          (M+, exactly)
 *
 * So the owner saw "Address not found. Try a simpler address." on precisely
 * the listings they were most likely to add, and had to guess what to delete.
 *
 * These checks are OFFLINE and make no network calls: Nominatim allows about
 * one request per second, and a test suite must not depend on a third party
 * being reachable. What is tested is the contract — which queries we try, in
 * what order, and that the address itself is never altered.
 *
 * Run: npm run verify:geocoding
 */
import { addressCandidates, isUnitPart, matchPrecision } from "../src/lib/addressQuery.js";

let pass = 0;
const failures = [];
function check(name, condition, detail = "") {
  if (condition) pass++;
  else failures.push(`${name}${detail ? ` — ${detail}` : ""}`);
}

/* ------------------------------------------- the address is never rewritten */

const HK = "9/F, Hang Wai Commercial Building, 231 Hennessy Road, Wan Chai, Hong Kong";
const hk = addressCandidates(HK);

check("the address as written is always tried first", hk[0] === HK, hk[0]);
check("more than one query is offered for a unit-prefixed address", hk.length > 1, `${hk.length}`);
check("no query is repeated", new Set(hk).size === hk.length, hk.join(" | "));

/* ------------------------------------------------ the queries that resolved */

check(
  "the floor prefix is dropped, giving the query that actually resolves",
  hk.includes("231 Hennessy Road, Wan Chai, Hong Kong"),
  hk.join(" | ")
);

const MPLUS = "M+, 38 Museum Drive, West Kowloon Cultural District, Hong Kong";
const mplus = addressCandidates(MPLUS);
check(
  "an unmatchable district is dropped too, leaving street plus city",
  mplus.includes("38 Museum Drive, Hong Kong"),
  mplus.join(" | ")
);
check(
  "the venue name plus city is tried, which resolves M+ exactly",
  mplus.includes("M+, Hong Kong"),
  mplus.join(" | ")
);

const DEEP = "Unit 1102, 11/F, Block B, Sea View Estate, 2-8 Watson Road, North Point, Hong Kong";
const deep = addressCandidates(DEEP);
check(
  "several stacked unit parts are all dropped",
  deep.some((q) => q.startsWith("Sea View Estate")),
  deep.join(" | ")
);
check(
  "a district-level fallback exists so a pin is offered rather than nothing",
  deep.includes("North Point, Hong Kong"),
  deep.join(" | ")
);

/* ----------------------------------- addresses that already worked must not change */

for (const good of [
  "Tate Modern, Bankside, London",
  "Sihlquai 133, 8005 Zurich, Switzerland",
  "100 Soi Tonson, Ploenchit Road, Lumpini, Pathumwan, Bangkok, 10330, Thailand",
]) {
  const qs = addressCandidates(good);
  check(`"${good.slice(0, 28)}…" is tried unchanged first`, qs[0] === good, qs[0]);
}

/* ---------------------------------------------------------------- edge cases */

check("an empty address yields no queries at all", addressCandidates("").length === 0);
check("a blank-ish address yields no queries", addressCandidates("   ").length === 0);
check("a one-word address yields exactly itself", addressCandidates("Zurich").join() === "Zurich");
check(
  "whitespace is normalised, not preserved",
  addressCandidates("  231   Hennessy  Road ,  Hong Kong ")[0] === "231 Hennessy Road, Hong Kong",
  addressCandidates("  231   Hennessy  Road ,  Hong Kong ")[0]
);

/* -------------------------------------------------- unit detection itself */

for (const part of ["9/F", "11/F", "G/F", "LG/F", "Unit 1102", "Room 5", "Shop 3B",
                    "Suite 200", "Flat A", "Block B", "Level 4", "2nd Floor", "Studio 12"]) {
  check(`"${part}" is recognised as a floor/unit part`, isUnitPart(part));
}
for (const part of ["231 Hennessy Road", "Bankside", "Hong Kong", "Sihlquai 133",
                    "Museum Drive", "Wan Chai"]) {
  check(`"${part}" is NOT treated as a floor/unit part`, !isUnitPart(part), "would be dropped wrongly");
}

/* --------------------------------------------------------------- precision */

check("a hit on the written address is exact", matchPrecision(0) === "exact");
check("a hit on any simplified query is approximate", matchPrecision(1) === "approximate");

/* ----------------------------------------------------------------- report */

console.log(`\n  passed: ${pass}`);
if (failures.length) {
  console.log(`  FAILED: ${failures.length}\n`);
  failures.forEach((f) => console.log(`   ✗ ${f}`));
  process.exit(1);
}
console.log("  address queries degrade correctly and never rewrite the address\n");
