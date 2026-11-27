/**
 * Newsletter signup as a visitor (no account) on every place it appears (E1/E2).
 * Real Chrome, TEST project only; every address it adds is removed.
 *   node scripts/e2e-newsletter.mjs [site]     Report: reports/E-newsletter.html
 * With https://www.artfutureclub.com it only LOOKS (no signups on live).
 */
import puppeteer from "puppeteer-core";
import { readFileSync } from "node:fs";
import { createReport } from "./lib/report.mjs";
const E = Object.fromEntries(readFileSync(".env", "utf8").split(/\r?\n/).filter((l) => /^[A-Z_]+=/.test(l)).map((l) => [l.slice(0, l.indexOf("=")), l.slice(l.indexOf("=") + 1).trim()]));
const SITE = process.argv[2] || "http://localhost:5198", LIVE = SITE.startsWith("https");
const U = E.COPY_SUPABASE_URL, K = E.COPY_SUPABASE_SERVICE_ROLE_KEY;
if (!LIVE && !(await fetch(`${SITE}/src/api/base44Client.js`).then((r) => r.text())).includes("jbcexmconizdqxnfyjba")) throw Error("not TEST — stopped");
const H = { apikey: K, Authorization: `Bearer ${K}` };
const rows = async (q) => (await fetch(`${U}/rest/v1/newsletter_subscriber?${q}`, { headers: H })).json();
const R = createReport("E-newsletter", "Newsletter signup", LIVE ? "Live site, looking only." : "Real Chrome as a visitor, TEST project; addresses removed.");
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const stamp = Date.now(), errs = [];
const art = (await rows("select=id&limit=0"), (await (await fetch(`${(LIVE ? E.VITE_SUPABASE_URL : U)}/rest/v1/article?select=slug&published=eq.true&limit=1`, { headers: { apikey: LIVE ? E.VITE_SUPABASE_ANON_KEY : K, Authorization: `Bearer ${LIVE ? E.VITE_SUPABASE_ANON_KEY : K}` } })).json())[0]);
const PLACES = [
  ["/", "home", "home"], ["/events", "events", "events"], ["/open-calls", "open-calls", "open-calls"],
  ["/about", "about", "about"], [`/editorial/${art.slug}`, "article", "article"], ["/gallery", "footer", "footer /gallery"], ["/artists", "footer", "footer /artists"],
];
const b = await puppeteer.launch({ executablePath: "C:/Program Files/Google/Chrome/Application/chrome.exe", headless: true });
const before = LIVE ? 0 : (await rows("select=id")).length;
try {
  for (const [path, src, saved] of PLACES) {
    for (const [w, tag] of [[390, "phone"], [1366, "desktop"]]) {
      const c = await b.createBrowserContext(); // a fresh visitor, never signed in
      const p = await c.newPage();
      await p.setViewport({ width: w, height: 900 });
      p.on("pageerror", (e) => errs.push(`${path}: ${e.message}`));
      await p.goto(SITE + path, { waitUntil: "domcontentloaded", timeout: 90000 });
      const F = `form[data-newsletter="${src}"]`;
      const ok = await p.waitForSelector(F, { timeout: 60000 }).then(() => true, () => false);
      await sleep(1500);
      await p.evaluate(() => [...document.querySelectorAll("button")].find((x) => /^reject$/i.test(x.innerText.trim()))?.click());
      const side = await p.evaluate(() => document.documentElement.scrollWidth - innerWidth);
      if (tag === "phone") { await p.$eval(F, (x) => x.scrollIntoView({ block: "center" })); await sleep(500); await (await p.$(F)).screenshot({ path: R.shotPath(`${src}-${path.split("/")[1] || "home"}.png`) }); }
      R.ok(`${path} (${tag})`, "signup box is there and fits the screen", ok && side <= 0, `${side}px`, tag === "phone" ? `${src}-${path.split("/")[1] || "home"}.png` : "");
      if (LIVE || tag === "desktop") { await c.close(); continue; }
      const em = `nl-${stamp}-${src}-${path.split("/")[1] || "home"}@example.com`;
      const fill = async (v, tick = true) => { await p.$eval(`${F} input[type=email]`, (i) => { i.focus(); i.select(); }); await p.type(`${F} input[type=email]`, v); if (tick) await p.$eval(`${F} input[type=checkbox]`, (x) => x.click()); await p.$eval(F, (f) => f.requestSubmit()); await sleep(3500); };
      const msg = () => p.evaluate((sel) => document.querySelector(`[data-newsletter="${sel}"]`)?.innerText || "", src);
      if (path === "/") {
        await fill("not-an-email", true);
        R.ok("Checks", "a wrong address is refused, with a message", /valid email/.test(await msg()));
        await p.$eval(`${F} input[type=checkbox]`, (x) => x.click());
        await fill("", false); // clears, keeps typing below
      }
      await p.$eval(`${F} input[type=email]`, (i) => { i.value = ""; });
      await fill(em, path !== "/");
      if (path === "/") { R.ok("Checks", "no tick: asks for consent, nothing saved", /tick the box/.test(await msg()) && !(await rows(`email=eq.${encodeURIComponent(em)}&select=id`)).length); await p.$eval(`${F} input[type=checkbox]`, (x) => x.click()); await p.$eval(F, (f) => f.requestSubmit()); await sleep(3500); }
      const got = await rows(`email=eq.${encodeURIComponent(em)}&select=*`);
      R.ok(`${path} (${tag})`, "a visitor's signup is saved, with where it came from", /on the list/.test(await msg()) && got.length === 1 && got[0].source === saved && got[0].consent === true, got[0]?.source);
      await c.close();
      if (path === "/events") {
        const c2 = await b.createBrowserContext(); const q = await c2.newPage(); await q.setViewport({ width: 390, height: 900 });
        await q.goto(SITE + path, { waitUntil: "domcontentloaded" }); await q.waitForSelector(F); await sleep(1500);
        await q.type(`${F} input[type=email]`, em.toUpperCase()); await q.$eval(`${F} input[type=checkbox]`, (x) => x.click()); await q.$eval(F, (f) => f.requestSubmit()); await sleep(3500);
        R.ok("Checks", "same address again (in capitals): 'already on the list', not an error, not saved twice", /already on the list/.test(await q.evaluate((s) => document.querySelector(`[data-newsletter="${s}"]`).innerText, src)) && (await rows(`email=eq.${encodeURIComponent(em)}&select=id`)).length === 1);
        await q.evaluate((s) => { const t = document.querySelector('[data-newsletter="footer"] input[name="website"]'); Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value").set.call(t, "spam"); t.dispatchEvent(new Event("input", { bubbles: true })); void s; }, src);
        const bot = `nl-${stamp}-bot@example.com`;
        await q.type('[data-newsletter="footer"] input[type=email]', bot); await q.$eval('[data-newsletter="footer"] input[type=checkbox]', (x) => x.click()); await q.$eval('form[data-newsletter="footer"]', (f) => f.requestSubmit()); await sleep(3000);
        R.ok("Checks", "a bot filling the hidden field is not saved", !(await rows(`email=eq.${encodeURIComponent(bot)}&select=id`)).length);
        await c2.close();
      }
    }
  }
} catch (e) { R.ok("Whole run", "ran to the end", false, String(e.message).slice(0, 180)); } finally {
  await b.close();
  if (!LIVE) {
    await fetch(`${U}/rest/v1/newsletter_subscriber?email=like.nl-${stamp}-*`, { method: "DELETE", headers: H });
    const after = (await rows("select=id")).length;
    R.ok("Clean-up", "test addresses removed", after === before, `${before} → ${after}`);
  }
}
R.ok("Whole run", "no page errors", !errs.length, errs.join(" | ").slice(0, 200));
const { passed, total } = R.write({ heading: SITE });
for (const r of R.results) console.log(r.pass ? "PASS" : "FAIL", "|", r.area, "|", r.check, "|", r.detail);
console.log(`${passed}/${total} passed — report: reports/E-newsletter.html`);
process.exit(passed === total ? 0 : 1);
