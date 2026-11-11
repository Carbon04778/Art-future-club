/**
 * The Events page shows every event — not the 200 oldest — in real Chrome.
 * Read-only: compares the page with what the public can read from the
 * database. Run it against a dev server on live data, or the live site.
 *
 *   node scripts/ui-test-events-all.mjs [site]   (default http://localhost:5199, live data)
 * Report: reports/events-all.html
 */
import puppeteer from "puppeteer-core";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { createReport } from "./lib/report.mjs";

const ROOT = fileURLToPath(new URL("..", import.meta.url));
const E = Object.fromEntries(readFileSync(join(ROOT, ".env"), "utf8").split(/\r?\n/).filter((l) => /^[A-Z_]+=/.test(l)).map((l) => [l.slice(0, l.indexOf("=")), l.slice(l.indexOf("=") + 1).trim()]));
const SITE = process.argv[2] || "http://localhost:5199";
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// what a visitor is allowed to read
const evs = await (await fetch(`${E.VITE_SUPABASE_URL}/rest/v1/event?select=id,title,start_date&order=start_date.asc&limit=5000`, { headers: { apikey: E.VITE_SUPABASE_ANON_KEY } })).json();
const now = new Date();
const upcoming = evs.filter((e) => new Date(e.start_date) >= now);
const newest = evs[evs.length - 1];
const nextUp = upcoming[0];

const R = createReport("events-all", "Events page shows every event", `Real Chrome, read-only, ${SITE}. Database: ${evs.length} events, ${upcoming.length} upcoming.`);
const b = await puppeteer.launch({ executablePath: "C:/Program Files/Google/Chrome/Application/chrome.exe", headless: true });
const errs = [];
for (const [width, tag] of [[390, "phone"], [1366, "desktop"]]) {
  const p = await b.newPage();
  await p.setViewport({ width, height: width < 600 ? 844 : 900 });
  p.on("pageerror", (e) => errs.push(e.message));
  await p.goto(`${SITE}/events`, { waitUntil: "networkidle2", timeout: 120000 });
  await sleep(3000);
  await p.evaluate(() => [...document.querySelectorAll("button")].find((x) => /^reject$/i.test(x.innerText.trim()))?.click());
  const shown = await p.evaluate(() => {
    const rows = [...document.querySelectorAll(".divide-y > div")];
    const months = [...document.querySelectorAll("p")].filter((x) => /^(January|February|March|April|May|June|July|August|September|October|November|December) \d{4}$/.test(x.textContent.trim())).map((x) => x.textContent.trim());
    return { rows: rows.length, months, text: document.body.textContent };
  });
  const shot = `events-${tag}.png`;
  await p.screenshot({ path: R.shotPath(shot) });
  R.ok(`Events (${tag})`, `every event the public can see is listed (${evs.length})`, shown.rows === evs.length, `${shown.rows} on the page`, shot);
  R.ok(`Events (${tag})`, "the next upcoming event is there", !nextUp || shown.text.includes(nextUp.title), nextUp ? `${nextUp.start_date.slice(0, 10)} ${nextUp.title}` : "none upcoming");
  R.ok(`Events (${tag})`, "the furthest-ahead event is there", shown.text.includes(newest.title), `${newest.start_date.slice(0, 10)} ${newest.title}`);
  const thisMonth = now.toLocaleDateString("en-GB", { month: "long", year: "numeric" });
  R.ok(`Events (${tag})`, `this month (${thisMonth}) has its own heading`, shown.months.includes(thisMonth), shown.months.slice(0, 4).join(", "));
  R.ok(`Events (${tag})`, "the list starts with upcoming events, not September", shown.months[0] !== "September 2026" && shown.months.length > 0, `first heading: ${shown.months[0]}`);
  R.ok(`Events (${tag})`, "fits the screen (no sideways scroll)", (await p.evaluate(() => document.documentElement.scrollWidth - innerWidth)) <= 0);
  await p.close();
}
R.ok("Whole run", "no page errors", errs.length === 0, errs.join(" | ").slice(0, 300));
await b.close();
const { passed, total } = R.write({ heading: SITE.startsWith("https://") ? "Live site" : "Dev server on live data (read-only)" });
console.table(R.results.map((r) => ({ area: r.area, check: r.check.slice(0, 64), pass: r.pass ? "PASS" : "FAIL", detail: r.detail.slice(0, 48) })));
console.log(`${passed}/${total} passed — report: reports/events-all.html`);
process.exit(passed === total ? 0 : 1);
