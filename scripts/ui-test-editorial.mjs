/**
 * A4 (newest article larger on the Editorial page) in real Chrome, on the
 * real articles. Read-only: the page only displays.
 *   node scripts/ui-test-editorial.mjs [site]      (default http://localhost:5199)
 * Report: reports/A4-editorial-lead.html
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
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// The newest live article, from the database itself.
const arts = await (await fetch(`${E.VITE_SUPABASE_URL}/rest/v1/article?select=slug,title,subtitle,category,featured,publish_date,created_date&published=eq.true&limit=2000`, { headers: { apikey: E.VITE_SUPABASE_ANON_KEY } })).json();
const when = (a) => new Date(a.publish_date || a.created_date || 0);
const live = arts.filter((a) => !a.publish_date || new Date(a.publish_date) <= new Date()).sort((a, b) => when(b) - when(a));
const newest = live[0];
const otherCat = ["Interview", "Essay", "Review", "Open Call", "News", "Feature"].find((c) => live.some((a) => a.category === c) && c !== newest.category) || "Essay";

const R = createReport("A4-editorial-lead", "A4 — newest article larger on the Editorial page", "Real Chrome on the real articles (read-only).");
const b = await puppeteer.launch({ executablePath: "C:/Program Files/Google/Chrome/Application/chrome.exe", headless: true });
const p = await b.newPage();
await p.setViewport({ width: 1366, height: 900 });
const errs = []; p.on("pageerror", (e) => errs.push(e.message));
await p.goto(`${SITE}/editorial`, { waitUntil: "networkidle2", timeout: 90000 });
await p.waitForSelector('[data-testid="editorial-lead"] h2', { timeout: 45000 }).catch(() => {});
await sleep(1500);
await p.evaluate(() => [...document.querySelectorAll("button")].find((x) => /^reject$/i.test(x.innerText.trim()))?.click());
await sleep(500);
// the lead image is lazy-loaded: wait for it rather than a fixed time
await p.waitForFunction(() => { const i = document.querySelector('[data-testid="editorial-lead"] img'); return i && i.complete && i.naturalWidth > 0; }, { timeout: 30000 }).catch(() => {});
const state = () => p.evaluate(() => ({
  lead: [...document.querySelectorAll('[data-testid="editorial-lead"] h2')].map((h) => h.textContent.trim()),
  leadText: document.querySelector('[data-testid="editorial-lead"]')?.innerText || "",
  leadHref: document.querySelector('[data-testid="editorial-lead"] a')?.getAttribute("href") || "",
  leadImg: (() => { const i = document.querySelector('[data-testid="editorial-lead"] img'); return i ? { ok: i.complete && i.naturalWidth > 0, w: Math.round(i.getBoundingClientRect().width) } : null; })(),
  grid: [...document.querySelectorAll("h3")].map((h) => h.textContent.trim()),
}));
let s = await state();
await p.screenshot({ path: R.shotPath("1-main.png") });
R.ok("Main page", `the newest article leads, large: "${newest.title.slice(0, 50)}"`, s.lead.length === 1 && s.lead[0] === newest.title.trim(), s.lead.join(" | "), "1-main.png");
R.ok("Main page", "it shows the subtitle", !newest.subtitle || s.leadText.includes(newest.subtitle.trim().slice(0, 40)));
R.ok("Main page", "it has a 'Continue reading' prompt", /continue reading/i.test(s.leadText));
R.ok("Main page", "it opens the article", s.leadHref === `/editorial/${newest.slug}`, s.leadHref);
R.ok("Main page", "its image loaded and spans the page width", s.leadImg?.ok && s.leadImg.w > 900, JSON.stringify(s.leadImg));
R.ok("Main page", "not repeated in the grid below", !s.grid.includes(newest.title.trim()));
R.ok("Main page", `every other live article still listed (${live.length - 1})`, s.grid.length === live.length - 1 - live.filter((a) => a.featured && a !== newest).length, `${s.grid.length} in grid`);

// Open it
await Promise.all([p.waitForNavigation({ waitUntil: "networkidle2" }).catch(() => {}), p.click('[data-testid="editorial-lead"] a')]);
await p.waitForSelector("h1", { timeout: 30000 }).catch(() => {});
await sleep(1000);
R.ok("Main page", "clicking it opens that article", (await p.evaluate(() => document.querySelector("h1")?.innerText.trim())) === newest.title.trim(), p.url());
await p.goBack({ waitUntil: "networkidle2" });
await p.waitForSelector('[data-testid="editorial-lead"] h2', { timeout: 30000 }).catch(() => {});

// Category and search: no large lead
await p.evaluate((c) => [...document.querySelectorAll("button")].find((x) => x.innerText.trim().toLowerCase() === c.toLowerCase())?.click(), otherCat);
await sleep(800);
s = await state();
await p.screenshot({ path: R.shotPath("2-category.png") });
R.ok("Filtered", `category "${otherCat}": no large lead`, s.lead.length === 0 && s.grid.length > 0, `${s.grid.length} results`, "2-category.png");
await p.evaluate(() => [...document.querySelectorAll("button")].find((x) => x.innerText.trim().toLowerCase() === "all")?.click());
await sleep(800);
R.ok("Filtered", "back to All: the lead returns", (await state()).lead[0] === newest.title.trim());
await p.type('input[placeholder^="Search articles"]', newest.title.split(" ")[1] || "art");
await sleep(800);
s = await state();
R.ok("Filtered", "searching: no large lead", s.lead.length === 0, `${s.grid.length} results`);
R.ok("Whole run", "no page errors", errs.length === 0, errs.join(" | "));

// Signed in as admin: drafts are visible to staff, but still only ONE large
// card (2026-10-28: a featured draft copy of the newest article showed as a
// second large card for admins and editors).
{
  const ctx = await b.createBrowserContext();
  const a = await ctx.newPage();
  await a.setViewport({ width: 1366, height: 900 });
  const aerrs = []; a.on("pageerror", (e) => aerrs.push(e.message));
  await a.goto(`${SITE}/login`, { waitUntil: "networkidle2", timeout: 120000 });
  await a.waitForSelector('input[type="email"]', { timeout: 60000 });
  await a.type('input[type="email"]', E.AFC_ADMIN_EMAIL);
  await a.type('input[type="password"]', E.AFC_ADMIN_PASSWORD);
  await Promise.all([a.waitForNavigation({ waitUntil: "networkidle2", timeout: 90000 }).catch(() => {}), a.click('button[type="submit"]')]);
  await a.goto(`${SITE}/editorial`, { waitUntil: "networkidle2", timeout: 120000 });
  await a.waitForFunction(() => document.querySelectorAll("h3").length > 5, { timeout: 90000 }).catch(() => {});
  await sleep(4000); // the admin list (with drafts) arrives after the public one
  await a.evaluate(() => [...document.querySelectorAll("button")].find((x) => /^reject$/i.test(x.innerText.trim()))?.click());
  const adm = await a.evaluate(() => {
    const big = [...document.querySelectorAll('[data-testid="editorial-lead"], [data-testid="editorial-featured"]')];
    const titles = [...document.querySelectorAll("h2, h3")].map((h) => h.textContent.trim());
    const dup = titles.filter((t, i) => titles.indexOf(t) !== i);
    return { big: big.length, bigTitles: big.map((x) => x.querySelector("h2")?.textContent.trim()), bigDrafts: big.filter((x) => /draft/i.test(x.innerText)).length, drafts: [...document.querySelectorAll("span")].filter((s) => /^draft$/i.test(s.textContent.trim())).length, dup };
  });
  await a.screenshot({ path: R.shotPath("4-admin.png") });
  R.ok("Admin view", "exactly ONE large card — the newest live article", adm.big === 1 && adm.bigTitles[0] === newest.title.trim(), JSON.stringify(adm.bigTitles), "4-admin.png");
  R.ok("Admin view", "no draft is ever shown large", adm.bigDrafts === 0, `${adm.drafts} draft(s) listed in the grid`);
  R.ok("Admin view", "no page errors", aerrs.length === 0, aerrs.join(" | "));
  await ctx.close();
}

// Phone
await p.setViewport({ width: 390, height: 844 });
await p.goto(`${SITE}/editorial`, { waitUntil: "networkidle2" });
await p.waitForSelector('[data-testid="editorial-lead"] h2', { timeout: 45000 }).catch(() => {});
await sleep(1500);
await p.evaluate(() => document.querySelector('[data-testid="editorial-lead"]')?.scrollIntoView({ block: "start" }));
await sleep(500);
const over = await p.evaluate(() => document.documentElement.scrollWidth - innerWidth);
await p.screenshot({ path: R.shotPath("3-phone.png") });
R.ok("Phone", "lead shows, no sideways scrolling", (await state()).lead.length === 1 && over <= 1, `${over}px`, "3-phone.png");

await b.close();
const { passed, total } = R.write({ heading: LIVE ? "Live site after deploy (read-only)" : "Browser test (v12 code, real articles, read-only)" });
console.table(R.results.map((r) => ({ area: r.area, check: r.check.slice(0, 60), pass: r.pass ? "PASS" : "FAIL", detail: r.detail.slice(0, 36) })));
console.log(`${passed}/${total} passed — report: reports/A4-editorial-lead.html`);
process.exit(passed === total ? 0 : 1);
