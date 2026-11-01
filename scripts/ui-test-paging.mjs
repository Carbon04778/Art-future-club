/**
 * Long lists that load as you scroll (Artists, Galleries, Venues), in real
 * Chrome. Read-only.
 *
 * The bug (2026-10-27): scroll a list to the end, then narrow it with a
 * filter or search — it showed 18, said "Showing 18 of 36 — keep scrolling",
 * and never loaded more. Fixed in src/hooks/useProgressiveList.js.
 *
 *   node scripts/ui-test-paging.mjs [site]     (default http://localhost:5199)
 * Report: reports/paging.html
 */
import puppeteer from "puppeteer-core";
import { createReport } from "./lib/report.mjs";

const SITE = process.argv[2] || "http://localhost:5199";
const LIVE = SITE.startsWith("https://");
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const PAGES = [
  { name: "Artists", path: "/artists", card: "a[href^='/artists/']", narrow: { kind: "filter", value: "Painting" } },
  { name: "Galleries", path: "/gallery", card: "a[href^='/gallery/']", narrow: { kind: "search", box: 'input[placeholder^="Search by name, location"]', value: "Hong Kong" } },
  { name: "Venues", path: "/venues", card: "a[href^='/venues/']", narrow: null },
];

const R = createReport("paging", "Lists that load as you scroll — Artists, Galleries, Venues", "Real Chrome, read-only.");
const b = await puppeteer.launch({ executablePath: "C:/Program Files/Google/Chrome/Application/chrome.exe", headless: true });

const cards = (p, sel) => p.evaluate((s) => new Set([...document.querySelectorAll(s)].map((a) => a.getAttribute("href"))).size, sel);
const counter = (p) => p.evaluate(() => (document.body.innerText.match(/showing\s+(\d+)\s+of\s+(\d+)/i) || []).slice(1).map(Number));
/** Scroll to the bottom until the "keep scrolling" counter is gone or stops moving. */
async function scrollToEnd(p, sel) {
  let last = -1;
  for (let i = 0; i < 30; i++) {
    await p.evaluate(() => window.scrollTo(0, document.body.scrollHeight));
    await sleep(1200);
    const n = await cards(p, sel);
    if (!(await counter(p)).length || n === last) break;
    last = n;
  }
}

for (const pg of PAGES) {
  const p = await b.newPage();
  await p.setViewport({ width: 1366, height: 900 });
  const errs = []; p.on("pageerror", (e) => errs.push(e.message));
  await p.goto(`${SITE}${pg.path}`, { waitUntil: "networkidle2", timeout: 90000 });
  await p.waitForFunction((s) => document.querySelectorAll(s).length > 0, { timeout: 45000 }, pg.card).catch(() => {});
  await sleep(1500);
  await p.evaluate(() => [...document.querySelectorAll("button")].find((x) => /^reject$/i.test(x.innerText.trim()))?.click());

  const [, total] = (await counter(p)).length ? await counter(p) : [0, await cards(p, pg.card)];
  await scrollToEnd(p, pg.card);
  const all = await cards(p, pg.card);
  R.ok(pg.name, `scrolling loads every one (${total})`, all === total && !(await counter(p)).length, `${all} shown`);

  if (pg.narrow) {
    await p.evaluate(() => window.scrollTo(0, 0));
    if (pg.narrow.kind === "filter") {
      await p.evaluate((v) => [...document.querySelectorAll("button")].find((x) => x.innerText.trim().toLowerCase() === v.toLowerCase())?.click(), pg.narrow.value);
    } else {
      await p.type(pg.narrow.box, pg.narrow.value);
    }
    await sleep(1500);
    const c = await counter(p);
    const want = c.length ? c[1] : await cards(p, pg.card);
    await scrollToEnd(p, pg.card);
    const got = await cards(p, pg.card);
    const stuck = await counter(p);
    await p.screenshot({ path: R.shotPath(`${pg.name.toLowerCase()}-after-narrowing.png`) });
    R.ok(pg.name, `after scrolling to the end, ${pg.narrow.kind === "filter" ? `the "${pg.narrow.value}" filter` : `searching "${pg.narrow.value}"`} still loads them all (${want})`,
      got === want && !stuck.length, stuck.length ? `stuck: "Showing ${stuck[0]} of ${stuck[1]}"` : `${got} shown`, `${pg.name.toLowerCase()}-after-narrowing.png`);
  }
  R.ok(pg.name, "no page errors", errs.length === 0, errs.join(" | "));
  await p.close();
}

await b.close();
const { passed, total } = R.write({ heading: LIVE ? "Live site (read-only)" : "Browser test (v12 code, live data, read-only)" });
console.table(R.results.map((r) => ({ area: r.area, check: r.check.slice(0, 70), pass: r.pass ? "PASS" : "FAIL", detail: r.detail.slice(0, 36) })));
console.log(`${passed}/${total} passed — report: reports/paging.html`);
process.exit(passed === total ? 0 : 1);
