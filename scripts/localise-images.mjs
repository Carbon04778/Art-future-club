/**
 * Localise remote images.
 *
 * Downloads every image still hosted on the old Base44 CDN, optimises it,
 * writes it to public/images/, and rewrites every reference in the source.
 *
 * After this runs successfully, the Base44 account can be cancelled — nothing
 * on the site depends on it any more.
 *
 * Usage:
 *   npm run localise-images            download, optimise, rewrite
 *   npm run localise-images -- --dry   report only, change nothing
 *
 * Optimisation uses `sharp` if it is installed. If not, files are downloaded
 * unchanged and the script tells you what it skipped — it never fails just
 * because sharp is missing.
 */

import { readFileSync, writeFileSync, mkdirSync, existsSync, statSync } from "node:fs";
import { readdir } from "node:fs/promises";
import { join, extname, relative, basename } from "node:path";
import { fileURLToPath } from "node:url";

// fileURLToPath, NOT .pathname: on Windows, `new URL(...).pathname` yields
// "/C:/Users/..." with a leading slash, which is not a valid Windows path and
// makes every directory read fail silently.
const ROOT = fileURLToPath(new URL("..", import.meta.url));
const OUT_DIR = join(ROOT, "public", "images");
const DRY = process.argv.includes("--dry");

const MAX_EDGE = 2400;   // px on the long side — plenty for full-bleed heroes
const QUALITY = 82;
const SCAN_DIRS = ["src", "."];
const SCAN_EXT = new Set([".js", ".jsx", ".ts", ".tsx", ".html", ".css"]);
const REMOTE = /https:\/\/media\.base44\.com\/[^\s"'`)]+/g;

const kb = (n) => `${(n / 1024).toFixed(0)} kB`;

/* -------------------------------------------------------------- find files */

async function sourceFiles() {
  const found = [];
  async function walk(dir, depth = 0) {
    if (depth > 6) return;
    let entries;
    try {
      entries = await readdir(dir, { withFileTypes: true });
    } catch {
      return;
    }
    for (const e of entries) {
      if (["node_modules", "dist", ".git", "public", "docs", ".tmp"].includes(e.name)) continue;
      const full = join(dir, e.name);
      if (e.isDirectory()) await walk(full, depth + 1);
      else if (SCAN_EXT.has(extname(e.name))) found.push(full);
    }
  }
  for (const d of SCAN_DIRS) await walk(join(ROOT, d));
  return [...new Set(found)];
}

/* --------------------------------------------------------- collect the URLs */

/* ------------------------------------------------------- collect the URLs */

const files = await sourceFiles();

// If the scan finds nothing, the path resolution is broken — do not let that
// masquerade as "everything is already localised".
if (files.length === 0) {
  console.error(`\n  ERROR: scanned 0 source files under ${ROOT}`);
  console.error("  Run this from the project root (the folder with package.json).\n");
  process.exit(1);
}

const urls = new Map();      // url -> [files that reference it]
const dynamic = new Map();   // template-literal URLs we CANNOT rewrite safely

for (const file of files) {
  const text = readFileSync(file, "utf8");
  for (const match of text.matchAll(REMOTE)) {
    const url = match[0];
    // A URL assembled at runtime, e.g. `.../${id}`. We cannot rewrite these,
    // because the filename is not known until the app runs — and optimisation
    // may change the extension. These must be inlined by hand.
    if (url.includes("${")) {
      if (!dynamic.has(url)) dynamic.set(url, []);
      dynamic.get(url).push(relative(ROOT, file));
      continue;
    }
    if (!urls.has(url)) urls.set(url, []);
    urls.get(url).push(file);
  }
}

if (dynamic.size) {
  console.log("\n  WARNING — dynamically built image URLs found.");
  console.log("  These CANNOT be rewritten automatically and will still point");
  console.log("  at Base44 after this script finishes:\n");
  for (const [url, where] of dynamic) {
    console.log(`    ${url}`);
    console.log(`      in ${where.join(", ")}`);
  }
  console.log("\n  Replace them with full literal URLs, then run this again.\n");
}

if (urls.size === 0) {
  console.log("\n  No remote Base44 images found — already localised.\n");
  process.exit(0);
}

console.log(`\n  Found ${urls.size} remote images across ${files.length} scanned files.\n`);

/* --------------------------------------------------------------- optimiser */

let sharp = null;
try {
  ({ default: sharp } = await import("sharp"));
} catch {
  console.log("  Note: `sharp` is not installed, so images will be saved as-is.");
  console.log("        For smaller files run:  npm i -D sharp\n");
}

async function optimise(buffer, name) {
  if (!sharp) return { buffer, name };
  try {
    const img = sharp(buffer);
    const meta = await img.metadata();
    const resized =
      Math.max(meta.width ?? 0, meta.height ?? 0) > MAX_EDGE
        ? img.resize({ width: MAX_EDGE, height: MAX_EDGE, fit: "inside" })
        : img;
    const out = await resized.webp({ quality: QUALITY }).toBuffer();
    if (out.length >= buffer.length) return { buffer, name };
    return { buffer: out, name: name.replace(/\.\w+$/, "") + ".webp" };
  } catch {
    return { buffer, name };
  }
}

/* -------------------------------------------------------------- do the work */

if (!DRY) mkdirSync(OUT_DIR, { recursive: true });

const rewrites = new Map(); // remote url -> /images/<local>
let totalBefore = 0;
let totalAfter = 0;
const failed = [];

for (const [url, refs] of urls) {
  // Strip the CDN hash prefix: "6ce84d220_artfuture.png" -> "artfuture.png"
  const raw = decodeURIComponent(url.split("/").pop().split("?")[0]);
  let name = raw.replace(/^[a-f0-9]{6,}_/i, "").replace(/[^\w.\-]/g, "-");

  process.stdout.write(`  ${name.padEnd(38)}`);

  try {
    const res = await fetch(url);
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const original = Buffer.from(await res.arrayBuffer());

    const { buffer, name: finalName } = await optimise(original, name);
    name = finalName;

    totalBefore += original.length;
    totalAfter += buffer.length;

    if (!DRY) {
      let target = join(OUT_DIR, name);
      // Avoid clobbering a different image that reduced to the same name.
      let n = 2;
      while (existsSync(target) && statSync(target).size !== buffer.length) {
        target = join(OUT_DIR, name.replace(/(\.\w+)$/, `-${n++}$1`));
      }
      name = basename(target);
      writeFileSync(target, buffer);
    }

    rewrites.set(url, `/images/${name}`);
    const saved = original.length - buffer.length;
    console.log(
      `${kb(original.length).padStart(8)} -> ${kb(buffer.length).padStart(8)}` +
        (saved > 0 ? `   (-${Math.round((saved / original.length) * 100)}%)` : "") +
        `   ${refs.length} ref${refs.length > 1 ? "s" : ""}`
    );
  } catch (err) {
    failed.push({ url, reason: String(err.message || err) });
    console.log(`  FAILED  ${err.message || err}`);
  }
}

/* ---------------------------------------------------------------- rewriting */

let filesChanged = 0;
let refsChanged = 0;

if (!DRY && rewrites.size) {
  for (const file of files) {
    const before = readFileSync(file, "utf8");
    let after = before;
    for (const [url, local] of rewrites) {
      if (after.includes(url)) {
        after = after.split(url).join(local);
        refsChanged++;
      }
    }
    if (after !== before) {
      writeFileSync(file, after);
      filesChanged++;
    }
  }
}

/* ------------------------------------------------------------------ report */

console.log("");
if (DRY) {
  console.log("  DRY RUN — nothing was written.\n");
} else {
  console.log(`  Saved  ${rewrites.size} images to public/images/`);
  console.log(`  Rewrote ${refsChanged} references across ${filesChanged} files`);
  if (totalBefore) {
    const pct = Math.round((1 - totalAfter / totalBefore) * 100);
    console.log(`  Total  ${kb(totalBefore)} -> ${kb(totalAfter)}${pct > 0 ? `  (-${pct}%)` : ""}`);
  }
}

if (failed.length) {
  console.log(`\n  ${failed.length} DOWNLOAD(S) FAILED — these still point at Base44:`);
  failed.forEach((f) => console.log(`    ${f.reason}  ${f.url}`));
  console.log("\n  Do NOT cancel the Base44 account until these are resolved.\n");
  process.exit(1);
}

console.log("\n  Next:  npm run verify:all   then commit.");
console.log("  Once the site looks right, the Base44 account can be cancelled.\n");
