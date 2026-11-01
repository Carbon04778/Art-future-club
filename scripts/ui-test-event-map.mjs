/**
 * B7 (events on the map) in real Chrome.
 *
 * TEST (dev server on :5198 pointed at TEST, migration 030 run there):
 *   - the map's Events filter lists the upcoming events that 030 placed, each
 *     with its date, and a pin opens the event's popup and page;
 *   - posting an event through the REAL form at a venue that is on the site,
 *     with NO end date: it saves (that used to fail), at the venue's own pin,
 *     at the right time, and appears on the map. Deleted afterwards.
 * Live (after deploy): read-only — the Events filter lists events, a popup
 *   opens, no errors.
 *
 *   node scripts/ui-test-event-map.mjs [site]   (default http://localhost:5198)
 * Report: reports/B7-event-map.html
 */
import puppeteer from "puppeteer-core";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { createReport } from "./lib/report.mjs";

const ROOT = fileURLToPath(new URL("..", import.meta.url));
const E = Object.fromEntries(readFileSync(join(ROOT, ".env"), "utf8").split(/\r?\n/).filter((l) => /^[A-Z_]+=/.test(l)).map((l) => [l.slice(0, l.indexOf("=")), l.slice(l.indexOf("=") + 1).trim()]));
const SITE = process.argv[2] || "http://localhost:5198";
const LIVE = SITE.startsWith("https://");
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
async function http(url, opts = {}) { for (let i = 0; ; i++) { try { return await fetch(url, opts); } catch (e) { if (i >= 3) throw e; await sleep(3000); } } }
const U = LIVE ? E.VITE_SUPABASE_URL : E.COPY_SUPABASE_URL.replace(/\/+$/, "");
const SK = LIVE ? E.SUPABASE_SERVICE_ROLE_KEY : E.COPY_SUPABASE_SERVICE_ROLE_KEY;
if (!LIVE && !U.includes("jbcexmconizdqxnfyjba")) throw new Error("COPY_SUPABASE_URL is not the TEST project");
const SH = { apikey: SK, Authorization: `Bearer ${SK}`, "Content-Type": "application/json", Prefer: "return=representation" };
const rest = async (method, q, body) => { const r = await http(`${U}/rest/v1/${q}`, { method, headers: SH, body: body ? JSON.stringify(body) : undefined }); const t = await r.text(); return { status: r.status, data: t ? JSON.parse(t) : null }; };

const R = createReport("B7-event-map", "B7 — events on the map", LIVE ? "Real Chrome on the live site, read-only." : "Real Chrome, real sign-in, TEST project. The one event the test posts is deleted at the end.");
const b = await puppeteer.launch({ executablePath: "C:/Program Files/Google/Chrome/Application/chrome.exe", headless: true });
const ctx = await b.createBrowserContext();
const p = await ctx.newPage();
await p.setViewport({ width: 1366, height: 900 });
const errs = []; p.on("pageerror", (e) => errs.push(e.message));
const go = async (path) => { await p.goto(`${SITE}${path}`, { waitUntil: "networkidle2", timeout: 120000 }); await sleep(2500); await p.evaluate(() => [...document.querySelectorAll("button")].find((x) => /^reject$/i.test(x.innerText.trim()))?.click()); };
const listRows = () => p.evaluate(() => [...document.querySelectorAll("li button")].map((x) => x.innerText.replace(/\s+/g, " ").trim()).filter((t) => /^.+ Event · /i.test(t) || / EVENT · /i.test(t)));

// what the database says should be there
const all = (await rest("GET", "event?select=id,title,slug,start_date,end_date,geo_lat&limit=2000")).data;
const nowD = new Date();
const expected = all.filter((e) => e.geo_lat != null && new Date(e.end_date || e.start_date) >= nowD);
R.ok("Database", `030 placed events: ${expected.length} upcoming/running events have a position`, expected.length > 0, `${all.filter((e) => e.geo_lat != null).length} of ${all.length} events placed in total`);

await go("/map?show=events");
await p.waitForFunction(() => /events?\b/i.test(document.body.innerText) && !/loading…/i.test(document.body.innerText), { timeout: 60000 }).catch(() => {});
await sleep(2500);
const header = await p.evaluate(() => (document.body.innerText.match(/\d+ artists? · \d+ places · \d+ events?/i) || [""])[0]);
const n = Number((header.match(/(\d+) events?/i) || [])[1]);
await p.screenshot({ path: R.shotPath("1-events-filter.png") });
R.ok("Map", `the Events filter shows all ${expected.length} placed upcoming events (and nothing else)`, n === expected.length && /0 places/i.test(header), header, "1-events-filter.png");
R.ok("Map", "the Events filter button is selected from ?show=events", await p.evaluate(() => [...document.querySelectorAll("button")].some((x) => /^events$/i.test(x.innerText.trim()) && /bg-foreground|text-background/.test(x.className))));
// open the first event from the list
const first = expected.sort((a, b) => new Date(a.start_date) - new Date(b.start_date))[0];
await p.evaluate(() => [...document.querySelectorAll("li button")].find((x) => /event ·/i.test(x.innerText))?.click());
await sleep(2500);
const popupLink = await p.evaluate(() => [...document.querySelectorAll("a[href^='/events/']")].map((a) => a.getAttribute("href"))[0] || "");
await p.screenshot({ path: R.shotPath("2-event-popup.png") });
R.ok("Map", "choosing an event opens its popup, linking to the event's page", /^\/events\//.test(popupLink), popupLink, "2-event-popup.png");
await go("/map");
await sleep(1500);
R.ok("Map", "'All' still shows artists and places, now with events too", await p.evaluate(() => /\d+ artists? · \d+ places · \d+ events?/i.test(document.body.innerText) && !/· 0 places/i.test(document.body.innerText)));

let made = null;
if (!LIVE) {
  try {
    // a venue that is on the site, with a pin
    const venue = (await rest("GET", "collector_profile?select=display_name,geo_lat,geo_lng,address&status=eq.approved&type=eq.Gallery&geo_lat=not.is.null&limit=50")).data
      .find((v) => /^[\w .&'-]+$/.test(v.display_name));
    const title = `B7 test event ${Date.now()}`;
    await go("/login");
    await p.type('input[type="email"]', E.AFC_ADMIN_EMAIL);
    await p.type('input[type="password"]', E.AFC_ADMIN_PASSWORD);
    await Promise.all([p.waitForNavigation({ waitUntil: "networkidle2", timeout: 90000 }).catch(() => {}), p.click('button[type="submit"]')]);
    await go("/events");
    await p.evaluate(() => [...document.querySelectorAll("button")].find((x) => /add event/i.test(x.innerText))?.click());
    await p.waitForSelector("form input[required]", { timeout: 20000 });
    const fill = (sel, v) => p.evaluate((s, val) => { const el = document.querySelector(s); Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value").set.call(el, val); el.dispatchEvent(new Event("input", { bubbles: true })); }, sel, v);
    await p.type("form input[required]", title);
    await fill('input[placeholder^="Gallery / venue name"]', venue.display_name);
    await fill('input[placeholder="Street, City"]', venue.address || "");
    const localStart = "2027-03-10T18:00";
    await fill('form input[type="datetime-local"]', localStart);
    await p.screenshot({ path: R.shotPath("3-post-event.png") });
    await p.evaluate(() => document.querySelector("form").requestSubmit());
    for (let i = 0; i < 20 && !made; i++) { await sleep(1000); made = (await rest("GET", `event?select=*&title=eq.${encodeURIComponent(title)}`)).data[0]; }
    R.ok("Posting", "an event with NO end date posts (it used to be refused)", !!made && made.end_date === null, made ? `end_date ${made.end_date}` : "not saved", "3-post-event.png");
    R.ok("Posting", `it is placed on the venue's own pin (${venue.display_name})`, made && Number(made.geo_lat) === Number(venue.geo_lat) && Number(made.geo_lng) === Number(venue.geo_lng), made ? `${made.geo_lat},${made.geo_lng}` : "");
    R.ok("Posting", "the time saved is the organiser's own (6 pm stays 6 pm)", made && new Date(made.start_date).getTime() === new Date(localStart).getTime(), made?.start_date);
    await go("/map?show=events");
    await p.waitForFunction((t) => document.body.innerText.includes(t), { timeout: 45000 }, title).catch(() => {});
    R.ok("Posting", "the new event is on the map straight away", await p.evaluate((t) => document.body.innerText.includes(t), title));
  } catch (err) {
    R.ok("Whole run", "test ran to the end", false, String(err?.message || err).slice(0, 160));
  } finally {
    if (made) await rest("DELETE", `event?id=eq.${made.id}`);
    await rest("DELETE", "event?title=like.B7%20test%20event*");
    const left = (await rest("GET", "event?select=id&title=like.B7%20test%20event*")).data.length;
    R.ok("Clean-up", "TEST: the event the test posted is deleted", left === 0, `${left} left`);
  }
}

// phone
await p.setViewport({ width: 390, height: 844 });
await go("/map?show=events");
const over = await p.evaluate(() => document.documentElement.scrollWidth - innerWidth);
R.ok("Phone", "map with the Events filter: no sideways scrolling", over <= 1, `${over}px`);
R.ok("Whole run", "no page errors", errs.length === 0, errs.join(" | "));
await b.close();
const { passed, total } = R.write({ heading: LIVE ? "Live site after deploy (read-only)" : "Browser test (v12 code, TEST project, real sign-in)" });
console.table(R.results.map((r) => ({ area: r.area, check: r.check.slice(0, 66), pass: r.pass ? "PASS" : "FAIL", detail: r.detail.slice(0, 34) })));
console.log(`${passed}/${total} passed — report: reports/B7-event-map.html`);
process.exit(passed === total ? 0 : 1);
