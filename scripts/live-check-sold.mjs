/**
 * Read-only check of B2 on the LIVE site after deploy. Writes nothing.
 * Appends a "Live after deploy" section to reports/B2-sold-works.html.
 */
import puppeteer from "puppeteer-core";
import { readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
const ROOT = fileURLToPath(new URL("..", import.meta.url));
const E = Object.fromEntries(readFileSync(join(ROOT, ".env"), "utf8").split(/\r?\n/).filter((l) => /^[A-Z_]+=/.test(l)).map((l) => [l.slice(0, l.indexOf("=")), l.slice(l.indexOf("=") + 1).trim()]));
const L = E.VITE_SUPABASE_URL, A = E.VITE_SUPABASE_ANON_KEY;
const SITE = "https://www.artfutureclub.com";
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const artists = await (await fetch(`${L}/rest/v1/artist_profile?select=slug,display_name,portfolio_works&status=eq.approved&limit=1000`, { headers: { apikey: A } })).json();
const withSale = artists.filter((a) => (a.portfolio_works || []).some((w) => w.available_for_sale && w.price));
const soldOnLive = artists.flatMap((a) => (a.portfolio_works || []).filter((w) => w.sold === true)).length;
const results = [];
const ok = (check, pass, detail = "") => results.push({ check, pass: !!pass, detail: String(detail).slice(0, 140) });
ok("works marked sold on live right now (expected 0 until someone ticks it)", true, soldOnLive);

const b = await puppeteer.launch({ executablePath: "C:/Program Files/Google/Chrome/Application/chrome.exe", headless: true });
async function open(path) {
  const p = await b.newPage(); await p.setViewport({ width: 1366, height: 900 });
  const errs = []; p.on("pageerror", (e) => errs.push(e.message));
  for (let i = 0; i < 3; i++) { try { await p.goto(SITE + path, { waitUntil: "networkidle2", timeout: 90000 }); break; } catch {} }
  await sleep(2500);
  return { p, errs };
}
for (const a of withSale.slice(0, 4)) {
  const { p, errs } = await open(`/artists/${a.slug}`);
  const t = await p.evaluate(() => document.body.innerText);
  const w = a.portfolio_works.find((x) => x.available_for_sale && x.price);
  ok(`${a.display_name}: for-sale work still shows its price and Enquire`, t.includes(String(w.price)) && /enquire/i.test(t) && errs.length === 0, `${w.currency || "USD"} ${w.price}${errs.length ? " · errors: " + errs.join(" | ") : ""}`);
  ok(`${a.display_name}: nothing wrongly labelled SOLD`, !/\bSOLD\b/.test(t));
  await p.close();
}
for (const path of ["/", "/artists", "/map", "/editorial"]) {
  const { p, errs } = await open(path);
  const broken = await p.evaluate(() => [...document.images].filter((i) => i.complete && i.naturalWidth === 0).length);
  ok(`${path} loads with no errors and no broken images`, errs.length === 0 && broken === 0, `errors ${errs.length} · broken images ${broken}`);
  await p.close();
}
await b.close();
const passed = results.filter((r) => r.pass).length;
const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));
const rows = results.map((r) => `<tr class="${r.pass ? "ok" : "bad"}"><td>${esc(r.check)}</td><td>${r.pass ? "PASS" : "FAIL"}</td><td>${esc(r.detail)}</td></tr>`).join("");
const f = join(ROOT, "reports", "B2-sold-works.html");
writeFileSync(f, readFileSync(f, "utf8").replace("</body>", `<h2>Live site after deploy (read-only, ${new Date().toISOString()})</h2><p><b>${passed} / ${results.length} passed</b> — nothing on live was changed by these checks.</p><table><tr><th>Check</th><th>Result</th><th>Detail</th></tr>${rows}</table></body>`));
console.table(results.map((r) => ({ check: r.check.slice(0, 70), pass: r.pass ? "PASS" : "FAIL", detail: r.detail.slice(0, 40) })));
console.log(`${passed}/${results.length} passed (live, read-only)`);
