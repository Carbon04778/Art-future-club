/**
 * C12 / B8 on the LIVE site, read-only: the admin opens Import CSV, downloads
 * the template, uploads a small file built from real listings and sees the
 * preview — then cancels. Import is never pressed; the number of listings
 * is compared before and after to prove nothing was saved. (Saving, drafts,
 * map pins and Undo were tested on TEST: scripts/ui-test-csv-import.mjs.)
 *
 *   node scripts/ui-test-csv-import-live.mjs [site]   (default https://www.artfutureclub.com)
 * Report: reports/C12-csv-import-live.html
 */
import puppeteer from "puppeteer-core";
import { readFileSync, writeFileSync, mkdirSync, existsSync, rmSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { createReport } from "./lib/report.mjs";

const ROOT = fileURLToPath(new URL("..", import.meta.url));
const E = Object.fromEntries(readFileSync(join(ROOT, ".env"), "utf8").split(/\r?\n/).filter((l) => /^[A-Z_]+=/.test(l)).map((l) => [l.slice(0, l.indexOf("=")), l.slice(l.indexOf("=") + 1).trim()]));
const SITE = process.argv[2] || "https://www.artfutureclub.com";
const U = E.VITE_SUPABASE_URL;
const SH = { apikey: E.SUPABASE_SERVICE_ROLE_KEY, Authorization: `Bearer ${E.SUPABASE_SERVICE_ROLE_KEY}` };
const read = async (q) => (await fetch(`${U}/rest/v1/${q}`, { headers: SH })).json();
const count = async () => Number((await fetch(`${U}/rest/v1/collector_profile?select=id`, { headers: { ...SH, Prefer: "count=exact", Range: "0-0" } })).headers.get("content-range")?.split("/")[1]);
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const q = (s) => `"${String(s).replace(/"/g, '""')}"`;

const R = createReport("C12-csv-import-live", "C12 — CSV import on the live site", `Real Chrome, ${SITE}, admin signed in. READ-ONLY: Import is never pressed.`);
const SHOTS = R.shotPath("");
mkdirSync(SHOTS, { recursive: true });
rmSync(join(SHOTS, "afc-listings-template.csv"), { force: true });

const before = await count();
const [free] = await read("collector_profile?select=id,display_name,based_in&user_id=is.null&type=eq.Gallery&based_in=eq.Hong%20Kong&order=created_date.asc&limit=1");
const [owned] = await read("collector_profile?select=id,display_name,based_in&user_id=not.is.null&type=eq.Gallery&limit=1");
const oldest = (await read("collector_profile?select=id,display_name,based_in&order=created_date.asc&limit=5"))
  .find((x) => x.id !== free.id && x.id !== owned?.id && x.display_name !== free.display_name && x.display_name !== owned?.display_name);
const pending = (await read("collector_profile?select=id&status=in.(pending,flagged)")).length + (await read("artist_profile?select=id&status=in.(pending,flagged)")).length;
const TAG = `Live preview check ${Date.now()}`;
const csv = [
  "listing_type,name,city,address",
  `Gallery,${TAG},Hong Kong,1 Queen's Road Central`,
  `Gallery,${q(free.display_name)},Hong Kong,`,
  owned ? `Gallery,${q(owned.display_name)},${q(owned.based_in || "Hong Kong")},` : "",
  `Gallery,${q(oldest.display_name)},${q(oldest.based_in || "Hong Kong")},`,
  `Cafe,${TAG} wrong,Hong Kong,`,
].filter(Boolean).join("\r\n");
const csvPath = join(SHOTS, "preview.csv");
writeFileSync(csvPath, "\ufeff" + csv);

const b = await puppeteer.launch({ executablePath: "C:/Program Files/Google/Chrome/Application/chrome.exe", headless: true });
const ctx = await b.createBrowserContext();
const bcdp = await b.target().createCDPSession();
await bcdp.send("Browser.setDownloadBehavior", { behavior: "allow", downloadPath: SHOTS, browserContextId: ctx.id });
const p = await ctx.newPage();
await p.setViewport({ width: 1366, height: 900 });
const errs = []; p.on("pageerror", (e) => errs.push(e.message));
let dialogs = 0; p.on("dialog", (d) => { dialogs++; d.dismiss(); }); // never confirm anything
const go = async (path) => { await p.goto(`${SITE}${path}`, { waitUntil: "networkidle2", timeout: 120000 }); await sleep(2000); await p.evaluate(() => [...document.querySelectorAll("button")].find((x) => /^reject$/i.test(x.innerText.trim()))?.click()); };
const tab = async (n) => { await p.evaluate((t) => [...document.querySelectorAll("button")].find((x) => x.textContent.trim() === t)?.click(), n); await sleep(1500); };
const text = (sel) => p.evaluate((s) => document.querySelector(s)?.textContent || "", sel);

try {
  // public pages first, as a visitor
  for (const path of ["/", "/gallery", "/venues", "/events"]) {
    await go(path);
    R.ok("Visitors", `${path} loads`, (await p.evaluate(() => document.body.textContent.length)) > 500);
  }
  await go("/login");
  await p.type('input[type="email"]', E.AFC_ADMIN_EMAIL);
  await p.type('input[type="password"]', E.AFC_ADMIN_PASSWORD);
  await Promise.all([p.waitForNavigation({ waitUntil: "networkidle2", timeout: 90000 }).catch(() => {}), p.click('button[type="submit"]')]);
  await go("/admin");
  await p.waitForFunction(() => [...document.querySelectorAll("button")].some((x) => x.textContent.trim() === "Import CSV"), { timeout: 60000 }).catch(() => {});
  R.ok("Admin", "the live admin page has the 'Import CSV' tab", await p.evaluate(() => [...document.querySelectorAll("button")].some((x) => x.textContent.trim() === "Import CSV")));

  // Approvals still lists every profile waiting (now read page by page)
  await p.waitForFunction(() => !/Loading/i.test(document.body.textContent), { timeout: 30000 }).catch(() => {});
  await sleep(1500);
  await p.screenshot({ path: R.shotPath("1-approvals.png") });
  const queueText = await p.evaluate(() => document.body.textContent);
  R.ok("Approvals", `Approvals opens with no errors (database: ${pending} profile${pending === 1 ? "" : "s"} waiting)`, queueText.length > 500 && errs.length === 0, errs[0] || "", "1-approvals.png");

  await tab("Import CSV");
  R.ok("Import", "the import screen opens", !!(await p.$('[data-testid="import-panel"]')));
  await p.click('[data-testid="import-template"]');
  let tpl = "";
  for (let i = 0; i < 20 && !tpl; i++) { await sleep(500); const f = join(SHOTS, "afc-listings-template.csv"); if (existsSync(f)) tpl = readFileSync(f, "utf8"); }
  R.ok("Import", "the template downloads from the live site", tpl.charCodeAt(0) === 0xfeff && /^\ufefflisting_type,name,city,country,address,description,website,contact_email,phone,opening_hours/.test(tpl), tpl.slice(1, 60));

  await (await p.$('[data-testid="import-file"]')).uploadFile(csvPath);
  await p.waitForSelector('[data-testid="import-preview"]', { timeout: 90000 });
  await sleep(800);
  const c = await p.evaluate(() => ["ready", "duplicate", "problem"].map((k) => document.querySelector(`[data-testid="count-${k}"]`).textContent));
  const dupes = owned ? 3 : 2;
  R.ok("Preview", `against the real ${before} listings: 1 ready, ${dupes} already on the site, 1 problem`, c[0].endsWith(" 1") && c[1].endsWith(` ${dupes}`) && c[2].endsWith(" 1"), c.join(" · "));
  const row = (l) => p.evaluate((x) => document.querySelector(`[data-testid="import-row"][data-line="${x}"]`)?.textContent || "", l);
  R.ok("Preview", `finds '${free.display_name}' already on the site`, /Already on the site/.test(await row(3)));
  if (owned) R.ok("Preview", `'${owned.display_name}' (owned by a member) cannot be updated`, /Owned by a member/.test(await row(4)));
  R.ok("Preview", `finds the OLDEST listing too ('${oldest.display_name}') — every listing is checked, not the newest 500`, /Already on the site/.test(await row(owned ? 5 : 4)));
  await p.evaluate(() => document.querySelector('[data-testid="import-preview"]').scrollIntoView({ block: "start" }));
  await p.screenshot({ path: R.shotPath("2-preview.png") });
  R.ok("Preview", "screenshot", true, "", "2-preview.png");

  await p.setViewport({ width: 390, height: 844 });
  await sleep(700);
  const over = await p.evaluate(() => document.documentElement.scrollWidth - innerWidth);
  await p.screenshot({ path: R.shotPath("3-preview-phone.png") });
  R.ok("Phone", "the admin page fits a phone (no sideways scroll)", over <= 0, `${over}px`, "3-preview-phone.png");
  await p.setViewport({ width: 1366, height: 900 });
  await sleep(400);

  // cancel — nothing saved
  await p.evaluate(() => [...document.querySelectorAll("button")].find((x) => x.textContent.trim() === "Cancel")?.click());
  await sleep(1000);
  R.ok("Read-only", "Cancel clears the preview", !(await p.$('[data-testid="import-preview"]')));
} catch (err) {
  R.ok("Whole run", "test ran to the end", false, String(err?.message || err).slice(0, 200));
} finally {
  const after = await count();
  const mine = await read(`collector_profile?select=id&display_name=like.${encodeURIComponent("Live preview check")}*`);
  R.ok("Read-only", "nothing was saved: same number of listings before and after, no test listing", after === before && mine.length === 0 && dialogs === 0, `${before} → ${after}`);
}
R.ok("Whole run", "no page errors", errs.length === 0, errs.join(" | ").slice(0, 300));
await b.close();
const { passed, total } = R.write({ heading: "Live site (read-only)" });
console.table(R.results.map((r) => ({ area: r.area, check: r.check.slice(0, 72), pass: r.pass ? "PASS" : "FAIL", detail: r.detail.slice(0, 40) })));
console.log(`${passed}/${total} passed — report: reports/C12-csv-import-live.html`);
process.exit(passed === total ? 0 : 1);
