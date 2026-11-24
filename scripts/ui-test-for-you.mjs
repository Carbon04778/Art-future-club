/**
 * "For you" pictures in real Chrome (D5). READ-ONLY. The follows are answered
 * inside this browser only, so there is always something to suggest.
 *   node scripts/ui-test-for-you.mjs [site]
 */
import puppeteer from "puppeteer-core";
import { readFileSync } from "node:fs";
import { createReport } from "./lib/report.mjs";
const E = Object.fromEntries(readFileSync(".env", "utf8").split(/\r?\n/).filter((l) => /^[A-Z_]+=/.test(l)).map((l) => [l.slice(0, l.indexOf("=")), l.slice(l.indexOf("=") + 1).trim()]));
const SITE = process.argv[2] || "http://localhost:5198", LIVE = SITE.startsWith("https");
const R = createReport("D5-for-you", "For you pictures", "Real Chrome, read-only.");
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const b = await puppeteer.launch({ executablePath: "C:/Program Files/Google/Chrome/Application/chrome.exe", headless: true });
const errs = [];
try {
  let p = await b.newPage();
  // At the default window the cookie banner covers the sign-in button.
  await p.setViewport({ width: 1366, height: 900 });
  await p.goto(SITE + "/login", { waitUntil: "domcontentloaded", timeout: 90000 });
  await p.waitForSelector('input[type="email"]', { timeout: 60000 });
  await sleep(3500);
  await p.type('input[type="email"]', E.AFC_ADMIN_EMAIL); await p.type('input[type="password"]', E.AFC_ADMIN_PASSWORD);
  await p.click('button[type="submit"]'); await sleep(7000); await p.close();
  for (const [w, tag] of [[390, "phone"], [1366, "desktop"]]) {
    p = await b.newPage();
    await p.setViewport({ width: w, height: 1000 });
    p.on("pageerror", (e) => errs.push(e.message));
    await p.setRequestInterception(true);
    p.on("request", (q) => (/\/rest\/v1\/follow\?/.test(q.url()) && q.method() === "GET" && /follower_id/.test(q.url())
      ? q.respond({ status: 200, headers: { "access-control-allow-origin": "*" }, contentType: "application/json", body: JSON.stringify(["Axel Vervoordt Gallery", "Alisan Fine Art", "Hong Kong Palace Museum"].map((n, i) => ({ id: String(i), following_id: "x" + i, following_name: n }))) })
      : q.continue()));
    await p.goto(SITE + "/events", { waitUntil: "domcontentloaded", timeout: 90000 });
    await p.waitForSelector("[data-pick-image] img", { timeout: 90000 });
    await p.evaluate(() => [...document.querySelectorAll("button")].find((x) => /^reject$/i.test(x.innerText.trim()))?.click());
    await sleep(8000);
    const d = await p.evaluate(() => ({ im: [...document.querySelectorAll("[data-pick-image] img")].map((i) => { i.loading = "eager"; return { ok: i.complete && i.naturalWidth > 0, src: i.currentSrc, w: i.naturalWidth }; }), side: document.documentElement.scrollWidth - innerWidth }));
    await sleep(6000);
    const ok = await p.evaluate(() => [...document.querySelectorAll("[data-pick-image] img")].every((i) => i.complete && i.naturalWidth > 0 && !/placeholder/.test(i.currentSrc)));
    await (await p.$('[data-testid="event-discovery"]')).screenshot({ path: R.shotPath(`${tag}.png`) });
    R.ok(tag, "each suggestion's picture loads", d.im.length > 0 && ok, `${d.im.length} pictures`, `${tag}.png`);
    if (LIVE) R.ok(tag, "small copies are used", d.im.every((i) => /\/api\/img\?w=320/.test(i.src)), d.im[0]?.src.slice(0, 80));
    R.ok(tag, "fits the screen", d.side <= 0, `${d.side}px`);
    await p.close();
  }
} catch (e) { R.ok("Whole run", "ran to the end", false, e.message); }
R.ok("Whole run", "no page errors", !errs.length, errs.join(" | "));
await b.close();
const { passed, total } = R.write({ heading: SITE });
for (const r of R.results) console.log(r.pass ? "PASS" : "FAIL", "|", r.area, "|", r.check, "|", r.detail);
console.log(`${passed}/${total} passed — report: reports/D5-for-you.html`);
process.exit(passed === total ? 0 : 1);
