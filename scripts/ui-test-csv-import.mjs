/**
 * C12 / B8 — Admin → Import CSV, in real Chrome with a real admin sign-in.
 *
 * TEST ONLY (dev server on :5198 pointed at the TEST project). It refuses
 * any other database. Uploads a real CSV: two new listings (one with
 * coordinates, one whose map pin is looked up), a row with a problem, an
 * existing unclaimed listing to update, and a member-owned listing that must
 * not change. Checks the database after each step, that visitors cannot see
 * the drafts, that they wait in Approvals, then presses Undo. Anything left
 * over is deleted and the updated listing put back at the end.
 *
 *   node scripts/ui-test-csv-import.mjs [site]   (default http://localhost:5198)
 * Report: reports/C12-csv-import.html
 */
import puppeteer from "puppeteer-core";
import { readFileSync, writeFileSync, mkdirSync, readdirSync, existsSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { createReport } from "./lib/report.mjs";

const ROOT = fileURLToPath(new URL("..", import.meta.url));
const E = Object.fromEntries(readFileSync(join(ROOT, ".env"), "utf8").split(/\r?\n/).filter((l) => /^[A-Z_]+=/.test(l)).map((l) => [l.slice(0, l.indexOf("=")), l.slice(l.indexOf("=") + 1).trim()]));
const SITE = process.argv[2] || "http://localhost:5198";
if (SITE.startsWith("https://")) throw new Error("This test writes listings. TEST only — never the live site.");
const U = E.COPY_SUPABASE_URL.replace(/\/+$/, "");
if (!U.includes("jbcexmconizdqxnfyjba")) throw new Error("COPY_SUPABASE_URL is not the TEST project");
const SK = E.COPY_SUPABASE_SERVICE_ROLE_KEY, AK = E.COPY_SUPABASE_ANON_KEY;
const SH = { apikey: SK, Authorization: `Bearer ${SK}`, "Content-Type": "application/json" };
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const rest = async (q, opts = {}) => { const r = await fetch(`${U}/rest/v1/${q}`, { headers: SH, ...opts }); const t = await r.text(); return t ? JSON.parse(t) : null; };

// The site must really be on TEST: the page's bundle carries the URL.
const html = await (await fetch(SITE)).text().catch(() => "");
if (!html) throw new Error(`Nothing at ${SITE} — start the TEST dev server first.`);

const TAG = `CSV check ${Date.now()}`;
const R = createReport("C12-csv-import", "C12 — import galleries and venues from a CSV file", "Real Chrome, real admin sign-in, TEST project. Everything the test creates is deleted at the end; the updated listing is put back.");
const SHOTS = R.shotPath("");
mkdirSync(SHOTS, { recursive: true });

// An unclaimed listing to update, and a member-owned one that must not change.
const [free] = await rest("collector_profile?select=id,display_name,based_in,phone,bio,slug&user_id=is.null&type=eq.Gallery&based_in=eq.Hong%20Kong&order=created_date.asc&limit=1");
const [owned] = await rest("collector_profile?select=id,display_name,based_in,phone,bio,updated_date&user_id=not.is.null&type=eq.Gallery&limit=1");
if (!free) throw new Error("TEST has no unclaimed Hong Kong gallery to update");
const freeBefore = { phone: free.phone, bio: free.bio };
const q = (s) => `"${String(s).replace(/"/g, '""')}"`;

const csv = [
  "listing_type,name,city,country,address,description,website,contact_email,phone,opening_hours,latitude,longitude",
  `Gallery,${TAG} Harbour Gallery,Hong Kong,Hong Kong,"G/F, 8 Pottinger Street, Central",A new gallery for the test,www.example.com,Hello@Example.com,+852 0000 0001,Tue–Sat 11:00–19:00,22.2819,114.1555`,
  `Venue,${TAG} Hall,Hong Kong,Hong Kong,"1 Queen's Road Central, Central",A venue whose map pin is looked up,,,,,,`,
  `Cafe,${TAG} Wrong Type,Hong Kong,,,,,,,,,`,
  `Gallery,${q(free.display_name)},Hong Kong,,,,,,+852 9999 0000,,,`,
  owned ? `Gallery,${q(owned.display_name)},${q(owned.based_in || "Hong Kong")},,,Must never be saved,,,,,,` : "",
].filter(Boolean).join("\r\n");
const csvPath = join(SHOTS, "upload.csv");
writeFileSync(csvPath, "\ufeff" + csv);

const b = await puppeteer.launch({ executablePath: "C:/Program Files/Google/Chrome/Application/chrome.exe", headless: true });
const ctx = await b.createBrowserContext();
const p = await ctx.newPage();
await p.setViewport({ width: 1366, height: 900 });
const errs = []; p.on("pageerror", (e) => errs.push(e.message)); p.on("dialog", (d) => d.accept());
// Downloads in a private browser context must be allowed for that context.
const bcdp = await b.target().createCDPSession();
await bcdp.send("Browser.setDownloadBehavior", { behavior: "allow", downloadPath: SHOTS, browserContextId: ctx.id, eventsEnabled: true });
const go = async (path) => { await p.goto(`${SITE}${path}`, { waitUntil: "networkidle2", timeout: 120000 }); await sleep(2000); await p.evaluate(() => [...document.querySelectorAll("button")].find((x) => /^reject$/i.test(x.innerText.trim()))?.click()); };
const tab = async (name) => { await p.evaluate((n) => [...document.querySelectorAll("button")].find((x) => x.textContent.trim() === n)?.click(), name); await sleep(1500); };
const text = (sel) => p.evaluate((s) => document.querySelector(s)?.textContent || "", sel);
const mine = () => rest(`collector_profile?select=*&display_name=like.${encodeURIComponent(TAG)}*`);

try {
  // sign in
  await go("/login");
  await p.type('input[type="email"]', E.AFC_ADMIN_EMAIL);
  await p.type('input[type="password"]', E.AFC_ADMIN_PASSWORD);
  await Promise.all([p.waitForNavigation({ waitUntil: "networkidle2", timeout: 90000 }).catch(() => {}), p.click('button[type="submit"]')]);
  await go("/admin");
  await p.waitForFunction(() => [...document.querySelectorAll("button")].some((x) => x.textContent.trim() === "Import CSV"), { timeout: 60000 });
  await tab("Import CSV");
  R.ok("Admin", "an 'Import CSV' tab opens the import", !!(await p.$('[data-testid="import-panel"]')));

  // template
  await p.click('[data-testid="import-template"]');
  let tpl = "";
  for (let i = 0; i < 20 && !tpl; i++) { await sleep(500); const f = join(SHOTS, "afc-listings-template.csv"); if (existsSync(f)) tpl = readFileSync(f, "utf8"); }
  R.ok("Template", "the template downloads, with the site's fields as headings", /listing_type,name,city,country,address,description,website,contact_email,phone,opening_hours/.test(tpl), tpl.split(/\r?\n/)[0].slice(1, 90));

  // upload → preview
  await (await p.$('[data-testid="import-file"]')).uploadFile(csvPath);
  await p.waitForSelector('[data-testid="import-preview"]', { timeout: 60000 });
  await sleep(500);
  const counts = await p.evaluate(() => ["ready", "duplicate", "problem"].map((k) => document.querySelector(`[data-testid="count-${k}"]`).textContent));
  R.ok("Preview", `shows 2 ready, ${owned ? 2 : 1} already on the site, 1 problem`, counts[0].endsWith(" 2") && counts[1].endsWith(` ${owned ? 2 : 1}`) && counts[2].endsWith(" 1"), counts.join(" · "));
  R.ok("Preview", "nothing is saved before Import is pressed", (await mine()).length === 0);
  R.ok("Preview", "the chosen file stays in the box and is named above the preview", (await p.evaluate(() => document.querySelector('[data-testid="import-file"]').files.length)) === 1 && /Preview of upload\.csv — 5 listings/.test(await text('[data-testid="import-preview"]')));
  const rowText = (line) => p.evaluate((l) => document.querySelector(`[data-testid="import-row"][data-line="${l}"]`)?.textContent || "", line);
  R.ok("Preview", "the problem row says what is wrong (row 4)", /not one the site has/.test(await rowText(4)));
  R.ok("Preview", "'Venue' is explained (saved as Institution)", /saved as Institution/.test(await rowText(3)));
  if (owned) R.ok("Preview", "a member-owned listing cannot be updated", /Owned by a member/.test(await rowText(6)) && !(await p.$('[data-testid="import-row"][data-line="6"] [data-testid="dup-choice"]')));
  await p.select('[data-testid="import-row"][data-line="5"] [data-testid="dup-choice"]', "update");
  await sleep(300);
  R.ok("Preview", "choosing Update counts it on the Import button", /2 new, 1 update/.test(await text('[data-testid="import-run"]')), await text('[data-testid="import-run"]'));
  await p.evaluate(() => document.querySelector('[data-testid="import-preview"]').scrollIntoView({ block: "start" }));
  await p.screenshot({ path: R.shotPath("1-preview.png") });
  R.ok("Preview", "screenshot of the preview", true, "", "1-preview.png");

  // phone width
  await p.setViewport({ width: 390, height: 844 });
  await sleep(600);
  const over = await p.evaluate(() => document.documentElement.scrollWidth - innerWidth);
  await p.screenshot({ path: R.shotPath("2-preview-phone.png") });
  R.ok("Preview", "fits a phone screen (no sideways scroll of the page)", over <= 0, `${over}px`, "2-preview-phone.png");
  const nameW = await p.evaluate(() => document.querySelector('[data-testid="import-row"] td:nth-child(2)')?.getBoundingClientRect().width || 0);
  R.ok("Preview", "on a phone, names stay readable (the table scrolls inside its box)", nameW >= 100, `name column ${Math.round(nameW)}px`);
  const tabsScroll = await p.evaluate(() => { const t = document.querySelector('[data-testid="admin-tabs"]'); return t && t.scrollWidth > t.clientWidth && getComputedStyle(t).overflowX === "auto"; });
  R.ok("Preview", "on a phone the admin tab row scrolls by itself (all 13 tabs reachable)", tabsScroll);
  await p.setViewport({ width: 1366, height: 900 });
  await sleep(400);

  // import
  await p.click('[data-testid="import-run"]');
  await p.waitForSelector('[data-testid="import-summary"]', { timeout: 120000 });
  await sleep(500);
  const sum = await p.evaluate(() => ["created", "updated", "skipped", "failed"].map((k) => document.querySelector(`[data-testid="sum-${k}"]`).textContent));
  await p.screenshot({ path: R.shotPath("3-summary.png") });
  R.ok("Import", `summary: 2 created, 1 updated, ${owned ? 1 : 0} skipped, 1 unsuccessful`, sum.join() === `2,1,${owned ? 1 : 0},1`, sum.join(" / "), "3-summary.png");
  const made = await mine();
  const g = made.find((x) => /Harbour Gallery$/.test(x.display_name));
  const h = made.find((x) => /Hall$/.test(x.display_name));
  R.ok("Database", "2 listings created, nothing for the problem row", made.length === 2 && !made.some((x) => /Wrong Type/.test(x.display_name)), `${made.length}`);
  R.ok("Database", "both are drafts waiting for approval, unclaimed, no claim email", made.every((x) => x.status === "pending" && x.user_id === null && x.claim_email === null));
  R.ok("Database", "fields saved: city, address with country, tidied website, email, phone, hours", g?.based_in === "Hong Kong" && /Pottinger Street, Central, Hong Kong$/.test(g?.address) && g?.website === "https://www.example.com" && g?.email === "hello@example.com" && g?.phone === "+852 0000 0001" && /11:00/.test(g?.opening_hours), `${g?.address} | ${g?.website}`);
  R.ok("Database", "the file's coordinates are the map pin", g?.geo_lat === 22.2819 && g?.geo_lng === 114.1555);
  R.ok("Database", "'Venue' saved as Institution", h?.type === "Institution");
  R.ok("Database", "the venue's map pin was looked up from its address", typeof h?.geo_lat === "number" && Math.abs(h.geo_lat - 22.28) < 0.1, h ? `${h.geo_lat}, ${h.geo_lng} (${h.geo_placename})` : "none");
  const fr = (await rest(`collector_profile?select=phone,bio,display_name,status&id=eq.${free.id}`))[0];
  R.ok("Database", `'${free.display_name}' updated — phone only; name, text and status unchanged`, fr.phone === "+852 9999 0000" && fr.bio === free.bio && fr.display_name === free.display_name, fr.phone);
  if (owned) {
    const ow = (await rest(`collector_profile?select=bio,updated_date&id=eq.${owned.id}`))[0];
    R.ok("Database", "the member-owned listing is untouched", ow.bio === owned.bio && ow.updated_date === owned.updated_date);
  }
  const anon = await (await fetch(`${U}/rest/v1/collector_profile?select=id&display_name=like.${encodeURIComponent(TAG)}*`, { headers: { apikey: AK } })).json();
  R.ok("Visitors", "visitors cannot see the drafts", Array.isArray(anon) && anon.length === 0, JSON.stringify(anon).slice(0, 60));

  // results download
  await p.click('[data-testid="import-results"]');
  let res = "";
  for (let i = 0; i < 20 && !res; i++) { await sleep(500); const f = readdirSync(SHOTS).find((x) => x.startsWith("afc-import-results-")); if (f) res = readFileSync(join(SHOTS, f), "utf8"); }
  R.ok("Import", "the results file lists every row with what happened", /created \(draft, in Approvals\)/.test(res) && /updated/.test(res) && /failed/.test(res), `${res.split(/\r?\n/).length - 2} rows`);

  // Approvals
  await tab("Approvals");
  await p.waitForFunction((t) => document.body.textContent.includes(t), { timeout: 60000 }, TAG).catch(() => {});
  const inQueue = await p.evaluate((t) => (document.body.textContent.match(new RegExp(t, "g")) || []).length, TAG);
  await p.evaluate((t) => [...document.querySelectorAll("*")].find((e) => e.children.length === 0 && e.textContent.includes(t))?.scrollIntoView({ block: "center" }), TAG);
  await p.screenshot({ path: R.shotPath("4-approvals.png") });
  R.ok("Approvals", "both drafts wait in Approvals", inQueue >= 2, `${inQueue} mentions`, "4-approvals.png");

  // Undo — after going to Approvals and back, and a page refresh.
  await go("/admin");
  await p.waitForFunction(() => [...document.querySelectorAll("button")].some((x) => x.textContent.trim() === "Import CSV"), { timeout: 60000 });
  await tab("Import CSV");
  const lastBox = await text('[data-testid="last-import"]');
  await p.screenshot({ path: R.shotPath("5-undo-later.png") });
  R.ok("Undo", "after Approvals and a page refresh, the import can still be undone", /2 created, 1 updated/.test(lastBox), lastBox.slice(0, 80), "5-undo-later.png");
  if (await p.$('[data-testid="last-import-undo"]')) {
    await p.click('[data-testid="last-import-undo"]');
    await p.waitForSelector('[data-testid="import-undone"]', { timeout: 60000 });
    R.ok("Undo", "says what it undid", /2 deleted, 1 put back/.test(await text('[data-testid="import-undone"]')), await text('[data-testid="import-undone"]'));
    R.ok("Undo", "the 2 new listings are gone", (await mine()).length === 0);
    const back = (await rest(`collector_profile?select=phone,bio&id=eq.${free.id}`))[0];
    R.ok("Undo", `'${free.display_name}' is back exactly as it was`, back.phone === freeBefore.phone && back.bio === freeBefore.bio, `${back.phone}`);
    R.ok("Undo", "the Undo box is gone (cannot undo twice)", !(await p.$('[data-testid="last-import-undo"]')));
  }
} catch (err) {
  R.ok("Whole run", "test ran to the end", false, String(err?.message || err).slice(0, 200));
} finally {
  const left = await mine();
  for (const x of left) await rest(`collector_profile?id=eq.${x.id}`, { method: "DELETE" });
  await rest(`collector_profile?id=eq.${free.id}`, { method: "PATCH", body: JSON.stringify(freeBefore) });
  const after = (await rest(`collector_profile?select=phone,bio&id=eq.${free.id}`))[0];
  R.ok("Clean-up", "TEST: nothing left over, updated listing restored", (await mine()).length === 0 && after.phone === freeBefore.phone && after.bio === freeBefore.bio, `${left.length} removed by clean-up`);
}
R.ok("Whole run", "no page errors", errs.length === 0, errs.join(" | ").slice(0, 300));
await b.close();
const { passed, total } = R.write({ heading: "Browser test (v12 code, TEST project, real admin sign-in)" });
console.table(R.results.map((r) => ({ area: r.area, check: r.check.slice(0, 70), pass: r.pass ? "PASS" : "FAIL", detail: r.detail.slice(0, 40) })));
console.log(`${passed}/${total} passed — report: reports/C12-csv-import.html`);
process.exit(passed === total ? 0 : 1);
