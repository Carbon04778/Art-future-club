/**
 * Open Calls: every call has its own page, and can be edited — from that page
 * and from Admin → Open Calls. Real Chrome, real admin sign-in.
 *
 * TEST ONLY (dev server on :5198 pointed at the TEST project). It refuses
 * any other database. Creates its own open call, edits it, posts one from the
 * admin tab, deletes through the page, and removes anything left at the end.
 *
 *   node scripts/ui-test-open-call-edit.mjs [site]   (default http://localhost:5198)
 * Report: reports/open-call-edit.html
 */
import puppeteer from "puppeteer-core";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { createReport } from "./lib/report.mjs";

const ROOT = fileURLToPath(new URL("..", import.meta.url));
const E = Object.fromEntries(readFileSync(join(ROOT, ".env"), "utf8").split(/\r?\n/).filter((l) => /^[A-Z_]+=/.test(l)).map((l) => [l.slice(0, l.indexOf("=")), l.slice(l.indexOf("=") + 1).trim()]));
const SITE = process.argv[2] || "http://localhost:5198";
if (SITE.startsWith("https://")) throw new Error("This test writes open calls. TEST only — never the live site.");
const U = E.COPY_SUPABASE_URL.replace(/\/+$/, "");
if (!U.includes("jbcexmconizdqxnfyjba")) throw new Error("COPY_SUPABASE_URL is not the TEST project");
const SK = E.COPY_SUPABASE_SERVICE_ROLE_KEY;
const SH = { apikey: SK, Authorization: `Bearer ${SK}`, "Content-Type": "application/json", Prefer: "return=representation" };
const rest = async (q, opts = {}) => { const r = await fetch(`${U}/rest/v1/${q}`, { headers: SH, ...opts }); const t = await r.text(); if (!r.ok) throw new Error(`${r.status} ${t}`); return t ? JSON.parse(t) : null; };
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const html = await (await fetch(SITE)).text().catch(() => "");
if (!html) throw new Error(`Nothing at ${SITE} — start the TEST dev server first.`);

const TAG = `OC edit check ${Date.now()}`;
const R = createReport("open-call-edit", "Open Calls — own page and editing", "Real Chrome, real admin sign-in, TEST project. Everything the test creates is deleted at the end.");
const future = new Date(Date.now() + 20 * 864e5).toISOString().slice(0, 10);
const later = new Date(Date.now() + 40 * 864e5).toISOString().slice(0, 10);
const [made] = await rest("open_call", { method: "POST", body: JSON.stringify({
  title: `${TAG} Residency`, organizer: "Test Studio", type: "Residency", location: "Hong Kong", deadline: future,
  description: "First paragraph of the call.\n\nSecond paragraph, after a blank line.\nThird line — with a dash.",
  external_link: "https://example.com/apply", is_free: true, prize: "HK$10,000",
}) });

// After migration 032 a call has a readable slug, and that is its address.
const hasSlugs = !!made.slug;
const callPath = `/open-calls/${made.slug || made.id}`;
if (hasSlugs) R.ok("Readable link", "a new call gets a readable slug from its title", /^oc-edit-check-\d+-residency$/.test(made.slug), made.slug);

const b = await puppeteer.launch({ executablePath: "C:/Program Files/Google/Chrome/Application/chrome.exe", headless: true });
const errs = [];
const newPage = async (w = 1366) => {
  const p = await (await b.createBrowserContext()).newPage();
  p.on("pageerror", (e) => errs.push(e.message));
  p.on("dialog", (d) => d.accept());
  await p.setViewport({ width: w, height: w < 600 ? 844 : 900 });
  return p;
};
const go = async (p, path) => {
  await p.goto(`${SITE}${path}`, { waitUntil: "networkidle2", timeout: 120000 });
  await p.evaluate(() => [...document.querySelectorAll("button")].find((x) => /^reject$/i.test(x.innerText.trim()))?.click());
  await sleep(400);
};
const waitText = (p, re, ms = 30000) => p.waitForFunction((s) => new RegExp(s, "i").test(document.body.innerText), { timeout: ms }, re.source).then(() => true).catch(() => false);
const text = (p) => p.evaluate(() => document.body.innerText);
const fillForm = async (p, values) => {
  for (const [name, v] of Object.entries(values)) {
    const sel = `[data-testid="open-call-form"] [name="${name}"]`;
    await p.$eval(sel, (el) => { el.focus(); el.select?.(); });
    await p.evaluate((s) => { const el = document.querySelector(s); const proto = el.tagName === "TEXTAREA" ? HTMLTextAreaElement.prototype : HTMLInputElement.prototype; Object.getOwnPropertyDescriptor(proto, "value").set.call(el, ""); el.dispatchEvent(new Event("input", { bubbles: true })); }, sel);
    await p.type(sel, v);
  }
};

try {
  // ---------------------------------------------------------------- visitor
  {
    const p = await newPage();
    await go(p, "/open-calls");
    await waitText(p, new RegExp(TAG));
    const href = await p.evaluate((t) => [...document.querySelectorAll('[data-testid="open-call-link"]')].find((a) => a.textContent.includes(t))?.getAttribute("href"), TAG);
    R.ok("Visitor", `the list links the call to its own page (${hasSlugs ? "readable slug" : "id — 032 not run here"})`, href === callPath, href || "no link");
    R.ok("Visitor", "the card has 'View full details'", /view full details/i.test(await text(p)));
    R.ok("Visitor", "a visitor sees no Edit button", !(await p.$('[data-testid="open-call-edit"]')));
    await Promise.all([p.waitForFunction((cp) => location.pathname === cp, { timeout: 20000 }, callPath).catch(() => {}), p.evaluate((t) => [...document.querySelectorAll('[data-testid="open-call-link"]')].find((a) => a.textContent.includes(t)).click(), TAG)]);
    await waitText(p, /second paragraph/);
    const desc = await p.$eval('[data-testid="open-call-description"]', (el) => el.innerText).catch(() => "");
    R.ok("Own page", `clicking the title opens ${callPath}`, await p.evaluate((cp) => location.pathname === cp, callPath));
    if (hasSlugs) {
      await go(p, `/open-calls/${made.id}`);
      await waitText(p, /second paragraph/);
      R.ok("Readable link", "an old id link still opens the call, and the address becomes the readable one", await p.evaluate((cp) => location.pathname === cp, callPath), await p.evaluate(() => location.pathname));
    }
    R.ok("Own page", "shows the full description with its line breaks", /First paragraph of the call\.\n\nSecond paragraph, after a blank line\.\nThird line/.test(desc), JSON.stringify(desc.slice(0, 80)));
    // innerText is upper-cased by the mono-caps labels, so compare ignoring case.
    const t = (await text(p)).toLowerCase();
    const want = ["Test Studio", "Hong Kong", "HK$10,000", "Deadline", "Free to apply"];
    R.ok("Own page", "shows organiser, location, prize, deadline and 'Free to apply'", want.every((s) => t.includes(s.toLowerCase())), want.filter((s) => !t.includes(s.toLowerCase())).join(", "));
    R.ok("Own page", "the Apply button goes to the real link", (await p.$eval('[data-testid="open-call-apply"]', (a) => a.href).catch(() => "")) === "https://example.com/apply");
    R.ok("Own page", "a visitor sees no Edit/Delete", !(await p.$('[data-testid="open-call-owner-tools"]')));
    R.ok("Own page", "the tab title is the call's title", (await p.title()).startsWith(`${TAG} Residency`));
    await p.screenshot({ path: R.shotPath("own-page-desktop.png"), fullPage: true });
    R.ok("Own page", "screenshot (desktop)", true, "", "own-page-desktop.png");
    await p.setViewport({ width: 390, height: 844 }); await sleep(600);
    R.ok("Own page", "fits a phone (no sideways scroll)", (await p.evaluate(() => document.documentElement.scrollWidth - innerWidth)) <= 0);
    await p.screenshot({ path: R.shotPath("own-page-phone.png"), fullPage: true });
    R.ok("Own page", "screenshot (phone)", true, "", "own-page-phone.png");
    await go(p, "/open-calls/00000000-0000-0000-0000-000000000000");
    R.ok("Own page", "an unknown call says 'not found'", await waitText(p, /open call not found/));
    await go(p, "/open-calls/not-a-real-link");
    R.ok("Own page", "a mistyped link says 'not found' (not 'couldn't load')", await waitText(p, /open call not found/));
  }

  // ---------------------------------------------------------------- admin
  const p = await newPage();
  await go(p, "/login");
  await p.type('input[type="email"]', E.AFC_ADMIN_EMAIL);
  await p.type('input[type="password"]', E.AFC_ADMIN_PASSWORD);
  await Promise.all([p.waitForNavigation({ waitUntil: "networkidle2", timeout: 90000 }).catch(() => {}), p.click('button[type="submit"]')]);

  // edit from the call's own page
  await go(p, `/open-calls/${made.id}`);
  await p.waitForSelector('[data-testid="open-call-owner-tools"]', { timeout: 30000 }).catch(() => {});
  R.ok("Admin — own page", "the admin sees Edit and Delete", !!(await p.$('[data-testid="open-call-owner-tools"]')));
  await p.click('[data-testid="open-call-owner-tools"] [data-testid="open-call-edit"]');
  await p.waitForSelector('[data-testid="open-call-form"]');
  const filled = await p.$eval('[data-testid="open-call-form"] [name="title"]', (el) => el.value);
  R.ok("Admin — own page", "Edit opens the form filled in", filled === `${TAG} Residency`, filled);
  await fillForm(p, { title: `${TAG} Residency (edited)`, description: "New text.\nSecond line." });
  await p.$eval('[data-testid="open-call-form"] [name="deadline"]', (el, v) => { Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value").set.call(el, v); el.dispatchEvent(new Event("input", { bubbles: true })); el.dispatchEvent(new Event("change", { bubbles: true })); }, later);
  await p.click('[data-testid="open-call-save"]');
  await p.waitForFunction(() => !document.querySelector('[data-testid="open-call-form"]'), { timeout: 30000 }).catch(() => {});
  await sleep(500);
  let [row] = await rest(`open_call?id=eq.${made.id}&select=*`);
  R.ok("Admin — own page", "Save writes the new title, text and deadline to the database", row.title === `${TAG} Residency (edited)` && row.description === "New text.\nSecond line." && row.deadline === later, `${row.title} | ${row.deadline}`);
  R.ok("Admin — own page", "the rest of the call is unchanged (organiser, link, prize)", row.organizer === "Test Studio" && row.external_link === "https://example.com/apply" && row.prize === "HK$10,000");
  if (hasSlugs) R.ok("Readable link", "renaming the call keeps its link, so shared links never break", row.slug === made.slug, row.slug);
  R.ok("Admin — own page", "the page shows the new title straight away", (await p.$eval('[data-testid="open-call-title"]', (el) => el.textContent).catch(() => "")) === `${TAG} Residency (edited)`);
  await p.screenshot({ path: R.shotPath("admin-after-edit.png") });
  R.ok("Admin — own page", "screenshot after saving", true, "", "admin-after-edit.png");

  // edit from Admin → Open Calls
  await go(p, "/admin");
  await p.waitForFunction(() => [...document.querySelectorAll("button")].some((x) => x.textContent.trim() === "Open Calls"), { timeout: 60000 });
  await p.evaluate(() => [...document.querySelectorAll("button")].find((x) => x.textContent.trim() === "Open Calls").click());
  await p.waitForSelector('[data-testid="admin-open-calls"]', { timeout: 30000 });
  const rowSel = async () => p.evaluateHandle((t) => [...document.querySelectorAll('[data-testid="admin-open-call-row"]')].find((r) => r.textContent.includes(t)), TAG);
  let adminRow = await rowSel();
  R.ok("Admin tab", "the call is listed with View, Edit and Delete", await adminRow.evaluate((r) => !!r && /View/.test(r.textContent) && /Edit/.test(r.textContent) && /Delete/.test(r.textContent)).catch(() => false));
  R.ok("Admin tab", "View links to the call's own page", await adminRow.evaluate((r, cp) => [...r.querySelectorAll("a")].some((a) => a.getAttribute("href") === cp), callPath));
  await adminRow.evaluate((r) => r.querySelector('[data-testid="admin-open-call-edit"]').click());
  await p.waitForSelector('[data-testid="open-call-form"]');
  await fillForm(p, { prize: "HK$25,000 + studio", location: "Kowloon" });
  await p.click('[data-testid="open-call-save"]');
  await p.waitForFunction(() => !document.querySelector('[data-testid="open-call-form"]'), { timeout: 30000 }).catch(() => {});
  [row] = await rest(`open_call?id=eq.${made.id}&select=*`);
  R.ok("Admin tab", "Edit from the admin tab saves (prize, location)", row.prize === "HK$25,000 + studio" && row.location === "Kowloon", `${row.prize} | ${row.location}`);
  R.ok("Admin tab", "…and keeps the earlier edit", row.title === `${TAG} Residency (edited)`);
  await p.screenshot({ path: R.shotPath("admin-tab.png") });
  R.ok("Admin tab", "screenshot", true, "", "admin-tab.png");

  // post a new one from the admin tab
  await p.click('[data-testid="admin-open-call-new"]');
  await p.waitForSelector('[data-testid="open-call-form"]');
  await fillForm(p, { title: `${TAG} New Grant`, organizer: "Admin Org" });
  await p.click('[data-testid="open-call-save"]');
  await p.waitForFunction(() => !document.querySelector('[data-testid="open-call-form"]'), { timeout: 30000 }).catch(() => {});
  const [fresh] = await rest(`open_call?title=eq.${encodeURIComponent(`${TAG} New Grant`)}&select=*`);
  R.ok("Admin tab", "'New open call' posts one", !!fresh && fresh.organizer === "Admin Org");
  R.ok("Admin tab", "…and it appears in the admin list", await waitText(p, new RegExp(`${TAG} New Grant`), 10000));

  // delete through the call's own page
  if (fresh) {
    await go(p, `/open-calls/${fresh.id}`);
    await p.waitForSelector('[data-testid="open-call-owner-tools"]', { timeout: 30000 });
    await Promise.all([p.waitForFunction(() => location.pathname === "/open-calls", { timeout: 30000 }).catch(() => {}), p.evaluate(() => [...document.querySelectorAll('[data-testid="open-call-owner-tools"] button')].find((x) => /delete/i.test(x.textContent)).click())]);
    const gone = await rest(`open_call?id=eq.${fresh.id}&select=id`);
    R.ok("Admin — own page", "Delete (after the confirm) removes it and goes back to the list", gone.length === 0 && (await p.evaluate(() => location.pathname)) === "/open-calls");
  }

  // the visitor sees the edits
  const v = await newPage(390);
  await go(v, `/open-calls/${made.id}`);
  await waitText(v, /Residency \(edited\)/);
  const vt = await text(v);
  R.ok("Visitor", "a visitor sees the edited call on its page (phone)", vt.includes(`${TAG} Residency (edited)`) && vt.includes("HK$25,000 + studio") && vt.includes("Kowloon"));
  R.ok("Whole run", "no page errors", errs.length === 0, errs.join(" | ").slice(0, 200));
} finally {
  await b.close();
  const left = await rest(`open_call?title=like.${encodeURIComponent(`${TAG}*`)}&select=id`);
  for (const r of left) await rest(`open_call?id=eq.${r.id}`, { method: "DELETE" });
  const after = await rest(`open_call?title=like.${encodeURIComponent(`${TAG}*`)}&select=id`);
  R.ok("Clean-up", "everything the test created was deleted from TEST", after.length === 0, `${left.length} removed`);
}

const { passed, total } = R.write({ heading: "TEST project" });
console.table(R.results.map((r) => ({ area: r.area, check: r.check.slice(0, 70), pass: r.pass ? "PASS" : "FAIL", detail: String(r.detail || "").slice(0, 40) })));
console.log(`${passed}/${total} passed — report: reports/open-call-edit.html`);
process.exit(passed === total ? 0 : 1);
