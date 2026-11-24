/**
 * A photo on an AI draft, end to end on TEST (D6): real upload in Chrome,
 * saved, approved, published, shown; then removed. Refuses any other project.
 *   node scripts/e2e-ai-photo.mjs      Report: reports/D6-photo.html
 */
import puppeteer from "puppeteer-core";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { createReport } from "./lib/report.mjs";
const ROOT = fileURLToPath(new URL("..", import.meta.url));
const E = Object.fromEntries(readFileSync(join(ROOT, ".env"), "utf8").split(/\r?\n/).filter((l) => /^[A-Z_]+=/.test(l)).map((l) => [l.slice(0, l.indexOf("=")), l.slice(l.indexOf("=") + 1).trim()]));
const U = E.COPY_SUPABASE_URL, K = E.COPY_SUPABASE_SERVICE_ROLE_KEY, SITE = "http://localhost:5198";
if (!/jbcexmconizdqxnfyjba/.test(U)) throw Error("NOT TEST — stopped");
if (!(await fetch(`${SITE}/src/api/base44Client.js`).then((r) => r.text())).includes("jbcexmconizdqxnfyjba")) throw Error("5198 is not on TEST — stopped");
const H = { apikey: K, Authorization: `Bearer ${K}`, "Content-Type": "application/json", Prefer: "return=representation" };
const must = async (p, init = {}) => { const r = await fetch(`${U}/rest/v1/${p}`, { ...init, headers: H }); const t = await r.text(); if (!r.ok) throw Error(`${p}: ${t}`); return t ? JSON.parse(t) : null; };
const R = createReport("D6-photo", "Photo on an AI draft", "Real upload on the TEST project; everything removed afterwards.");
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
if ((await must("ai_event_draft?select=id")).length) throw Error("TEST has drafts — stopped");
const n0 = (await must("event?select=id&limit=1000")).length;
const [set0] = await must("ai_event_settings?select=*");
const up = [], errs = [];
let b;
const THEIRS = "https://example.com/gallery-own-image.jpg";
try {
  const mk = async (title, x = {}) => (await must("ai_event_draft", { method: "POST", body: JSON.stringify({ title, match_key: title, source_url: "https://example.com/e", venue: "E2E Place", chapter: "Hong Kong", start_date: "2027-03-01", end_date: "2027-04-01", image_url: THEIRS, ...x }) }))[0];
  const d1 = await mk("E2E Photo One"), d2 = await mk("E2E Photo None");
  await must("ai_event_settings?id=eq.true", { method: "PATCH", body: JSON.stringify({ trial_mode: false }) });
  b = await puppeteer.launch({ executablePath: "C:/Program Files/Google/Chrome/Application/chrome.exe", headless: true });
  const open = async (path, w) => { const p = await b.newPage(); await p.setViewport({ width: w, height: 900 }); p.on("pageerror", (e) => errs.push(e.message)); await p.goto(SITE + path, { waitUntil: "domcontentloaded", timeout: 90000 }); await sleep(4000); return p; };
  let p = await open("/login", 1366);
  await p.type('input[type="email"]', E.AFC_ADMIN_EMAIL); await p.type('input[type="password"]', E.AFC_ADMIN_PASSWORD); await p.click('button[type="submit"]'); await sleep(7000);
  await p.close();
  const AB = '[data-testid="ai-events"]';
  const btn = (x, title, re) => x.evaluate((bx, t, s) => { const li = [...document.querySelectorAll(`${bx} li`)].find((y) => y.textContent.includes(t)); const z = [...(li?.querySelectorAll("button") || [])].find((y) => new RegExp(s).test(y.textContent.trim())); z?.click(); return !!z; }, AB, title, re);
  const text = (x) => x.evaluate(() => document.body.textContent.replace(/\s+/g, " "));
  const submit = (x) => x.evaluate((bx) => document.querySelector(`${bx} form button[type="submit"]`).click(), AB);
  const draft = async (id) => (await must(`ai_event_draft?id=eq.${id}&select=*`))[0];
  p = await open("/admin?tab=AI%20Events", 390);
  await p.evaluate(() => [...document.querySelectorAll("button")].find((x) => /^reject$/i.test(x.innerText.trim()) && !x.closest('[data-testid="ai-events"]'))?.click());
  await p.waitForSelector(AB, { timeout: 60000 }); await sleep(3500);
  await btn(p, "E2E Photo One", "^Edit$"); await sleep(1000);
  await (await p.$('[data-photo-field] input[type="file"]')).uploadFile(join(ROOT, "public/images/team/heidi-mak.webp")); await sleep(2500);
  // drag the point of focus upwards, as Julie would
  const box = await (await p.$("[data-photo-field] img")).boundingBox();
  await p.evaluate(() => document.querySelector("[data-photo-field] img").scrollIntoView({ block: "center" })); await sleep(500);
  const bx = await (await p.$("[data-photo-field] img")).boundingBox();
  await p.mouse.move(bx.x + bx.width / 2, bx.y + bx.height / 2); await p.mouse.down(); await p.mouse.move(bx.x + bx.width / 2, bx.y + bx.height * 0.2, { steps: 8 }); await p.mouse.up(); await sleep(500);
  await (await p.$("[data-photo-field]")).screenshot({ path: R.shotPath("edit-phone.png") });
  R.ok("Edit (phone)", "photo previewed; form fits the screen", !!box && (await p.evaluate(() => document.documentElement.scrollWidth - innerWidth)) <= 0, "", "edit-phone.png");
  await submit(p);
  let x; for (let i = 0; i < 20; i++) { await sleep(2000); x = await draft(d1.id); if (x.photo_url) break; }
  if (x.photo_url) up.push(x.photo_url);
  const f = x.photo_url ? await fetch(x.photo_url) : null;
  R.ok("Save", "photo really uploaded and saved on the draft", f?.status === 200 && /^image\//.test(f.headers.get("content-type")), `${f?.status} ${f?.headers.get("content-type")} ${x.photo_url}`);
  R.ok("Save", "the chosen framing is saved", x.photo_focal_y !== 50, `${x.photo_focal_x}, ${x.photo_focal_y}`);
  R.ok("Save", "shown on the draft", await p.waitForSelector("[data-draft-photo] img", { timeout: 15000 }).then(() => true, () => false));
  // an edit without touching the photo
  await sleep(2500);
  await btn(p, "E2E Photo One", "^Edit$"); await sleep(1000);
  await submit(p); await sleep(5000);
  const y = await draft(d1.id);
  R.ok("Save", "saving again keeps the same photo and framing", y.photo_url === x.photo_url && y.photo_focal_y === x.photo_focal_y);
  await btn(p, "E2E Photo One", "^Approve$"); await sleep(5000);
  await btn(p, "E2E Photo None", "^Approve$"); await sleep(5000);
  const e1 = (await must("event?title=eq.E2E%20Photo%20One&select=*"))[0], e2 = (await must("event?title=eq.E2E%20Photo%20None&select=*"))[0];
  R.ok("Publish", "event published with the photo and framing", e1?.image_url === x.photo_url && e1.image_focal_x === x.photo_focal_x && e1.image_focal_y === x.photo_focal_y);
  R.ok("Publish", "without a photo: none, and never the gallery's own image", !!e2 && e2.image_url === null);
  await p.close();
  for (const [w, tag] of [[390, "phone"], [1366, "desktop"]]) {
    p = await open(`/events/${e1.slug}`, w); await sleep(2500);
    R.ok("Event page", `photo shown (${tag})`, await p.evaluate((s) => [...document.images].some((i) => i.currentSrc === s && i.naturalWidth > 0), x.photo_url), "", `event-${tag}.png`);
    await p.screenshot({ path: R.shotPath(`event-${tag}.png`) });
    await p.close();
  }
  p = await open("/events", 1366); await sleep(3000);
  R.ok("Events list", "photo shown on the card", await p.evaluate(async (s) => { const i = [...document.images].find((z) => z.src === s); if (!i) return false; i.scrollIntoView(); for (let k = 0; k < 20 && !i.naturalWidth; k++) await new Promise((r) => setTimeout(r, 500)); return i.naturalWidth > 0; }, x.photo_url));
  await p.close();
  // remove
  const d3 = await mk("E2E Photo Gone", { photo_url: x.photo_url });
  p = await open("/admin?tab=AI%20Events", 1366); await p.waitForSelector(AB); await sleep(3500);
  await btn(p, "E2E Photo Gone", "^Edit$"); await sleep(800);
  await p.evaluate(() => [...document.querySelectorAll("[data-photo-field] button")].find((z) => /Remove photo/.test(z.textContent)).click()); await sleep(400);
  await submit(p); await sleep(5000);
  R.ok("Remove", "photo can be removed before approving", (await draft(d3.id)).photo_url === null, (await text(p)).includes("Saved.") ? "Saved." : "");
  await p.close();
} catch (e) { R.ok("Whole run", "ran to the end", false, String(e.message).slice(0, 190)); console.error(e); } finally {
  if (b) await b.close();
  for (const u of up) { const m = /\/object\/public\/([^/]+)\/(.+)$/.exec(u); if (m) await fetch(`${U}/storage/v1/object/${m[1]}/${m[2]}`, { method: "DELETE", headers: { apikey: K, Authorization: `Bearer ${K}` } }); }
  await must("event?title=like.E2E%20Photo*", { method: "DELETE" });
  await must("ai_event_draft?title=like.E2E%20Photo*", { method: "DELETE" });
  await must("ai_event_settings?id=eq.true", { method: "PATCH", body: JSON.stringify({ trial_mode: set0.trial_mode }) });
  const n1 = (await must("event?select=id&limit=1000")).length, dr = (await must("ai_event_draft?select=id")).length;
  const gone = (await Promise.all(up.map((u) => fetch(u.replace("/public/", "/") + "?t=" + Date.now(), { headers: { apikey: K, Authorization: `Bearer ${K}` } })))).every((r) => !r.ok);
  R.ok("Clean-up", "TEST as before, uploaded file removed", n1 === n0 && dr === 0 && gone && (await must("ai_event_settings?select=trial_mode"))[0].trial_mode === true, `${n0} → ${n1} events, ${dr} drafts`);
}
R.ok("Whole run", "no page errors", !errs.length, errs.join(" | ").slice(0, 200));
const { passed, total } = R.write({ heading: "TEST project" });
for (const r of R.results) console.log(r.pass ? "PASS" : "FAIL", "|", r.area, "|", r.check, "|", r.detail);
console.log(`${passed}/${total} passed — report: reports/D6-photo.html`);
process.exit(passed === total ? 0 : 1);
