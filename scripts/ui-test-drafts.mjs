/**
 * B6 (save editorials as drafts) in real Chrome with a real sign-in.
 *
 * TEST (dev server on :5198 pointed at TEST): starts a new article with only
 * a title, saves it as a draft, adds text and saves again (must update the
 * SAME article), closes, finds it under Drafts, continues editing, publishes.
 * The database is checked after every step; the test article is deleted.
 * Live (after deploy): read-only — the admin sees the Drafts list; a visitor
 * does not; the Editorial page is unchanged for visitors.
 *
 *   node scripts/ui-test-drafts.mjs [site]   (default http://localhost:5198)
 * Report: reports/B6-drafts.html
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
if (!LIVE && !U.includes("jbcexmconizdqxnfyjba")) throw new Error("COPY_SUPABASE_URL is not the TEST project");
const SK = LIVE ? E.SUPABASE_SERVICE_ROLE_KEY : E.COPY_SUPABASE_SERVICE_ROLE_KEY;
const AK = LIVE ? E.VITE_SUPABASE_ANON_KEY : E.COPY_SUPABASE_ANON_KEY;
const SH = { apikey: SK, Authorization: `Bearer ${SK}`, "Content-Type": "application/json" };
const rows = async (q) => (await (await http(`${U}/rest/v1/${q}`, { headers: SH })).json());

const R = createReport("B6-drafts", "B6 — save editorials as drafts", LIVE ? "Real Chrome on the live site, read-only." : "Real Chrome, real sign-in, TEST project. The test article is deleted at the end.");
const b = await puppeteer.launch({ executablePath: "C:/Program Files/Google/Chrome/Application/chrome.exe", headless: true });
const ctx = await b.createBrowserContext();
const p = await ctx.newPage();
await p.setViewport({ width: 1366, height: 900 });
const errs = []; p.on("pageerror", (e) => errs.push(e.message)); p.on("dialog", (d) => d.accept());
const go = async (path) => { await p.goto(`${SITE}${path}`, { waitUntil: "networkidle2", timeout: 120000 }); await sleep(2500); await p.evaluate(() => [...document.querySelectorAll("button")].find((x) => /^reject$/i.test(x.innerText.trim()))?.click()); };
const click = (re) => p.evaluate((src) => { const el = [...document.querySelectorAll("button")].find((x) => new RegExp(src, "i").test(x.innerText.trim())); el?.scrollIntoView({ block: "center" }); el?.click(); return !!el; }, re);
const fill = (sel, v) => p.evaluate((s, val) => { const el = document.querySelector(s); const proto = el.tagName === "TEXTAREA" ? HTMLTextAreaElement.prototype : HTMLInputElement.prototype; Object.getOwnPropertyDescriptor(proto, "value").set.call(el, val); el.dispatchEvent(new Event("input", { bubbles: true })); }, sel, v);
const signInAdmin = async () => {
  await go("/login");
  await p.type('input[type="email"]', E.AFC_ADMIN_EMAIL);
  await p.type('input[type="password"]', E.AFC_ADMIN_PASSWORD);
  await Promise.all([p.waitForNavigation({ waitUntil: "networkidle2", timeout: 90000 }).catch(() => {}), p.click('button[type="submit"]')]);
};

if (LIVE) {
  await go("/editorial");
  R.ok("Visitor", "no Drafts list for a visitor", !(await p.$('[data-testid="drafts"]')));
  const anon = await (await http(`${U}/rest/v1/article?select=id&published=eq.false`, { headers: { apikey: AK } })).json();
  R.ok("Visitor", "the public API returns no drafts", Array.isArray(anon) && anon.length === 0);
  await signInAdmin();
  await go("/editorial");
  await p.waitForSelector('[data-testid="drafts"]', { timeout: 60000 }).catch(() => {});
  const n = (await rows("article?select=id&published=eq.false")).length;
  const listed = await p.evaluate(() => document.querySelectorAll('[data-testid="draft-row"]').length);
  await p.screenshot({ path: R.shotPath("1-admin-drafts.png") });
  R.ok("Admin", `the admin sees the Drafts list with all ${n} drafts`, listed === n && n > 0, `${listed} listed`, "1-admin-drafts.png");
  await click("^Continue editing$");
  await p.waitForSelector('[data-testid="article-status"]', { timeout: 30000 }).catch(() => {});
  R.ok("Admin", "'Continue editing' opens a draft in the form (nothing saved)", /draft — hidden from the site/i.test(await p.evaluate(() => document.querySelector('[data-testid="article-status"]')?.innerText || "")));
} else {
  const title = `B6 draft check ${Date.now()}`;
  let art = null;
  try {
    await signInAdmin();
    await go("/editorial");
    // The button appears once the page knows the visitor is staff.
    await p.waitForFunction(() => [...document.querySelectorAll("button")].some((x) => /new article/i.test(x.innerText)), { timeout: 60000 });
    await click("New Article");
    await p.waitForSelector("form input[required]", { timeout: 30000 });
    await p.type("form input[required]", title);
    await click("^Save Draft$");
    for (let i = 0; i < 20 && !art; i++) { await sleep(1000); art = (await rows(`article?select=*&title=eq.${encodeURIComponent(title)}`))[0]; }
    await p.waitForSelector('[data-testid="draft-saved"]', { timeout: 20000 }).catch(() => {});
    await p.evaluate(() => document.querySelector('[data-testid="article-actions"]')?.scrollIntoView({ block: "center" }));
    await sleep(600);
    await p.screenshot({ path: R.shotPath("1-draft-saved.png") });
    R.ok("Draft", "a new article with only a title saves as a draft", art?.published === false && art?.body === "", art ? `published=${art.published}` : "not saved", "1-draft-saved.png");
    R.ok("Draft", "the form stays open: 'Draft saved at …'", !!(await p.$('[data-testid="draft-saved"]')));
    const anonSees = await (await http(`${U}/rest/v1/article?select=id&id=eq.${art?.id}`, { headers: { apikey: AK } })).json();
    R.ok("Draft", "the public cannot see it", Array.isArray(anonSees) && anonSees.length === 0);

    await fill("form textarea[required]", "First paragraph of a piece in progress.");
    await click("^Save Draft$");
    await sleep(3500);
    const same = await rows(`article?select=id,body,published&title=eq.${encodeURIComponent(title)}`);
    R.ok("Draft", "saving again updates the SAME article (still one, now with text)", same.length === 1 && same[0].id === art.id && /piece in progress/.test(same[0].body), `${same.length} article(s)`);

    await click("^Close$");
    await sleep(1500);
    await go("/editorial");
    await p.waitForSelector('[data-testid="drafts"]', { timeout: 30000 }).catch(() => {});
    const listed = await p.evaluate((t) => [...document.querySelectorAll('[data-testid="draft-row"]')].some((r) => r.innerText.includes(t)), title);
    await p.evaluate(() => document.querySelector('[data-testid="drafts"]')?.scrollIntoView({ block: "start" }));
    await p.screenshot({ path: R.shotPath("2-drafts-list.png") });
    R.ok("Later", "it is under 'Drafts' on the Editorial page", listed, "", "2-drafts-list.png");
    await p.evaluate((t) => [...document.querySelectorAll('[data-testid="draft-row"]')].find((r) => r.innerText.includes(t))?.querySelector("button")?.click(), title);
    await p.waitForSelector("form textarea[required]", { timeout: 30000 });
    await sleep(800);
    const back = await p.evaluate(() => ({ t: document.querySelector("form input[required]").value, b: document.querySelector("form textarea[required]").value }));
    R.ok("Later", "'Continue editing' brings back the title and text", back.t === title && /piece in progress/.test(back.b));
    await fill("form textarea[required]", "First paragraph of a piece in progress.\n\nAnd now it is finished.");
    await p.evaluate(() => document.querySelector("form").requestSubmit());
    let pub = null;
    for (let i = 0; i < 20 && !pub?.published; i++) { await sleep(1000); pub = (await rows(`article?select=*&id=eq.${art.id}`))[0]; }
    R.ok("Publish", "Publish makes the same article live with the finished text", pub?.published === true && /now it is finished/.test(pub?.body || "") && (await rows(`article?select=id&title=eq.${encodeURIComponent(title)}`)).length === 1);
    const anonNow = await (await http(`${U}/rest/v1/article?select=id&id=eq.${art.id}`, { headers: { apikey: AK } })).json();
    R.ok("Publish", "…and the public can now see it", Array.isArray(anonNow) && anonNow.length === 1);
  } catch (err) {
    R.ok("Whole run", "test ran to the end", false, String(err?.message || err).slice(0, 160));
  } finally {
    await http(`${U}/rest/v1/article?title=like.B6%20draft%20check*`, { method: "DELETE", headers: SH });
    const left = (await rows("article?select=id&title=like.B6%20draft%20check*")).length;
    R.ok("Clean-up", "TEST: the test article is deleted", left === 0, `${left} left`);
  }
}
R.ok("Whole run", "no page errors", errs.length === 0, errs.join(" | "));
await b.close();
const { passed, total } = R.write({ heading: LIVE ? "Live site after deploy (read-only)" : "Browser test (v12 code, TEST project, real sign-in)" });
console.table(R.results.map((r) => ({ area: r.area, check: r.check.slice(0, 66), pass: r.pass ? "PASS" : "FAIL", detail: r.detail.slice(0, 30) })));
console.log(`${passed}/${total} passed — report: reports/B6-drafts.html`);
process.exit(passed === total ? 0 : 1);
