/**
 * Payments paused: nothing on the site asks for payment. Real Chrome, READ-ONLY.
 *   node scripts/ui-test-payments-paused.mjs [site]   (default https://www.artfutureclub.com)
 * Report: reports/payments-paused.html
 */
import puppeteer from "puppeteer-core";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { createReport } from "./lib/report.mjs";

const ROOT = fileURLToPath(new URL("..", import.meta.url));
const E = Object.fromEntries(readFileSync(join(ROOT, ".env"), "utf8").split(/\r?\n/).filter((l) => /^[A-Z_]+=/.test(l)).map((l) => [l.slice(0, l.indexOf("=")), l.slice(l.indexOf("=") + 1).trim()]));
const SITE = (process.argv[2] || "https://www.artfutureclub.com").replace(/\/+$/, "");
const R = createReport("payments-paused", "Payments paused — nothing asks for payment", `Real Chrome, ${SITE}. Read-only.`);
const ASKS = /upgrade membership|upgrade ↑|free limit|monthly limit reached|\$\s?(12|49|99)\b|membership policy|tiered membership/i;
const b = await puppeteer.launch({ executablePath: "C:/Program Files/Google/Chrome/Application/chrome.exe", headless: true });
const errs = [];
const open = async (w) => {
  const p = await (await b.createBrowserContext()).newPage();
  p.on("pageerror", (e) => errs.push(e.message));
  p.on("dialog", (d) => d.dismiss());
  await p.setViewport({ width: w, height: w < 600 ? 844 : 900 });
  return p;
};
const go = async (p, path) => {
  // Not "networkidle": it never settles on a slow connection. One retry, then fail loudly.
  const load = () => p.goto(`${SITE}${path}`, { waitUntil: "domcontentloaded", timeout: 90000 });
  await load().catch(load);
  // Wait for the page itself, not the loading spinner, or the check proves nothing.
  await p.waitForFunction(() => document.body.innerText.trim().length > 200, { timeout: 45000 }).catch(() => {});
  await new Promise((r) => setTimeout(r, 1200));
};
const scan = (p) => p.evaluate(() => ({ at: location.pathname, text: document.body.innerText, links: document.querySelectorAll('a[href="/upgrade"],a[href="/membership-policy"]').length }));
const checkPage = async (p, area, path, at = path) => {
  await go(p, path);
  const s = await scan(p);
  const hit = s.text.match(ASKS)?.[0] || "";
  R.ok(area, `${path}: no payment link or wording`, s.at === at && s.links === 0 && !hit && s.text.length > 200, `at ${s.at}, ${s.text.length} chars, ${s.links} links${hit ? `, says "${hit}"` : ""}`);
};
try {
  for (const [w, tag] of [[1366, "desktop"], [390, "phone"]]) {
    const p = await open(w);
    for (const path of ["/", "/artists", "/gallery", "/venues", "/directory", "/events", "/open-calls", "/editorial", "/map", "/about", "/partnership", "/collectors", "/register", "/login"]) await checkPage(p, `Visitor (${tag})`, path);
    await checkPage(p, `Visitor (${tag})`, "/upgrade", "/");
    await checkPage(p, `Visitor (${tag})`, "/membership-policy", "/");
    await go(p, "/collectors");
    R.ok(`Visitor (${tag})`, "collectors are still private", !!(await p.$('[data-testid="collectors-locked"]')));
    await p.screenshot({ path: R.shotPath(`collectors-${tag}.png`) });
    R.ok(`Visitor (${tag})`, "screenshot of Collectors", true, "", `collectors-${tag}.png`);
  }
  const p = await open(1366);
  await go(p, "/login");
  await p.type('input[type="email"]', E.AFC_ADMIN_EMAIL);
  await p.type('input[type="password"]', E.AFC_ADMIN_PASSWORD);
  await Promise.all([p.waitForNavigation({ waitUntil: "networkidle2", timeout: 90000 }).catch(() => {}), p.click('button[type="submit"]')]);
  await p.waitForFunction(() => location.pathname !== "/login", { timeout: 30000 }).catch(() => {});
  R.ok("Signed in", "signed in", (await scan(p)).at !== "/login");
  for (const path of ["/", "/community", "/profile/edit", "/about"]) {
    await go(p, path);
    const s = await scan(p);
    const hit = s.text.match(ASKS)?.[0] || "";
    R.ok("Signed in", `${path}: no payment link or wording`, s.at !== "/login" && s.links === 0 && !hit && s.text.length > 200, `at ${s.at}, ${s.text.length} chars${hit ? `, says "${hit}"` : ""}`);
  }
  await checkPage(p, "Signed in", "/upgrade", "/");
  R.ok("Whole run", "no page errors", errs.length === 0, errs.join(" | ").slice(0, 200));
} finally { await b.close(); }
const { passed, total } = R.write({ heading: SITE });
R.results.filter((r) => !r.pass).forEach((r) => console.log("FAIL", r.area, r.check, r.detail));
R.results.filter((r) => r.area === "Signed in").forEach((r) => console.log(r.pass ? "PASS" : "FAIL", r.check, r.detail || ""));
console.log(`${passed}/${total} passed — report: reports/payments-paused.html`);
process.exit(passed === total ? 0 : 1);
