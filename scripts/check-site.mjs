/**
 * Before/after health check of the real website, in real Chrome.
 *
 * WHY
 *
 * Image conversion changes live storage and database rows. "The script said
 * done" is not the same as "every page still shows its pictures", so each
 * batch is bracketed by this: a baseline first, then the same pages again,
 * and only what is NEWLY broken is reported. Problems that already existed
 * (zero-byte uploads, HEIC files Chrome cannot show) stay in the baseline and
 * do not hide a real regression.
 *
 *   node scripts/check-site.mjs --before --save before.json   (skips converted-image checks)
 *   node scripts/check-site.mjs --compare before.json
 *   ... --rows .tmp/webp-migration/<ref>/batch-<stamp>-rows.json
 *          also opens every page a batch touched, and checks its converted
 *          image is on the page, loads, and is real WebP
 *   ... --base http://localhost:5199 --project test
 *          check a local dev server pointed at the TEST project instead
 *
 * Reads only. Uses the installed Chrome via puppeteer-core.
 */

import puppeteer from "puppeteer-core";
import { readFileSync, writeFileSync, existsSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { artistPath, spacePath, eventPath } from "../src/lib/slugs.js";
import { isVenueType } from "../src/lib/venueTypes.js";

const ROOT = fileURLToPath(new URL("..", import.meta.url));
const arg = (name, fallback) =>
  process.argv.includes(name) ? process.argv[process.argv.indexOf(name) + 1] : fallback;

const BASE = arg("--base", "https://www.artfutureclub.com").replace(/\/+$/, "");
const PROJECT = arg("--project", "live");
const SAVE = arg("--save");
const COMPARE = arg("--compare");
const ROWS = arg("--rows");
const CHROME = arg("--chrome", "C:/Program Files/Google/Chrome/Application/chrome.exe");

// The pages most visitors see, plus every listing that shows uploads.
const CORE = process.argv.includes("--pages") ? (arg("--pages") === "none" ? [] : arg("--pages").split(",")) : ["/", "/artists", "/gallery", "/venues", "/events", "/editorial", "/open-calls", "/community", "/about", "/map"];

const env = Object.fromEntries(
  readFileSync(join(ROOT, ".env"), "utf8").split(/\r?\n/)
    .filter((l) => /^[A-Z_]+=/.test(l))
    .map((l) => [l.slice(0, l.indexOf("=")), l.slice(l.indexOf("=") + 1).trim()])
);
const API = (PROJECT === "test" ? env.COPY_SUPABASE_URL : env.VITE_SUPABASE_URL)?.replace(/\/+$/, "");
const ANON = PROJECT === "test" ? env.COPY_SUPABASE_ANON_KEY : env.VITE_SUPABASE_ANON_KEY;

/* ------------------------------------------------ rows -> page addresses */

async function api(path) {
  // Retried: one connect timeout here used to end the whole run before any page.
  for (let attempt = 1; ; attempt++) {
    try {
      const r = await fetch(`${API}/rest/v1/${path}`, { headers: { apikey: ANON }, signal: AbortSignal.timeout(60000) });
      return r.ok ? r.json() : [];
    } catch (e) {
      if (attempt >= 5) throw e;
      await new Promise((res) => setTimeout(res, 3000 * attempt));
    }
  }
}

async function pageFor({ table, id }) {
  const one = async (sel) => (await api(`${table}?id=eq.${id}&select=${sel}`))[0];
  if (table === "artist_profile") { const r = await one("id,slug"); return r && artistPath(r); }
  if (table === "collector_profile") { const r = await one("id,slug,type"); return r && spacePath(r, isVenueType(r.type)); }
  if (table === "event") { const r = await one("id,slug"); return r && eventPath(r); }
  if (table === "article") { const r = await one("id,slug,published"); return r?.published ? `/editorial/${r.slug || r.id}` : null; }
  if (table === "forum_post") return `/community/post/${id}`;
  return null; // collected_work and others have no public page of their own
}

/* ----------------------------------------------------------- one page */

async function inspect(browser, path, expect = []) {
  const page = await browser.newPage();
  // Count what actually crosses the network (compressed bytes), so a check's
  // data cost is measured rather than guessed — this runs on mobile data.
  let bytes = 0;
  const cdp = await page.createCDPSession();
  await cdp.send("Network.enable");
  cdp.on("Network.loadingFinished", (e) => { bytes += e.encodedDataLength || 0; });
  await page.setViewport({ width: 1366, height: 900 });
  const errors = [];
  const failed = [];
  page.on("pageerror", (e) => errors.push(e.message.slice(0, 160)));
  page.on("response", (r) => {
    const u = r.url();
    if (r.status() >= 400 && (u.includes("/storage/v1/") || u.includes("/rest/v1/") || u.startsWith(BASE))) {
      failed.push(`${r.status()} ${u.replace(/\?.*/, "").slice(-90)}`);
    }
  });

  let status = 0;
  try {
    // This connection resets now and then (ERR_CONNECTION_RESET) while the
    // site itself is fine; a dropped connection must not read as a broken page.
    let res;
    for (let attempt = 1; ; attempt++) {
      try {
        res = await page.goto(BASE + path, { waitUntil: "networkidle2", timeout: 90000 });
        break;
      } catch (e) {
        if (attempt >= 3) throw e;
        await new Promise((r) => setTimeout(r, 3000 * attempt));
      }
    }
    status = res?.status() ?? 0;
    await page.evaluate(async () => {
      for (let y = 0; y < document.body.scrollHeight; y += 500) {
        window.scrollTo(0, y);
        await new Promise((r) => setTimeout(r, 200));
      }
    });
    await new Promise((r) => setTimeout(r, 2500));
  } catch (e) {
    errors.push(`navigation: ${e.message.slice(0, 120)}`);
  }

  const broken = await page.evaluate(() =>
    [...document.images]
      .filter((i) => i.complete && i.naturalWidth === 0 && (i.currentSrc || i.src))
      .map((i) => (i.currentSrc || i.src).replace(/\?.*/, ""))
  ).catch(() => []);

  /*
   * A converted image must be on its page, display, and be WebP in fact.
   * Some are not on the page itself — a portfolio work's extra images only
   * appear in its lightbox — so when it is not found, the file is checked
   * directly instead: it must exist and be real WebP.
   */
  const expected = [];
  for (const { file, url } of expect) {
    const found = await page.waitForFunction((f) => {
      const el = [...document.images].find((i) => decodeURIComponent(i.currentSrc || i.src).includes(f));
      if (!el) return false;
      el.scrollIntoView({ block: "center" });
      return el.complete && el.naturalWidth > 0 ? { src: el.currentSrc || el.src } : false;
    }, { timeout: 20000 }, file).then((h) => h.jsonValue()).catch(() => null);
    let webp = false;
    if (found) {
      const r = await fetch(found.src, { headers: { Range: "bytes=0-11" } });
      const b = Buffer.from(await r.arrayBuffer());
      webp = b.toString("latin1", 0, 4) === "RIFF" && b.toString("latin1", 8, 12) === "WEBP";
    }
    if (!found) webp = await isWebpAt(url);
    expected.push({ file, shown: Boolean(found), webp });
  }

  await page.close();
  return { path, status, errors, failed: [...new Set(failed)], broken: [...new Set(broken)], expected, bytes };
}

async function isWebpAt(url) {
  try {
    const r = await fetch(url, { headers: { Range: "bytes=0-11" } });
    const b = Buffer.from(await r.arrayBuffer());
    return r.ok && b.toString("latin1", 0, 4) === "RIFF" && b.toString("latin1", 8, 12) === "WEBP";
  } catch {
    return false;
  }
}

/* ---------------------------------------------------------------- run */

const extra = new Map(); // page path -> [{ file, url }] converted images expected on it
const pageless = [];     // converted images on rows with no public page of their own
if (ROWS) {
  for (const r of JSON.parse(readFileSync(ROWS, "utf8"))) {
    const url = `${API}/storage/v1/object/public/uploads/${r.target.split("/").map(encodeURIComponent).join("/")}`;
    const item = { file: r.target.split("/").pop(), url };
    const p = await pageFor(r);
    if (!p) { pageless.push({ ...item, row: `${r.table} ${r.id}` }); continue; }
    const list = extra.get(p) || [];
    if (!list.some((x) => x.file === item.file)) list.push(item);
    extra.set(p, list);
  }
}

const browser = await puppeteer.launch({ executablePath: CHROME, headless: true });
const results = [];
for (const path of [...CORE, ...[...extra.keys()].filter((p) => !CORE.includes(p))]) {
  // A baseline taken BEFORE converting (--save without --compare) only needs
  // the batch's pages; waiting 20 s for each WebP that does not exist yet
  // made a 50-image baseline take over ten minutes.
  const beforeOnly = process.argv.includes("--before"); // asked for explicitly; guessing it skipped real checks
  /*
   * One page's browser glitch ("Attempted to use detached Frame") used to
   * throw out of the whole run, twice leaving a batch half checked and no
   * baseline saved. Each page gets a second try; if that fails too, it is
   * recorded as an error on that page and the run carries on.
   */
  let r;
  for (let attempt = 1; ; attempt++) {
    try {
      r = await inspect(browser, path, beforeOnly ? [] : extra.get(path) || []);
      break;
    } catch (e) {
      if (attempt < 2) continue;
      r = { path, status: 0, errors: [`checker: ${e.message.slice(0, 120)}`], failed: [], broken: [], expected: [] };
      break;
    }
  }
  results.push(r);
  const bad = r.status >= 400 || r.errors.length || r.expected.some((e) => !e.webp);
  console.log(`  ${bad ? "!!" : "ok"}  ${path.slice(0, 70).padEnd(70)} HTTP ${r.status}  broken images ${r.broken.length}  js errors ${r.errors.length}` +
    (r.expected.length ? `  converted ok ${r.expected.filter((e) => e.webp).length}/${r.expected.length} (on page ${r.expected.filter((e) => e.shown).length})` : ""));
}
await browser.close();

if (SAVE) {
  writeFileSync(SAVE, JSON.stringify({ base: BASE, at: new Date().toISOString(), results }, null, 1));
  console.log(`\n  baseline saved: ${SAVE}`);
}

let problems = 0;
if (COMPARE) {
  if (!existsSync(COMPARE)) { console.error(`\n  no baseline at ${COMPARE}`); process.exit(1); }
  const before = new Map(JSON.parse(readFileSync(COMPARE, "utf8")).results.map((r) => [r.path, r]));
  console.log("\n  COMPARED WITH BASELINE");
  for (const r of results) {
    const b = before.get(r.path);
    if (!b) continue; // a batch page with no baseline: judged by its own checks below
    const newBroken = r.broken.filter((u) => !b.broken.includes(u));
    const newErrors = r.errors.filter((e) => !b.errors.includes(e));
    const statusWorse = r.status >= 400 && b.status < 400;
    if (newBroken.length || newErrors.length || statusWorse) {
      problems++;
      console.log(`  NEW PROBLEM on ${r.path}`);
      newBroken.forEach((u) => console.log(`     broken image: ${u.slice(-100)}`));
      newErrors.forEach((e) => console.log(`     js error: ${e}`));
      if (statusWorse) console.log(`     page now HTTP ${r.status} (was ${b.status})`);
    }
  }
  if (!problems) console.log("  no new broken images, errors or failing pages");
}

for (const r of results) {
  for (const e of r.expected.filter((x) => !x.webp)) {
    problems++;
    console.log(`  CONVERTED IMAGE PROBLEM on ${r.path}: ${e.file} shown=${e.shown} webp=${e.webp}`);
  }
}
for (const e of pageless) {
  e.webp = await isWebpAt(e.url);
  if (!e.webp) {
    problems++;
    console.log(`  CONVERTED IMAGE PROBLEM (${e.row}, no page): ${e.file} is not real WebP or missing`);
  }
}
if (ROWS) {
  const all = [...results.flatMap((r) => r.expected), ...pageless];
  const onPage = results.reduce((a, r) => a + r.expected.filter((e) => e.shown && e.webp).length, 0);
  console.log(`\n  converted images: ${all.filter((e) => e.webp).length}/${all.length} verified real WebP` +
    ` (${onPage} seen displaying on their page; the rest are lightbox-only or have no page, checked by file)`);
}
// Absolute, needing no baseline: anything broken anywhere, old or new.
const withBroken = results.filter((r) => r.broken.length);
const withErrors = results.filter((r) => r.errors.length || r.status >= 400 || r.status === 0);
const mbUsed = results.reduce((a, r) => a + (r.bytes || 0), 0) / 1048576;
console.log(`\n  SUMMARY: ${results.length} pages checked | pages with any broken image: ${withBroken.length}` +
  ` | pages with errors or failed loads: ${withErrors.length} | data used: ${mbUsed.toFixed(1)} MB`);
withBroken.forEach((r) => console.log(`     broken on ${r.path}: ${r.broken.map((u) => u.slice(-60)).join(", ")}`));
withErrors.forEach((r) => console.log(`     error on ${r.path}: HTTP ${r.status} ${r.errors.join(" | ").slice(0, 160)}`));
process.exit(problems ? 1 : 0);
