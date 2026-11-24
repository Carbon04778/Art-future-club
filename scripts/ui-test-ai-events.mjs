/**
 * AI Events in real Chrome (C8). READ-ONLY: signs in, looks, saves nothing.
 *   node scripts/ui-test-ai-events.mjs [site]   (default http://localhost:5198, TEST)
 * Draft data is answered inside this browser only (nothing reaches any
 * database), so the screens can be checked before migration 034 is run.
 * Report: reports/C8-ai-events.html
 */
import puppeteer from "puppeteer-core";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { createReport } from "./lib/report.mjs";

const ROOT = fileURLToPath(new URL("..", import.meta.url));
const E = Object.fromEntries(readFileSync(join(ROOT, ".env"), "utf8").split(/\r?\n/).filter((l) => /^[A-Z_]+=/.test(l)).map((l) => [l.slice(0, l.indexOf("=")), l.slice(l.indexOf("=") + 1).trim()]));
const SITE = process.argv[2] || "http://localhost:5198";
const R = createReport("C8-ai-events", "AI Events", "Real Chrome. Draft data is simulated inside the browser; nothing is saved.");
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const D = (x) => ({ id: "d1", state: "new", title: "Against the Wind", event_type: "Exhibition", start_date: "2026-10-22", end_date: "2027-01-16", start_time: null, venue: "10 Chancery Lane Gallery", address: null, chapter: "Hong Kong", timezone: "Asia/Hong_Kong", source_url: "https://www.10chancerylanegallery.com/exhibitions/", flags: [], evidence: { date_text: "22 Oct 2026 - 16 Jan 2027" }, created_date: "2026-11-23T10:00:00Z", ...x });
const DATA = {
  ai_event_draft: [D({}), D({ id: "d2", title: "Angel Vergara, Still Motion", venue: "Axel Vervoordt Gallery", chapter: null, flags: [{ field: "chapter", message: "City not clear. This gallery may have more than one location." }] })],
  ai_event_source: [{ id: "s1", name: "Gagosian", url: "https://gagosian.com/", city: "Hong Kong", active: true, last_status: "blocked", last_detail: "blocked (403)", last_checked: "2026-11-23T10:00:00Z" }],
  ai_event_run: [{ id: "r1", status: "done", started_at: "2026-11-23T10:00:00Z", source_ids: ["s1"], results: [{ name: "Gagosian", status: "blocked", detail: "blocked (403)", found: 0 }], cost_usd: 0.018, report_error: "Email is not set up yet." }],
  ai_event_settings: [{ id: true, trial_mode: true, schedule_on: false, report_emails: [], updated_date: "2026-11-23T10:00:00Z" }],
};
const b = await puppeteer.launch({ executablePath: "C:/Program Files/Google/Chrome/Application/chrome.exe", headless: true });
const errs = [], writes = [];
const open = async (path, width, fake = true) => {
  const p = await b.newPage();
  await p.setViewport({ width, height: 900 });
  p.on("pageerror", (e) => errs.push(`${path}: ${e.message}`));
  await p.setRequestInterception(true);
  p.on("request", (q) => {
    const m = /\/rest\/v1\/(rpc\/)?(ai_event_\w+)/.exec(q.url());
    if (fake && /\/storage\/v1\/object\//.test(q.url()) && ["POST", "OPTIONS"].includes(q.method())) return undefined;
    if (!m || !fake) return q.continue();
    const cors = { "access-control-allow-origin": "*", "access-control-allow-headers": "*", "access-control-allow-methods": "*", "access-control-expose-headers": "*" };
    if (q.method() === "OPTIONS") return q.respond({ status: 200, headers: cors });
    if (q.method() !== "GET" && q.method() !== "HEAD") { writes.push(`${m[2]} ${q.postData()}`); return q.respond({ status: 200, headers: cors, contentType: "application/json", body: JSON.stringify(m[1] ? "checked" : []) }); }
    const rows = DATA[m[2]] || [];
    return q.respond({ status: 200, headers: { ...cors, "content-range": `0-${rows.length - 1}/${rows.length}` }, contentType: "application/json", body: JSON.stringify(rows) });
  });
  await p.goto(`${SITE}${path}`, { waitUntil: "domcontentloaded", timeout: 90000 });
  await sleep(3500);
  await p.evaluate(() => [...document.querySelectorAll("button")].find((x) => /^reject$/i.test(x.innerText.trim()) && x.closest('[role="dialog"], [class*="cookie"], [class*="fixed"]'))?.click());
  return p;
};
const text = (p) => p.evaluate(() => document.body.textContent.replace(/\s+/g, " "));
const side = (p) => p.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
const click = (p, re) => p.evaluate((s) => { const x = [...document.querySelectorAll('[data-testid="ai-events"] button')].find((y) => new RegExp(s).test(y.textContent.trim())); x?.click(); return !!x; }, re);
try {
  for (const [w, tag] of [[390, "phone"], [1366, "desktop"]]) {
    const p = await open("/events", w, false);
    await p.waitForSelector('[data-testid="event-discovery"] input', { timeout: 60000 });
    await p.waitForFunction(() => document.querySelectorAll("h3").length > 0, { timeout: 60000 }).catch(() => {});
    const n0 = await p.evaluate(() => document.querySelectorAll("h3").length);
    await p.type('[data-testid="event-discovery"] input', "exhibitions in hong kong this weekend");
    await sleep(1200);
    const t = await text(p);
    const n1 = await p.evaluate(() => document.querySelectorAll("h3").length);
    await p.screenshot({ path: R.shotPath(`events-${tag}.png`) });
    R.ok(`Events (${tag})`, "search understands the words and filters", /events? for Exhibition · Hong Kong · this weekend/.test(t) && n1 < n0, `${n0} → ${n1}`, `events-${tag}.png`);
    R.ok(`Events (${tag})`, "fits the screen", (await side(p)) <= 0);
    await p.evaluate(() => document.querySelector('[aria-label="Clear search"]').click());
    await sleep(800);
    R.ok(`Events (${tag})`, "clearing shows everything again", (await p.evaluate(() => document.querySelectorAll("h3").length)) === n0);
    await p.close();
  }
  let p = await open("/admin?tab=AI%20Events", 1366);
  R.ok("Access", "signed out: no AI Events panel", !(await p.$('[data-testid="ai-events"]')));
  await p.close();
  p = await open("/login", 1366);
  await p.type('input[type="email"]', E.AFC_ADMIN_EMAIL);
  await p.type('input[type="password"]', E.AFC_ADMIN_PASSWORD);
  await p.click('button[type="submit"]');
  await sleep(7000);
  await p.close();
  for (const [w, tag] of [[390, "phone"], [1366, "desktop"]]) {
    p = await open("/admin?tab=AI%20Events", w);
    await p.waitForSelector('[data-testid="ai-events"]', { timeout: 60000 });
    await sleep(2500);
    let t = await text(p);
    await (await p.$('[data-testid="ai-events"]')).screenshot({ path: R.shotPath(`admin-${tag}.png`) });
    R.ok(`Admin (${tag})`, "email link opens the AI Events tab, trial note shown", /Trial: nothing here is public/.test(t), "", `admin-${tag}.png`);
    R.ok(`Admin (${tag})`, "ready draft shown with source and page quote", /Ready to review \(1\)/.test(t) && /Against the Wind/.test(t) && /22 Oct 2026 - 16 Jan 2027/.test(t));
    await click(p, "^Needs checking"); await sleep(500); t = await text(p);
    R.ok(`Admin (${tag})`, "unclear city is flagged", /City not clear/.test(t));
    await click(p, "^Edit$"); await sleep(500);
    await (await p.$('[data-testid="ai-events"]')).screenshot({ path: R.shotPath(`edit-${tag}.png`) });
    R.ok(`Admin (${tag})`, "edit form opens", await p.evaluate(() => !!document.querySelector('[data-testid="ai-events"] form input[type="date"]')), "", `edit-${tag}.png`);
    await click(p, "^Websites"); await sleep(500); t = await text(p);
    R.ok(`Admin (${tag})`, "websites list says why one failed", /Gagosian/.test(t) && /Blocked/.test(t));
    await click(p, "^History"); await sleep(500); t = await text(p);
    R.ok(`Admin (${tag})`, "history shows the run, its cost and the email state", /0\.018/.test(t) && /Email is not set up yet/.test(t));
    await click(p, "^Settings"); await sleep(500); t = await text(p);
    R.ok(`Admin (${tag})`, "settings: schedule off, trial on", /Weekly schedule: off/.test(t) && /Trial: on/.test(t));
    R.ok(`Admin (${tag})`, "fits the screen", (await side(p)) <= 0, `${await side(p)}px`);
    await p.close();
  }
  p = await open("/admin?tab=AI%20Events", 1366);
  await p.waitForSelector('[data-testid="ai-events"]'); await sleep(2500);
  // D6: a photo, chosen while editing. The upload is answered in this browser.
  await p.setRequestInterception(true);
  let uploads = 0;
  p.on("request", (q) => {
    if (!/\/storage\/v1\/object\//.test(q.url()) || q.isInterceptResolutionHandled()) return;
    const h = { "access-control-allow-origin": "*", "access-control-allow-headers": "*", "access-control-allow-methods": "*" };
    if (q.method() === "POST") uploads++;
    if (["POST", "OPTIONS"].includes(q.method())) q.respond({ status: 200, headers: h, contentType: "application/json", body: '{"Key":"uploads/x.webp","Id":"1"}' }, 10);
  });
  writes.length = 0;
  await click(p, "^Edit$"); await sleep(800);
  const inp = await p.$('[data-photo-field] input[type="file"]');
  await inp.uploadFile(join(ROOT, "public/images/team/heidi-mak.webp")); await sleep(2500);
  await (await p.$("[data-photo-field]")).screenshot({ path: R.shotPath("photo.png") });
  R.ok("Photo", "chosen photo is previewed with positioning", await p.evaluate(() => [...document.querySelectorAll("[data-photo-field] img")].some((i) => i.naturalWidth > 0)), "", "photo.png");
  await p.evaluate(() => document.querySelector('[data-testid="ai-events"] form button[type="submit"]').click()); await sleep(6000);
  R.ok("Photo", "saved with the draft, uploaded once", uploads === 1 && writes.length === 1 && /"photo_url":"https:[^"]+"/.test(writes[0]) && /"photo_focal_x":50/.test(writes[0]), `${uploads} upload; ${(/"photo_url":"[^"]*"/.exec(writes[0] || "") || [])[0] || ""}`);
  await click(p, "^Edit$"); await sleep(800);
  writes.length = 0;
  await p.evaluate(() => document.querySelector('[data-testid="ai-events"] form button[type="submit"]').click()); await sleep(3000);
  R.ok("Photo", "saving without touching the photo sends no photo change", writes.length === 1 && !/photo_url/.test(writes[0]));
  writes.length = 0;
  await click(p, "^Approve"); await sleep(1500);
  R.ok("Approve", "sends exactly one approve for that draft, and says nothing was published", writes.length === 1 && /ai_event_review/.test(writes[0]) && /"p_draft":"d1"/.test(writes[0]) && /Nothing was published/.test(await text(p)), writes.join(" | "));
  await p.close();
  p = await open("/notifications", 390);
  R.ok("Notifications", "page opens; no organiser box for drafts that are not theirs", !/not found/i.test(await text(p)) && (await side(p)) <= 0);
  await p.close();
} catch (e) { R.ok("Whole run", "test ran to the end", false, String(e?.message || e).slice(0, 180)); }
R.ok("Whole run", "no page errors", errs.length === 0, errs.join(" | ").slice(0, 300));
await b.close();
const { passed, total } = R.write({ heading: SITE });
console.table(R.results.map((r) => ({ area: r.area, check: r.check.slice(0, 70), pass: r.pass ? "PASS" : "FAIL", detail: r.detail.slice(0, 60) })));
console.log(`${passed}/${total} passed — report: reports/C8-ai-events.html`);
process.exit(passed === total ? 0 : 1);
