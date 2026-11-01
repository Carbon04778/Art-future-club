/**
 * A1 (change profile type) end to end on the TEST project — real Chrome,
 * real sign-ins, and the database read directly after every step.
 *
 * Needs: dev server on :5198 pointed at TEST, migration 027 run there.
 * Creates throwaway accounts on TEST only and deletes them, their profiles,
 * requests, archives, works and follows at the end.
 *
 *   A  artist (3 artworks, a CV, a follower) asks to become a Gallery in the
 *      real panel → stays live while waiting → admin approves in the real
 *      Approvals tab → same id, Gallery, approved, details copied, follower
 *      kept, artworks in the archive → admin presses Undo → artist back.
 *   B  collector tries to make themselves a Gallery directly → refused;
 *      asks for Museum → admin declines with a note → member sees it;
 *      asks for Gallery → approved → same profile, type changed.
 *   C  gallery with a gallery work → becomes an Artist (Sculpture) →
 *      the work is archived → restore brings the work back.
 *   Rules: a member cannot approve; signed out cannot ask; one request at a time.
 *
 *   node scripts/ui-test-profile-switch.mjs [site]   (default http://localhost:5198)
 * Report: reports/A1-profile-switch.html
 */
import puppeteer from "puppeteer-core";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { createReport } from "./lib/report.mjs";

const ROOT = fileURLToPath(new URL("..", import.meta.url));
const E = Object.fromEntries(readFileSync(join(ROOT, ".env"), "utf8").split(/\r?\n/).filter((l) => /^[A-Z_]+=/.test(l)).map((l) => [l.slice(0, l.indexOf("=")), l.slice(l.indexOf("=") + 1).trim()]));
const SITE = process.argv[2] || "http://localhost:5198";
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const T = E.COPY_SUPABASE_URL.replace(/\/+$/, "");
if (!T.includes("jbcexmconizdqxnfyjba")) throw new Error("COPY_SUPABASE_URL is not the TEST project");
const SK = E.COPY_SUPABASE_SERVICE_ROLE_KEY, AK = E.COPY_SUPABASE_ANON_KEY;
const SH = { apikey: SK, Authorization: `Bearer ${SK}`, "Content-Type": "application/json", Prefer: "return=representation" };

// Retry once on a dropped connection — this network has been unreliable.
async function http(url, opts = {}) {
  for (let i = 0; ; i++) {
    try { return await fetch(url, opts); } catch (e) { if (i >= 3) throw e; await sleep(3000); }
  }
}
const rest = async (method, q, body, headers = SH) => { const r = await http(`${T}/rest/v1/${q}`, { method, headers, body: body ? JSON.stringify(body) : undefined }); const t = await r.text(); return { status: r.status, data: t ? JSON.parse(t) : null }; };
const one = async (q) => (await rest("GET", q)).data?.[0];
const token = async (email, password) => (await (await http(`${T}/auth/v1/token?grant_type=password`, { method: "POST", headers: { apikey: AK, "Content-Type": "application/json" }, body: JSON.stringify({ email, password }) })).json()).access_token;
const asUser = (jwt) => ({ apikey: AK, Authorization: `Bearer ${jwt}`, "Content-Type": "application/json", Prefer: "return=representation" });
const rpc = (fn, args, jwt) => rest("POST", `rpc/${fn}`, args, jwt ? asUser(jwt) : { apikey: AK, "Content-Type": "application/json" });
const newUser = async (tag) => {
  const email = `a1-test-${tag}-${Date.now()}@example.com`, password = `A1-${Date.now()}-x!Aa`;
  const u = await (await http(`${T}/auth/v1/admin/users`, { method: "POST", headers: SH, body: JSON.stringify({ email, password, email_confirm: true }) })).json();
  return { id: u.id, email, password };
};

const R = createReport("A1-profile-switch", "A1 — change profile type", "Real Chrome, real sign-ins, TEST project. Every account and row the test creates is deleted at the end.");
const b = await puppeteer.launch({ executablePath: "C:/Program Files/Google/Chrome/Application/chrome.exe", headless: true });
// Undo asks "are you sure?" in a browser dialog: answer yes, as the admin would.
const visitor = async () => { const ctx = await b.createBrowserContext(); const p = await ctx.newPage(); await p.setViewport({ width: 1366, height: 900 }); const errs = []; p.on("pageerror", (e) => errs.push(e.message)); p.on("dialog", (d) => d.accept()); return { ctx, p, errs }; };
async function signIn(p, email, password) {
  await p.goto(`${SITE}/login`, { waitUntil: "networkidle2", timeout: 90000 });
  await p.waitForSelector('input[type="email"]', { timeout: 30000 });
  await p.type('input[type="email"]', email);
  await p.type('input[type="password"]', password);
  await Promise.all([p.waitForNavigation({ waitUntil: "networkidle2", timeout: 60000 }).catch(() => {}), p.click('button[type="submit"]')]);
  await p.evaluate(() => [...document.querySelectorAll("button")].find((x) => /^reject$/i.test(x.innerText.trim()))?.click());
}
const clickText = (p, re, scope = "button") => p.evaluate((src, flags, scope) => { const re = new RegExp(src, flags); const el = [...document.querySelectorAll(scope)].find((x) => re.test(x.innerText.trim())); el?.scrollIntoView({ block: "center" }); el?.click(); return !!el; }, re.source, re.flags, scope);

const made = { users: [], follows: [] };
const admin = await one(`profiles?select=id&email=eq.${encodeURIComponent(E.AFC_ADMIN_EMAIL)}`);
let adminView;

try {
  // ======================================================== A: artist → gallery
  const A = await newUser("artist"); made.users.push(A.id);
  const works = [{ title: "W1", image_url: "/w1.webp" }, { title: "W2", image_url: "/w2.webp" }, { title: "W3", image_url: "/w3.webp" }];
  const aRow = (await rest("POST", "artist_profile", { user_id: A.id, display_name: `A1 Test Artist ${Date.now()}`, discipline: "Painting", disciplines: ["Painting", "Drawing"], bio: "Bio A", based_in: "Hong Kong", website: "https://a1-artist.example.com", instagram: "a1artist", status: "approved", portfolio_works: works, cv: { statement: "My statement", exhibitions: [{ title: "Show" }] } })).data[0];
  const fol = (await rest("POST", "follow", { follower_id: admin.id, following_id: aRow.id, following_name: aRow.display_name })).data[0];
  made.follows.push(fol.id);
  R.ok("Setup", "TEST: an approved artist with 3 artworks, a CV and a follower", !!aRow?.id && !!fol?.id, aRow.display_name);

  const m = await visitor();
  await signIn(m.p, A.email, A.password);
  await m.p.goto(`${SITE}/profile/edit`, { waitUntil: "networkidle2", timeout: 90000 });
  await m.p.waitForSelector('[data-testid="profile-switch"]', { timeout: 45000 });
  await clickText(m.p, /^change profile type$/i);
  await m.p.waitForSelector('[data-testid="switch-form"] select', { timeout: 15000 });
  await m.p.select('[data-testid="switch-form"] select', "Gallery");
  await sleep(500);
  await m.p.evaluate(() => document.querySelector('[data-testid="profile-switch"]').scrollIntoView({ block: "start" }));
  await sleep(1200); // let the scroll finish before the picture
  await m.p.screenshot({ path: R.shotPath("1-member-asks.png") });
  const warned = await m.p.evaluate(() => document.querySelector('[data-testid="switch-consequences"]')?.innerText || "");
  R.ok("A · Artist → Gallery", "the member is told what will NOT move (artworks, CV) before sending", /does not move across/i.test(warned) && /artworks/i.test(warned) && /cv/i.test(warned), "", "1-member-asks.png");
  await m.p.type('[data-testid="switch-form"] textarea', "I opened a gallery");
  await m.p.evaluate(() => document.querySelector('[data-testid="switch-form"]').requestSubmit());
  await m.p.waitForSelector('[data-testid="switch-pending"]', { timeout: 30000 }).catch(() => {});
  let req = await one(`profile_switch_request?select=*&user_id=eq.${A.id}&status=eq.pending`);
  R.ok("A · Artist → Gallery", "database: the request is waiting (Artist → Gallery, with their note)", req?.from_type === "Artist" && req?.to_type === "Gallery" && req?.reason === "I opened a gallery", JSON.stringify(req && { f: req.from_type, t: req.to_type }));
  R.ok("A · Artist → Gallery", "page: says it is waiting and the profile stays as it is", !!(await m.p.$('[data-testid="switch-pending"]')));
  const stillArtist = await one(`artist_profile?select=id,status,portfolio_works&id=eq.${aRow.id}`);
  R.ok("A · Artist → Gallery", "while waiting, the artist profile is unchanged and still public", stillArtist?.status === "approved" && stillArtist.portfolio_works.length === 3);
  const jwtA = await token(A.email, A.password);
  const again = await rpc("request_profile_switch", { p_to_type: "Collector" }, jwtA);
  R.ok("Rules", "a second request while one is waiting is refused", again.status >= 400 && /already have a request/i.test(JSON.stringify(again.data)), JSON.stringify(again.data).slice(0, 90));
  const selfApprove = await rpc("review_profile_switch", { p_request: req.id, p_approve: true }, jwtA);
  R.ok("Rules", "a member cannot approve their own request", selfApprove.status >= 400 && /administrator/i.test(JSON.stringify(selfApprove.data)), JSON.stringify(selfApprove.data).slice(0, 90));
  const anonAsk = await rpc("request_profile_switch", { p_to_type: "Gallery" });
  R.ok("Rules", "a signed-out visitor cannot ask", anonAsk.status >= 400, `HTTP ${anonAsk.status}`);

  // admin approves in the real Approvals tab
  adminView = await visitor();
  await signIn(adminView.p, E.AFC_ADMIN_EMAIL, E.AFC_ADMIN_PASSWORD);
  const openApprovals = async () => {
    await adminView.p.goto(`${SITE}/admin`, { waitUntil: "networkidle2", timeout: 90000 });
    await adminView.p.waitForFunction(() => [...document.querySelectorAll("button")].some((x) => /^approvals$/i.test(x.innerText.trim())), { timeout: 60000 });
    await clickText(adminView.p, /^approvals$/i);
    await adminView.p.waitForSelector('[data-testid="switch-requests"]', { timeout: 30000 }).catch(() => {});
    await sleep(1500);
  };
  await openApprovals();
  const card = await adminView.p.evaluate((name) => [...document.querySelectorAll('[data-testid="switch-request"]')].find((x) => x.innerText.includes(name))?.innerText || "", aRow.display_name);
  await adminView.p.evaluate(() => document.querySelector('[data-testid="switch-requests"]')?.scrollIntoView({ block: "start" }));
  await adminView.p.screenshot({ path: R.shotPath("2-admin-queue.png") });
  R.ok("A · Artist → Gallery", "Approvals tab: the request, with the REAL warning (3 artworks, a CV, 2 disciplines)", /Artist → Gallery/.test(card) && /3 artworks/.test(card) && /a CV/.test(card) && /2 disciplines/.test(card), card.replace(/\s+/g, " ").slice(0, 120), "2-admin-queue.png");
  await adminView.p.evaluate((name) => [...[...document.querySelectorAll('[data-testid="switch-request"]')].find((x) => x.innerText.includes(name)).querySelectorAll("button")].find((x) => /approve change/i.test(x.innerText)).click(), aRow.display_name);
  for (let i = 0; i < 20 && (await one(`profile_switch_request?select=status&id=eq.${req.id}`))?.status === "pending"; i++) await sleep(1000);

  req = await one(`profile_switch_request?select=*&id=eq.${req.id}`);
  const gone = await one(`artist_profile?select=id&id=eq.${aRow.id}`);
  const gal = await one(`collector_profile?select=*&id=eq.${aRow.id}`);
  const arch = req?.archive_id ? await one(`profile_archive?select=*&id=eq.${req.archive_id}`) : null;
  R.ok("A · Approved", "request approved", req?.status === "approved");
  R.ok("A · Approved", "the artist profile is replaced by a Gallery with the SAME id, approved", !gone && gal?.type === "Gallery" && gal?.status === "approved");
  R.ok("A · Approved", "name, bio, location, website and Instagram copied", gal?.display_name === aRow.display_name && gal?.bio === "Bio A" && gal?.based_in === "Hong Kong" && gal?.website === aRow.website && gal?.instagram === "a1artist");
  R.ok("A · Approved", "the follower still follows them", !!(await one(`follow?select=id&id=eq.${fol.id}&following_id=eq.${aRow.id}`)));
  R.ok("A · Approved", "the archive holds the whole artist profile — all 3 artworks and the CV", arch?.profile?.portfolio_works?.length === 3 && arch?.profile?.cv?.statement === "My statement");

  // the member's own view now
  await m.p.goto(`${SITE}/profile/edit`, { waitUntil: "networkidle2", timeout: 90000 });
  await sleep(3500);
  const landed = m.p.url();
  await m.p.screenshot({ path: R.shotPath("3-member-after.png") });
  R.ok("A · Approved", "the member's old artist editor now takes them to their gallery page", /\/gallery\//.test(landed), landed, "3-member-after.png");
  const myLink = await m.p.evaluate(() => [...document.querySelectorAll("a")].find((x) => /my profile/i.test(x.innerText))?.getAttribute("href"));
  R.ok("A · Approved", "'My Profile' points to the gallery", /^\/gallery\//.test(myLink || ""), myLink);
  const pub = await (await http(`${T}/rest/v1/collector_profile?select=id&id=eq.${aRow.id}`, { headers: { apikey: AK } })).json();
  R.ok("A · Approved", "the gallery is public straight away (approved in the review)", pub.length === 1);
  R.ok("A · Approved", "no page errors for the member", m.errs.length === 0, m.errs.join(" | "));
  await m.ctx.close();

  // Undo in the Approvals tab
  await openApprovals();
  await adminView.p.evaluate((name) => [...document.querySelectorAll('[data-testid="switch-recent"]')].find((x) => x.innerText.includes(name))?.querySelector("button")?.click(), aRow.display_name);
  for (let i = 0; i < 20 && !(await one(`artist_profile?select=id&id=eq.${aRow.id}`)); i++) await sleep(1000);
  const back = await one(`artist_profile?select=*&id=eq.${aRow.id}`);
  R.ok("A · Undo", "Undo restores the artist profile exactly: same id, 3 artworks, CV, disciplines", back?.portfolio_works?.length === 3 && back?.cv?.statement === "My statement" && JSON.stringify(back?.disciplines) === '["Painting","Drawing"]');
  R.ok("A · Undo", "…and the gallery that replaced it is archived, not left behind", !(await one(`collector_profile?select=id&id=eq.${aRow.id}`)) && !!(await one(`profile_archive?select=id&profile_id=eq.${aRow.id}&kind=eq.space`)));

  // ======================================================== B: collector
  const B = await newUser("collector"); made.users.push(B.id);
  const bRow = (await rest("POST", "collector_profile", { user_id: B.id, display_name: `A1 Test Collector ${Date.now()}`, type: "Collector", status: "approved" })).data[0];
  const jwtB = await token(B.email, B.password);
  const direct = await rest("PATCH", `collector_profile?id=eq.${bRow.id}`, { type: "Gallery" }, asUser(jwtB));
  R.ok("B · Collector", "making themselves a Gallery directly is REFUSED (the old gap)", direct.status >= 400 && /change profile type/i.test(JSON.stringify(direct.data)), JSON.stringify(direct.data).slice(0, 100));
  R.ok("B · Collector", "…the profile is still a Collector", (await one(`collector_profile?select=type&id=eq.${bRow.id}`))?.type === "Collector");
  const ordinary = await rest("PATCH", `collector_profile?id=eq.${bRow.id}`, { bio: "still editable" }, asUser(jwtB));
  R.ok("B · Collector", "ordinary edits still save", ordinary.status < 300 && ordinary.data?.[0]?.bio === "still editable", `HTTP ${ordinary.status}`);
  const askB = await rpc("request_profile_switch", { p_to_type: "Museum" }, jwtB);
  await rpc("review_profile_switch", { p_request: askB.data, p_approve: false, p_note: "Please add your address first." }, await token(E.AFC_ADMIN_EMAIL, E.AFC_ADMIN_PASSWORD));
  const vb = await visitor();
  await signIn(vb.p, B.email, B.password);
  await vb.p.goto(`${SITE}/collector-profile`, { waitUntil: "networkidle2", timeout: 90000 });
  await vb.p.waitForSelector('[data-testid="switch-rejected"]', { timeout: 45000 }).catch(() => {});
  const note = await vb.p.evaluate(() => document.querySelector('[data-testid="switch-rejected"]')?.innerText || "");
  const typeLocked = await vb.p.evaluate(() => [...document.querySelectorAll("select")].find((s) => [...s.options].some((o) => o.value === "Collector"))?.disabled);
  await vb.p.evaluate(() => document.querySelector('[data-testid="switch-rejected"]')?.scrollIntoView({ block: "center" }));
  await vb.p.screenshot({ path: R.shotPath("4-declined.png") });
  R.ok("B · Collector", "declined: the member sees the team's note", /add your address first/i.test(note), note.slice(0, 80), "4-declined.png");
  R.ok("B · Collector", "the type dropdown in their editor is locked", typeLocked === true);
  await vb.ctx.close();
  const askB2 = await rpc("request_profile_switch", { p_to_type: "Gallery" }, jwtB);
  await rpc("review_profile_switch", { p_request: askB2.data, p_approve: true }, await token(E.AFC_ADMIN_EMAIL, E.AFC_ADMIN_PASSWORD));
  const bAfter = await one(`collector_profile?select=*&id=eq.${bRow.id}`);
  R.ok("B · Collector → Gallery", "approved: the SAME profile becomes a Gallery, nothing archived", bAfter?.type === "Gallery" && bAfter?.status === "approved" && bAfter?.bio === "still editable" && !(await one(`profile_archive?select=id&profile_id=eq.${bRow.id}`)));

  // ======================================================== C: gallery → artist
  const C = await newUser("gallery"); made.users.push(C.id);
  const cRow = (await rest("POST", "collector_profile", { user_id: C.id, display_name: `A1 Test Gallery ${Date.now()}`, type: "Gallery", status: "approved", address: "1 Test Road", opening_hours: "Tue–Sat", bio: "Bio C" })).data[0];
  const gw = (await rest("POST", "gallery_work", { gallery_id: cRow.id, owner_id: C.id, artist_id: C.id, artist_name: "X", title: "A1 gallery work", image_url: "/g.webp" })).data?.[0];
  const jwtC = await token(C.email, C.password);
  const noDisc = await rpc("request_profile_switch", { p_to_type: "Artist" }, jwtC);
  R.ok("C · Gallery → Artist", "becoming an artist without a main discipline is refused", noDisc.status >= 400 && /discipline/i.test(JSON.stringify(noDisc.data)));
  const askC = await rpc("request_profile_switch", { p_to_type: "Artist", p_discipline: "Sculpture" }, jwtC);
  await rpc("review_profile_switch", { p_request: askC.data, p_approve: true }, await token(E.AFC_ADMIN_EMAIL, E.AFC_ADMIN_PASSWORD));
  const cArtist = await one(`artist_profile?select=*&id=eq.${cRow.id}`);
  const cReq = await one(`profile_switch_request?select=archive_id&id=eq.${askC.data}`);
  const cArch = await one(`profile_archive?select=*&id=eq.${cReq?.archive_id}`);
  R.ok("C · Gallery → Artist", "approved: an artist with the SAME id, main discipline Sculpture, bio copied", cArtist?.discipline === "Sculpture" && JSON.stringify(cArtist?.disciplines) === '["Sculpture"]' && cArtist?.bio === "Bio C" && cArtist?.status === "approved");
  R.ok("C · Gallery → Artist", "the gallery's work and address are in the archive (not lost)", cArch?.gallery_works?.length === (gw ? 1 : 0) && cArch?.profile?.address === "1 Test Road", `works archived: ${cArch?.gallery_works?.length}`);
  const restoreC = await rpc("restore_profile_archive", { p_archive: cReq.archive_id }, await token(E.AFC_ADMIN_EMAIL, E.AFC_ADMIN_PASSWORD));
  const cBack = await one(`collector_profile?select=*&id=eq.${cRow.id}`);
  R.ok("C · Restore", "restore brings the gallery back with its address and its work", restoreC.status < 300 && cBack?.address === "1 Test Road" && (!gw || !!(await one(`gallery_work?select=id&gallery_id=eq.${cRow.id}`))), `HTTP ${restoreC.status}`);
  const twice = await rpc("restore_profile_archive", { p_archive: cReq.archive_id }, await token(E.AFC_ADMIN_EMAIL, E.AFC_ADMIN_PASSWORD));
  R.ok("C · Restore", "the same archive cannot be restored twice", twice.status >= 400);

  R.ok("Whole run", "no page errors for the admin", adminView.errs.length === 0, adminView.errs.join(" | "));
} catch (err) {
  R.ok("Whole run", "test ran to the end", false, String(err?.stack || err).slice(0, 200));
} finally {
  if (adminView) await adminView.ctx.close().catch(() => {});
  // ---- clean-up: this run's accounts, and any a1-test-… account an interrupted run left
  for (const id of made.follows) await rest("DELETE", `follow?id=eq.${id}`).catch(() => {});
  const all = (await (await http(`${T}/auth/v1/admin/users?per_page=1000`, { headers: SH })).json()).users || [];
  const ids = [...new Set([...made.users, ...all.filter((u) => /^a1-test-/.test(u.email)).map((u) => u.id)])];
  for (const id of ids) {
    for (const q of [`profile_archive?user_id=eq.${id}`, `profile_switch_request?user_id=eq.${id}`, `gallery_work?owner_id=eq.${id}`, `artist_profile?user_id=eq.${id}`, `collector_profile?user_id=eq.${id}`]) await rest("DELETE", q).catch(() => {});
    await http(`${T}/auth/v1/admin/users/${id}`, { method: "DELETE", headers: SH }).catch(() => {});
  }
  const leftUsers = ((await (await http(`${T}/auth/v1/admin/users?per_page=1000`, { headers: SH })).json()).users || []).filter((u) => /^a1-test-/.test(u.email)).length;
  const leftRows = (await rest("GET", "artist_profile?select=id&display_name=like.A1%20Test*")).data.length + (await rest("GET", "collector_profile?select=id&display_name=like.A1%20Test*")).data.length;
  R.ok("Clean-up", "TEST: every account, profile, request, archive, work and follow the test made is deleted", leftUsers === 0 && leftRows === 0, `${leftUsers} accounts, ${leftRows} profiles left`);
}

await b.close();
const { passed, total } = R.write({ heading: "Browser test (v12 code, TEST project, real sign-ins)" });
console.table(R.results.map((r) => ({ area: r.area, check: r.check.slice(0, 66), pass: r.pass ? "PASS" : "FAIL", detail: r.detail.slice(0, 30) })));
console.log(`${passed}/${total} passed — report: reports/A1-profile-switch.html`);
process.exit(passed === total ? 0 : 1);
