/**
 * Main menu: Community, About, Messages and Admin moved under "More ⌄"
 * (owner, 2026-11-22: at 100% zoom the bar was too long and crowded).
 *
 * Measures the bar BEFORE (the live site, read-only) and AFTER (the dev
 * server on :5198, TEST project) at common screen widths at 100% zoom, with
 * the admin signed in (the most items) and signed out. Then checks the More
 * menu with the mouse and the keyboard. Nothing is saved anywhere.
 *
 *   node scripts/ui-test-nav-more.mjs [after-site] [before-site]
 * Report: reports/nav-more.html
 */
import puppeteer from "puppeteer-core";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { createReport } from "./lib/report.mjs";

const ROOT = fileURLToPath(new URL("..", import.meta.url));
const E = Object.fromEntries(readFileSync(join(ROOT, ".env"), "utf8").split(/\r?\n/).filter((l) => /^[A-Z_]+=/.test(l)).map((l) => [l.slice(0, l.indexOf("=")), l.slice(l.indexOf("=") + 1).trim()]));
const AFTER = process.argv[2] || "http://localhost:5198";
const BEFORE = process.argv[3] || "https://www.artfutureclub.com";
const WIDTHS = [1024, 1280, 1366, 1440, 1536, 1920];
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const R = createReport("nav-more", "Main menu — Community, About, Messages, Admin under 'More'", `Before: ${BEFORE} (read-only). After: ${AFTER}. Real Chrome at 100% zoom.`);

const b = await puppeteer.launch({ executablePath: "C:/Program Files/Google/Chrome/Application/chrome.exe", headless: true });
const errs = [];
const session = async (site, signIn) => {
  const p = await (await b.createBrowserContext()).newPage();
  p.on("pageerror", (e) => errs.push(`${site}: ${e.message}`));
  await p.setViewport({ width: 1366, height: 900 });
  await p.goto(`${site}/${signIn ? "login" : ""}`, { waitUntil: "networkidle2", timeout: 120000 });
  await sleep(800);
  await p.evaluate(() => [...document.querySelectorAll("button")].find((x) => /^reject$/i.test(x.innerText.trim()))?.click());
  if (signIn) {
    await p.type('input[type="email"]', E.AFC_ADMIN_EMAIL);
    await p.type('input[type="password"]', E.AFC_ADMIN_PASSWORD);
    await Promise.all([p.waitForNavigation({ waitUntil: "networkidle2", timeout: 90000 }).catch(() => {}), p.click('button[type="submit"]')]);
    await p.goto(`${site}/`, { waitUntil: "networkidle2", timeout: 120000 });
    await p.waitForFunction(() => /my profile/i.test(document.querySelector("header")?.innerText || ""), { timeout: 30000 }).catch(() => {});
  }
  return p;
};

/** How the bar looks at this width: one row? anything wrapped, overlapping or squeezed? */
const measure = (p) => p.evaluate(() => {
  const h = document.querySelector("header");
  const row = h.firstElementChild;
  const nav = h.querySelector("nav");
  const right = row.lastElementChild;
  const items = nav && getComputedStyle(nav).display !== "none" ? [...nav.children].map((el) => el.querySelector("button") || el) : [];
  const wrapped = items.filter((el) => el.getClientRects().length > 1 || el.getBoundingClientRect().height > 22).map((el) => el.innerText.trim());
  const rects = items.map((el) => el.getBoundingClientRect());
  let minGap = 999;
  for (let i = 1; i < rects.length; i++) if (Math.abs(rects[i].top - rects[0].top) < 4) minGap = Math.min(minGap, rects[i].left - rects[i - 1].right);
  const rows = new Set(rects.map((r) => Math.round(r.top))).size;
  const navR = nav?.getBoundingClientRect(), rightR = right.getBoundingClientRect(), logoR = row.firstElementChild.getBoundingClientRect();
  return {
    height: Math.round(row.getBoundingClientRect().height),
    items: items.map((el) => el.innerText.trim()),
    wrapped, rows,
    minGap: items.length > 1 ? Math.round(minGap) : null,
    overlap: navR && items.length ? Math.round(Math.max(navR.right - rightR.left, logoR.right - navR.left, 0)) : 0,
    rightItems: right.innerText.replace(/\s+/g, " ").trim(),
    sideScroll: document.documentElement.scrollWidth - innerWidth,
  };
});
const ok = (m) => m.wrapped.length === 0 && m.rows <= 1 && m.overlap <= 0 && m.sideScroll <= 0 && (m.minGap === null || m.minGap >= 12);
const describe = (m) => `height ${m.height}px, ${m.rows} row(s), smallest gap ${m.minGap ?? "-"}px${m.wrapped.length ? `, WRAPPED: ${m.wrapped.join(" / ")}` : ""}${m.overlap > 0 ? `, OVERLAP ${m.overlap}px` : ""}${m.sideScroll > 0 ? `, sideways scroll ${m.sideScroll}px` : ""}`;

try {
  for (const signedIn of [true, false]) {
    const who = signedIn ? "admin signed in" : "signed out";
    const before = await session(BEFORE, signedIn);
    const after = await session(AFTER, signedIn);
    for (const w of WIDTHS) {
      for (const p of [before, after]) { await p.setViewport({ width: w, height: 900 }); }
      await sleep(400);
      const mb = await measure(before), ma = await measure(after);
      R.ok(`${who} — ${w}px`, `AFTER: the bar is one tidy row (no wrapping, overlap or squeezing)`, ok(ma), `after: ${describe(ma)} | before: ${describe(mb)}`);
      if ([1280, 1366].includes(w)) {
        for (const [p, tag] of [[before, "before"], [after, "after"]]) {
          await p.screenshot({ path: R.shotPath(`${signedIn ? "admin" : "visitor"}-${w}-${tag}.png`), clip: { x: 0, y: 0, width: w, height: 90 } });
        }
        R.ok(`${who} — ${w}px`, "screenshots of the bar, before and after", true, "", `${signedIn ? "admin" : "visitor"}-${w}-before.png`);
        R.ok(`${who} — ${w}px`, "(after)", true, "", `${signedIn ? "admin" : "visitor"}-${w}-after.png`);
      }
    }
    await after.setViewport({ width: 1366, height: 900 }); await sleep(300);
    const m = await measure(after);
    // innerText comes back upper-cased by the mono-caps style
    const up = m.items.map((s) => s.toUpperCase());
    R.ok(who, "the bar ends with 'More', after Map", up.at(-1) === "MORE" && up.includes("MAP") && !up.includes("COMMUNITY") && !up.includes("ABOUT"), m.items.join(" · "));
    if (signedIn) R.ok(who, "Admin and Messages are no longer on the right; bell and My Profile stay", !/admin|messages/i.test(m.rightItems) && /my profile/i.test(m.rightItems), m.rightItems);

    // mouse: hover opens; the items; click goes there
    await after.hover('[data-testid="nav-more"] button'); await sleep(250);
    const list = await after.$$eval('[data-testid="nav-more"] a', (as) => as.map((a) => a.textContent.trim()));
    const want = signedIn ? ["Community", "About", "Messages", "Admin"] : ["Community", "About"];
    R.ok(who, `hovering 'More' shows: ${want.join(", ")}`, JSON.stringify(list) === JSON.stringify(want), list.join(", "));
    await after.screenshot({ path: R.shotPath(`${signedIn ? "admin" : "visitor"}-more-open.png`), clip: { x: 0, y: 0, width: 1366, height: 300 } });
    R.ok(who, "screenshot with 'More' open", true, "", `${signedIn ? "admin" : "visitor"}-more-open.png`);
    const arrow = await after.$eval('[data-testid="nav-more"] button svg', (s) => getComputedStyle(s).transform);
    R.ok(who, "the small arrow flips up while open", arrow !== "none", arrow);
    await Promise.all([after.waitForFunction(() => location.pathname === "/about", { timeout: 20000 }).catch(() => {}), after.evaluate(() => [...document.querySelectorAll('[data-testid="nav-more"] a')].find((a) => a.textContent.trim() === "About").click())]);
    await sleep(500);
    R.ok(who, "clicking 'About' opens the About page and closes the menu", (await after.evaluate(() => location.pathname)) === "/about" && !(await after.$('[data-testid="nav-more"] a')));
    await after.mouse.move(10, 600); await sleep(200);
    R.ok(who, "'More' is highlighted while on one of its pages (About)", await after.$eval('[data-testid="nav-more"] button', (x) => x.className.includes("text-primary")));

    // keyboard: Tab to it, Enter opens, Tab into it, Esc closes
    await after.mouse.move(10, 600); await sleep(200);
    await after.focus('[data-testid="nav-more"] button');
    await after.keyboard.press("Enter"); await sleep(200);
    const kOpen = await after.$eval('[data-testid="nav-more"] button', (x) => x.getAttribute("aria-expanded"));
    await after.keyboard.press("Tab"); await sleep(100);
    const focused = await after.evaluate(() => document.activeElement?.textContent?.trim());
    await after.keyboard.press("Escape"); await sleep(200);
    const kClosed = !(await after.$('[data-testid="nav-more"] a'));
    const back = await after.evaluate(() => document.activeElement?.closest('[data-testid="nav-more"]') && document.activeElement.tagName === "BUTTON");
    R.ok(who, "keyboard: Enter opens it (aria-expanded=true), Tab goes into the list", kOpen === "true" && focused === "Community", `${kOpen}, focus on ${focused}`);
    R.ok(who, "keyboard: Esc closes it and puts focus back on 'More'", kClosed && back);
    // click outside closes
    await after.click('[data-testid="nav-more"] button'); await sleep(150);
    await after.mouse.click(600, 600); await sleep(200);
    R.ok(who, "a click elsewhere closes it", !(await after.$('[data-testid="nav-more"] a')));

    // phone: everything still in the menu
    await after.setViewport({ width: 390, height: 844 }); await sleep(300);
    await after.click('button[aria-label="Toggle menu"]'); await sleep(300);
    const phone = await after.evaluate(() => document.querySelector("header").innerText);
    const all = ["Artists", "Galleries", "Events", "Open Calls", "Map", "Community", "About", ...(signedIn ? ["Messages", "Admin", "My Profile"] : ["Sign in"])];
    R.ok(who, "phone menu still has every link", all.every((s) => phone.toLowerCase().includes(s.toLowerCase())), all.filter((s) => !phone.toLowerCase().includes(s.toLowerCase())).join(", "));
    R.ok(who, "phone: no sideways scroll", (await after.evaluate(() => document.documentElement.scrollWidth - innerWidth)) <= 0);
    if (signedIn) {
      await after.screenshot({ path: R.shotPath("admin-phone-menu.png"), clip: { x: 0, y: 0, width: 390, height: 700 } });
      R.ok(who, "screenshot of the phone menu", true, "", "admin-phone-menu.png");
    }
  }
  R.ok("Whole run", "no page errors", errs.length === 0, errs.join(" | ").slice(0, 200));
} finally {
  await b.close();
}
const { passed, total } = R.write({ heading: "Before and after" });
console.table(R.results.filter((r) => !/screenshot|\(after\)/.test(r.check)).map((r) => ({ area: r.area, check: r.check.slice(0, 62), pass: r.pass ? "PASS" : "FAIL", detail: String(r.detail || "").slice(0, 120) })));
console.log(`${passed}/${total} passed — report: reports/nav-more.html`);
process.exit(passed === total ? 0 : 1);
