/**
 * B4 on the LIVE site, after deploy. Changes nothing:
 *  1. Real articles: no headings appear in existing text, paragraph counts
 *     match the database, no "##", no errors.
 *  2. A REAL sign-in through the login page, then the article editor: the
 *     "+ Add heading" button works in the text box — then Cancel. Nothing is
 *     saved (checked: the article count is the same before and after).
 *     No sign-out: a scripted sign-out can end the owner's own session.
 * Appends to reports/B4-article-headings.html.
 */
import puppeteer from "puppeteer-core";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { createReport } from "./lib/report.mjs";

const ROOT = fileURLToPath(new URL("..", import.meta.url));
const E = Object.fromEntries(readFileSync(join(ROOT, ".env"), "utf8").split(/\r?\n/).filter((l) => /^[A-Z_]+=/.test(l)).map((l) => [l.slice(0, l.indexOf("=")), l.slice(l.indexOf("=") + 1).trim()]));
const SITE = "https://www.artfutureclub.com";
const L = E.VITE_SUPABASE_URL, SK = E.SUPABASE_SERVICE_ROLE_KEY, A = E.VITE_SUPABASE_ANON_KEY;
if (!L.includes("erfrbjkozzqptopjhmav")) throw new Error("expected the live project");
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const countArticles = async () => {
  const r = await fetch(`${L}/rest/v1/article?select=id`, { headers: { apikey: SK, Authorization: `Bearer ${SK}`, Prefer: "count=exact", Range: "0-0" } });
  return Number((r.headers.get("content-range") || "/0").split("/")[1]);
};

const R = createReport("B4-article-headings", "", "");
const b = await puppeteer.launch({ executablePath: "C:/Program Files/Google/Chrome/Application/chrome.exe", headless: true, protocolTimeout: 240000 });
const p = await b.newPage();
await p.setViewport({ width: 1366, height: 900 });
const errs = []; p.on("pageerror", (e) => errs.push(e.message));
const go = async (path) => { for (let i = 0; i < 3; i++) { try { await p.goto(SITE + path, { waitUntil: "networkidle2", timeout: 90000 }); break; } catch {} } };

// ---- 1. real articles, read-only
const arts = await (await fetch(`${L}/rest/v1/article?select=slug,title,body&published=eq.true&order=publish_date.desc&limit=8`, { headers: { apikey: A } })).json();
for (const a of arts) {
  await go(`/editorial/${a.slug}`);
  await p.waitForFunction((t) => document.querySelector("h1")?.innerText.includes(t.slice(0, 20)), { timeout: 45000 }, a.title).catch(() => {});
  await sleep(800);
  const expected = (a.body || "").split("\n\n").filter((x) => x.trim()).length;
  const got = await p.evaluate(() => {
    const body = document.querySelector(".mt-12");
    return { paras: body ? body.querySelectorAll(":scope > p").length : -1, heads: body ? body.querySelectorAll("h2").length : -1, hashes: document.body.innerText.includes("##") };
  });
  R.ok("Live articles", `${a.title.slice(0, 50)}: unchanged`, got.heads === 0 && !got.hashes && got.paras === expected, `paragraphs ${got.paras}/${expected} · headings ${got.heads}`);
}

// ---- 2. a real sign-in, then the editor — closed without saving
const before = await countArticles();
await go("/login");
await p.waitForSelector('input[type="email"]', { timeout: 30000 });
await p.type('input[type="email"]', E.AFC_ADMIN_EMAIL);
await p.type('input[type="password"], #password', E.AFC_ADMIN_PASSWORD);
await Promise.all([p.waitForNavigation({ waitUntil: "networkidle2", timeout: 60000 }).catch(() => {}), p.click('button[type="submit"]')]);
await sleep(3000);
// The proof of a real admin sign-in is below: the admin-only "New Article" button
// appears and the editor opens. (A header-text check here misfired.)

await go("/editorial");
await sleep(2500);
await p.evaluate(() => [...document.querySelectorAll("button")].find((x) => /^reject$/i.test(x.innerText.trim()))?.click());
// "New Article" appears once the admin role has loaded — wait for it.
await p.waitForFunction(() => [...document.querySelectorAll("button")].some((x) => /new article/i.test(x.innerText)), { timeout: 30000 }).catch(() => {});
await p.evaluate(() => [...document.querySelectorAll("button")].find((x) => /new article/i.test(x.innerText))?.click());
await sleep(2500);
const adminOnly = await p.evaluate(() => [...document.querySelectorAll("button")].some((x) => /new article/i.test(x.innerText)) || !!document.querySelector("textarea[placeholder='Use blank lines to separate paragraphs.']"));
R.ok("Live · real sign-in", "signed in through the real login page (admin-only editor reachable)", adminOnly);
const hasBtn = await p.evaluate(() => [...document.querySelectorAll("button")].some((x) => x.innerText.trim().toLowerCase() === "+ add heading"));
R.ok("Live · editor", "'+ Add heading' is in the live editor", hasBtn);
const body = await p.$("textarea[placeholder='Use blank lines to separate paragraphs.']");
let value = "";
if (body) {
  await body.click();
  await body.type("First paragraph.");
  await p.evaluate(() => [...document.querySelectorAll("button")].find((x) => x.innerText.trim().toLowerCase() === "+ add heading")?.click());
  await sleep(400);
  await p.keyboard.type("A heading");
  value = await p.evaluate((el) => el.value, body);
  await p.evaluate((el) => el.scrollIntoView({ block: "center" }), body);
  await sleep(500);
  await p.screenshot({ path: R.shotPath("8-live-editor.png") });
}
R.ok("Live · editor", "Add heading works in the live editor", value === "First paragraph.\n\n## A heading", JSON.stringify(value), body ? "8-live-editor.png" : "");
// close WITHOUT saving
await p.evaluate(() => [...document.querySelectorAll("button")].find((x) => x.innerText.trim().toLowerCase() === "cancel")?.click());
await sleep(1500);
const closed = await p.evaluate(() => !document.querySelector("textarea[placeholder='Use blank lines to separate paragraphs.']"));
const after = await countArticles();
R.ok("Live · editor", "closed with Cancel — nothing was saved", closed && after === before, `articles before ${before}, after ${after}`);
R.ok("Live · whole run", "no page errors", errs.length === 0, errs.join(" | "));
await b.close();
const { passed, total } = R.write({ heading: "Live site after deploy", note: "Read-only article checks, plus a real sign-in through the login page and the editor opened and cancelled. Nothing on the live site was changed." });
console.table(R.results.map((r) => ({ area: r.area, check: r.check.slice(0, 58), pass: r.pass ? "PASS" : "FAIL", detail: r.detail.slice(0, 44) })));
console.log(`${passed}/${total} passed (live)`);
process.exit(passed === total ? 0 : 1);
