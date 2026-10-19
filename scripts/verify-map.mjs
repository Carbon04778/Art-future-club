/**
 * Verifies the one map (B1 in docs/CLIENT-REQUESTS.md): artists as a layer of
 * the galleries-and-venues map, one pin per chapter city.
 *
 * Run: npm run verify:map
 */

import { readFileSync } from "node:fs";
import { CHAPTERS } from "../src/lib/chaptersData.js";
import {
  parseCoords, groupArtistsByCity, isArtistGroup, ARTISTS_TYPE, artistCountLabel,
} from "../src/lib/artistGroups.js";

let pass = 0;
const failures = [];
const check = (name, cond, detail = "") =>
  cond ? pass++ : failures.push(`${name}${detail ? ` — ${detail}` : ""}`);

// --- every chapter can be placed --------------------------------------------
for (const c of CHAPTERS) {
  const p = parseCoords(c.coords);
  check(`${c.city} has a readable position`, p && Math.abs(p.lat) <= 90 && Math.abs(p.lng) <= 180, c.coords);
}
const hk = parseCoords("22.3193°N / 114.1694°E");
check("north/east stay positive", hk?.lat === 22.3193 && hk?.lng === 114.1694, JSON.stringify(hk));
const ny = parseCoords("40.7128°N / 74.0060°W");
check("west becomes negative", ny?.lng === -74.006, JSON.stringify(ny));
check("south becomes negative", parseCoords("33.8688°S / 151.2093°E")?.lat === -33.8688);
check("unreadable text gives null, not a pin in the sea", parseCoords("somewhere") === null);

// --- grouping -----------------------------------------------------------------
const artists = [
  { id: "1", display_name: "Zed", chapter: "Hong Kong" },
  { id: "2", display_name: "Amy", chapter: "Hong Kong" },
  { id: "3", display_name: "Bo", chapter: "London" },
  { id: "4", display_name: "No City", chapter: "" },
  { id: "5", display_name: "Other One", chapter: "Other" },
  { id: "6", display_name: "Spaced", chapter: " Hong Kong " },
  { id: "7", display_name: "Unknown City", chapter: "Atlantis" },
];
const { groups, unplaced } = groupArtistsByCity(artists);
const hkGroup = groups.find((g) => g.display_name === "Hong Kong");
check("one pin per city, not per artist", groups.length === 2, groups.map((g) => g.display_name).join(","));
check("every placed artist is counted once", groups.reduce((n, g) => n + g.members.length, 0) === 4);
check("stray spaces in a chapter still place the artist", hkGroup?.members.length === 3);
check("artists without a usable city are counted, not dropped", unplaced.length === 3,
  unplaced.map((a) => a.display_name).join(","));
check("biggest city first", groups[0].display_name === "Hong Kong");
check("names sorted inside a city", hkGroup.members.map((a) => a.display_name).join(",") === "Amy,Spaced,Zed");
check("group rows look like map rows",
  groups.every((g) => g.id.startsWith("artists:") && g.type === ARTISTS_TYPE &&
    Number.isFinite(g.geo_lat) && Number.isFinite(g.geo_lng)));
check("group ids are unique", new Set(groups.map((g) => g.id)).size === groups.length);
check("isArtistGroup tells them apart", isArtistGroup(hkGroup) && !isArtistGroup({ type: "Gallery" }));
check("count label singular", artistCountLabel(1) === "1 artist");
check("count label plural", artistCountLabel(55) === "55 artists");
check("no artists gives no pins", groupArtistsByCity([]).groups.length === 0);

// --- wiring ---------------------------------------------------------------------
const read = (p) => readFileSync(new URL(p, import.meta.url), "utf8");
const map = read("../src/components/SpacesMap.jsx");
const artistPage = read("../src/pages/ArtistMap.jsx");
const galleryPage = read("../src/pages/GalleryMap.jsx");

check("the map offers an Artists filter", /\["All", "Artists", "Galleries", "Venues"\]/.test(map));
check("artists are paged, not capped at 200",
  /ArtistProfile\.page\(/.test(map) && !/ArtistProfile\.list\([^)]*200/.test(map + artistPage));
check("only published artists are plotted", /where: \{ status: "approved" \}/.test(map));
check("artist pins open the artist popup", /isArtistGroup\(row\)\s*\?\s*<ArtistGroupPopup/.test(map));
check("/map is the one map, with artists", /<SpacesMap[^>]*includeArtists/.test(artistPage));
check("/map no longer draws a second map", !/MapContainer|CircleMarker/.test(artistPage));
check("?show= preselects a filter", /params\.get\("show"\)/.test(artistPage));
check("/gallery-map still works, landing on Galleries",
  /<Navigate to="\/map\?show=galleries" replace \/>/.test(galleryPage));
for (const s of ["GoogleSpacesSurface", "LeafletSpacesSurface"]) {
  check(`${s} draws an artist pin`, /type === ARTISTS_TYPE/.test(read(`../src/components/map/${s}.jsx`)));
}

console.log(`\nverify-map: ${pass} passed, ${failures.length} failed`);
if (failures.length) {
  failures.forEach((f) => console.log("  FAIL", f));
  process.exit(1);
}
