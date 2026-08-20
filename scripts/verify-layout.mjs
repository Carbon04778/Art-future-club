/**
 * Layout guard for action rows.
 *
 * Client report: "the social media icons are running off the grid" — on the
 * artist portfolio the share icons overlapped the Collect label and spilled
 * past the card edge.
 *
 * A single flex row does not wrap by default, so once like + collect +
 * comment + four share icons exceed the column width they overflow instead of
 * moving to the next line. This checks the source for rows that can overflow,
 * and confirms the two reported rows are split and wrapping.
 *
 * Run: npm run verify:layout
 */

import { readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";

let pass = 0;
const failures = [];
const check = (name, cond, detail = "") =>
  cond ? pass++ : failures.push(`${name}${detail ? ` — ${detail}` : ""}`);

const SRC = new URL("../src/", import.meta.url).pathname;

function walk(dir, out = []) {
  for (const entry of readdirSync(dir)) {
    const p = join(dir, entry);
    if (statSync(p).isDirectory()) {
      if (entry !== "ui") walk(p, out);
    } else if (entry.endsWith(".jsx")) {
      out.push(p);
    }
  }
  return out;
}

const files = walk(SRC);
check("found component files to inspect", files.length > 20, `${files.length}`);

/* --------------------------------------------------------------------------
   1. No action row may be a non-wrapping flex with a real gap.
      `flex-wrap` costs nothing when the row already fits — it only takes
      effect once the row would otherwise overflow.
-------------------------------------------------------------------------- */

const offenders = [];
for (const f of files) {
  const src = readFileSync(f, "utf8");
  const rel = f.replace(SRC, "");
  for (const m of src.matchAll(/className="([^"]*\bflex items-center\b[^"]*)"/g)) {
    const cls = m[1];
    if (cls.includes("flex-wrap")) continue;
    if (cls.includes("overflow-x-auto")) continue; // deliberately scrollable
    if (!/\bgap-[4-9]\b|\bgap-1[0-9]\b/.test(cls)) continue;
    offenders.push(`${rel}: ${cls.slice(0, 60)}`);
  }
}
check("no action row can overflow instead of wrapping",
  offenders.length === 0,
  offenders.slice(0, 4).join(" | "));

/* --------------------------------------------------------------------------
   2. The two rows the client reported are split, with share on its own line.
-------------------------------------------------------------------------- */

const artist = readFileSync(join(SRC, "pages/ArtistProfileView.jsx"), "utf8");
const gallery = readFileSync(join(SRC, "pages/GalleryProfile.jsx"), "utf8");

/**
 * The row that overflowed was the per-work one: like + collect + comment +
 * four share icons inside a narrow grid column. Assert that ShareButtons is
 * no longer inside the same flex container as CollectButton.
 *
 * The full-width profile header row (follow + like + share) is not in scope —
 * three items across the page width fit, and it wraps if they ever do not.
 */
const shareSplitFromCollect = (src) => {
  const ci = src.indexOf("<CollectButton");
  const si = src.indexOf("<ShareButtons", ci);
  if (ci === -1 || si === -1) return false;
  const between = src.slice(ci, si);
  // A closing </div> plus a new flex container between them means they are
  // in separate rows.
  return /<\/div>/.test(between) && /className="[^"]*flex/.test(between);
};

check("artist portfolio: share icons split from the collect row",
  shareSplitFromCollect(artist));
check("gallery work: share icons split from the collect row",
  shareSplitFromCollect(gallery));

check("artist portfolio row wraps", /flex flex-wrap items-center gap-x-5/.test(artist));
check("gallery work row wraps", /flex flex-wrap items-center gap-x-5/.test(gallery));

/* --------------------------------------------------------------------------
   3. Collect is available wherever a work can be collected.
-------------------------------------------------------------------------- */

check("artist portfolio offers Collect", /<CollectButton/.test(artist));
check("gallery works offer Collect (was missing entirely)", /<CollectButton/.test(gallery));
check("gallery Collect uses a stable work reference",
  /workRef=\{`gallery-work-\$\{selected\.id\}`\}/.test(gallery));
check("gallery Collect credits the work's own artist where known",
  /artistName=\{selected\.artist_name \|\| profile\.display_name\}/.test(gallery));

/* --------------------------------------------------------------------------
   4. The horizontally scrollable ticker must NOT have been wrapped.
-------------------------------------------------------------------------- */

const nexus = readFileSync(join(SRC, "components/GlobalNexus.jsx"), "utf8");
const scrollRow = (nexus.match(/className="([^"]*overflow-x-auto[^"]*)"/) || [])[1] || "";
check("the scrolling ticker was left alone", scrollRow.length > 0 && !scrollRow.includes("flex-wrap"),
  scrollRow.slice(0, 60));

/* --------------------------------------------------------------------------
   5. No image may point at a third-party CDN we do not control.
      The original build used Wix and Base44 hosts; those are no longer ours,
      so any survivor renders as a broken image — including, at one point,
      the global "broken image" fallback itself.
-------------------------------------------------------------------------- */

const externals = [];
for (const f of files) {
  const src = readFileSync(f, "utf8");
  const rel = f.replace(SRC, "");
  for (const m of src.matchAll(/["'`](https?:\/\/[^"'`]+\.(?:png|jpe?g|webp|gif|svg)[^"'`]*)["'`]/gi)) {
    const url = m[1];
    // Map tiles are served live by OpenStreetMap and must stay remote.
    if (/tile\.openstreetmap\.org|\{[sxyz]\}/.test(url)) continue;
    externals.push(`${rel}: ${url.slice(0, 70)}`);
  }
}
check("no images load from a third-party CDN",
  externals.length === 0, externals.slice(0, 3).join(" | "));

const imageComp = readFileSync(join(SRC, "components/ui/image.jsx"), "utf8");
check("the broken-image fallback is a local file",
  /FALLBACK_IMAGE_URL = "\/images\//.test(imageComp));

/* --------------------------------------------------------------------------
   6. The custom cursor must exist on EVERY route.
      index.css sets `body { cursor: none }`, so a page without LFrameCursor
      has no cursor at all. It was previously imported per page and six pages
      omitted it — including every auth page.
-------------------------------------------------------------------------- */

const app = readFileSync(join(SRC, "App.jsx"), "utf8");
check("cursor is mounted once at the router root", /<LFrameCursor \/>/.test(app));
// Compare against the real JSX element, not the word inside the comment
// above it — the comment mentions <Routes> and matched first.
const routesTag = app.search(/^\s*<Routes>/m);
check("cursor is mounted OUTSIDE <Routes> so it covers every route",
  app.indexOf("<LFrameCursor />") < routesTag, `cursor@${app.indexOf("<LFrameCursor />")} routes@${routesTag}`);

const perPage = [];
for (const f of files) {
  if (!f.includes("/pages/")) continue;
  if (/<LFrameCursor \/>/.test(readFileSync(f, "utf8"))) perPage.push(f.replace(SRC, ""));
}
check("no page mounts its own duplicate cursor",
  perPage.length === 0, perPage.slice(0, 3).join(", "));

const cursor = readFileSync(join(SRC, "components/LFrameCursor.jsx"), "utf8");
check("cursor guards against non-Element event targets",
  /instanceof Element/.test(cursor));
check("cursor recovers when the pointer re-enters the window",
  /mouseenter|focus/.test(cursor));

/* --------------------------------------------------------------------------
   7. Every value the app writes must be permitted by the database.
      portfolio_work was sent by ArtistProfileView but rejected by the
      comment/like CHECK constraints, so every artwork comment and like
      failed silently.
-------------------------------------------------------------------------- */

const schemaSql = readFileSync(
  new URL("../supabase/migrations/001_schema.sql", import.meta.url).pathname, "utf8");
const migrations = readdirSync(new URL("../supabase/migrations/", import.meta.url).pathname)
  .filter((f) => f.endsWith(".sql"))
  .map((f) => readFileSync(new URL(`../supabase/migrations/${f}`, import.meta.url).pathname, "utf8"))
  .join("\n");

const targetTypes = new Set();
for (const f of files) {
  const src = readFileSync(f, "utf8");
  for (const m of src.matchAll(/targetType[=:]\s*["'{]?["']([a-z_]+)["']/g)) targetTypes.add(m[1]);
  for (const m of src.matchAll(/target_type:\s*["']([a-z_]+)["']/g)) targetTypes.add(m[1]);
}
check("found the target types the app uses", targetTypes.size > 0, [...targetTypes].join(", "));

// The constraint must either be dropped, or list every value the app sends.
const constraintDropped = /drop constraint if exists comment_target_type_check/.test(migrations);
const stillConstrained = /target_type\s+text not null check \(target_type in \(([^)]*)\)/.exec(schemaSql);
const allowed = stillConstrained
  ? (stillConstrained[1].match(/'([^']+)'/g) || []).map((x) => x.slice(1, -1))
  : [];
const rejected = constraintDropped ? [] : [...targetTypes].filter((t) => !allowed.includes(t));
check("no target type the app sends is rejected by the database",
  rejected.length === 0,
  rejected.length ? `${rejected.join(", ")} — add migration 011` : "");

/* --------------------------------------------------------------------------
   8. No source file may be empty, and every component file must export
      something.

      An empty .jsx file imports cleanly and returns `undefined`, which React
      renders as nothing — producing a blank white page with no build error
      and no lint warning. That is exactly what happened when a new component
      was created but never pasted into.
-------------------------------------------------------------------------- */

const empties = files.filter((f) => readFileSync(f, "utf8").trim().length === 0);
check("no source file is empty", empties.length === 0,
  empties.map((f) => f.replace(SRC, "")).join(", "));

const noExport = files.filter((f) => {
  // main.jsx is the entry point: it mounts the app and exports nothing.
  if (f.endsWith("main.jsx")) return false;
  const src = readFileSync(f, "utf8");
  if (!src.trim()) return false;           // already reported above
  return !/export\s+(default|const|function|class|\{)/.test(src);
});
check("every source file exports something", noExport.length === 0,
  noExport.map((f) => f.replace(SRC, "")).join(", "));

console.log(`\n  passed: ${pass}`);
if (failures.length) {
  console.log(`  FAILED: ${failures.length}\n`);
  failures.forEach((f) => console.log(`   ✗ ${f}`));
  process.exit(1);
}
console.log("  action rows wrap cleanly and share icons sit on their own line\n");
