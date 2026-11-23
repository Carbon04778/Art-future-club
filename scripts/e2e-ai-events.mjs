/**
 * AI Events end to end on the TEST project (C8): real websites, real AI, real
 * drafts, approvals by admin and by an organiser in Chrome, then clean-up.
 * Refuses to run against any project but TEST. Needs the dev server on 5198
 * pointing at TEST.   node scripts/e2e-ai-events.mjs
 * Report: reports/C8-e2e.html
 */
import puppeteer from "puppeteer-core";
import { randomBytes } from "node:crypto";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { createReport } from "./lib/report.mjs";

const ROOT = fileURLToPath(new URL("..", import.meta.url));
const E = Object.fromEntries(readFileSync(join(ROOT, ".env"), "utf8").split(/\r?\n/).filter((l) => /^[A-Z_]+=/.test(l)).map((l) => [l.slice(0, l.indexOf("=")), l.slice(l.indexOf("=") + 1).trim()]));
const URL_ = E.COPY_SUPABASE_URL, SVC = E.COPY_SUPABASE_SERVICE_ROLE_KEY, ANON = E.COPY_SUPABASE_ANON_KEY, SITE = "http://localhost:5198";
if (!/jbcexmconizdqxnfyjba/.test(URL_)) throw Error("NOT TEST — stopped");
if (!(await fetch(`${SITE}/src/api/base44Client.js`).then((r) => r.text())).includes("jbcexmconizdqxnfyjba")) throw Error("5198 is not on TEST — stopped");
// The endpoint is given TEST only.
Object.assign(process.env, { VITE_SUPABASE_URL: URL_, SUPABASE_URL: URL_, VITE_SUPABASE_ANON_KEY: ANON, SUPABASE_SERVICE_ROLE_KEY: SVC, MISTRAL_API_KEY: E.MISTRAL_API_KEY, CRON_SECRET: randomBytes(24).toString("hex") });
delete process.env.RESEND_API_KEY;
const handler = (await import("../api/ai-events.js")).default;

const R = createReport("C8-e2e", "AI Events — full test on TEST", "Real websites, real AI and real Chrome on the TEST project. Everything added was removed afterwards.");
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const rest = async (path, { token = SVC, key = SVC, ...init } = {}) => {
  const r = await fetch(`${URL_}/rest/v1/${path}`, { ...init, headers: { apikey: key, Authorization: `Bearer ${token}`, "Content-Type": "application/json", Prefer: "return=representation", ...(init.headers || {}) } });
  const t = await r.text();
  return { ok: r.ok, status: r.status, data: t ? JSON.parse(t) : null };
};
const must = async (...a) => { const r = await rest(...a); if (!r.ok) throw Error(`${a[0]}: ${JSON.stringify(r.data)}`); return r.data; };
const as = (token) => ({ token, key: ANON });
const rpc = (token, fn, body) => rest(`rpc/${fn}`, { ...as(token), method: "POST", body: JSON.stringify(body) });
const signIn = async (email, password) => { const r = await fetch(`${URL_}/auth/v1/token?grant_type=password`, { method: "POST", headers: { apikey: ANON, "Content-Type": "application/json" }, body: JSON.stringify({ email, password }) }); const j = await r.json(); if (!r.ok) throw Error("sign in: " + JSON.stringify(j)); return j.access_token; };
const signOut = (t) => fetch(`${URL_}/auth/v1/logout?scope=local`, { method: "POST", headers: { apikey: ANON, Authorization: `Bearer ${t}` } });
const callApi = async (req) => { const res = { setHeader() {}, end(b) { this.body = JSON.parse(b); } }; await handler({ headers: {}, url: "/api/ai-events", ...req }, res); return { status: res.statusCode, body: res.body }; };
const count = async (t) => { const r = await fetch(`${URL_}/rest/v1/${t}?select=id`, { headers: { apikey: SVC, Authorization: `Bearer ${SVC}`, Prefer: "count=exact", Range: "0-0" } }); return Number(r.headers.get("content-range").split("/")[1]); };

const before = { event: await count("event"), listings: await count("collector_profile") };
const eventIds0 = new Set((await must("event?select=id&limit=1000")).map((x) => x.id));
const [settings0] = await must("ai_event_settings?select=*");
for (const t of ["ai_event_source", "ai_event_draft", "ai_event_run"]) if (await count(t)) throw Error(`${t} is not empty — stopped, so clean-up cannot remove someone's work`);
const stamp = Date.now();
const orgEmail = `ai-events-e2e-${stamp}@example.com`, orgPass = randomBytes(12).toString("hex") + "Aa1!";
let orgId = null, listing = null, admin = null, org = null, b = null;
const errs = [];
try {
  admin = await signIn(E.AFC_ADMIN_EMAIL, E.AFC_ADMIN_PASSWORD);
  /* ---- a throwaway organiser who owns a throwaway gallery */
  const u = await fetch(`${URL_}/auth/v1/admin/users`, { method: "POST", headers: { apikey: SVC, Authorization: `Bearer ${SVC}`, "Content-Type": "application/json" }, body: JSON.stringify({ email: orgEmail, password: orgPass, email_confirm: true, user_metadata: { full_name: "E2E Organiser" } }) }).then((r) => r.json());
  if (!u.id) throw Error("user: " + JSON.stringify(u));
  orgId = u.id;
  listing = (await must("collector_profile", { method: "POST", body: JSON.stringify({ user_id: orgId, display_name: `E2E Gallery ${stamp}`, type: "Gallery", based_in: "Hong Kong", website: "https://example.com" }) }))[0];
  org = await signIn(orgEmail, orgPass);
  R.ok("Setup", "throwaway gallery and owner made on TEST", !!listing.id && !!org);

  /* ---- websites */
  const names = ["10 Chancery Lane Gallery", "Axel Vervoordt Gallery", "Gagosian", "MASSIMODECARLO", "Square Street Gallery", "CHAT Centre for Heritage, Arts and Textile", "Jockey Club Creative Arts Centre", "Aabee Bleue Project", "10 A.M. Gallery", "Galerie Andres Thalmann", "Luca Tommasi Arte Contemporanea"];
  const all = await must("collector_profile?select=id,display_name,based_in,website&website=not.is.null&limit=1000");
  const pick = names.map((n) => all.find((l) => l.display_name === n)).filter(Boolean);
  const add = await rest("ai_event_source", { ...as(admin), method: "POST", body: JSON.stringify(pick.map((l) => ({ listing_id: l.id, name: l.display_name, url: l.website, city: l.based_in }))) });
  R.ok("Websites", "admin adds websites", add.ok && add.data.length === pick.length, `${add.data?.length}`);
  R.ok("Websites", "organiser cannot see or add websites", (await rest("ai_event_source?select=id", as(org))).data.length === 0 && !(await rest("ai_event_source", { ...as(org), method: "POST", body: JSON.stringify({ name: "x", url: "https://x.com" }) })).ok);
  R.ok("Websites", "visitor cannot see drafts, websites or settings", (await Promise.all(["ai_event_draft", "ai_event_source", "ai_event_settings", "ai_event_run"].map((t) => rest(`${t}?select=*`, as(ANON))))).every((r) => !r.ok || r.data.length === 0));

  /* ---- who may run it */
  R.ok("Run", "organiser cannot start a check", (await callApi({ method: "POST", headers: { authorization: `Bearer ${org}` } })).status === 403);
  R.ok("Run", "wrong schedule secret refused", (await callApi({ method: "GET", headers: { authorization: "Bearer nope" } })).status === 401);
  const cron = { authorization: `Bearer ${process.env.CRON_SECRET}` };
  R.ok("Run", "schedule off: the weekly call does nothing", (await callApi({ method: "GET", url: "/api/ai-events?step=start", headers: cron })).body.idle === true && (await count("ai_event_run")) === 0);

  /* ---- real check in steps, as Run now does */
  let p, steps = 0;
  do { p = await callApi({ method: "POST", headers: { authorization: `Bearer ${admin}` } }); steps++; console.log("step", steps, JSON.stringify(p.body)); } while (p.status === 200 && !p.body.done && steps < 20);
  const [run] = await must("ai_event_run?select=*");
  const drafts = await must("ai_event_draft?select=*&order=title");
  R.ok("Run", "real check finishes", p.body.done && run.status === "done" && run.results.length === pick.length, `${steps} steps, ${drafts.length} drafts, $${Number(run.cost_usd).toFixed(4)}`);
  R.ok("Run", "each website checked once", new Set(run.results.map((x) => x.source_id)).size === run.results.length);
  for (const x of run.results) console.log("  ", x.name, x.status, x.detail, x.found);
  R.ok("Run", "blocked and not-allowed sites reported", run.results.find((x) => x.name === "Gagosian")?.status === "blocked" && run.results.find((x) => /Jockey/.test(x.name))?.status === "robots");
  R.ok("Run", "report email: says it is not set up, nothing sent", !run.report_sent_at && /not set up/.test(run.report_error || ""), run.report_error);
  R.ok("Run", "nothing published", (await count("event")) === before.event);
  const EXP = { "Against the Wind": ["2026-10-22", "2027-01-16"], "Giorgio Griffa": ["2026-10-16", "2027-01-30"], "The Studio": ["2026-10-12", "2026-12-18"], "Kim Lim, Source": ["2026-09-17", "2027-01-30"], "Regina Cassolo Bracchi": ["2026-11-26", "2027-01-29"], "Oh Haji: Becoming Flowers": ["2026-11-14", "2027-02-28"] };
  const wrong = Object.entries(EXP).filter(([t, [s, e]]) => { const d = drafts.find((x) => x.title === t); return !d || d.start_date !== s || d.end_date !== e; }).map((x) => x[0]);
  R.ok("Drafts", "six hand-checked events saved with the right dates", wrong.length === 0, wrong.join(", "));
  R.ok("Drafts", "no ended event saved", drafts.every((d) => !(d.end_date || d.start_date) || (d.end_date || d.start_date) >= run.started_at.slice(0, 10)));
  R.ok("Drafts", "every draft has its source link", drafts.every((d) => /^https?:/.test(d.source_url)));
  R.ok("Drafts", "unclear details are flagged", drafts.filter((d) => !d.start_date || !d.chapter).every((d) => d.flags.length));
  const dupes = drafts.filter((d) => d.duplicate_of);
  R.ok("Drafts", "possible duplicates (information)", true, dupes.map((d) => d.title).join(", ") || "none");
  do { p = await callApi({ method: "POST", headers: { authorization: `Bearer ${admin}` } }); } while (!p.body.done);
  const again = await must("ai_event_draft?select=id,title,run_id");
  const extra = again.filter((x) => x.run_id !== run.id);
  R.ok("Drafts", "second check does not repeat drafts", extra.length === 0, extra.map((x) => x.title).join(", "));
  const r2 = (await must("ai_event_run?select=*&order=started_at.desc&limit=1"))[0];
  R.ok("Run", "unchanged pages cost little the second time", Number(r2.cost_usd) < Number(run.cost_usd), `$${Number(run.cost_usd).toFixed(4)} then $${Number(r2.cost_usd).toFixed(4)}`);

  /* ---- approvals through the database */
  const free = drafts.find((d) => d.title === "Against the Wind"), draftBase = { source_id: null, run_id: run.id, event_type: "Exhibition", source_url: "https://example.com/e", chapter: "Hong Kong", timezone: "Asia/Hong_Kong", start_date: "2027-03-01", end_date: "2027-04-01" };
  const review = (t, id, a, patch = {}, note = null) => rpc(t, "ai_event_review", { p_draft: id, p_action: a, p_patch: patch, p_note: note });
  R.ok("Approval", "trial: approve only marks as checked", (await review(admin, free.id, "approve")).data === "checked" && (await count("event")) === before.event);
  R.ok("Approval", "organiser cannot use the admin approval", !(await review(org, free.id, "approve")).ok);
  R.ok("Approval", "organiser cannot end the trial", (await rest("ai_event_settings?id=eq.true", { ...as(org), method: "PATCH", body: JSON.stringify({ trial_mode: false }) })).data?.length === 0);
  R.ok("Approval", "admin cannot skip the steps by editing a draft directly", !(await rest(`ai_event_draft?id=eq.${free.id}`, { ...as(admin), method: "PATCH", body: JSON.stringify({ state: "published" }) })).ok);
  R.ok("Approval", "nobody can call the publish step directly", !(await rpc(admin, "ai_event_publish", { p_draft: free.id })).ok);
  await must("ai_event_settings?id=eq.true", { ...as(admin), method: "PATCH", body: JSON.stringify({ trial_mode: false }) });
  R.ok("Approval", "trial ended, unclaimed listing: admin approval publishes", (await review(admin, free.id, "approve")).data === "published" && (await count("event")) === before.event + 1);
  const pub = (await must(`event?source_url=eq.${encodeURIComponent(free.source_url)}&select=*`))[0];
  R.ok("Approval", "published event: right dates, no invented time, no picture, has a page link", pub.start_date.startsWith("2026-10-22") && pub.date_only === true && !pub.image_url && !!pub.slug && pub.is_free === false, pub.slug);
  const mk = async (x) => (await must("ai_event_draft", { method: "POST", body: JSON.stringify({ ...draftBase, listing_id: listing.id, venue: listing.display_name, title: x, match_key: x.toLowerCase(), evidence: {}, flags: [] }) }))[0];
  const o1 = await mk("E2E Show One"), o2 = await mk("E2E Show Two"), o3 = await mk("E2E Show Three");
  R.ok("Approval", "organiser sees nothing before admin approves", (await rest("ai_event_draft?select=id", as(org))).data.length === 0);
  for (const d of [o1, o2, o3]) R.ok("Approval", `claimed listing: ${d.title} waits for the organiser`, (await review(admin, d.id, "approve")).data === "awaiting_organiser");
  R.ok("Approval", "not public yet", (await count("event")) === before.event + 1);
  R.ok("Approval", "organiser now sees only their three", (await rest("ai_event_draft?select=id", as(org))).data.length === 3);

  /* ---- organiser, in Chrome */
  b = await puppeteer.launch({ executablePath: "C:/Program Files/Google/Chrome/Application/chrome.exe", headless: true });
  const open = async (ctx, path, w) => { const pg = await ctx.newPage(); await pg.setViewport({ width: w, height: 900 }); pg.on("pageerror", (e) => errs.push(`${path}: ${e.message}`)); await pg.goto(SITE + path, { waitUntil: "domcontentloaded", timeout: 90000 }); await sleep(4000); return pg; };
  const login = async (ctx, e, pw) => { const pg = await open(ctx, "/login", 1366); await pg.type('input[type="email"]', e); await pg.type('input[type="password"]', pw); await pg.click('button[type="submit"]'); await sleep(7000); await pg.close(); };
  const btn = (pg, box, title, re) => pg.evaluate((bx, t, s) => { const li = [...document.querySelectorAll(`${bx} li`)].find((x) => x.textContent.includes(t)); const y = [...(li?.querySelectorAll("button") || [])].find((z) => new RegExp(s).test(z.textContent.trim())); y?.click(); return !!y; }, box, title, re);
  const text = (pg) => pg.evaluate(() => document.body.textContent.replace(/\s+/g, " "));
  const oc = await b.createBrowserContext();
  await login(oc, orgEmail, orgPass);
  const BOX = '[data-testid="organiser-drafts"]';
  let pg = await open(oc, "/notifications", 390);
  await pg.waitForSelector(`${BOX} li`, { timeout: 60000 });
  await sleep(1500);
  await pg.screenshot({ path: R.shotPath("organiser.png") });
  let t = await text(pg);
  R.ok("Organiser (phone)", "sees events to approve, and a notification", /Events to approve/.test(t) && /E2E Show One/.test(t) && /for your approval/.test(t), "", "organiser.png");
  R.ok("Organiser (phone)", "fits the screen", (await pg.evaluate(() => document.documentElement.scrollWidth - innerWidth)) <= 0);
  await btn(pg, BOX, "E2E Show One", "^Approve and publish"); await sleep(4000);
  R.ok("Organiser (phone)", "approve publishes it", /is now live/.test(await text(pg)) && (await must(`ai_event_draft?id=eq.${o1.id}&select=state`))[0].state === "published");
  await btn(pg, BOX, "E2E Show Two", "^Request a change"); await sleep(500);
  await pg.type(`${BOX} textarea`, "Please fix the end date");
  await btn(pg, BOX, "E2E Show Two", "^Send$"); await sleep(4000);
  const s2 = (await must(`ai_event_draft?id=eq.${o2.id}&select=state,note`))[0];
  R.ok("Organiser (phone)", "request a change goes back to admin with the note", s2.state === "changes" && /end date/.test(s2.note), s2.note);
  await btn(pg, BOX, "E2E Show Three", "^Decline$"); await sleep(4000);
  R.ok("Organiser (phone)", "decline: not published", (await must(`ai_event_draft?id=eq.${o3.id}&select=state,event_id`))[0].state === "declined");
  await pg.close();
  const e1 = (await must("event?title=eq.E2E%20Show%20One&select=*"))[0];
  R.ok("Organiser (phone)", "published event belongs to the organiser", e1?.organizer_id === orgId);
  await oc.close();

  /* ---- admin, in Chrome, on the real drafts; Run now goes to the real endpoint */
  const ac = await b.createBrowserContext();
  await login(ac, E.AFC_ADMIN_EMAIL, E.AFC_ADMIN_PASSWORD);
  const AB = '[data-testid="ai-events"]';
  const tabc = (x, re) => x.evaluate((bx, s) => { const y = [...document.querySelectorAll(`${bx} button`)].find((z) => new RegExp(s).test(z.textContent.trim())); y?.click(); return !!y; }, AB, re);
  pg = await open(ac, "/admin?tab=AI%20Events", 1366);
  await pg.waitForSelector(AB, { timeout: 60000 }); await sleep(4000);
  t = await text(pg);
  R.ok("Admin", "trial note gone, real drafts listed", !/Trial: nothing here is public/.test(t) && /Ready to review \(\d+\)/.test(t), (t.match(/Ready to review \(\d+\)|Needs checking \(\d+\)|Possible duplicates \(\d+\)/g) || []).join(", "));
  await (await pg.$(AB)).screenshot({ path: R.shotPath("admin-ready.png") });
  await tabc(pg, "^Needs checking"); await sleep(1000);
  t = await text(pg);
  await (await pg.$(AB)).screenshot({ path: R.shotPath("admin-checking.png") });
  R.ok("Admin", "organiser's change note shown", /Please fix the end date/.test(t), "", "admin-checking.png");
  await btn(pg, AB, "E2E Show Two", "^Edit$"); await sleep(800);
  await pg.evaluate(() => { const i = document.querySelectorAll('[data-testid="ai-events"] form input[type="date"]')[1]; Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value").set.call(i, "2027-05-01"); i.dispatchEvent(new Event("input", { bubbles: true })); });
  await sleep(300);
  await pg.evaluate(() => document.querySelector('[data-testid="ai-events"] form button[type="submit"]').click());
  await sleep(4000);
  R.ok("Admin", "edit saves to the database", (await must(`ai_event_draft?id=eq.${o2.id}&select=end_date`))[0].end_date === "2027-05-01");
  await btn(pg, AB, "E2E Show Two", "^Approve$"); await sleep(4000);
  R.ok("Admin", "approving again sends it back to the organiser", (await must(`ai_event_draft?id=eq.${o2.id}&select=state`))[0].state === "awaiting_organiser" && /Waiting for the organiser/.test(await text(pg)));
  await tabc(pg, "^History"); await sleep(1000);
  t = await text(pg);
  R.ok("Admin", "history lists both checks", (t.match(/of 11 checked/g) || []).length === 2, String((t.match(/of 11 checked/g) || []).length));
  await pg.close();
  pg = await open(ac, `/events/${e1.slug}`, 390);
  t = await text(pg);
  R.ok("Public page", "published event opens, with no invented time", /E2E Show One/.test(t) && !/12:00|20:00|13:00/.test(t), "", "event.png");
  await pg.screenshot({ path: R.shotPath("event.png") });
  await pg.close();
  await ac.close();
  R.ok("History", "each decision recorded with who did it", (await must(`ai_event_log?draft_id=eq.${o2.id}&select=action,actor`)).every((x) => x.actor) && (await must(`ai_event_log?draft_id=eq.${o2.id}&select=action`)).length >= 4);

  /* ---- schedule */
  await must("ai_event_settings?id=eq.true", { ...as(admin), method: "PATCH", body: JSON.stringify({ schedule_on: true }) });
  await must("ai_event_source?active=is.true", { method: "PATCH", body: JSON.stringify({ active: false }) });
  await must("ai_event_source?name=eq.Square%20Street%20Gallery", { method: "PATCH", body: JSON.stringify({ active: true }) });
  R.ok("Schedule", "a later call does not start a new week by itself", (await callApi({ method: "GET", url: "/api/ai-events?step=more", headers: cron })).body.idle === true);
  const cr = await callApi({ method: "GET", url: "/api/ai-events?step=start", headers: cron });
  const r3 = (await must("ai_event_run?select=*&order=started_at.desc&limit=1"))[0];
  R.ok("Schedule", "schedule on: the weekly call runs; paused websites skipped", cr.body.done && r3.trigger === "schedule" && r3.results.length === 1, JSON.stringify(cr.body));
} catch (e) { R.ok("Whole run", "test ran to the end", false, String(e?.message || e).slice(0, 190)); console.error(e); } finally {
  if (b) await b.close();
  /* ---- clean-up: only what this test added */
  try {
    const made = (await must("event?select=id,source_url,title&limit=1000")).filter((x) => !eventIds0.has(x.id) && (x.source_url || /^E2E Show/.test(x.title)));
    for (const x of made) await must(`event?id=eq.${x.id}`, { method: "DELETE" });
    for (const tb of ["ai_event_draft", "ai_event_run", "ai_event_source"]) await must(`${tb}?id=not.is.null`, { method: "DELETE" });
    if (listing) await must(`collector_profile?id=eq.${listing.id}`, { method: "DELETE" });
    if (orgId) await fetch(`${URL_}/auth/v1/admin/users/${orgId}`, { method: "DELETE", headers: { apikey: SVC, Authorization: `Bearer ${SVC}` } });
    await must("ai_event_settings?id=eq.true", { method: "PATCH", body: JSON.stringify({ trial_mode: settings0.trial_mode, schedule_on: settings0.schedule_on, report_emails: settings0.report_emails }) });
    if (admin) await signOut(admin);
    const gone = orgId ? (await fetch(`${URL_}/auth/v1/admin/users/${orgId}`, { headers: { apikey: SVC, Authorization: `Bearer ${SVC}` } })).status : 404;
    const after = { event: await count("event"), listings: await count("collector_profile") };
    const left = (await Promise.all(["ai_event_source", "ai_event_draft", "ai_event_run", "ai_event_log"].map(count))).join();
    const [s] = await must("ai_event_settings?select=trial_mode,schedule_on");
    R.ok("Clean-up", "TEST is exactly as before", after.event === before.event && after.listings === before.listings && left === "0,0,0,0" && gone === 404 && s.trial_mode === settings0.trial_mode && s.schedule_on === settings0.schedule_on, `${JSON.stringify(before)} → ${JSON.stringify(after)}; left ${left}; user ${gone}; trial ${s.trial_mode}`);
  } catch (e) { R.ok("Clean-up", "TEST is exactly as before", false, String(e?.message || e).slice(0, 190)); }
}
R.ok("Whole run", "no page errors", errs.length === 0, errs.join(" | ").slice(0, 300));
const { passed, total } = R.write({ heading: "TEST project" });
for (const r of R.results) console.log(r.pass ? "PASS" : "FAIL", "|", r.area, "|", r.check, "|", r.detail);
console.log(`${passed}/${total} passed — report: reports/C8-e2e.html`);
process.exit(passed === total ? 0 : 1);
