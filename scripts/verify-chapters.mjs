/**
 * Verifies the chapter list (A2 in docs/CLIENT-REQUESTS.md): every chapter is
 * complete and its picture is in the project, numbers and addresses are
 * unique, and the pages that once typed the eight cities by hand now read
 * the one list in src/lib/chaptersData.js — so a new chapter (Cairns next)
 * needs one edit, not seven. Also checks the About Us team photos exist.
 *
 * Run: npm run verify:chapters
 */
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { CHAPTERS, CHAPTER_NAMES, CHAPTER_OPTIONS } from "../src/lib/chaptersData.js";

const ROOT = fileURLToPath(new URL("..", import.meta.url));
const src = (f) => readFileSync(join(ROOT, f), "utf8");
let pass = 0;
const fails = [];
const check = (n, c, d = "") => (c ? pass++ : fails.push(`${n}${d ? ` — ${d}` : ""}`));

// ---- each chapter is complete
for (const c of CHAPTERS) {
  for (const k of ["city", "slug", "chapter", "coords", "timezone", "image", "image_credit", "tagline", "about"]) {
    check(`${c.city}: has ${k}`, typeof c[k] === "string" && c[k].trim() !== "");
  }
  check(`${c.city}: picture is in the project (${c.image})`, existsSync(join(ROOT, "public", c.image)));
  check(`${c.city}: web address is lower-case words`, /^[a-z]+(-[a-z]+)*$/.test(c.slug));
  check(`${c.city}: map position reads as a place`, /^\d+(\.\d+)?°[NS] \/ \d+(\.\d+)?°[EW]$/.test(c.coords), c.coords);
  check(`${c.city}: no sample artists for a new chapter`, !["Seattle", "Taipei"].includes(c.city) || c.artists.length === 0);
}
const uniq = (xs) => new Set(xs).size === xs.length;
check("chapter numbers are unique", uniq(CHAPTERS.map((c) => c.chapter)));
check("chapter numbers run Ch.01, Ch.02 … in order", CHAPTERS.every((c, i) => c.chapter === `Ch.${String(i + 1).padStart(2, "0")}`), CHAPTERS.map((c) => c.chapter).join(" "));
check("web addresses are unique", uniq(CHAPTERS.map((c) => c.slug)));
check("Seattle and Taipei are chapters", CHAPTER_NAMES.includes("Seattle") && CHAPTER_NAMES.includes("Taipei"));
check("Seattle credit: Erynne Byrd-Quigtar", CHAPTERS.find((c) => c.slug === "seattle")?.image_credit === "Artwork by: Erynne Byrd-Quigtar");
check("Taipei credit: Adam Dupuis", CHAPTERS.find((c) => c.slug === "taipei")?.image_credit === "Artwork by: Adam Dupuis");
check("profiles can pick every chapter, and 'Other'", CHAPTER_OPTIONS.length === CHAPTERS.length + 1 && CHAPTER_OPTIONS.at(-1) === "Other");

// ---- no page types the city list by hand any more
const handTyped = /"Toronto",\s*"Zurich"|'Toronto',\s*'Zurich'|Toronto · Zurich|Toronto and Zurich|"Tokyo", "Berlin"/;
for (const f of ["src/components/ArticleForm.jsx", "src/pages/ArtistCommunity.jsx", "src/components/ManifestoFooter.jsx", "src/pages/Partnership.jsx", "src/pages/EventCalendar.jsx"]) {
  check(`${f} reads the chapter list (no hand-typed cities)`, !handTyped.test(src(f)) && /chaptersData/.test(src(f)));
}
check("Add Event form offers the real chapters", /\[\.\.\.CHAPTER_NAMES, "Online", "Other"\]/.test(src("src/pages/EventCalendar.jsx")));
check("'Local Pulse' only shows when a chapter has one", [src("src/components/CityChapters.jsx"), src("src/pages/CityChapterDetail.jsx")].every((s) => /\{chapter\.pulse && \(/.test(s)));

// ---- About Us
const about = src("src/pages/AboutUs.jsx");
const team = [...about.matchAll(/img: "(\/images\/team\/[^"]+)"/g)].map((m) => m[1]);
check("About Us: 7 team members", team.length === 7, `${team.length}`);
for (const img of team) check(`About Us photo is in the project: ${img}`, existsSync(join(ROOT, "public", img)));
check("About Us: Erynne Byrd-Quigtar, Editorial Editor, Seattle", /name: "Erynne Byrd-Quigtar", role: "Editorial Editor", city: "Seattle"/.test(about));

console.log(`verify:chapters — ${pass} passed, ${fails.length} failed`);
if (fails.length) { for (const f of fails) console.log("  ✗", f); process.exit(1); }
process.exit(0);
