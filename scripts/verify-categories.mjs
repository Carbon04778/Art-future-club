/**
 * Categories must not bleed into one another.
 *
 * Two faults prompted this:
 *
 *   1. The Collective Registry's "venues" list was actually Event.list(), so
 *      an event held at a gallery appeared as a venue — carrying the event's
 *      image, the event's chapter as its city, and linking to /events. That is
 *      why "10 Chancery Lane Gallery" showed as VENUE / OTHER.
 *
 *   2. "Other" was a venue type, so a collector or curator filed as "Other"
 *      turned up on the venues page as though they were a building.
 *
 * Run: node scripts/verify-categories.mjs
 */

import { readFileSync } from "node:fs";
import { VENUE_TYPES, COLLECTOR_TYPES, isVenueType } from "../src/lib/venueTypes.js";

const reg = readFileSync("src/components/CollectiveRegistry.jsx", "utf8");
const ven = readFileSync("src/pages/Venues.jsx", "utf8");
const gal = readFileSync("src/pages/GalleryShowcase.jsx", "utf8");

// Comments describing the old behaviour must not be mistaken for it.
const stripComments = (src) => src.replace(/\/\/.*$/gm, "").replace(/\/\*[\s\S]*?\*\//g, "");
const regCode = stripComments(reg);

let pass = 0;
const failures = [];
const check = (name, cond, detail = "") =>
  cond ? pass++ : failures.push(`${name}${detail ? ` — ${detail}` : ""}`);

/* ------------------------------------------------ the categories themselves */

check("Gallery is not a venue type", !isVenueType("Gallery"));
check("Collector is not a venue type", !isVenueType("Collector"));
check("Curator is not a venue type", !isVenueType("Curator"));
check("Advisor is not a venue type", !isVenueType("Advisor"));
check(
  "'Other' is not a venue type",
  !isVenueType("Other"),
  "a collector filed as Other would appear on the venues page"
);

for (const t of ["Institution", "Museum", "Foundation", "Event Space", "Restaurant"]) {
  check(`${t} is a venue type`, isVenueType(t));
}

check(
  "every venue type can actually be chosen when creating",
  VENUE_TYPES.every((t) => COLLECTOR_TYPES.includes(t))
);

/* ------------------------------------------------------------- the registry */

check("registry does not read events", !/Event\.list\(/.test(regCode));
check("registry reads collector profiles", /CollectorProfile\.list/.test(regCode));
check(
  "registry separates galleries from venues",
  /p\.type === 'Gallery'/.test(regCode) && /isVenueType\(p\.type\)/.test(regCode)
);
check("galleries link to a gallery page", /to: `\/gallery\/\$\{g\.id\}`/.test(regCode));
check("venues link to a venue page", /to: `\/venues\/\$\{v\.id\}`/.test(regCode));
check("nothing links to an event page", !/to: `\/events\//.test(regCode));
check("a venue shows its real kind", /type: v\.type \|\| 'Venue'/.test(regCode));
check("a venue uses its own image", /image: v\.avatar_url/.test(regCode));
check("a venue uses its own city", /city: v\.based_in/.test(regCode));

/* ------------------------------------------------------ the directory pages */

check("the galleries page selects only galleries", /filter\(\{ type: "Gallery" \}/.test(gal));
check("the venues page uses the shared helper", /isVenueType\(r\.type\)/.test(ven));

/* ------------------------------------------------------------- simulation */

const sample = COLLECTOR_TYPES.map((t) => ({ type: t }));
const onGalleries = sample.filter((p) => p.type === "Gallery");
const onVenues = sample.filter((p) => isVenueType(p.type));
const both = onGalleries.filter((g) => onVenues.includes(g));

check("no profile can appear on both pages", both.length === 0, both.map((b) => b.type).join(", "));

const onNeither = sample
  .filter((p) => p.type !== "Gallery" && !isVenueType(p.type))
  .map((p) => p.type);
check(
  "people appear on neither page, as they should",
  onNeither.join(",") === "Collector,Curator,Advisor,Other",
  onNeither.join(",")
);

console.log(`\n  passed: ${pass}`);
if (failures.length) {
  console.log(`  FAILED: ${failures.length}\n`);
  failures.forEach((f) => console.log(`   ✗ ${f}`));
  process.exit(1);
}
console.log("  galleries, venues, events and people stay in their own places\n");
