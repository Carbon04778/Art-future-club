/**
 * B11 (the Directory) end to end — real Chrome, real sign-ins.
 *
 * TEST (dev server on :5198 pointed at TEST, migration 028 run there):
 *   1. A listing the AFC team made (an approved Framer with a pin and a claim
 *      email) shows on /directory, its own page (no photo sections), the map
 *      (Directory filter) — and NOT on the Galleries or Venues pages.
 *   2. Claim: the business signs in with that email and the listing becomes
 *      theirs; "My Profile" opens it.
 *   3. A new business signs up as a Printer: its listing is held for approval
 *      (hidden from the public), appears in the Approvals tab, the admin
 *      approves it, and it appears on /directory.
 *   4. A paid/partner Framer still cannot post open calls.
 *   Everything the test creates is deleted at the end.
 * Live (after deploy): read-only — the page, the menu link, the map filter,
 *   Galleries and Venues unaffected.
 *
 *   node scripts/ui-test-directory.mjs [site]   (default http://localhost:5198)
 * Report: reports/B11-directory.html
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

const R = createReport("B11-directory", "B11 — the Directory", LIVE ? "Real Chrome on the live site, read-only." : "Real Chrome, real sign-ins, TEST project. Everything created for the test is deleted at the end.");
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
const text = (p) => p.evaluate(() => document.body.innerText);
const clickText = (p, re) => p.evaluate((src, flags) => { const re = new RegExp(src, flags); const el = [...document.querySelectorAll("button")].find((x) => re.test(x.innerText.trim())); el?.scrollIntoView({ block: "center" }); el?.click(); return !!el; }, re.source, re.flags);
const cards = (p) => p.evaluate(() => [...document.querySelectorAll('[data-testid="directory-card"] h3')].map((h) => h.textContent.trim()));

if (LIVE) {
  const v = await visitor();
  await go(v.p, "/directory");
  await v.p.screenshot({ path: R.shotPath("1-directory.png") });
  R.ok("Directory", "the page opens with its categories", /Directory/i.test(await text(v.p)) && /Framers/i.test(await text(v.p)) && /Printers/i.test(await text(v.p)), "", "1-directory.png");
  R.ok("Menu", "'Directory' is in the main menu", await v.p.evaluate(() => !!document.querySelector('header a[href="/directory"]')));
  await go(v.p, "/map?show=directory");
  R.ok("Map", "the map has a Directory filter, preselected from the link", await v.p.evaluate(() => [...document.querySelectorAll("button")].some((x) => /^directory$/i.test(x.innerText.trim()))));
  for (const [path, label] of [["/gallery", "Galleries"], ["/venues", "Venues"]]) {
    await go(v.p, path);
    R.ok("Unaffected", `${label} page still opens`, !/not found/i.test(await text(v.p)));
  }
  R.ok("Whole run", "no page errors", v.errs.length === 0, v.errs.join(" | "));
  await v.ctx.close();
} else {
  const T = E.COPY_SUPABASE_URL.replace(/\/+$/, "");
  if (!T.includes("jbcexmconizdqxnfyjba")) throw new Error("COPY_SUPABASE_URL is not the TEST project");
  const SK = E.COPY_SUPABASE_SERVICE_ROLE_KEY, AK = E.COPY_SUPABASE_ANON_KEY;
  const SH = { apikey: SK, Authorization: `Bearer ${SK}`, "Content-Type": "application/json", Prefer: "return=representation" };
  const rest = async (method, q, body, headers = SH) => { const r = await http(`${T}/rest/v1/${q}`, { method, headers, body: body ? JSON.stringify(body) : undefined }); const t = await r.text(); return { status: r.status, data: t ? JSON.parse(t) : null }; };
  const one = async (q) => (await rest("GET", q)).data?.[0];
  const newUser = async (tag) => { const email = `b11-test-${tag}-${Date.now()}@example.com`, password = `B11-${Date.now()}-x!Aa`; return { email, password }; };
  const createUser = async (u) => (await (await http(`${T}/auth/v1/admin/users`, { method: "POST", headers: SH, body: JSON.stringify({ email: u.email, password: u.password, email_confirm: true }) })).json()).id;
  const stamp = Date.now();
  const made = { users: [], spaces: [] };
  try {
    // ---- 1. a listing the AFC team made
    const owner = await newUser("framer");
    const framer = (await rest("POST", "collector_profile", { display_name: `B11 Test Framer ${stamp}`, type: "Framer", status: "approved", based_in: "Hong Kong", address: "1 Frame Street, Hong Kong", geo_lat: 22.2819, geo_lng: 114.1582, bio: "Museum-grade framing", website: "https://b11-framer.example.com", claim_email: owner.email.toLowerCase() })).data[0];
    made.spaces.push(framer.id);
    R.ok("Setup", "TEST: an approved Framer listing made by the AFC team (with a claim email)", !!framer?.slug, framer?.slug);

    const v = await visitor();
    await go(v.p, "/directory");
    await v.p.waitForFunction(() => document.querySelector('[data-testid="directory-card"]'), { timeout: 30000 }).catch(() => {});
    R.ok("Directory page", "the listing is on /directory", (await cards(v.p)).includes(framer.display_name), (await cards(v.p)).length + " listed");
    await clickText(v.p, /^framers$/i); await sleep(800);
    await v.p.screenshot({ path: R.shotPath("1-directory-framers.png") });
    R.ok("Directory page", "the Framers category shows it", (await cards(v.p)).includes(framer.display_name), "", "1-directory-framers.png");
    await go(v.p, `/directory/${framer.slug}`);
    await v.p.waitForFunction(() => document.querySelector("h1, h2"), { timeout: 30000 }).catch(() => {});
    await sleep(1500);
    const page = await text(v.p);
    await v.p.screenshot({ path: R.shotPath("2-listing-page.png") });
    R.ok("Listing page", "its own page: name, bio, website, 'The Directory' back link", page.includes(framer.display_name) && /Museum-grade framing/.test(page) && /The Directory/i.test(page), "", "2-listing-page.png");
    R.ok("Listing page", "no photo sections (no 'Works' heading, no 'Add Work')", !/\bWorks\b/.test(page.replace(/Museum-grade/, "")) && !/add work/i.test(page));
    await go(v.p, "/gallery");
    R.ok("Not elsewhere", "NOT on the Galleries page", !(await text(v.p)).includes(framer.display_name));
    await go(v.p, "/venues");
    R.ok("Not elsewhere", "NOT on the Venues page", !(await text(v.p)).includes(framer.display_name));
    await go(v.p, "/map?show=directory");
    await v.p.waitForFunction((n) => document.body.innerText.includes(n), { timeout: 45000 }, framer.display_name).catch(() => {});
    await v.p.screenshot({ path: R.shotPath("3-map.png") });
    R.ok("Map", "the map's Directory filter lists it", (await text(v.p)).includes(framer.display_name), "", "3-map.png");
    R.ok("Whole run", "no page errors for a visitor", v.errs.length === 0, v.errs.join(" | "));
    await v.ctx.close();

    // ---- 2. the business claims it
    const ownerId = await createUser(owner); made.users.push(ownerId);
    const o = await visitor();
    await signIn(o.p, owner.email, owner.password);
    await go(o.p, "/onboarding");
    await sleep(3000);
    const claimed = await one(`collector_profile?select=user_id&id=eq.${framer.id}`);
    R.ok("Claim", "signing in with the claim email makes the listing theirs", claimed?.user_id === ownerId);
    R.ok("Claim", "…and takes them straight to it", o.p.url().includes(`/directory/${framer.slug}`), o.p.url().replace(SITE, ""));
    const myLink = await o.p.evaluate(() => [...document.querySelectorAll("a")].find((x) => /my profile/i.test(x.innerText))?.getAttribute("href"));
    R.ok("Claim", "'My Profile' opens their listing", myLink === `/directory/${framer.slug}`, myLink);
    const editBtn = await o.p.evaluate(() => [...document.querySelectorAll("button")].some((x) => /edit/i.test(x.innerText)));
    R.ok("Claim", "they can edit it", editBtn);
    // a paid/partner framer still cannot post an open call
    await rest("PATCH", `collector_profile?id=eq.${framer.id}`, { partnership_type: "Partner" });
    const jwt = (await (await http(`${T}/auth/v1/token?grant_type=password`, { method: "POST", headers: { apikey: AK, "Content-Type": "application/json" }, body: JSON.stringify({ email: owner.email, password: owner.password }) })).json()).access_token;
    const acc = await (await http(`${T}/rest/v1/rpc/open_call_access`, { method: "POST", headers: { apikey: AK, Authorization: `Bearer ${jwt}`, "Content-Type": "application/json" }, body: "{}" })).json();
    R.ok("Open calls", "a Partner framer may VIEW open calls but not POST them (galleries only)", acc?.[0]?.can_view === true && acc?.[0]?.can_post === false, JSON.stringify(acc));
    R.ok("Whole run", "no page errors for the business", o.errs.length === 0, o.errs.join(" | "));
    await o.ctx.close();

    // ---- 3. a new business signs up as a Printer
    const nb = await newUser("printer");
    const nbId = await createUser(nb); made.users.push(nbId);
    const s = await visitor();
    await signIn(s.p, nb.email, nb.password);
    await go(s.p, "/onboarding");
    await s.p.waitForFunction(() => document.body.innerText.length > 50, { timeout: 30000 });
    // step 0 → 1 (whatever the first step's button says), choose business
    for (let i = 0; i < 3 && !(await s.p.evaluate(() => [...document.querySelectorAll("button")].some((x) => /art store \/ framer \/ printer/i.test(x.innerText)))); i++) {
      await s.p.evaluate(() => [...document.querySelectorAll("button")].find((x) => /get started|continue|begin|next/i.test(x.innerText) && !x.disabled)?.click());
      await sleep(800);
    }
    await s.p.evaluate(() => [...document.querySelectorAll("button")].find((x) => /art store \/ framer \/ printer/i.test(x.innerText))?.click());
    await sleep(300);
    await clickText(s.p, /^continue/i); await sleep(800);
    await s.p.waitForSelector('[data-testid="business-type"]', { timeout: 15000 });
    await s.p.select('[data-testid="business-type"]', "Printer");
    const nameBox = await s.p.$('input[placeholder="Your name or studio"]');
    await nameBox.click({ clickCount: 3 }); await nameBox.type(`B11 Test Printer ${stamp}`);
    await s.p.screenshot({ path: R.shotPath("4-signup-business.png") });
    await clickText(s.p, /^continue/i); await sleep(800);
    await s.p.evaluate(() => [...document.querySelectorAll("button")].filter((x) => !x.disabled).pop()?.click());
    for (let i = 0; i < 20 && !(await one(`collector_profile?select=id&user_id=eq.${nbId}`)); i++) await sleep(1000);
    const printer = await one(`collector_profile?select=*&user_id=eq.${nbId}`);
    if (printer) made.spaces.push(printer.id);
    await sleep(2500);
    R.ok("Sign-up", "a business can sign up as a Printer", printer?.type === "Printer" && printer?.display_name === `B11 Test Printer ${stamp}`, printer ? `${printer.type}, ${printer.status}` : "no profile", "4-signup-business.png");
    R.ok("Sign-up", "…and lands on its own Directory page", s.p.url().includes("/directory/"), s.p.url().replace(SITE, ""));
    const hidden = await (await http(`${T}/rest/v1/collector_profile?select=id&id=eq.${printer?.id}`, { headers: { apikey: AK } })).json();
    R.ok("Approval", "it is held for approval: the public cannot see it yet", printer?.status !== "approved" && Array.isArray(hidden) && hidden.length === 0, printer?.status);
    R.ok("Whole run", "no page errors during sign-up", s.errs.length === 0, s.errs.join(" | "));
    await s.ctx.close();
    // the business submits for review, as the page asks them to
    if (printer && printer.status === "draft") await rest("PATCH", `collector_profile?id=eq.${printer.id}`, { status: "pending" });

    const a = await visitor();
    await signIn(a.p, E.AFC_ADMIN_EMAIL, E.AFC_ADMIN_PASSWORD);
    await go(a.p, "/admin");
    await a.p.waitForFunction(() => [...document.querySelectorAll("button")].some((x) => /^approvals$/i.test(x.innerText.trim())), { timeout: 90000 });
    await clickText(a.p, /^approvals$/i);
    await a.p.waitForFunction((n) => document.body.innerText.includes(n), { timeout: 45000 }, `B11 Test Printer ${stamp}`).catch(() => {});
    R.ok("Approval", "it appears in the admin's Approvals queue", (await text(a.p)).includes(`B11 Test Printer ${stamp}`));
    await a.p.evaluate((n) => { const li = [...document.querySelectorAll("li")].find((x) => x.innerText.includes(n)); [...(li?.querySelectorAll("button") || [])].find((x) => /approve and publish/i.test(x.innerText))?.click(); }, `B11 Test Printer ${stamp}`);
    for (let i = 0; i < 20 && (await one(`collector_profile?select=status&id=eq.${printer?.id}`))?.status !== "approved"; i++) await sleep(1000);
    R.ok("Approval", "the admin approves it", (await one(`collector_profile?select=status&id=eq.${printer?.id}`))?.status === "approved");
    R.ok("Whole run", "no page errors for the admin", a.errs.length === 0, a.errs.join(" | "));
    await a.ctx.close();
    const v2 = await visitor();
    await go(v2.p, "/directory");
    await v2.p.waitForFunction(() => document.querySelector('[data-testid="directory-card"]'), { timeout: 30000 }).catch(() => {});
    R.ok("Approval", "once approved it is on /directory for everyone", (await cards(v2.p)).includes(`B11 Test Printer ${stamp}`));
    // phone
    const ph = await visitor(390);
    await go(ph.p, "/directory");
    const over = await ph.p.evaluate(() => document.documentElement.scrollWidth - innerWidth);
    await ph.p.screenshot({ path: R.shotPath("5-phone.png") });
    R.ok("Phone", "Directory page: no sideways scrolling", over <= 1, `${over}px`, "5-phone.png");
    await ph.ctx.close();
    await v2.ctx.close();
  } catch (err) {
    R.ok("Whole run", "test ran to the end", false, String(err?.stack || err).slice(0, 200));
  } finally {
    for (const id of made.spaces) await rest("DELETE", `collector_profile?id=eq.${id}`).catch(() => {});
    await rest("DELETE", "collector_profile?display_name=like.B11%20Test*").catch(() => {});
    const all = (await (await http(`${T}/auth/v1/admin/users?per_page=1000`, { headers: SH })).json()).users || [];
    for (const u of all.filter((x) => /^b11-test-/.test(x.email) || made.users.includes(x.id))) {
      await rest("DELETE", `collector_profile?user_id=eq.${u.id}`).catch(() => {});
      await rest("DELETE", `artist_profile?user_id=eq.${u.id}`).catch(() => {});
      await http(`${T}/auth/v1/admin/users/${u.id}`, { method: "DELETE", headers: SH }).catch(() => {});
    }
    const leftU = ((await (await http(`${T}/auth/v1/admin/users?per_page=1000`, { headers: SH })).json()).users || []).filter((x) => /^b11-test-/.test(x.email)).length;
    const leftP = (await rest("GET", "collector_profile?select=id&display_name=like.B11%20Test*")).data.length;
    R.ok("Clean-up", "TEST: every account and listing the test made is deleted", leftU === 0 && leftP === 0, `${leftU} accounts, ${leftP} listings left`);
  }
}

await b.close();
const { passed, total } = R.write({ heading: LIVE ? "Live site after deploy (read-only)" : "Browser test (v12 code, TEST project, real sign-ins)" });
console.table(R.results.map((r) => ({ area: r.area, check: r.check.slice(0, 66), pass: r.pass ? "PASS" : "FAIL", detail: r.detail.slice(0, 30) })));
console.log(`${passed}/${total} passed — report: reports/B11-directory.html`);
process.exit(passed === total ? 0 : 1);
