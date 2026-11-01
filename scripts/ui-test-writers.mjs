/**
 * Real-browser test of B3 (writer links). Read-only: these pages write
 * nothing, so it runs against the real articles — the true test of the name
 * matching. Report: reports/B3-writer-links.html
 *
 *   npx vite --port 5199   (then)   npx vite-node --mode test scripts/ui-test-writers.mjs [site]
 */
import puppeteer from "puppeteer-core";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { createReport } from "./lib/report.mjs";
import { writerKey, displayNameFor } from "../src/lib/writers.js";

const ROOT = fileURLToPath(new URL("..", import.meta.url));
const E = Object.fromEntries(readFileSync(join(ROOT, ".env"), "utf8").split(/\r?\n/).filter((l) => /^[A-Z_]+=/.test(l)).map((l) => [l.slice(0, l.indexOf("=")), l.slice(l.indexOf("=") + 1).trim()]));
const BASE = process.argv[2] || "http://localhost:5199";
const LIVE = BASE.startsWith("https://");
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// ---- the truth: published, already-out articles grouped by writer key
const get = async (q) => (await fetch(`${E.VITE_SUPABASE_URL}/rest/v1/${q}`, { headers: { apikey: E.VITE_SUPABASE_ANON_KEY } })).json();
const now = new Date();
const arts = (await get("article?select=id,slug,title,author_name,publish_date,created_date&published=eq.true&limit=2000"))
  .filter((a) => !a.publish_date || new Date(a.publish_date) <= now);
const byKey = new Map();
for (const a of arts) { const k = writerKey(a.author_name); if (k) (byKey.get(k) || byKey.set(k, []).get(k)).push(a); }
const countFor = (name) => byKey.get(writerKey(name))?.length || 0;
const artists = await get("artist_profile?select=slug,display_name&status=eq.approved&limit=1000");

const R = createReport(LIVE ? "B3-writer-links" : "B3-writer-links", "B3 — articles linked to their writer",
  "Real Chrome. These pages only read data, so the test uses the real articles.");
const b = await puppeteer.launch({ executablePath: "C:/Program Files/Google/Chrome/Application/chrome.exe", headless: true });
async function open(path, width = 1366) {
  const p = await b.newPage(); await p.setViewport({ width, height: 900 });
  const errs = []; p.on("pageerror", (e) => errs.push(e.message));
  for (let i = 0; i < 3; i++) { try { await p.goto(BASE + path, { waitUntil: "networkidle2", timeout: 90000 }); break; } catch {} }
  await sleep(2500);
  await p.evaluate(() => [...document.querySelectorAll("button")].find((x) => /^reject$/i.test(x.innerText.trim()))?.click());
  return { p, errs };
}
async function shot(p, file, focusText) {
  if (focusText) await p.evaluate((t) => [...document.querySelectorAll("p, h1, h3, a")].find((e) => e.innerText.includes(t))?.scrollIntoView({ block: "center" }), focusText);
  await sleep(600); await p.screenshot({ path: R.shotPath(file) }); return file;
}
const byline = (p) => p.evaluate(() => {
  const by = [...document.querySelectorAll("p")].find((x) => /^by\s/i.test(x.innerText.trim()));
  const links = by ? [...by.querySelectorAll("a")].map((a) => ({ text: a.innerText.trim(), href: a.getAttribute("href") })) : [];
  return { text: by?.innerText.trim(), links };
});

// 1. A writer WITH an artist page (Saskia Key): byline -> artist page, plus "All articles"
const saskia = arts.find((a) => writerKey(a.author_name) === writerKey("Saskia Key"));
{
  const { p, errs } = await open(`/editorial/${saskia.slug || saskia.id}`);
  const bl = await byline(p);
  R.ok("Article byline", "Saskia Key's article: name links to her artist page", bl.links[0]?.href === "/artists/saskia-key", JSON.stringify(bl.links), await shot(p, "1-byline-artist.png", "By "));
  R.ok("Article byline", "…and offers 'All articles'", bl.links[1]?.text.toLowerCase() === "all articles" && bl.links[1].href === "/editorial/writer/saskia-key", JSON.stringify(bl.links[1]));
  R.ok("Article byline", "no page errors", errs.length === 0, errs.join(" | "));
  await p.close();
}

// 2. A writer WITHOUT an artist page, via the odd spelling "Barzaghi Benedetta"
const odd = arts.find((a) => (a.author_name || "").trim() === "Barzaghi Benedetta") || arts.find((a) => writerKey(a.author_name) === writerKey("Benedetta Barzaghi"));
{
  const { p } = await open(`/editorial/${odd.slug || odd.id}`);
  const bl = await byline(p);
  R.ok("Article byline", `"${odd.author_name.trim()}" (no artist page): links to a writer page`, /^\/editorial\/writer\//.test(bl.links[0]?.href || ""), JSON.stringify(bl.links), await shot(p, "2-byline-writer.png", "By "));
  const href = bl.links[0]?.href;
  await p.close();
  const w = await open(href);
  const t = await w.p.evaluate(() => document.body.innerText);
  const expected = countFor("Benedetta Barzaghi");
  R.ok("Writer page", `Benedetta's page gathers every spelling: ${expected} articles`, new RegExp(`\\b${expected} articles?\\b`, "i").test(t), `page says: ${(t.match(/\d+ articles?/i) || [])[0]} · database: ${expected}`, await shot(w.p, "3-writer-page.png", "ARTICLE"));
  R.ok("Writer page", "headline uses the usual spelling", /Benedetta Barzaghi/.test(t) && !/^Barzaghi Benedetta$/m.test(t));
  const listed = await w.p.evaluate(() => [...document.querySelectorAll("a[href^='/editorial/']")].filter((a) => a.querySelector("h3")).length);
  R.ok("Writer page", "every one of them is listed as a link", listed === expected, `${listed} cards`);
  R.ok("Writer page", "no page errors", w.errs.length === 0, w.errs.join(" | "));
  await w.p.close();
}

// 3. Every writer's page count matches the database
for (const [, list] of [...byKey.entries()].sort((a, b) => b[1].length - a[1].length)) {
  const name = displayNameFor(list);
  const { p } = await open(`/editorial/writer/${encodeURIComponent(name.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, ""))}`);
  const t = await p.evaluate(() => document.body.innerText);
  R.ok("Writer page", `${name}: ${list.length} article${list.length === 1 ? "" : "s"}`, new RegExp(`\\b${list.length} articles?\\b`, "i").test(t), (t.match(/\d+ articles?/i) || ["(none)"])[0]);
  await p.close();
}

// 4. Artist pages: Writing section for writers, nothing for everyone else
for (const slug of ["saskia-key", "julie-petris", "pranavi-halai"]) {
  const a = artists.find((x) => x.slug === slug);
  if (!a) continue;
  const n = countFor(a.display_name);
  const { p } = await open(`/artists/${slug}`);
  const t = await p.evaluate(() => document.body.innerText);
  R.ok("Artist page", `${a.display_name}: Writing section shows ${n} articles`, new RegExp(`Writing · ${n} articles? for AFC Editorial`, "i").test(t), (t.match(/Writing · \d+ articles?/i) || ["(no section)"])[0], await shot(p, `4-artist-writing-${slug}.png`, "WRITING"));
  await p.close();
}
const nonWriter = artists.find((a) => countFor(a.display_name) === 0);
{
  const { p } = await open(`/artists/${nonWriter.slug}`);
  const t = await p.evaluate(() => document.body.innerText);
  R.ok("Artist page", `${nonWriter.display_name} (wrote nothing): no Writing section`, !/Writing · /i.test(t));
  await p.close();
}

// 5. Edge cases
{
  const { p, errs } = await open("/editorial/writer/nobody-by-this-name");
  const t = await p.evaluate(() => document.body.innerText);
  R.ok("Writer page", "an unknown writer shows a clear message, not an error", /No published articles by this writer/i.test(t) && errs.length === 0);
  await p.close();
}
{
  const { p, errs } = await open("/editorial/writer/rachel-mitchell", 390);
  const overflow = await p.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
  R.ok("Phone", "writer page fits a phone (no sideways scroll)", overflow <= 1 && errs.length === 0, `${overflow}px`, await shot(p, "5-phone.png"));
  await p.close();
}
{
  const { p, errs } = await open("/editorial");
  const cards = await p.evaluate(() => [...document.querySelectorAll("a[href^='/editorial/']")].length);
  R.ok("Editorial index", "still lists the articles, no errors", cards > 50 && errs.length === 0, `${cards} links`);
  await p.close();
}

await b.close();
const { passed, total } = R.write({ heading: LIVE ? "Live site after deploy (read-only)" : "Browser test (v12, real articles, read-only)" });
console.table(R.results.map((r) => ({ area: r.area, check: r.check.slice(0, 62), pass: r.pass ? "PASS" : "FAIL", detail: r.detail.slice(0, 40) })));
console.log(`${passed}/${total} passed — report: reports/B3-writer-links.html`);
process.exit(passed === total ? 0 : 1);
