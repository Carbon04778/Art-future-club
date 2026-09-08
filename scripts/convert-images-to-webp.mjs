/**
 * Convert the static site images to WebP, and rewrite every reference to them.
 *
 * WHY
 *
 * public/images held 30 MB of PNG and JPEG. The home page alone pulled about
 * 22 MB of it — eight chapter photographs, one of them a 6.3 MB screenshot
 * saved as a PNG. Uploaded artwork has always been converted on the way in
 * (compressImage in the Supabase provider), but the imagery that ships with
 * the site never went through that path.
 *
 * THE CONVERSION IS THE EASY HALF
 *
 * These filenames are referenced across chaptersData.js, the seed, Home.jsx,
 * several components and index.html. Changing an extension without moving
 * every reference with it produces silently broken images, so this rewrites
 * them in the same pass and then verifies that every referenced file exists.
 *
 *   node scripts/convert-images-to-webp.mjs --dry    preview, change nothing
 *   node scripts/convert-images-to-webp.mjs          convert and rewrite
 *
 * Requires sharp (a devDependency). Re-runnable: anything already converted is
 * skipped.
 */

import { readdirSync, statSync, readFileSync, writeFileSync, unlinkSync, existsSync } from "node:fs";
import { join, extname, relative } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = fileURLToPath(new URL("..", import.meta.url));
const IMAGES = join(ROOT, "public", "images");
const DRY = process.argv.includes("--dry");

const QUALITY = 82;      // matches compressImage() on the upload path
const MAX_EDGE = 2400;   // generous for a full-bleed hero on a retina display

/*
 * Deliberately NOT converted.
 *
 * The social-card image stays a JPEG: og:image is read by crawlers whose WebP
 * support is inconsistent (LinkedIn in particular), and that tag is already
 * being looked at separately as part of the SEO work. It is 0.28 MB, so
 * keeping it costs nothing.
 *
 * SVG is a vector — rasterising it would make it worse — and favicon.png
 * lives outside this directory and stays PNG for browser-tab compatibility.
 */
const KEEP_ORIGINAL = new Set(["AdobeStock_528827486.jpg"]);
const CONVERTIBLE = new Set([".png", ".jpg", ".jpeg"]);

/* Files whose text may reference an image. */
const REWRITE_IN = [
  "index.html",
  "public/manifest.json",
  ...walk(join(ROOT, "src"))
    .filter((f) => /\.(jsx?|tsx?|css)$/.test(f))
    .map((f) => relative(ROOT, f).replace(/\\/g, "/")),
];

function walk(dir, out = []) {
  if (!existsSync(dir)) return out;
  for (const entry of readdirSync(dir)) {
    const p = join(dir, entry);
    if (statSync(p).isDirectory()) walk(p, out);
    else out.push(p);
  }
  return out;
}

const mb = (n) => (n / 1048576).toFixed(2);

/* ------------------------------------------------------------- convert */

const originals = walk(IMAGES).filter((f) => CONVERTIBLE.has(extname(f).toLowerCase()));
const renames = new Map(); // "Foo.png" -> "Foo.webp"
let before = 0;
let after = 0;
let skipped = 0;

let sharp;
if (!DRY) {
  try {
    sharp = (await import("sharp")).default;
  } catch {
    console.error("\n  sharp is not installed. Run:  npm i -D sharp\n");
    process.exit(1);
  }
}

console.log(DRY ? "\n  DRY RUN — nothing will be written\n" : "\n  Converting\n");

for (const file of originals) {
  const name = file.split(/[\\/]/).pop();
  if (KEEP_ORIGINAL.has(name)) {
    console.log(`  keep      ${name}  (social card, stays JPEG)`);
    skipped++;
    continue;
  }

  const target = file.replace(/\.(png|jpe?g)$/i, ".webp");
  const originalSize = statSync(file).size;
  before += originalSize;

  if (DRY) {
    console.log(`  would be  ${name}  ->  ${target.split(/[\\/]/).pop()}  (${mb(originalSize)} MB)`);
    renames.set(name, name.replace(/\.(png|jpe?g)$/i, ".webp"));
    continue;
  }

  const img = sharp(file);
  const meta = await img.metadata();
  await img
    .resize({ width: MAX_EDGE, height: MAX_EDGE, fit: "inside", withoutEnlargement: true })
    .webp({ quality: QUALITY })
    .toFile(target);

  const newSize = statSync(target).size;
  after += newSize;
  renames.set(name, target.split(/[\\/]/).pop());

  const saved = Math.round((1 - newSize / originalSize) * 100);
  console.log(
    `  ${name.padEnd(38)} ${mb(originalSize).padStart(6)} -> ${mb(newSize).padStart(6)} MB` +
    `  ${String(saved).padStart(3)}%   ${meta.width}x${meta.height}`
  );
  unlinkSync(file);
}

/* ------------------------------------------------------------- rewrite */

let filesChanged = 0;
let refsChanged = 0;

for (const rel of REWRITE_IN) {
  const abs = join(ROOT, rel);
  if (!existsSync(abs)) continue;
  const src = readFileSync(abs, "utf8");
  let next = src;
  for (const [from, to] of renames) {
    if (next.includes(from)) {
      // Escape regex metacharacters in the filename.
      const safe = from.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
      const hits = (next.match(new RegExp(safe, "g")) || []).length;
      next = next.replace(new RegExp(safe, "g"), to);
      refsChanged += hits;
    }
  }
  if (next !== src) {
    filesChanged++;
    if (!DRY) writeFileSync(abs, next);
    console.log(`  ${DRY ? "would rewrite" : "rewrote"}  ${rel}`);
  }
}

/* -------------------------------------------------------------- verify */

let broken = 0;
if (!DRY) {
  for (const rel of REWRITE_IN) {
    const abs = join(ROOT, rel);
    if (!existsSync(abs)) continue;
    for (const m of readFileSync(abs, "utf8").matchAll(/["'`(]\/images\/([A-Za-z0-9_./-]+\.(?:webp|png|jpe?g|svg))/g)) {
      if (!existsSync(join(ROOT, "public", "images", m[1]))) {
        console.log(`  MISSING   /images/${m[1]}  referenced by ${rel}`);
        broken++;
      }
    }
  }
}

console.log("");
console.log(`  converted ${renames.size} file(s), kept ${skipped}`);
if (!DRY) {
  console.log(`  ${mb(before)} MB -> ${mb(after)} MB  (${Math.round((1 - after / before) * 100)}% smaller)`);
}
console.log(`  ${refsChanged} reference(s) across ${filesChanged} file(s)`);
if (broken) {
  console.log(`\n  ${broken} BROKEN REFERENCE(S) — fix before committing\n`);
  process.exit(1);
}
console.log(DRY ? "\n  dry run only — re-run without --dry to apply\n" : "\n  done\n");
