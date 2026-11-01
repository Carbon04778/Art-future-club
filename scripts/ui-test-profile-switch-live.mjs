/**
 * A1 (change profile type) on the LIVE site after deploy — careful version.
 *
 * Touches no real member. One temporary account (an @example.com address,
 * created confirmed, so no email is sent) with a DRAFT artist profile, which
 * the public cannot see. In real Chrome: the member asks to become a Gallery,
 * the admin sees it in Approvals and declines with a note, the member sees
 * the note, asks again and cancels. Nothing is ever approved here — that
 * would publish the test profile; approving is proven on TEST with the same
 * database code (ui-test-profile-switch.mjs). Everything is deleted at the end.
 *
 *   node scripts/ui-test-profile-switch-live.mjs
 * Report: reports/A1-profile-switch-live.html
 */
import puppeteer from "puppeteer-core";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { createReport } from "./lib/report.mjs";

const ROOT = fileURLToPath(new URL("..", import.meta.url));
const E = Object.fromEntries(readFileSync(join(ROOT, ".env"), "utf8").split(/\r?\n/).filter((l) => /^[A-Z_]+=/.test(l)).map((l) => [l.slice(0, l.indexOf("=")), l.slice(l.indexOf("=") + 1).trim()]));
const SITE = "https://www.artfutureclub.com";
const L = E.VITE_SUPABASE_URL, SK = E.SUPABASE_SERVICE_ROLE_KEY, AK = E.VITE_SUPABASE_ANON_KEY;
if (!L.includes("erfrbjkozzqptopjhmav")) throw new Error("VITE_SUPABASE_URL is not the live project");
const SH = { apikey: SK, Authorization: `Bearer ${SK}`, "Content-Type": "application/json", Prefer: "return=representation" };
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
async function http(url, opts = {}) { for (let i = 0; ; i++) { try { return await fetch(url, opts); } catch (e) { if (i >= 3) throw e; await sleep(3000); } } }
const rest = async (method, q, body, headers = SH) => { const r = await http(`${L}/rest/v1/${q}`, { method, headers, body: body ? JSON.stringify(body) : undefined }); const t = await r.text(); return { status: r.status, data: t ? JSON.parse(t) : null }; };
const one = async (q) => (await rest("GET", q)).data?.[0];

const R = createReport("A1-profile-switch-live", "A1 — change profile type (live site)", "Real Chrome on artfutureclub.com. One temporary test member with a hidden draft profile; no real member touched; nothing approved or published; everything deleted at the end.");
const b = await puppeteer.launch({ executablePath: "C:/Program Files/Google/Chrome/Application/chrome.exe", headless: true });
const visitor = async () => { const ctx = await b.createBrowserContext(); const p = await ctx.newPage(); await p.setViewport({ width: 1366, height: 900 }); const errs = []; p.on("pageerror", (e) => errs.push(e.message)); p.on("dialog", (d) => d.accept()); return { ctx, p, errs }; };
async function signIn(p, email, password) {
  await p.goto(`${SITE}/login`, { waitUntil: "networkidle2", timeout: 120000 });
  await p.waitForSelector('input[type="email"]', { timeout: 60000 });
  await p.type('input[type="email"]', email);
  await p.type('input[type="password"]', password);
  await Promise.all([p.waitForNavigation({ waitUntil: "networkidle2", timeout: 90000 }).catch(() => {}), p.click('button[type="submit"]')]);
  await p.evaluate(() => [...document.querySelectorAll("button")].find((x) => /^reject$/i.test(x.innerText.trim()))?.click());
}
const clickText = (p, re) => p.evaluate((src, flags) => { const re = new RegExp(src, flags); const el = [...document.querySelectorAll("button")].find((x) => re.test(x.innerText.trim())); el?.scrollIntoView({ block: "center" }); el?.click(); return !!el; }, re.source, re.flags);

const stamp = Date.now();
const EMAIL = `a1-live-${stamp}@example.com`, PASS = `A1L-${stamp}-x!Aa`;
let userId = null;
const NAME = `A1 Live Check ${stamp}`;
try {
  const before = { a: (await rest("GET", "artist_profile?select=id&status=eq.approved")).data.length, s: (await rest("GET", "collector_profile?select=id&status=eq.approved")).data.length };
  const u = await (await http(`${L}/auth/v1/admin/users`, { method: "POST", headers: SH, body: JSON.stringify({ email: EMAIL, password: PASS, email_confirm: true }) })).json();
  userId = u.id;
  const prof = (await rest("POST", "artist_profile", { user_id: userId, display_name: NAME, discipline: "Painting", disciplines: ["Painting"], status: "draft", bio: "temporary check" })).data[0];
  const pub = await (await http(`${L}/rest/v1/artist_profile?select=id&id=eq.${prof.id}`, { headers: { apikey: AK } })).json();
  R.ok("Setup", "a temporary member with a DRAFT profile — invisible to the public", !!prof?.id && Array.isArray(pub) && pub.length === 0, EMAIL);

  // ---- the member asks
  const m = await visitor();
  await signIn(m.p, EMAIL, PASS);
  await m.p.goto(`${SITE}/profile/edit`, { waitUntil: "networkidle2", timeout: 120000 });
  await m.p.waitForSelector('[data-testid="profile-switch"]', { timeout: 60000 }).catch(() => {});
  R.ok("Member", "the 'Change profile type' panel is on their profile editor", !!(await m.p.$('[data-testid="profile-switch"]')));
  await clickText(m.p, /^change profile type$/i);
  await m.p.waitForSelector('[data-testid="switch-form"] select', { timeout: 20000 });
  await m.p.select('[data-testid="switch-form"] select', "Gallery");
  await sleep(400);
  const told = await m.p.evaluate(() => document.querySelector('[data-testid="switch-consequences"]')?.innerText || "");
  R.ok("Member", "told what will NOT move (artworks, CV) before sending", /does not move across/i.test(told) && /artworks/i.test(told));
  await m.p.evaluate(() => document.querySelector('[data-testid="switch-form"]').requestSubmit());
  await m.p.waitForSelector('[data-testid="switch-pending"]', { timeout: 45000 }).catch(() => {});
  await m.p.evaluate(() => document.querySelector('[data-testid="profile-switch"]')?.scrollIntoView({ block: "start" }));
  await sleep(1200);
  await m.p.screenshot({ path: R.shotPath("1-member-waiting.png") });
  R.ok("Member", "after sending: 'waiting for approval' shows straight away", !!(await m.p.$('[data-testid="switch-pending"]')), "", "1-member-waiting.png");
  let req = await one(`profile_switch_request?select=*&user_id=eq.${userId}&status=eq.pending`);
  R.ok("Database", "the request is saved and waiting (Artist → Gallery)", req?.from_type === "Artist" && req?.to_type === "Gallery");
  R.ok("Database", "their profile is unchanged while waiting", (await one(`artist_profile?select=status&id=eq.${prof.id}`))?.status === "draft");

  // ---- the admin declines in the real Approvals tab
  const a = await visitor();
  await signIn(a.p, E.AFC_ADMIN_EMAIL, E.AFC_ADMIN_PASSWORD);
  await a.p.goto(`${SITE}/admin`, { waitUntil: "networkidle2", timeout: 120000 });
  await a.p.waitForFunction(() => [...document.querySelectorAll("button")].some((x) => /^approvals$/i.test(x.innerText.trim())), { timeout: 90000 });
  await clickText(a.p, /^approvals$/i);
  await a.p.waitForFunction((n) => [...document.querySelectorAll('[data-testid="switch-request"]')].some((x) => x.innerText.includes(n)), { timeout: 60000 }, NAME).catch(() => {});
  await a.p.evaluate(() => document.querySelector('[data-testid="switch-requests"]')?.scrollIntoView({ block: "start" }));
  await sleep(1000);
  await a.p.screenshot({ path: R.shotPath("2-admin-approvals.png") });
  const card = await a.p.evaluate((n) => [...document.querySelectorAll('[data-testid="switch-request"]')].find((x) => x.innerText.includes(n))?.innerText || "", NAME);
  R.ok("Admin", "the request appears in Approvals, Artist → Gallery, with Approve and Decline", /Artist → Gallery/.test(card) && /approve change/i.test(card) && /decline/i.test(card), "", "2-admin-approvals.png");
  await a.p.evaluate((n) => [...[...document.querySelectorAll('[data-testid="switch-request"]')].find((x) => x.innerText.includes(n)).querySelectorAll("button")].find((x) => /^decline$/i.test(x.innerText.trim())).click(), NAME);
  await sleep(500);
  await a.p.type('[data-testid="switch-request"] textarea', "Live check — please ignore.");
  await a.p.evaluate(() => [...document.querySelectorAll('[data-testid="switch-request"] button')].find((x) => /^decline$/i.test(x.innerText.trim()))?.click());
  for (let i = 0; i < 20 && (await one(`profile_switch_request?select=status&id=eq.${req.id}`))?.status === "pending"; i++) await sleep(1000);
  req = await one(`profile_switch_request?select=*&id=eq.${req.id}`);
  R.ok("Admin", "Decline saved with the note; nothing published", req?.status === "rejected" && /please ignore/i.test(req?.review_note || "") && (await one(`artist_profile?select=status&id=eq.${prof.id}`))?.status === "draft");
  R.ok("Admin", "no page errors in the admin dashboard", a.errs.length === 0, a.errs.join(" | "));
  await a.ctx.close();

  // ---- the member sees the note, asks again, cancels
  await m.p.goto(`${SITE}/profile/edit`, { waitUntil: "networkidle2", timeout: 120000 });
  await m.p.waitForSelector('[data-testid="switch-rejected"]', { timeout: 60000 }).catch(() => {});
  R.ok("Member", "sees that it was declined, with the team's note", /please ignore/i.test(await m.p.evaluate(() => document.querySelector('[data-testid="switch-rejected"]')?.innerText || "")));
  await clickText(m.p, /^change profile type$/i);
  await m.p.waitForSelector('[data-testid="switch-form"] select', { timeout: 20000 });
  await m.p.select('[data-testid="switch-form"] select', "Collector");
  await m.p.evaluate(() => document.querySelector('[data-testid="switch-form"]').requestSubmit());
  await m.p.waitForSelector('[data-testid="switch-pending"]', { timeout: 45000 }).catch(() => {});
  await clickText(m.p, /^cancel request$/i);
  await m.p.waitForFunction(() => !document.querySelector('[data-testid="switch-pending"]'), { timeout: 30000 }).catch(() => {});
  const waiting = await one(`profile_switch_request?select=id&user_id=eq.${userId}&status=eq.pending`);
  R.ok("Member", "asking again then Cancel request: nothing left waiting", !waiting && !(await m.p.$('[data-testid="switch-pending"]')));
  R.ok("Member", "no page errors for the member", m.errs.length === 0, m.errs.join(" | "));
  await m.ctx.close();

  // ---- nobody else affected
  const after = { a: (await rest("GET", "artist_profile?select=id&status=eq.approved")).data.length, s: (await rest("GET", "collector_profile?select=id&status=eq.approved")).data.length };
  R.ok("Real members", `published profiles unchanged (${before.a} artists, ${before.s} spaces)`, after.a === before.a && after.s === before.s, JSON.stringify(after));
} catch (err) {
  R.ok("Whole run", "test ran to the end", false, String(err?.message || err).slice(0, 200));
} finally {
  if (userId) {
    await rest("DELETE", `profile_switch_request?user_id=eq.${userId}`).catch(() => {});
    await rest("DELETE", `profile_archive?user_id=eq.${userId}`).catch(() => {});
    await rest("DELETE", `artist_profile?user_id=eq.${userId}`).catch(() => {});
    await rest("DELETE", `collector_profile?user_id=eq.${userId}`).catch(() => {});
    await http(`${L}/auth/v1/admin/users/${userId}`, { method: "DELETE", headers: SH }).catch(() => {});
  }
  const users = ((await (await http(`${L}/auth/v1/admin/users?per_page=1000`, { headers: SH })).json()).users || []).filter((x) => /^a1-live-/.test(x.email));
  const rows = (await rest("GET", "artist_profile?select=id&display_name=like.A1%20Live%20Check*")).data.length;
  R.ok("Clean-up", "the temporary member, profile and requests are deleted from live", users.length === 0 && rows === 0, `${users.length} accounts, ${rows} profiles left`);
}
await b.close();
const { passed, total } = R.write({ heading: "Live site after deploy (one temporary hidden member)" });
console.table(R.results.map((r) => ({ area: r.area, check: r.check.slice(0, 66), pass: r.pass ? "PASS" : "FAIL", detail: r.detail.slice(0, 30) })));
console.log(`${passed}/${total} passed — report: reports/A1-profile-switch-live.html`);
process.exit(passed === total ? 0 : 1);
