/**
 * Open Calls own pages and Edit on the LIVE site, READ-ONLY.
 * Visitors open every real call's page; the admin sees Edit, opens the form
 * (filled in) and CANCELS. Nothing is saved: every call's updated_date is
 * compared before and after. (Saving, posting and deleting were tested on
 * TEST: scripts/ui-test-open-call-edit.mjs.)
 *
 *   node scripts/ui-test-open-call-edit-live.mjs [site]   (default https://www.artfutureclub.com)
 * Report: reports/open-call-edit-live.html
 */
import puppeteer from "puppeteer-core";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { createReport } from "./lib/report.mjs";

const ROOT = fileURLToPath(new URL("..", import.meta.url));
const E = Object.fromEntries(readFileSync(join(ROOT, ".env"), "utf8").split(/\r?\n/).filter((l) => /^[A-Z_]+=/.test(l)).map((l) => [l.slice(0, l.indexOf("=")), l.slice(l.indexOf("=") + 1).trim()]));
const SITE = process.argv[2] || "https://www.artfutureclub.com";
const U = E.VITE_SUPABASE_URL;
const SH = { apikey: E.SUPABASE_SERVICE_ROLE_KEY, Authorization: `Bearer ${E.SUPABASE_SERVICE_ROLE_KEY}` };
const snapshot = async () => (await fetch(`${U}/rest/v1/open_call?select=id,slug,title,updated_date&order=id`, { headers: SH })).json();
// Readable links since 032/033; an id when a call has none.
const pathOf = (c) => `/open-calls/${c.slug || c.id}`;
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const before = await snapshot();
if (!Array.isArray(before)) throw new Error(`Could not read open calls: ${JSON.stringify(before)}`);
const R = createReport("open-call-edit-live", "Open Calls — own pages and Edit on the live site", `Real Chrome, ${SITE}. READ-ONLY: the edit form is opened and cancelled, never saved.`);

const b = await puppeteer.launch({ executablePath: "C:/Program Files/Google/Chrome/Application/chrome.exe", headless: true });
const errs = [];
const newPage = async (w = 1366) => {
  const p = await (await b.createBrowserContext()).newPage();
  p.on("pageerror", (e) => errs.push(e.message));
  p.on("dialog", (d) => d.dismiss()); // never confirm anything on live
  await p.setViewport({ width: w, height: w < 600 ? 844 : 900 });
  return p;
};
const go = async (p, path) => {
  await p.goto(`${SITE}${path}`, { waitUntil: "networkidle2", timeout: 120000 });
  await p.evaluate(() => [...document.querySelectorAll("button")].find((x) => /^reject$/i.test(x.innerText.trim()))?.click());
  await sleep(300);
};
const waitFor = (p, sel, ms = 45000) => p.waitForSelector(sel, { timeout: ms }).then(() => true).catch(() => false);

try {
  for (const [w, tag] of [[1366, "desktop"], [390, "phone"]]) {
    const p = await newPage(w);
    await go(p, "/open-calls");
    await p.waitForFunction((n) => document.querySelectorAll('[data-testid="open-call-link"]').length >= n, { timeout: 45000 }, before.length).catch(() => {});
    const hrefs = await p.$$eval('[data-testid="open-call-link"]', (as) => as.map((a) => a.getAttribute("href")));
    R.ok(`Visitor (${tag})`, `all ${before.length} calls link to their own page by a readable link`, before.every((c) => c.slug && hrefs.includes(pathOf(c))) && hrefs.every((h) => !/[0-9a-f]{8}-[0-9a-f]{4}-/.test(h)), hrefs.join(" "));
    R.ok(`Visitor (${tag})`, "no Edit buttons for a visitor", !(await p.$('[data-testid="open-call-edit"]')));
    R.ok(`Visitor (${tag})`, "the list fits the screen", (await p.evaluate(() => document.documentElement.scrollWidth - innerWidth)) <= 0);
    let opened = 0, fit = true;
    for (const c of before) {
      await go(p, pathOf(c));
      if (await waitFor(p, '[data-testid="open-call-title"]')) {
        if ((await p.$eval('[data-testid="open-call-title"]', (el) => el.textContent)) === c.title) opened++;
        if ((await p.evaluate(() => document.documentElement.scrollWidth - innerWidth)) > 0) fit = false;
      }
    }
    R.ok(`Visitor (${tag})`, `every call's own page opens with its title (${before.length})`, opened === before.length, `${opened} of ${before.length}`);
    R.ok(`Visitor (${tag})`, "every call's page fits the screen", fit);
    R.ok(`Visitor (${tag})`, "a visitor sees no Edit/Delete on the page", !(await p.$('[data-testid="open-call-owner-tools"]')));
    await p.screenshot({ path: R.shotPath(`call-page-${tag}.png`), fullPage: true });
    R.ok(`Visitor (${tag})`, "screenshot of a call's page", true, "", `call-page-${tag}.png`);
    if (tag === "desktop") {
      const old = before[0];
      await go(p, `/open-calls/${old.id}`);
      await waitFor(p, '[data-testid="open-call-title"]');
      R.ok("Visitor (desktop)", "an old id link still opens the call and becomes the readable link", (await p.evaluate(() => location.pathname)) === pathOf(old), await p.evaluate(() => location.pathname));
      await go(p, "/open-calls/not-a-real-link");
      R.ok("Visitor (desktop)", "a wrong link says 'Open call not found'", await waitFor(p, '[data-testid="open-call-missing"]'));
    }
  }

  // admin: sees Edit, opens it, cancels
  const p = await newPage();
  await go(p, "/login");
  await p.type('input[type="email"]', E.AFC_ADMIN_EMAIL);
  await p.type('input[type="password"]', E.AFC_ADMIN_PASSWORD);
  await Promise.all([p.waitForNavigation({ waitUntil: "networkidle2", timeout: 90000 }).catch(() => {}), p.click('button[type="submit"]')]);
  const first = before[0];
  if (first) {
    await go(p, pathOf(first));
    R.ok("Admin — call page", "the admin sees Edit and Delete", await waitFor(p, '[data-testid="open-call-owner-tools"]'));
    await p.click('[data-testid="open-call-owner-tools"] [data-testid="open-call-edit"]');
    await waitFor(p, '[data-testid="open-call-form"]', 10000);
    const val = await p.$eval('[data-testid="open-call-form"] [name="title"]', (el) => el.value).catch(() => "");
    R.ok("Admin — call page", "Edit opens the form filled in with the call", val === first.title, val);
    await p.screenshot({ path: R.shotPath("admin-edit-form.png") });
    R.ok("Admin — call page", "screenshot of the edit form", true, "", "admin-edit-form.png");
    await p.evaluate(() => [...document.querySelectorAll('[data-testid="open-call-form"] button')].find((x) => x.textContent.trim() === "Cancel").click());
    await sleep(300);
    R.ok("Admin — call page", "Cancel closes it without saving", !(await p.$('[data-testid="open-call-form"]')));
  }
  await go(p, "/open-calls");
  await p.waitForFunction(() => document.querySelectorAll('[data-testid="open-call-card"]').length > 0, { timeout: 45000 }).catch(() => {});
  R.ok("Admin — list", "the admin sees Edit on every card", (await p.$$('[data-testid="open-call-edit"]')).length === before.length, `${(await p.$$('[data-testid="open-call-edit"]')).length} of ${before.length}`);
  await go(p, "/admin");
  await p.waitForFunction(() => [...document.querySelectorAll("button")].some((x) => x.textContent.trim() === "Open Calls"), { timeout: 60000 });
  await p.evaluate(() => [...document.querySelectorAll("button")].find((x) => x.textContent.trim() === "Open Calls").click());
  await waitFor(p, '[data-testid="admin-open-calls"]');
  const rows = await p.$$('[data-testid="admin-open-call-row"]');
  R.ok("Admin tab", `all ${before.length} calls listed with View, Edit and Delete`, rows.length === before.length && (await p.$$eval('[data-testid="admin-open-call-row"]', (rs) => rs.every((r) => /View/.test(r.textContent) && /Edit/.test(r.textContent) && /Delete/.test(r.textContent)))), `${rows.length} rows`);
  R.ok("Admin tab", "'New open call' button is there", !!(await p.$('[data-testid="admin-open-call-new"]')));
  await p.click('[data-testid="admin-open-call-edit"]');
  R.ok("Admin tab", "Edit opens the form", await waitFor(p, '[data-testid="open-call-form"]', 10000));
  await p.screenshot({ path: R.shotPath("admin-tab-edit.png") });
  R.ok("Admin tab", "screenshot", true, "", "admin-tab-edit.png");
  await p.evaluate(() => [...document.querySelectorAll('[data-testid="open-call-form"] button')].find((x) => x.textContent.trim() === "Cancel").click());
  R.ok("Whole run", "no page errors", errs.length === 0, errs.join(" | ").slice(0, 200));
} finally {
  await b.close();
}
const after = await snapshot();
R.ok("Read-only", "nothing was saved: same calls, same titles, same last-changed times", JSON.stringify(after) === JSON.stringify(before), `${before.length} → ${after.length}`);

const { passed, total } = R.write({ heading: "Live site" });
console.table(R.results.map((r) => ({ area: r.area, check: r.check.slice(0, 70), pass: r.pass ? "PASS" : "FAIL", detail: String(r.detail || "").slice(0, 40) })));
console.log(`${passed}/${total} passed — report: reports/open-call-edit-live.html`);
process.exit(passed === total ? 0 : 1);
