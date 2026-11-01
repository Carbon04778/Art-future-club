/**
 * Real-browser test of B4 (headings in article text) on the TEST project:
 * write an article in the real editor using "Add heading", publish it, and
 * check what was saved and what readers see. Report: reports/B4-article-headings.html
 *
 * Needs a dev server on :5199 pointed at TEST.
 *   node scripts/ui-test-headings.mjs   (plain node: vite-node rewrites the in-page import)
 */
import puppeteer from "puppeteer-core";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { createReport } from "./lib/report.mjs";

const ROOT = fileURLToPath(new URL("..", import.meta.url));
const E = Object.fromEntries(readFileSync(join(ROOT, ".env"), "utf8").split(/\r?\n/).filter((l) => /^[A-Z_]+=/.test(l)).map((l) => [l.slice(0, l.indexOf("=")), l.slice(l.indexOf("=") + 1).trim()]));
const TEST = E.COPY_SUPABASE_URL.replace(/\/+$/, "");
if (!TEST.includes("jbcexmconizdqxnfyjba")) throw new Error("not the TEST project");
const SK = E.COPY_SUPABASE_SERVICE_ROLE_KEY;
const BASE = "http://localhost:5199";
const TITLE = `B4 Heading Test ${Date.now()}`;
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const db = async (q) => (await fetch(`${TEST}/rest/v1/${q}`, { headers: { apikey: SK, Authorization: `Bearer ${SK}` } })).json();

const R = createReport("B4-article-headings", "B4 — headings inside article text", "");
const b = await puppeteer.launch({ executablePath: "C:/Program Files/Google/Chrome/Application/chrome.exe", headless: true, protocolTimeout: 240000 });
const p = await b.newPage();
await p.setViewport({ width: 1366, height: 900 });
const errs = []; p.on("pageerror", (e) => errs.push(e.message));
p.on("dialog", (d) => d.accept().catch(() => {}));
await p.goto(BASE, { waitUntil: "domcontentloaded" });
const login = await p.evaluate(async (email, password) => {
  const { supabase } = await import("/src/api/providers/supabase.js");
  const { error } = await supabase.auth.signInWithPassword({ email, password });
  return error?.message || "ok";
}, E.AFC_ADMIN_EMAIL, E.AFC_ADMIN_PASSWORD);
R.ok("Setup", "signed in as the admin on TEST", login === "ok", login);

const shot = async (file) => { await sleep(500); await p.screenshot({ path: R.shotPath(file) }); return file; };
// Labels are shown in capitals by CSS ("TITLE *"), so compare without case.
const fieldAfter = async (label, tag = "input") => (await p.evaluateHandle((label, tag) => {
  const l = [...document.querySelectorAll("label")].find((x) => x.innerText.trim().replace(/\s*\*$/, "").toLowerCase() === label.toLowerCase());
  return l?.parentElement?.querySelector(tag) || null;
}, label, tag)).asElement();

// 1. open the editor
await p.goto(`${BASE}/editorial`, { waitUntil: "networkidle2" });
await sleep(2500);
await p.evaluate(() => [...document.querySelectorAll("button")].find((x) => /new article/i.test(x.innerText))?.click());
await sleep(2500);
const hasButton = await p.evaluate(() => [...document.querySelectorAll("button")].some((x) => x.innerText.trim().toLowerCase() === "+ add heading"));
R.ok("Editor", "'+ Add heading' button is there", hasButton);
const hint = await p.evaluate(() => document.body.innerText.includes("shows as a heading"));
R.ok("Editor", "a hint explains how headings work", hint);

// 2. type a real article, using the button
await (await fieldAfter("Title")).type(TITLE);
const author = await fieldAfter("Author");
await author.click({ clickCount: 3 }); await author.type("B4 Tester");
const body = await p.$("textarea[placeholder='Use blank lines to separate paragraphs.']");
await body.click();
await body.type("Opening paragraph about the artist.");
const addHeading = () => p.evaluate(() => [...document.querySelectorAll("button")].find((x) => x.innerText.trim().toLowerCase() === "+ add heading")?.click());
await addHeading(); await sleep(400);
await p.keyboard.type("Early years");
await p.keyboard.press("Enter"); await p.keyboard.press("Enter");
await p.keyboard.type("She began painting in 1990.");
await addHeading(); await sleep(400);
await p.keyboard.type("Recent work");
await p.keyboard.press("Enter"); await p.keyboard.press("Enter");
await p.keyboard.type("Her new series opens in March.");
const typed = await p.evaluate((el) => el.value, body);
const expected = "Opening paragraph about the artist.\n\n## Early years\n\nShe began painting in 1990.\n\n## Recent work\n\nHer new series opens in March.";
R.ok("Editor", "'Add heading' puts each heading on its own line, cursor ready", typed === expected, JSON.stringify(typed));
await p.evaluate((el) => el.scrollIntoView({ block: "center" }), body);
R.ok("Editor", "screenshot of the editor", true, "", await shot("1-editor.png"));

// 3. publish
await p.evaluate(() => {
  const box = [...document.querySelectorAll("label")].find((l) => /publish immediately/i.test(l.innerText))?.querySelector("input");
  if (box && !box.checked) box.click();
});
await p.evaluate(() => [...document.querySelectorAll("button[type=submit]")].find((x) => /publish|save|schedule/i.test(x.innerText))?.click());
let row = null;
for (let i = 0; i < 20 && !row; i++) { await sleep(1500); row = (await db(`article?select=id,slug,body,reading_time_mins,published&title=eq.${encodeURIComponent(TITLE)}`))[0]; }
R.ok("Saved", "the article was saved and published", row?.published === true, JSON.stringify({ found: !!row, published: row?.published }));
R.ok("Saved", "the text was stored exactly as typed", row?.body === expected, JSON.stringify(row?.body));
R.ok("Saved", "reading time counts words, not '##'", row?.reading_time_mins === 1, `${row?.reading_time_mins} min`);

// 4. what readers see
await p.goto(`${BASE}/editorial/${row?.slug || row?.id}`, { waitUntil: "networkidle2" });
// Wait for the article itself, not just the spinner.
const loaded = await p.waitForFunction((t) => document.querySelector("h1")?.innerText.includes(t), { timeout: 45000 }, TITLE).then(() => true).catch(() => false);
R.ok("Article page", "the article loads", loaded);
await sleep(1000);
await p.evaluate(() => [...document.querySelectorAll("button")].find((x) => /^reject$/i.test(x.innerText.trim()))?.click());
const page = await p.evaluate(() => {
  const h2 = [...document.querySelectorAll("h2")];
  const para = [...document.querySelectorAll("p")].find((x) => x.innerText.includes("She began painting"));
  const px = (e) => (e ? parseFloat(getComputedStyle(e).fontSize) : 0);
  return {
    headings: h2.map((h) => h.innerText),
    headingSize: px(h2[0]), paraSize: px(para),
    headingWeight: h2[0] ? getComputedStyle(h2[0]).fontWeight : "",
    hashes: document.body.innerText.includes("##"),
    order: [...document.querySelectorAll("h2, p")].map((e) => e.innerText).filter((t) => /Opening paragraph|Early years|She began|Recent work|Her new series/.test(t)),
  };
});
await p.evaluate(() => document.querySelector("h2")?.scrollIntoView({ block: "center" }));
R.ok("Article page", "both headings show as headings", page.headings.join("|") === "Early years|Recent work", page.headings.join("|"), await shot("2-article-page.png"));
R.ok("Article page", "no '##' visible anywhere", !page.hashes);
R.ok("Article page", "headings are larger than the body text", page.headingSize > page.paraSize, `${page.headingSize}px vs ${page.paraSize}px`);
R.ok("Article page", "headings are bold", Number(page.headingWeight) >= 600, page.headingWeight);
R.ok("Article page", "everything in the order it was written",
  page.order.join(" / ") === "Opening paragraph about the artist. / Early years / She began painting in 1990. / Recent work / Her new series opens in March.", page.order.join(" / "));

// 5. an existing article on TEST still looks the same (no headings appear)
const old = (await db("article?select=slug,body&published=eq.true&limit=200")).find((a) => !/^##/m.test(a.body || "") && (a.body || "").split("\n\n").length > 5);
await p.goto(`${BASE}/editorial/${old.slug}`, { waitUntil: "networkidle2" });
await sleep(2500);
const oldHeads = await p.evaluate(() => document.querySelectorAll("article h2, .mt-12 h2").length);
R.ok("Existing articles", "an existing article shows no new headings", oldHeads === 0, old.slug);

// 6. phone
await p.setViewport({ width: 390, height: 844 });
await p.goto(`${BASE}/editorial/${row?.slug || row?.id}`, { waitUntil: "networkidle2" });
await sleep(2000);
const overflow = await p.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
R.ok("Phone", "article with headings fits a phone", overflow <= 1, `${overflow}px`, await shot("3-phone.png"));

R.ok("Whole run", "no page errors in the browser", errs.length === 0, errs.join(" | "));
await b.close();
// Delete what this test published. It used to be left behind on TEST, where
// three "B4 Heading Test" articles then led the Editorial page (2026-10-30).
await fetch(`${TEST}/rest/v1/article?title=like.B4%20Heading%20Test*`, { method: "DELETE", headers: { apikey: SK, Authorization: `Bearer ${SK}` } });
R.ok("Clean-up", "TEST: the test article is deleted", (await db("article?select=id&title=like.B4%20Heading%20Test*")).length === 0);
const { passed, total } = R.write({ heading: "Browser test on the TEST project", note: `Wrote and published "${TITLE}" in the real editor.` });
console.table(R.results.map((r) => ({ area: r.area, check: r.check.slice(0, 60), pass: r.pass ? "PASS" : "FAIL", detail: r.detail.slice(0, 50) })));
console.log(`${passed}/${total} passed — report: reports/B4-article-headings.html`);
process.exit(passed === total ? 0 : 1);
