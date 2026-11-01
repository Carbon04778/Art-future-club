/**
 * Real-browser test of B2 (sold works), against the TEST project only, with a
 * report the owner can open: reports/B2-sold-works.html.
 *
 * Needs a dev server on :5199 pointed at TEST (COPY_SUPABASE_URL). Uses the
 * admin account's OWN artist profile on TEST, plus one other artist as a
 * control that must not change.
 *
 *   node scripts/ui-test-sold.mjs
 */
import puppeteer from "puppeteer-core";
import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = fileURLToPath(new URL("..", import.meta.url));
const E = Object.fromEntries(readFileSync(join(ROOT, ".env"), "utf8").split(/\r?\n/)
  .filter((l) => /^[A-Z_]+=/.test(l)).map((l) => [l.slice(0, l.indexOf("=")), l.slice(l.indexOf("=") + 1).trim()]));
const TEST = E.COPY_SUPABASE_URL.replace(/\/+$/, "");
if (!TEST.includes("jbcexmconizdqxnfyjba")) throw new Error("COPY_SUPABASE_URL is not the TEST project");
const SK = E.COPY_SUPABASE_SERVICE_ROLE_KEY;
const BASE = "http://localhost:5199";
const CONTROL = "shanti1708";
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// ---- the database, read directly, to confirm what was really saved
const db = async (q) => (await fetch(`${TEST}/rest/v1/${q}`, { headers: { apikey: SK, Authorization: `Bearer ${SK}` } })).json();
const admin = (await db(`profiles?select=id&email=eq.${encodeURIComponent(E.AFC_ADMIN_EMAIL)}`))[0];
const mine = async () => (await db(`artist_profile?select=id,slug,display_name,portfolio_works&user_id=eq.${admin.id}`))[0];
const start = await mine();
const SLUG = start.slug;
const addedBefore = start.portfolio_works?.[0]?.added_date || null;

// ---- report
const results = [];
mkdirSync(join(ROOT, "reports", "B2-shots"), { recursive: true });
const ok = (area, check, pass, detail = "", shot = "") => results.push({ area, check, pass: !!pass, detail: String(detail).slice(0, 160), shot });
/**
 * A screenshot of what the check is about: the cookie banner dismissed, and
 * the test artwork (or `focus` text) scrolled into view.
 */
async function snap(p, name, focus = "B2 Test Work") {
  await p.evaluate((focus) => {
    [...document.querySelectorAll("button")].find((b) => /^reject$/i.test(b.innerText.trim()))?.click();
    const el = [...document.querySelectorAll("h3, label, input")].find((e) =>
      (e.innerText || e.value || "").trim() === focus || (e.tagName === "LABEL" && e.innerText.trim() === "Sold"));
    el?.scrollIntoView({ block: "center" });
  }, focus);
  await new Promise((r) => setTimeout(r, 900));
  const f = `B2-shots/${name}.png`;
  await p.screenshot({ path: join(ROOT, "reports", f) });
  return f;
}

const b = await puppeteer.launch({ executablePath: "C:/Program Files/Google/Chrome/Application/chrome.exe", headless: true, protocolTimeout: 240000 });
const p = await b.newPage();
await p.setViewport({ width: 1366, height: 900 });
const pageErrors = [];
p.on("pageerror", (e) => pageErrors.push(e.message));
p.on("dialog", (d) => d.accept().catch(() => {}));
await p.goto(BASE, { waitUntil: "domcontentloaded" });
const login = await p.evaluate(async (email, password) => {
  const { supabase } = await import("/src/api/providers/supabase.js");
  const { error } = await supabase.auth.signInWithPassword({ email, password });
  return error?.message || "ok";
}, E.AFC_ADMIN_EMAIL, E.AFC_ADMIN_PASSWORD);
ok("Setup", "signed in as the admin on TEST", login === "ok", login);

const go = async (path) => { for (let i = 0; i < 3; i++) { try { await p.goto(BASE + path, { waitUntil: "networkidle2", timeout: 90000 }); break; } catch {} } await sleep(2500); };
const setInput = (sel, value, index = 0) => p.evaluate((sel, value, index) => {
  const el = document.querySelectorAll(sel)[index];
  if (!el) return false;
  Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value").set.call(el, value);
  el.dispatchEvent(new Event("input", { bubbles: true }));
  return true;
}, sel, value, index);
/** Tick or untick the checkbox inside the label reading `text` (the first work). */
const setBox = (text, want) => p.evaluate((text, want) => {
  const label = [...document.querySelectorAll("label")].find((l) => l.innerText.trim().toLowerCase() === text.toLowerCase());
  const box = label?.querySelector('input[type="checkbox"]');
  if (!box) return "missing";
  if (box.checked !== want) box.click();
  return box.checked === want ? "ok" : "did not change";
}, text, want);
const visible = (text) => p.evaluate((t) => [...document.querySelectorAll("input")].some((i) => i.placeholder === t && i.offsetParent !== null), text);
const save = async (label) => { await p.evaluate((label) => [...document.querySelectorAll("button")].find((x) => new RegExp(label, "i").test(x.innerText) && x.offsetParent)?.click(), label); await sleep(4500); };
const work0 = async () => (await mine()).portfolio_works?.[0] || {};

// ===== 1. artist's own editor: for sale, then sold, then unsold
await go("/profile/edit");
await setInput('input[placeholder="Work title"]', "B2 Test Work");
ok("Artist editor", "'Available for sale' tick box present", (await setBox("Available for sale", true)) === "ok");
ok("Artist editor", "'Sold' tick box present, under Available for sale", (await setBox("Sold", false)) === "ok");
await sleep(500);
ok("Artist editor", "price field shows while for sale and not sold", await visible("Price (e.g. 3,500)"));
await setInput('input[placeholder="Price (e.g. 3,500)"]', "1,500");
await save("^save");
let w = await work0();
ok("Artist editor", "saved: for sale, not sold, price 1,500", w.available_for_sale === true && w.sold !== true && w.price === "1,500", JSON.stringify({ a: w.available_for_sale, s: w.sold, p: w.price }));

await go(`/artists/${SLUG}`);
let text = await p.evaluate(() => document.body.innerText);
ok("Artist page", "unsold work shows its price", /USD 1,500/.test(text), "", await snap(p, "1-artist-page-for-sale"));
ok("Artist page", "unsold work has Enquire", /enquire/i.test(text));

await go("/profile/edit");
ok("Artist editor", "tick Sold", (await setBox("Sold", true)) === "ok");
await sleep(500);
ok("Artist editor", "price field hides once Sold is ticked", !(await visible("Price (e.g. 3,500)")), "", await snap(p, "2-editor-sold-ticked"));
await save("^save");
w = await work0();
ok("Artist editor", "saved: sold = true", w.sold === true, JSON.stringify({ s: w.sold }));
ok("Artist editor", "the work's added_date survived the save", (w.added_date || null) === addedBefore, `${addedBefore} -> ${w.added_date}`);

await go(`/artists/${SLUG}`);
text = await p.evaluate(() => document.body.innerText);
ok("Artist page", "sold work is still on the page", /B2 Test Work/i.test(text));
ok("Artist page", "sold work is labelled SOLD", /\bSOLD\b/i.test(text), "", await snap(p, "3-artist-page-sold"));
ok("Artist page", "sold work shows no price", !/USD 1,500/.test(text));
ok("Artist page", "sold work has no Enquire button", !/enquire/i.test(text));
// Like is a heart icon; Collect is hidden on your OWN work by design (checked on the control artist below).
ok("Artist page", "Like (heart) still on the sold work", await p.evaluate(() => document.querySelectorAll("svg.lucide-heart").length > 0));

// lightbox: open the work
const opened = await p.evaluate(() => { const img = [...document.querySelectorAll("img")].find((i) => i.closest("button, [role=button], a, div[onclick]") && i.naturalWidth > 0 && i.getBoundingClientRect().width > 150); img?.click(); return !!img; });
await sleep(2000);
const lb = await p.evaluate(() => document.querySelector('[role="dialog"], .fixed.inset-0')?.innerText || "");
ok("Lightbox", "opening the sold work shows 'Sold'", opened && /\bSOLD\b/i.test(lb), lb.slice(0, 80), await snap(p, "4-lightbox-sold"));
ok("Lightbox", "and no price", !/USD 1,500/.test(lb));

// ===== 2. admin Edit Listings: loads sold, unticks it, keeps added_date
await go("/admin");
await p.evaluate(() => [...document.querySelectorAll("button")].find((x) => /^edit listings$/i.test(x.innerText.trim()))?.click());
await sleep(2500);
await setInput('input[placeholder="Search by name, email or city"]', start.display_name);
await sleep(2500);
// The account has an artist AND a collector listing of the same name: pick the artist.
// Open each matching listing's editor until one has works (a Sold box) — that is the artist.
let openedEditor = false;
for (let k = 0; k < 4 && !openedEditor; k++) {
  // Close any open editor first, and let the page update before looking again.
  await p.evaluate(() => [...document.querySelectorAll("button")].find((x) => /^close$/i.test(x.innerText.trim()))?.click());
  await sleep(1500);
  const clicked = await p.evaluate((k) => {
    const edits = [...document.querySelectorAll("button")].filter((x) => /^edit$/i.test(x.innerText.trim()) && x.offsetParent);
    if (!edits[k]) return false;
    edits[k].click();
    return true;
  }, k);
  if (!clicked) break;
  await sleep(3500);
  openedEditor = await p.evaluate(() => [...document.querySelectorAll("label")].some((l) => l.innerText.trim() === "Sold"));
}
const soldBoxState = await p.evaluate(() => [...document.querySelectorAll("label")].find((l) => l.innerText.trim() === "Sold")?.querySelector("input")?.checked);
ok("Admin · Edit Listings", "editor shows the work as Sold", openedEditor && soldBoxState === true, `opened=${openedEditor} checked=${soldBoxState}`, await snap(p, "5-admin-edit-sold"));
ok("Admin · Edit Listings", "untick Sold", (await setBox("Sold", false)) === "ok");
await save("^save changes");
w = await work0();
ok("Admin · Edit Listings", "saved: sold = false", w.sold === false, JSON.stringify({ s: w.sold }));
ok("Admin · Edit Listings", "added_date kept (this panel used to strip it)", (w.added_date || null) === addedBefore, `${addedBefore} -> ${w.added_date}`);
ok("Admin · Edit Listings", "price kept", w.price === "1,500", w.price);

await go(`/artists/${SLUG}`);
text = await p.evaluate(() => document.body.innerText);
ok("Artist page", "after admin unticks Sold: price and Enquire are back", /USD 1,500/.test(text) && /enquire/i.test(text), "", await snap(p, "6-artist-page-back-for-sale"));

// ===== 3. control: another artist, untouched
await go(`/artists/${CONTROL}`);
text = await p.evaluate(() => document.body.innerText);
ok("Other artists", `${CONTROL}: for-sale work still shows price + Enquire`, /enquire/i.test(text) && !/\bSOLD\b/i.test(text), "", await snap(p, "7-control-artist", "Ascend( Abstract Triptych)"));

ok("Other artists", `${CONTROL}: Like and Collect still there`,
  /collect/i.test(text) && (await p.evaluate(() => document.querySelectorAll("svg.lucide-heart").length > 0)));

ok("Whole run", "no page errors in the browser", pageErrors.length === 0, pageErrors.join(" | "));
await b.close();

// ---- write the report
const passed = results.filter((r) => r.pass).length;
const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));
const rows = results.map((r) => `<tr class="${r.pass ? "ok" : "bad"}"><td>${esc(r.area)}</td><td>${esc(r.check)}</td><td>${r.pass ? "PASS" : "FAIL"}</td><td>${esc(r.detail)}</td><td>${r.shot ? `<a href="${r.shot}"><img src="${r.shot}"></a>` : ""}</td></tr>`).join("\n");
const html = `<!doctype html><html><head><meta charset="utf-8"><title>B2 sold works — test report</title>
<style>body{font:14px system-ui,sans-serif;margin:24px;color:#111}h1{margin:0 0 4px}p.sum{font-size:16px}
table{border-collapse:collapse;width:100%}td,th{border:1px solid #ddd;padding:6px 8px;text-align:left;vertical-align:top}
tr.ok td:nth-child(3){color:#0a7d2c;font-weight:700}tr.bad td:nth-child(3){color:#c0182b;font-weight:700}tr.bad{background:#fff3f4}
img{width:220px;border:1px solid #ccc}</style></head><body>
<h1>B2 — sold works stay on the artist page</h1>
<p>Real Chrome, on the TEST project (live untouched). ${new Date().toISOString()}</p>
<p class="sum"><b>${passed} / ${results.length} checks passed</b></p>
<table><tr><th>Area</th><th>Check</th><th>Result</th><th>Detail</th><th>Screenshot</th></tr>${rows}</table>
</body></html>`;
writeFileSync(join(ROOT, "reports", "B2-sold-works.html"), html);
console.table(results.map(({ area, check, pass, detail }) => ({ area, check, pass: pass ? "PASS" : "FAIL", detail: detail.slice(0, 50) })));
console.log(`${passed}/${results.length} passed — report: reports/B2-sold-works.html`);
process.exit(passed === results.length ? 0 : 1);
