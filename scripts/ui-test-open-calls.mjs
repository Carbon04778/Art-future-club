/**
 * B9 (Open Calls for premium members only) in real Chrome, real sign-ins.
 *
 * TEST (dev server on :5198 pointed at TEST, migration 026 run there):
 *   Creates, on TEST only, two sample open calls and one throwaway member
 *   account, then walks that member through each kind of visitor:
 *     signed out → member, not premium → premium (active subscription) →
 *     approved Partner gallery (may post, through the real form).
 *   Also the admin. Checks the PAGE and the DATABASE directly (the public
 *   API must refuse the list too). Deletes everything it created at the end.
 * Live (after deploy): read-only — signed out sees "Upgrade to view", the
 *   public API returns no open calls, the admin still sees the page.
 *
 *   node scripts/ui-test-open-calls.mjs [site]   (default http://localhost:5198)
 * Report: reports/B9-open-calls.html
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

const R = createReport("B9-open-calls", "B9 — Open Calls for premium members only", LIVE
  ? "Real Chrome on the live site, read-only."
  : "Real Chrome, real sign-ins, TEST project. Everything created for the test is deleted at the end.");
const b = await puppeteer.launch({ executablePath: "C:/Program Files/Google/Chrome/Application/chrome.exe", headless: true });

async function fresh() {
  const ctx = await b.createBrowserContext(); // its own cookies and storage: a separate visitor
  const p = await ctx.newPage();
  await p.setViewport({ width: 1366, height: 900 });
  const errs = []; p.on("pageerror", (e) => errs.push(e.message));
  return { ctx, p, errs };
}
async function signIn(p, email, password) {
  await p.goto(`${SITE}/login`, { waitUntil: "networkidle2" });
  await p.waitForSelector('input[type="email"]', { timeout: 30000 });
  await p.type('input[type="email"]', email);
  await p.type('input[type="password"]', password);
  await Promise.all([p.waitForNavigation({ waitUntil: "networkidle2", timeout: 60000 }).catch(() => {}), p.click('button[type="submit"]')]);
}
async function openCalls(p) {
  await p.goto(`${SITE}/open-calls`, { waitUntil: "networkidle2", timeout: 90000 });
  await p.waitForFunction(() => /upgrade to view|no opportunities|deadline|past deadlines/i.test(document.body.innerText), { timeout: 45000 }).catch(() => {});
  await sleep(1200);
  await p.evaluate(() => [...document.querySelectorAll("button")].find((x) => /^reject$/i.test(x.innerText.trim()))?.click());
  return p.evaluate(() => ({
    locked: !!document.querySelector('[data-testid="open-calls-locked"]'),
    upgrade: !!document.querySelector('[data-testid="open-calls-locked"] a[href="/upgrade"]'),
    signIn: !!document.querySelector('[data-testid="open-calls-locked"] a[href="/login"]'),
    post: [...document.querySelectorAll("button")].some((x) => /post opportunity/i.test(x.innerText)),
    text: document.body.innerText,
  }));
}

if (LIVE) {
  const anon = await (await fetch(`${E.VITE_SUPABASE_URL}/rest/v1/open_call?select=id`, { headers: { apikey: E.VITE_SUPABASE_ANON_KEY } })).json();
  R.ok("Database", "the public API returns no open calls to a signed-out visitor", Array.isArray(anon) && anon.length === 0, JSON.stringify(anon).slice(0, 80));
  const v = await fresh();
  const s = await openCalls(v.p);
  await v.p.screenshot({ path: R.shotPath("1-signed-out.png") });
  R.ok("Signed out", "sees 'Upgrade to view' with Upgrade and sign-in", s.locked && s.upgrade && s.signIn, "", "1-signed-out.png");
  R.ok("Signed out", "no Post button, no page errors", !s.post && v.errs.length === 0, v.errs.join(" | "));
  await v.ctx.close();
  const a = await fresh();
  await signIn(a.p, E.AFC_ADMIN_EMAIL, E.AFC_ADMIN_PASSWORD);
  const s2 = await openCalls(a.p);
  await a.p.screenshot({ path: R.shotPath("2-admin.png") });
  R.ok("Admin", "sees the board (not locked) and the Post button", !s2.locked && s2.post, "", "2-admin.png");
  R.ok("Admin", "no page errors", a.errs.length === 0, a.errs.join(" | "));
  await a.ctx.close();
} else {
  const T = E.COPY_SUPABASE_URL.replace(/\/+$/, "");
  if (!T.includes("jbcexmconizdqxnfyjba")) throw new Error("COPY_SUPABASE_URL is not the TEST project");
  const SK = E.COPY_SUPABASE_SERVICE_ROLE_KEY, AK = E.COPY_SUPABASE_ANON_KEY;
  const SH = { apikey: SK, Authorization: `Bearer ${SK}`, "Content-Type": "application/json", Prefer: "return=representation" };
  const rest = async (method, q, body, headers = SH) => { const r = await fetch(`${T}/rest/v1/${q}`, { method, headers, body: body ? JSON.stringify(body) : undefined }); const t = await r.text(); return { status: r.status, data: t ? JSON.parse(t) : null }; };
  const token = async (email, password) => (await (await fetch(`${T}/auth/v1/token?grant_type=password`, { method: "POST", headers: { apikey: AK, "Content-Type": "application/json" }, body: JSON.stringify({ email, password }) })).json()).access_token;
  const asUser = (jwt) => ({ apikey: AK, Authorization: `Bearer ${jwt}`, "Content-Type": "application/json", Prefer: "return=representation" });

  const stamp = Date.now();
  const EMAIL = `b9-test-${stamp}@example.com`, PASS = `B9-${stamp}-x!Aa`;
  const made = { calls: [], user: null, sub: null, space: null };
  try {
    // ---- setup (TEST only)
    const admin = (await rest("GET", `profiles?select=id&email=eq.${encodeURIComponent(E.AFC_ADMIN_EMAIL)}`)).data[0];
    const c1 = await rest("POST", "open_call", { title: `B9 test residency ${stamp}`, type: "Residency", organizer: "B9 Test", deadline: new Date(Date.now() + 30 * 864e5).toISOString().slice(0, 10), external_link: "https://example.com/b9", is_free: true, posted_by_id: admin.id, posted_by_name: "B9 test" });
    made.calls.push(c1.data[0].id);
    const u = await (await fetch(`${T}/auth/v1/admin/users`, { method: "POST", headers: { apikey: SK, Authorization: `Bearer ${SK}`, "Content-Type": "application/json" }, body: JSON.stringify({ email: EMAIL, password: PASS, email_confirm: true }) })).json();
    made.user = u.id;
    R.ok("Setup", "TEST: one sample open call and one throwaway member created", !!made.calls[0] && !!made.user, `${EMAIL}`);

    // ---- 1. signed out
    const anon = await rest("GET", "open_call?select=id", null, { apikey: AK });
    R.ok("Signed out", "database: the public API returns NO open calls", Array.isArray(anon.data) && anon.data.length === 0, JSON.stringify(anon.data).slice(0, 80));
    let v = await fresh();
    let s = await openCalls(v.p);
    await v.p.screenshot({ path: R.shotPath("1-signed-out.png") });
    R.ok("Signed out", "page: 'Upgrade to view', Upgrade button, sign-in link, no list", s.locked && s.upgrade && s.signIn && !/B9 test residency/.test(s.text), "", "1-signed-out.png");
    R.ok("Signed out", "no Post button", !s.post);
    await v.ctx.close();

    // ---- 2. signed in, not premium
    let jwt = await token(EMAIL, PASS);
    const r2 = await rest("GET", "open_call?select=id", null, asUser(jwt));
    R.ok("Member, not premium", "database: their own API calls return NO open calls", Array.isArray(r2.data) && r2.data.length === 0, JSON.stringify(r2.data).slice(0, 80));
    const ins2 = await rest("POST", "open_call", { title: "should be refused", type: "Other", organizer: "x", posted_by_id: made.user }, asUser(jwt));
    if (ins2.data?.[0]?.id) made.calls.push(ins2.data[0].id);
    R.ok("Member, not premium", "database: posting is refused", ins2.status >= 400, `HTTP ${ins2.status}`);
    v = await fresh();
    await signIn(v.p, EMAIL, PASS);
    s = await openCalls(v.p);
    await v.p.screenshot({ path: R.shotPath("2-member-not-premium.png") });
    R.ok("Member, not premium", "page: 'Upgrade to view' (no sign-in link — already signed in)", s.locked && s.upgrade && !s.signIn && !/B9 test residency/.test(s.text), "", "2-member-not-premium.png");

    // ---- 3. premium: an active subscription
    const sub = await rest("POST", "subscription", { user_id: made.user, plan: "premium_portfolio", status: "active", expires_at: new Date(Date.now() + 30 * 864e5).toISOString() });
    made.sub = sub.data[0].id;
    s = await openCalls(v.p);
    await v.p.screenshot({ path: R.shotPath("3-premium.png") });
    R.ok("Premium member", "page: sees the open calls", !s.locked && /B9 test residency/i.test(s.text), "", "3-premium.png");
    R.ok("Premium member", "page: Apply opens the real link", await v.p.evaluate(() => !!document.querySelector('a[href="https://example.com/b9"]')));
    R.ok("Premium member", "page: no Post button (not a gallery)", !s.post);
    const ins3 = await rest("POST", "open_call", { title: "should be refused", type: "Other", organizer: "x", posted_by_id: made.user }, asUser(jwt));
    if (ins3.data?.[0]?.id) made.calls.push(ins3.data[0].id);
    R.ok("Premium member", "database: posting still refused (only galleries/venues post)", ins3.status >= 400, `HTTP ${ins3.status}`);
    // an expired subscription is not premium
    await rest("PATCH", `subscription?id=eq.${made.sub}`, { expires_at: new Date(Date.now() - 864e5).toISOString() });
    s = await openCalls(v.p);
    R.ok("Premium member", "an EXPIRED subscription is locked again", s.locked);
    await rest("DELETE", `subscription?id=eq.${made.sub}`); made.sub = null;

    // ---- 4. approved Partner gallery: may view and post
    const sp = await rest("POST", "collector_profile", { user_id: made.user, display_name: `B9 Test Gallery ${stamp}`, type: "Gallery", status: "approved", partnership_type: "Partner", based_in: "Hong Kong" });
    made.space = sp.data[0].id;
    s = await openCalls(v.p);
    R.ok("Partner gallery", "page: sees the open calls and the Post button", !s.locked && s.post && /B9 test residency/i.test(s.text));
    await v.p.evaluate(() => [...document.querySelectorAll("button")].find((x) => /post opportunity/i.test(x.innerText))?.click());
    await v.p.waitForSelector("form", { timeout: 15000 });
    const title = `B9 partner post ${stamp}`;
    const req = await v.p.$$("form input[required]");
    await req[0].type(title); await req[1].type("B9 Test Gallery");
    await v.p.screenshot({ path: R.shotPath("4-partner-posting.png") });
    await v.p.evaluate(() => document.querySelector("form").requestSubmit());
    let posted;
    for (let i = 0; i < 15 && !posted; i++) { await sleep(1000); posted = (await rest("GET", `open_call?select=id,title,posted_by_id&title=eq.${encodeURIComponent(title)}`)).data[0]; }
    if (posted) made.calls.push(posted.id);
    R.ok("Partner gallery", "posted through the real form; saved under their own account", posted?.posted_by_id === made.user, posted ? posted.id : "not saved", "4-partner-posting.png");
    await sleep(1500);
    R.ok("Partner gallery", "their new open call shows on the board", /B9 partner post/i.test(await v.p.evaluate(() => document.body.innerText)));
    // a DRAFT (unapproved) gallery may not post
    await rest("PATCH", `collector_profile?id=eq.${made.space}`, { status: "draft" });
    jwt = await token(EMAIL, PASS);
    const ins4 = await rest("POST", "open_call", { title: "should be refused", type: "Other", organizer: "x", posted_by_id: made.user }, asUser(jwt));
    if (ins4.data?.[0]?.id) made.calls.push(ins4.data[0].id);
    R.ok("Partner gallery", "database: an UNAPPROVED gallery cannot post", ins4.status >= 400, `HTTP ${ins4.status}`);
    R.ok("Whole run", "no page errors (member)", v.errs.length === 0, v.errs.join(" | "));
    await v.ctx.close();

    // ---- 5. admin
    const a = await fresh();
    await signIn(a.p, E.AFC_ADMIN_EMAIL, E.AFC_ADMIN_PASSWORD);
    s = await openCalls(a.p);
    await a.p.screenshot({ path: R.shotPath("5-admin.png") });
    R.ok("Admin", "sees every open call and the Post button", !s.locked && s.post && /B9 test residency/i.test(s.text), "", "5-admin.png");
    R.ok("Admin", "no page errors", a.errs.length === 0, a.errs.join(" | "));
    // phone
    await a.p.setViewport({ width: 390, height: 844 });
    await openCalls(a.p);
    const over = await a.p.evaluate(() => document.documentElement.scrollWidth - innerWidth);
    R.ok("Phone", "no sideways scrolling", over <= 1, `${over}px`);
    await a.ctx.close();
  } catch (err) {
    R.ok("Whole run", "test ran to the end", false, String(err?.message || err).slice(0, 160));
  } finally {
    // ---- clean-up: everything this test made, and only that
    for (const id of made.calls) await rest("DELETE", `open_call?id=eq.${id}`);
    if (made.sub) await rest("DELETE", `subscription?id=eq.${made.sub}`);
    if (made.user) {
      await rest("DELETE", `subscription?user_id=eq.${made.user}`);
      await rest("DELETE", `collector_profile?user_id=eq.${made.user}`);
      await fetch(`${T}/auth/v1/admin/users/${made.user}`, { method: "DELETE", headers: { apikey: SK, Authorization: `Bearer ${SK}` } });
    }
    // Also anything an earlier run left behind when a dropped connection cut
    // it off before this clean-up (found 2026-10-28): every open call titled
    // "B9 …" and every b9-test-… account, with their rows. TEST only.
    for (const row of (await rest("GET", "open_call?select=id&title=like.B9*")).data || []) await rest("DELETE", `open_call?id=eq.${row.id}`);
    const users = (await (await fetch(`${T}/auth/v1/admin/users?per_page=1000`, { headers: { apikey: SK, Authorization: `Bearer ${SK}` } })).json()).users || [];
    for (const old of users.filter((x) => /^b9-test-\d+@example\.com$/.test(x.email))) {
      await rest("DELETE", `subscription?user_id=eq.${old.id}`);
      await rest("DELETE", `collector_profile?user_id=eq.${old.id}`);
      await fetch(`${T}/auth/v1/admin/users/${old.id}`, { method: "DELETE", headers: { apikey: SK, Authorization: `Bearer ${SK}` } });
    }
    const left = (await rest("GET", `open_call?select=id&title=like.B9*`)).data.length
      + (made.user ? (await rest("GET", `collector_profile?select=id&user_id=eq.${made.user}`)).data.length : 0)
      + (made.user ? (await rest("GET", `profiles?select=id&id=eq.${made.user}`)).data.length : 0);
    R.ok("Clean-up", "TEST: every open call, profile, subscription and account the test made is deleted", left === 0, `${left} left`);
  }
}

await b.close();
const { passed, total } = R.write({ heading: LIVE ? "Live site after deploy (read-only)" : "Browser test (v12 code, TEST project, real sign-ins)" });
console.table(R.results.map((r) => ({ area: r.area, check: r.check.slice(0, 64), pass: r.pass ? "PASS" : "FAIL", detail: r.detail.slice(0, 32) })));
console.log(`${passed}/${total} passed — report: reports/B9-open-calls.html`);
process.exit(passed === total ? 0 : 1);
