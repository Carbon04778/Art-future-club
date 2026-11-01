/**
 * B10 (Collectors) end to end — real Chrome, real sign-ins, and the database
 * asked directly as each kind of visitor.
 *
 * TEST (dev server on :5198 pointed at TEST, migration 029 run there).
 * Throwaway accounts on TEST only, all deleted at the end:
 *   C1  collector (public)        — browses, collects into a new collection,
 *                                   then makes their profile private
 *   C2  collector (PRIVATE)
 *   C3  collector (public) with a collection
 *   A   artist, not premium       — must NOT see collectors
 *   P   artist with an active subscription (premium) — may see them
 *   X   artist with one artwork, which C1 collects
 * Live (after deploy): read-only — signed out is locked, no Collectors menu
 *   link, the public API returns no collectors and no collectors' saved works.
 *
 *   node scripts/ui-test-collectors.mjs [site]   (default http://localhost:5198)
 * Report: reports/B10-collectors.html
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

const R = createReport("B10-collectors", "B10 — Collectors", LIVE ? "Real Chrome on the live site, read-only." : "Real Chrome, real sign-ins, TEST project, and the database asked directly as each kind of visitor. Everything created is deleted at the end.");
const b = await puppeteer.launch({ executablePath: "C:/Program Files/Google/Chrome/Application/chrome.exe", headless: true });
const visitor = async (w = 1366) => { const ctx = await b.createBrowserContext(); const p = await ctx.newPage(); await p.setViewport({ width: w, height: 900 }); const errs = []; p.on("pageerror", (e) => errs.push(e.message)); p.on("dialog", (d) => d.accept()); return { ctx, p, errs }; };
async function signIn(p, email, password) {
  await p.goto(`${SITE}/login`, { waitUntil: "networkidle2", timeout: 120000 });
  await p.waitForSelector('input[type="email"]', { timeout: 60000 });
  await p.type('input[type="email"]', email);
  await p.type('input[type="password"]', password);
  await Promise.all([p.waitForNavigation({ waitUntil: "networkidle2", timeout: 90000 }).catch(() => {}), p.click('button[type="submit"]')]);
  await p.evaluate(() => [...document.querySelectorAll("button")].find((x) => /^reject$/i.test(x.innerText.trim()))?.click());
}
const go = async (p, path) => { await p.goto(`${SITE}${path}`, { waitUntil: "networkidle2", timeout: 120000 }); await sleep(2500); await p.evaluate(() => [...document.querySelectorAll("button")].find((x) => /^reject$/i.test(x.innerText.trim()))?.click()); };
const has = (p, sel) => p.evaluate((s) => !!document.querySelector(s), sel);
const menuHasCollectors = (p) => p.evaluate(() => !!document.querySelector('header a[href="/collectors"]'));

if (LIVE) {
  const anonProfiles = await (await http(`${E.VITE_SUPABASE_URL}/rest/v1/collector_profile?select=id&type=in.(Collector,Curator,Advisor,Other)`, { headers: { apikey: E.VITE_SUPABASE_ANON_KEY } })).json();
  R.ok("Database", "the public API returns no collector profiles", Array.isArray(anonProfiles) && anonProfiles.length === 0, JSON.stringify(anonProfiles).slice(0, 60));
  const anonWorks = await (await http(`${E.VITE_SUPABASE_URL}/rest/v1/collected_work?select=user_id&limit=500`, { headers: { apikey: E.VITE_SUPABASE_ANON_KEY } })).json();
  R.ok("Database", "artists' and galleries' saved works are still public, as before", Array.isArray(anonWorks), `${anonWorks.length} visible`);
  const v = await visitor();
  await go(v.p, "/collectors");
  await v.p.screenshot({ path: R.shotPath("1-signed-out.png") });
  R.ok("Signed out", "/collectors says it is for collectors and premium members", await has(v.p, '[data-testid="collectors-locked"]'), "", "1-signed-out.png");
  R.ok("Signed out", "no 'Collectors' link in the menu", !(await menuHasCollectors(v.p)));
  R.ok("Whole run", "no page errors", v.errs.length === 0, v.errs.join(" | "));
  await v.ctx.close();
  const a = await visitor();
  await signIn(a.p, E.AFC_ADMIN_EMAIL, E.AFC_ADMIN_PASSWORD);
  await go(a.p, "/collectors");
  R.ok("Admin", "the admin sees the Collectors page and menu link", (await has(a.p, '[data-testid="collectors-page"]')) && (await menuHasCollectors(a.p)));
  R.ok("Admin", "no page errors", a.errs.length === 0, a.errs.join(" | "));
  await a.ctx.close();
} else {
  const T = E.COPY_SUPABASE_URL.replace(/\/+$/, "");
  if (!T.includes("jbcexmconizdqxnfyjba")) throw new Error("COPY_SUPABASE_URL is not the TEST project");
  const SK = E.COPY_SUPABASE_SERVICE_ROLE_KEY, AK = E.COPY_SUPABASE_ANON_KEY;
  const SH = { apikey: SK, Authorization: `Bearer ${SK}`, "Content-Type": "application/json", Prefer: "return=representation" };
  const rest = async (method, q, body, headers = SH) => { const r = await http(`${T}/rest/v1/${q}`, { method, headers, body: body ? JSON.stringify(body) : undefined }); const t = await r.text(); return { status: r.status, data: t ? JSON.parse(t) : null }; };
  const stamp = Date.now();
  const users = {};
  const mk = async (tag) => { const u = { email: `b10-test-${tag}-${stamp}@example.com`, password: `B10-${stamp}-x!Aa` }; u.id = (await (await http(`${T}/auth/v1/admin/users`, { method: "POST", headers: SH, body: JSON.stringify({ email: u.email, password: u.password, email_confirm: true }) })).json()).id; users[tag] = u; return u; };
  const jwt = async (u) => (await (await http(`${T}/auth/v1/token?grant_type=password`, { method: "POST", headers: { apikey: AK, "Content-Type": "application/json" }, body: JSON.stringify({ email: u.email, password: u.password }) })).json()).access_token;
  const as = (tok) => ({ apikey: AK, Authorization: `Bearer ${tok}`, "Content-Type": "application/json", Prefer: "return=representation" });
  const seen = async (tok, q) => (await rest("GET", q, null, tok ? as(tok) : { apikey: AK })).data;
  try {
    // ---- setup
    const C1 = await mk("c1"), C2 = await mk("c2"), C3 = await mk("c3"), A = await mk("artist"), P = await mk("premium"), X = await mk("x");
    const pc1 = (await rest("POST", "collector_profile", { user_id: C1.id, display_name: `B10 Collector One ${stamp}`, type: "Collector", based_in: "London" })).data[0];
    const pc2 = (await rest("POST", "collector_profile", { user_id: C2.id, display_name: `B10 Private Two ${stamp}`, type: "Collector", is_private: true })).data[0];
    const pc3 = (await rest("POST", "collector_profile", { user_id: C3.id, display_name: `B10 Curator Three ${stamp}`, type: "Curator", based_in: "Hong Kong" })).data[0];
    await rest("POST", "artist_profile", { user_id: A.id, display_name: `B10 Artist A ${stamp}`, discipline: "Painting", disciplines: ["Painting"], status: "approved" });
    await rest("POST", "artist_profile", { user_id: P.id, display_name: `B10 Premium P ${stamp}`, discipline: "Painting", disciplines: ["Painting"], status: "approved" });
    await rest("POST", "subscription", { user_id: P.id, plan: "premium_portfolio", status: "active", expires_at: new Date(Date.now() + 30 * 864e5).toISOString() });
    const px = (await rest("POST", "artist_profile", { user_id: X.id, display_name: `B10 Artist X ${stamp}`, discipline: "Drawing", disciplines: ["Drawing"], status: "approved", portfolio_works: [{ title: `B10 Work ${stamp}`, image_url: "/w.webp", medium: "Ink" }] })).data[0];
    const k3 = (await rest("POST", "collection", { user_id: C3.id, name: "Curated" })).data[0];
    await rest("POST", "collected_work", { user_id: C3.id, collection_id: k3.id, artist_id: px.id, artist_name: px.display_name, work_ref: `${px.id}-work-0`, work_title: `B10 Work ${stamp}` });
    await rest("POST", "collected_work", { user_id: C2.id, artist_id: px.id, artist_name: px.display_name, work_ref: `${px.id}-work-0`, work_title: "private save" });
    await rest("POST", "collected_work", { user_id: A.id, artist_id: px.id, artist_name: px.display_name, work_ref: `${px.id}-work-0`, work_title: "artist save" });
    R.ok("Setup", "TEST: 3 collectors (one private), a non-premium artist, a premium member, an artist with a work", !!(pc1 && pc2 && pc3 && px));

    // ---- the database, asked as each visitor
    const tC1 = await jwt(C1), tA = await jwt(A), tP = await jwt(P);
    const people = `collector_profile?select=id&id=in.(${pc1.id},${pc2.id},${pc3.id})`;
    R.ok("Database · signed out", "sees NO collector profiles", (await seen(null, people)).length === 0);
    R.ok("Database · signed out", "sees NO collector's saved works", (await seen(null, `collected_work?select=id&user_id=in.(${C2.id},${C3.id})`)).length === 0);
    R.ok("Database · signed out", "still sees an artist's saved works (public as before)", (await seen(null, `collected_work?select=id&user_id=eq.${A.id}`)).length === 1);
    R.ok("Database · non-premium artist", "sees NO collector profiles", (await seen(tA, people)).length === 0);
    R.ok("Database · non-premium artist", "sees NO collector's collections or works", (await seen(tA, `collection?select=id&id=eq.${k3.id}`)).length === 0 && (await seen(tA, `collected_work?select=id&user_id=eq.${C3.id}`)).length === 0);
    const pSees = (await seen(tP, people)).map((r) => r.id);
    R.ok("Database · premium member", "sees the public collectors, NOT the private one", pSees.includes(pc1.id) && pSees.includes(pc3.id) && !pSees.includes(pc2.id), `${pSees.length} visible`);
    R.ok("Database · premium member", "sees a public collector's collection and works", (await seen(tP, `collection?select=id&id=eq.${k3.id}`)).length === 1 && (await seen(tP, `collected_work?select=id&user_id=eq.${C3.id}`)).length === 1);
    R.ok("Database · premium member", "sees NOTHING a private collector saved", (await seen(tP, `collected_work?select=id&user_id=eq.${C2.id}`)).length === 0);
    const c1Sees = (await seen(tC1, people)).map((r) => r.id);
    R.ok("Database · collector", "a collector sees other public collectors, not the private one", c1Sees.includes(pc3.id) && !c1Sees.includes(pc2.id));
    const sneak = await rest("POST", "collected_work", { user_id: C1.id, collection_id: k3.id, artist_id: px.id, work_ref: "sneak" }, as(tC1));
    R.ok("Database · rules", "nobody can file a work in someone else's collection", sneak.status >= 400, `HTTP ${sneak.status}`);
    const forged = await rest("POST", "collection", { user_id: C3.id, name: "forged" }, as(tC1));
    R.ok("Database · rules", "nobody can create a collection for someone else", forged.status >= 400, `HTTP ${forged.status}`);

    // ---- the pages
    const anon = await visitor();
    await go(anon.p, "/collectors");
    R.ok("Pages · signed out", "/collectors is locked ('collectors and premium members')", await has(anon.p, '[data-testid="collectors-locked"]'));
    R.ok("Pages · signed out", "no Collectors link in the menu", !(await menuHasCollectors(anon.p)));
    await anon.ctx.close();

    const va = await visitor();
    await signIn(va.p, A.email, A.password);
    await go(va.p, "/collectors");
    await va.p.screenshot({ path: R.shotPath("1-artist-locked.png") });
    R.ok("Pages · non-premium artist", "locked, with Upgrade — and no list", (await has(va.p, '[data-testid="collectors-locked"]')) && !(await va.p.evaluate(() => document.body.innerText.includes("B10 Curator"))), "", "1-artist-locked.png");
    R.ok("Pages · non-premium artist", "no Collectors link in their menu", !(await menuHasCollectors(va.p)));
    await go(va.p, `/collectors/${pc3.slug}`);
    R.ok("Pages · non-premium artist", "a collector's page direct link is locked too", await has(va.p, '[data-testid="collectors-locked"]'));
    await va.ctx.close();

    const vp = await visitor();
    await signIn(vp.p, P.email, P.password);
    await go(vp.p, "/collectors");
    await vp.p.waitForSelector('[data-testid="collector-card"]', { timeout: 30000 }).catch(() => {});
    const listed = await vp.p.evaluate(() => [...document.querySelectorAll('[data-testid="collector-card"] h3')].map((h) => h.textContent));
    await vp.p.screenshot({ path: R.shotPath("2-premium-list.png") });
    R.ok("Pages · premium member", "the Collectors page lists the public collectors, not the private one", listed.some((n) => n.includes("B10 Collector One")) && listed.some((n) => n.includes("B10 Curator Three")) && !listed.some((n) => n.includes("B10 Private")), listed.filter((n) => n.startsWith("B10")).join(" | "), "2-premium-list.png");
    R.ok("Pages · premium member", "'Collectors' is in their menu", await menuHasCollectors(vp.p));
    await go(vp.p, `/collectors/${pc3.slug}`);
    await vp.p.waitForSelector('[data-testid="collected-work"]', { timeout: 30000 }).catch(() => {});
    await vp.p.evaluate(() => document.querySelector('[data-testid="collections"]')?.scrollIntoView({ block: "start" }));
    await sleep(800);
    await vp.p.screenshot({ path: R.shotPath("3-collector-page.png") });
    const tabs = await vp.p.evaluate(() => [...document.querySelectorAll('[role="tab"]')].map((t) => t.innerText.replace(/\s+/g, " ").trim()));
    R.ok("Pages · premium member", "a collector's page shows their collection 'Curated' with its work", tabs.some((t) => /curated 1/i.test(t)) && (await vp.p.evaluate((s) => document.body.innerText.includes(s), `B10 Work ${stamp}`)), tabs.join(" | "), "3-collector-page.png");
    await go(vp.p, `/collectors/${pc2.slug}`);
    R.ok("Pages · premium member", "the PRIVATE collector's page reads as not available", await has(vp.p, '[data-testid="collector-unavailable"]'));
    R.ok("Pages · premium member", "no page errors", vp.errs.length === 0, vp.errs.join(" | "));
    await vp.ctx.close();

    // ---- a collector collects into a new collection, then goes private
    const vc = await visitor();
    await signIn(vc.p, C1.email, C1.password);
    await go(vc.p, `/artists/${px.slug}`);
    await vc.p.waitForSelector('[data-testid="collect-button"]', { timeout: 45000 });
    await vc.p.evaluate(() => { const b = document.querySelector('[data-testid="collect-button"]'); b.scrollIntoView({ block: "center" }); b.click(); });
    await vc.p.waitForSelector('[data-testid="collect-menu"] input', { timeout: 15000 });
    await vc.p.type('[data-testid="collect-menu"] input', "B10 Board");
    await vc.p.screenshot({ path: R.shotPath("4-save-to.png") });
    await vc.p.click('[aria-label="Create collection and save"]');
    let mine = [];
    for (let i = 0; i < 15 && !mine.length; i++) { await sleep(1000); mine = (await rest("GET", `collected_work?select=*&user_id=eq.${C1.id}`)).data; }
    const board = (await rest("GET", `collection?select=*&user_id=eq.${C1.id}`)).data[0];
    R.ok("Collecting", "'Save to…' → new collection 'B10 Board' → the work is saved in it", board?.name === "B10 Board" && mine.length === 1 && mine[0].collection_id === board.id, "", "4-save-to.png");
    await go(vc.p, "/collector-profile/view");
    await vc.p.waitForSelector('[data-testid="collections"]', { timeout: 30000 }).catch(() => {});
    const myTabs = await vc.p.evaluate(() => [...document.querySelectorAll('[role="tab"]')].map((t) => t.innerText.replace(/\s+/g, " ").trim()));
    R.ok("Collecting", "their own page shows the collection with the work", myTabs.some((t) => /b10 board 1/i.test(t)), myTabs.join(" | "));
    R.ok("Collecting", "and says who can see the profile", /visible to collectors and premium members/i.test(await vc.p.evaluate(() => document.querySelector('[data-testid="privacy-status"]')?.innerText || "")));
    await go(vc.p, "/collector-profile");
    await vc.p.waitForSelector('[data-testid="private-toggle"] input', { timeout: 30000 });
    await vc.p.evaluate(() => { const i = document.querySelector('[data-testid="private-toggle"] input'); i.scrollIntoView({ block: "center" }); i.click(); });
    await vc.p.screenshot({ path: R.shotPath("5-private-toggle.png") });
    await vc.p.evaluate(() => document.querySelector('[data-testid="private-toggle"]').closest("form").requestSubmit());
    let priv;
    for (let i = 0; i < 15 && !priv; i++) { await sleep(1000); priv = (await rest("GET", `collector_profile?select=is_private&id=eq.${pc1.id}`)).data[0]?.is_private; }
    R.ok("Private", "the collector makes their profile private (real form)", priv === true, "", "5-private-toggle.png");
    R.ok("Private", "now a premium member cannot see them or their collection", !(await seen(tP, people)).some((r) => r.id === pc1.id) && (await seen(tP, `collected_work?select=id&user_id=eq.${C1.id}`)).length === 0);
    R.ok("Private", "they still see their own profile and collection", (await seen(tC1, `collector_profile?select=id&id=eq.${pc1.id}`)).length === 1 && (await seen(tC1, `collected_work?select=id&user_id=eq.${C1.id}`)).length === 1);
    R.ok("Whole run", "no page errors for the collector", vc.errs.length === 0, vc.errs.join(" | "));
    await vc.ctx.close();

    // ---- phone
    const ph = await visitor(390);
    await signIn(ph.p, P.email, P.password);
    await go(ph.p, "/collectors");
    const over = await ph.p.evaluate(() => document.documentElement.scrollWidth - innerWidth);
    R.ok("Phone", "Collectors page: no sideways scrolling", over <= 1, `${over}px`);
    await ph.ctx.close();
  } catch (err) {
    R.ok("Whole run", "test ran to the end", false, String(err?.stack || err).slice(0, 200));
  } finally {
    const all = (await (await http(`${T}/auth/v1/admin/users?per_page=1000`, { headers: SH })).json()).users || [];
    for (const u of all.filter((x) => /^b10-test-/.test(x.email))) {
      for (const q of [`collected_work?user_id=eq.${u.id}`, `collection?user_id=eq.${u.id}`, `subscription?user_id=eq.${u.id}`, `collector_profile?user_id=eq.${u.id}`, `artist_profile?user_id=eq.${u.id}`]) await rest("DELETE", q).catch(() => {});
      await http(`${T}/auth/v1/admin/users/${u.id}`, { method: "DELETE", headers: SH }).catch(() => {});
    }
    const leftU = ((await (await http(`${T}/auth/v1/admin/users?per_page=1000`, { headers: SH })).json()).users || []).filter((x) => /^b10-test-/.test(x.email)).length;
    const leftP = (await rest("GET", "collector_profile?select=id&display_name=like.B10*")).data.length + (await rest("GET", "artist_profile?select=id&display_name=like.B10*")).data.length;
    R.ok("Clean-up", "TEST: every account, profile, collection, saved work and subscription the test made is deleted", leftU === 0 && leftP === 0, `${leftU} accounts, ${leftP} profiles left`);
  }
}

await b.close();
const { passed, total } = R.write({ heading: LIVE ? "Live site after deploy (read-only)" : "Browser + database test (v12 code, TEST project, real sign-ins)" });
console.table(R.results.map((r) => ({ area: r.area, check: r.check.slice(0, 66), pass: r.pass ? "PASS" : "FAIL", detail: r.detail.slice(0, 30) })));
console.log(`${passed}/${total} passed — report: reports/B10-collectors.html`);
process.exit(passed === total ? 0 : 1);
