/**
 * A3 (several disciplines per artist) in real Chrome with a real sign-in.
 *
 * TEST project (dev server on :5198 pointed at TEST; migration 025 run
 * there): ticks disciplines on the admin's own TEST artist profile, saves
 * through the real form, reads what the database stored, checks the profile
 * page and the Artists filter, then puts every changed column back.
 * Against the live site (after deploy) it only reads: the Artists page and
 * filter, and the profile form opening with the picker — nothing is saved.
 *
 *   node scripts/ui-test-disciplines.mjs [site]   (default http://localhost:5198)
 * Report: reports/A3-disciplines.html
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

const R = createReport("A3-disciplines", "A3 — more than one discipline per artist", LIVE
  ? "Real Chrome on the live site, read-only."
  : "Real Chrome, real sign-in, TEST project. Saves through the real form and puts every value back.");
const b = await puppeteer.launch({ executablePath: "C:/Program Files/Google/Chrome/Application/chrome.exe", headless: true });
const p = await b.newPage();
await p.setViewport({ width: 1366, height: 900 });
const errs = []; p.on("pageerror", (e) => errs.push(e.message));
const dismiss = () => p.evaluate(() => [...document.querySelectorAll("button")].find((x) => /^reject$/i.test(x.innerText.trim()))?.click());
const chip = (name) => p.evaluate((n) => { const el = [...document.querySelectorAll('[data-testid="discipline-picker"] [role=group] button')].find((x) => x.innerText.trim().toLowerCase() === n.toLowerCase()); el?.scrollIntoView({ block: "center" }); el?.click(); return !!el; }, name);
const pressed = () => p.evaluate(() => [...document.querySelectorAll('[data-testid="discipline-picker"] button[aria-pressed=true]')].map((x) => x.innerText.trim().toUpperCase()));
// The Artists page shows 18 and adds more as you scroll — scroll until no more arrive.
const artistCards = async () => {
  let last = -1;
  for (let i = 0; i < 40; i++) {
    const n = await p.evaluate(() => { window.scrollTo(0, document.body.scrollHeight); return document.querySelectorAll("a[href^='/artists/']").length; });
    if (n === last) break;
    last = n; await sleep(1500);
  }
  await p.evaluate(() => window.scrollTo(0, 0));
  return p.evaluate(() => [...document.querySelectorAll("a[href^='/artists/']")].map((a) => a.getAttribute("href")));
};

async function signIn() {
  await p.goto(`${SITE}/login`, { waitUntil: "networkidle2" });
  await p.waitForSelector('input[type="email"]', { timeout: 30000 });
  await p.type('input[type="email"]', E.AFC_ADMIN_EMAIL);
  await p.type('input[type="password"]', E.AFC_ADMIN_PASSWORD);
  await Promise.all([p.waitForNavigation({ waitUntil: "networkidle2", timeout: 60000 }).catch(() => {}), p.click('button[type="submit"]')]);
  await dismiss();
}
async function openArtists() {
  await p.goto(`${SITE}/artists`, { waitUntil: "networkidle2", timeout: 90000 });
  await p.waitForFunction(() => document.querySelectorAll("a[href^='/artists/']").length > 0, { timeout: 45000 }).catch(() => {});
  await sleep(1500); await dismiss();
}
const filterBy = async (d) => { await p.evaluate((d) => [...document.querySelectorAll("button")].find((x) => x.innerText.trim().toLowerCase() === d.toLowerCase())?.click(), d); await sleep(1200); };

if (LIVE) {
  // ---------- read-only on the live site
  const H = { apikey: E.VITE_SUPABASE_ANON_KEY };
  const rows = await (await fetch(`${E.VITE_SUPABASE_URL}/rest/v1/artist_profile?select=slug,discipline,disciplines&status=eq.approved&limit=2000`, { headers: H })).json();
  R.ok("Database", "live has the disciplines list (migration 025)", Array.isArray(rows) && rows.every((r) => Array.isArray(r.disciplines)), Array.isArray(rows) ? `${rows.length} published artists` : JSON.stringify(rows).slice(0, 120));
  await openArtists();
  const all = await artistCards();
  await p.screenshot({ path: R.shotPath("1-artists.png") });
  R.ok("Artists page", `lists every published artist (${rows.length})`, new Set(all).size === rows.length, `${new Set(all).size} cards`, "1-artists.png");
  for (const d of ["Painting", "Mixed Media", "Printmaking"]) {
    const want = rows.filter((r) => r.discipline === d || (r.disciplines || []).includes(d)).length;
    await filterBy(d);
    const got = new Set(await artistCards()).size;
    R.ok("Artists page", `"${d}" filter shows every artist with it (${want})`, got === want, `${got} shown`);
  }
  await signIn();
  await p.goto(`${SITE}/profile/edit`, { waitUntil: "networkidle2" });
  await p.waitForSelector('[data-testid="discipline-picker"]', { timeout: 45000 }).catch(() => {});
  R.ok("Profile form", "the artist profile form opens with the discipline picker (nothing saved)", !!(await p.$('[data-testid="discipline-picker"]')));
} else {
  // ---------- TEST: real saves, then everything put back
  const T = E.COPY_SUPABASE_URL.replace(/\/+$/, "");
  if (!T.includes("jbcexmconizdqxnfyjba")) throw new Error("COPY_SUPABASE_URL is not the TEST project");
  const TH = { apikey: E.COPY_SUPABASE_SERVICE_ROLE_KEY, Authorization: `Bearer ${E.COPY_SUPABASE_SERVICE_ROLE_KEY}`, "Content-Type": "application/json", Prefer: "return=representation" };
  const tdb = async (q) => (await fetch(`${T}/rest/v1/${q}`, { headers: TH })).json();
  const admin = (await tdb(`profiles?select=id&email=eq.${encodeURIComponent(E.AFC_ADMIN_EMAIL)}`))[0];
  const before = (await tdb(`artist_profile?select=*&user_id=eq.${admin.id}`))[0];
  R.ok("Setup", `TEST project, the admin's own TEST artist profile ("${before?.display_name}")`, !!before && Array.isArray(before.disciplines), JSON.stringify({ discipline: before?.discipline, disciplines: before?.disciplines }));
  await signIn();
  try {
    await p.goto(`${SITE}/profile/edit`, { waitUntil: "networkidle2" });
    await p.waitForSelector('[data-testid="discipline-picker"]', { timeout: 45000 });
    await sleep(2500);
    const start = await pressed();
    R.ok("Profile form", `opens with the saved discipline ticked (${before.discipline || "none"})`, start.length === (before.discipline ? 1 : 0) && (!before.discipline || start[0] === before.discipline.toUpperCase()), start.join());
    // Clear, then tick Sculpture, Drawing, Painting; make Drawing main
    for (const d of start) await chip(d);
    await chip("Sculpture"); await chip("Drawing"); await chip("Painting");
    await sleep(300);
    await p.evaluate(() => [...document.querySelectorAll('[data-testid="discipline-picker"] p button')].find((x) => x.innerText.trim().toLowerCase() === "drawing")?.click());
    await sleep(400);
    await p.evaluate(() => document.querySelector('[data-testid="discipline-picker"]').scrollIntoView({ block: "center" }));
    await p.screenshot({ path: R.shotPath("2-form-ticked.png") });
    R.ok("Profile form", "three ticked, Drawing made the main one", (await pressed()).length === 3 && /Main:\s*Drawing/i.test(await p.evaluate(() => document.querySelector('[data-testid="discipline-picker"]').innerText)), (await pressed()).join(), "2-form-ticked.png");
    await p.evaluate(() => document.querySelector('[data-testid="discipline-picker"]').closest("form").requestSubmit());
    let after;
    for (let i = 0; i < 20; i++) { await sleep(1000); after = (await tdb(`artist_profile?select=*&id=eq.${before.id}`))[0]; if (after.discipline === "Drawing") break; }
    R.ok("Saved", `main discipline saved: "Drawing"`, after.discipline === "Drawing", after.discipline);
    R.ok("Saved", `full list saved, main first: Drawing, Sculpture, Painting`, JSON.stringify(after.disciplines) === JSON.stringify(["Drawing", "Sculpture", "Painting"]), JSON.stringify(after.disciplines));
    const changed = Object.keys(after).filter((k) => JSON.stringify(after[k]) !== JSON.stringify(before[k]));
    R.ok("Saved", "nothing else on the profile changed", changed.every((k) => ["discipline", "disciplines", "updated_date", "status"].includes(k)), changed.join(", "));

    // profile page
    await p.goto(`${SITE}/artists/${after.slug}`, { waitUntil: "networkidle2" });
    await p.waitForSelector('[data-testid="artist-disciplines"]', { timeout: 45000 }).catch(() => {});
    await sleep(1200);
    const shown = await p.evaluate(() => document.querySelector('[data-testid="artist-disciplines"]')?.innerText.trim());
    await p.screenshot({ path: R.shotPath("3-profile.png") });
    R.ok("Profile page", "shows all three, main first", /^drawing · sculpture · painting$/i.test(shown || ""), shown, "3-profile.png");

    // Artists filter: found under a NON-main discipline (visible to its owner even while pending)
    await openArtists();
    await filterBy("Sculpture");
    const sculptors = await artistCards();
    await p.screenshot({ path: R.shotPath("4-filter-sculpture.png") });
    R.ok("Artists page", "the 'Sculpture' filter finds this artist (a secondary discipline)", sculptors.includes(`/artists/${after.slug}`), `${sculptors.length} shown`, "4-filter-sculpture.png");
    await filterBy("Printmaking");
    R.ok("Artists page", "Printmaking is now in the filter", await p.evaluate(() => [...document.querySelectorAll("button")].some((x) => x.innerText.trim().toLowerCase() === "printmaking")));

    // the admin editor reads the same list
    await p.goto(`${SITE}/admin`, { waitUntil: "networkidle2" });
    await p.waitForFunction(() => [...document.querySelectorAll("button")].some((x) => /^edit listings$/i.test(x.innerText.trim())), { timeout: 60000 }).catch(() => {});
    await p.evaluate(() => [...document.querySelectorAll("button")].find((x) => /^edit listings$/i.test(x.innerText.trim()))?.click());
    await sleep(2500);
    const box = 'input[placeholder="Search by name, email or city"]';
    await p.waitForSelector(box, { timeout: 30000 });
    await p.type(box, after.display_name);
    await sleep(3000);
    let seen = [];
    for (let k = 0; k < 4 && seen.length === 0; k++) {
      await p.evaluate(() => [...document.querySelectorAll("button")].find((x) => /^close$/i.test(x.innerText.trim()))?.click());
      await sleep(1000);
      const ok = await p.evaluate((k) => { const e = [...document.querySelectorAll("button")].filter((x) => /^edit$/i.test(x.innerText.trim()) && x.offsetParent); if (!e[k]) return false; e[k].click(); return true; }, k);
      if (!ok) break;
      await sleep(3000);
      seen = await pressed();
    }
    await p.screenshot({ path: R.shotPath("5-admin-editor.png") });
    R.ok("Admin editor", "Edit Listings shows the same three ticked", seen.length === 3 && ["DRAWING", "SCULPTURE", "PAINTING"].every((d) => seen.includes(d)), seen.join(), "5-admin-editor.png");
  } catch (err) {
    R.ok("Whole run", "test ran to the end", false, String(err?.message || err).slice(0, 150));
  } finally {
    const now = (await tdb(`artist_profile?select=*&id=eq.${before.id}`))[0] || {};
    const restore = Object.fromEntries(Object.keys(now).filter((k) => k !== "updated_date" && JSON.stringify(now[k]) !== JSON.stringify(before[k])).map((k) => [k, before[k]]));
    const back = Object.keys(restore).length
      ? (await (await fetch(`${T}/rest/v1/artist_profile?id=eq.${before.id}`, { method: "PATCH", headers: TH, body: JSON.stringify(restore) })).json())[0]
      : now;
    R.ok("Clean-up", "the TEST profile is exactly as before", Object.keys(before).filter((k) => k !== "updated_date").every((k) => JSON.stringify(back?.[k]) === JSON.stringify(before[k])), `restored: ${Object.keys(restore).join(", ") || "nothing needed"}`);
  }
}
R.ok("Whole run", "no page errors", errs.length === 0, errs.join(" | "));

// phone
await p.setViewport({ width: 390, height: 844 });
await p.goto(`${SITE}/profile/edit`, { waitUntil: "networkidle2" });
await p.waitForSelector('[data-testid="discipline-picker"]', { timeout: 45000 }).catch(() => {});
await sleep(1500);
await p.evaluate(() => document.querySelector('[data-testid="discipline-picker"]')?.scrollIntoView({ block: "center" }));
const over = await p.evaluate(() => document.documentElement.scrollWidth - innerWidth);
await p.screenshot({ path: R.shotPath("6-phone.png") });
R.ok("Phone", "picker fits, no sideways scrolling", over <= 1 && !!(await p.$('[data-testid="discipline-picker"]')), `${over}px`, "6-phone.png");

await b.close();
const { passed, total } = R.write({ heading: LIVE ? "Live site after deploy (read-only)" : "Browser test (v12 code, TEST project, real sign-in)" });
console.table(R.results.map((r) => ({ area: r.area, check: r.check.slice(0, 60), pass: r.pass ? "PASS" : "FAIL", detail: r.detail.slice(0, 40) })));
console.log(`${passed}/${total} passed — report: reports/A3-disciplines.html`);
process.exit(passed === total ? 0 : 1);
