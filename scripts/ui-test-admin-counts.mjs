/**
 * B12 (admin counts) in real Chrome with a REAL sign-in through the login page.
 * Read-only: the dashboard only displays numbers. Each card is compared with
 * the database's own exact count. No sign-out (a scripted sign-out can end the
 * owner's own session).
 *   node scripts/ui-test-admin-counts.mjs [site]      (default http://localhost:5199)
 * Report: reports/B12-admin-counts.html
 */
import puppeteer from "puppeteer-core";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { createReport } from "./lib/report.mjs";

const ROOT = fileURLToPath(new URL("..", import.meta.url));
const E = Object.fromEntries(readFileSync(join(ROOT, ".env"), "utf8").split(/\r?\n/).filter((l) => /^[A-Z_]+=/.test(l)).map((l) => [l.slice(0, l.indexOf("=")), l.slice(l.indexOf("=") + 1).trim()]));
const SITE = process.argv[2] || "http://localhost:5199";
const LIVE = SITE.startsWith("https://");
const L = E.VITE_SUPABASE_URL, SK = E.SUPABASE_SERVICE_ROLE_KEY;
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const VENUES = ["Institution", "Museum", "Foundation", "Event Space", "Restaurant"];

// ---- the database's own numbers
const count = async (q) => {
  const r = await fetch(`${L}/rest/v1/${q}`, { headers: { apikey: SK, Authorization: `Bearer ${SK}`, Prefer: "count=exact", Range: "0-0" } });
  return Number((r.headers.get("content-range") || "/0").split("/")[1]);
};
const inList = (xs) => `in.(${xs.map((x) => `"${x}"`).join(",")})`;
const truth = {
  Artists: { total: await count("artist_profile?select=id"), published: await count("artist_profile?select=id&status=eq.approved") },
  Galleries: { total: await count("collector_profile?select=id&type=eq.Gallery"), published: await count("collector_profile?select=id&type=eq.Gallery&status=eq.approved") },
  Venues: { total: await count(`collector_profile?select=id&type=${encodeURIComponent(inList(VENUES))}`), published: await count(`collector_profile?select=id&status=eq.approved&type=${encodeURIComponent(inList(VENUES))}`) },
  Collectors: { total: await count("collector_profile?select=id&type=eq.Collector"), published: await count("collector_profile?select=id&type=eq.Collector&status=eq.approved") },
};

const R = createReport("B12-admin-counts", "B12 — admin panel counts", "Real Chrome, real sign-in through the login page, live data (read-only).");
const b = await puppeteer.launch({ executablePath: "C:/Program Files/Google/Chrome/Application/chrome.exe", headless: true });
const p = await b.newPage();
await p.setViewport({ width: 1366, height: 900 });
const errs = []; p.on("pageerror", (e) => errs.push(e.message));

await p.goto(`${SITE}/login`, { waitUntil: "networkidle2" });
await p.waitForSelector('input[type="email"]', { timeout: 30000 });
await p.type('input[type="email"]', E.AFC_ADMIN_EMAIL);
await p.type('input[type="password"]', E.AFC_ADMIN_PASSWORD);
await Promise.all([p.waitForNavigation({ waitUntil: "networkidle2", timeout: 60000 }).catch(() => {}), p.click('button[type="submit"]')]);
await p.goto(`${SITE}/admin`, { waitUntil: "networkidle2" });
// wait until the four new cards have real numbers (not "…")
await p.waitForFunction(() => {
  const cards = [...document.querySelectorAll(".border.border-border.p-4")];
  return ["Galleries", "Venues", "Collectors"].every((l) => cards.some((c) => c.innerText.toLowerCase().includes(l.toLowerCase()) && /\d/.test(c.querySelector("p")?.innerText || "")));
}, { timeout: 45000 }).catch(() => {});
await p.evaluate(() => [...document.querySelectorAll("button")].find((x) => /^reject$/i.test(x.innerText.trim()))?.click());
const cards = await p.evaluate(() => Object.fromEntries([...document.querySelectorAll(".border.border-border.p-4")].map((c) => {
  const ps = [...c.querySelectorAll("p")].map((x) => x.innerText.trim());
  return [ps[1]?.toLowerCase(), { value: ps[0], note: ps[2] || "" }];
})));
R.ok("Sign-in", "signed in as the admin through the real login page", Object.keys(cards).length >= 8, `${Object.keys(cards).length} cards`);
await p.screenshot({ path: R.shotPath("1-admin-cards.png") });

for (const [label, t] of Object.entries(truth)) {
  const c = cards[label.toLowerCase()];
  const drafts = t.total - t.published;
  R.ok("Counts", `${label}: shows ${t.total} (database: ${t.total})`, c && c.value === String(t.total), `card ${c?.value}`, label === "Artists" ? "1-admin-cards.png" : "");
  R.ok("Counts", `${label}: "not published" note ${drafts > 0 ? `says ${drafts}` : "hidden (0 drafts)"}`,
    drafts > 0 ? c?.note === `${drafts} NOT PUBLISHED` || c?.note.toLowerCase() === `${drafts} not published` : !c?.note, `note "${c?.note}"`);
}
for (const label of ["inquiries", "forum posts", "open calls", "subscriptions"]) {
  R.ok("Other cards", `${label} card still there with a number`, cards[label] && /\d/.test(cards[label].value), cards[label]?.value);
}
const headline = await p.evaluate(() => [...document.querySelectorAll("p")].map((x) => x.innerText.trim()).find((t) => /^\d+ artists$/i.test(t)));
R.ok("Header", "the line under 'Admin' uses the same exact artist count", headline?.toLowerCase() === `${truth.Artists.total} artists`, headline);

// the tabs still work
for (const tab of ["Edit Listings", "Approvals"]) {
  await p.evaluate((t) => [...document.querySelectorAll("button")].find((x) => x.innerText.trim().toLowerCase() === t.toLowerCase())?.click(), tab);
  await sleep(2500);
  const ok = await p.evaluate((t) => document.body.innerText.toLowerCase().includes(t === "Edit Listings" ? "edit listings" : "approval"), tab);
  R.ok("Tabs", `${tab} tab still opens`, ok);
}
// phone
await p.setViewport({ width: 390, height: 844 });
await p.goto(`${SITE}/admin`, { waitUntil: "networkidle2" }); await sleep(4000);
const overflow = await p.evaluate(() => document.documentElement.scrollWidth - innerWidth);
// The admin page already scrolled 877px sideways on a phone before B12 —
// measured on the live site 2026-10-20, old and new code identical. The
// cause is the row of 12 admin tabs (logged as a follow-up). B12 must not
// add to it.
const BEFORE_B12 = 877;
R.ok("Phone", `B12 adds no sideways scroll (the tab bar already overflows ${BEFORE_B12}px — pre-existing)`, overflow <= BEFORE_B12, `${overflow}px`);
await p.screenshot({ path: R.shotPath("2-phone.png") });
R.ok("Whole run", "no page errors", errs.length === 0, errs.join(" | "));
await b.close();
const { passed, total } = R.write({ heading: LIVE ? "Live site after deploy" : "Browser test (v12 code, live data, real sign-in)" });
console.table(R.results.map((r) => ({ area: r.area, check: r.check.slice(0, 55), pass: r.pass ? "PASS" : "FAIL", detail: r.detail.slice(0, 32) })));
console.log(`${passed}/${total} passed — report: reports/B12-admin-counts.html`);
process.exit(passed === total ? 0 : 1);
