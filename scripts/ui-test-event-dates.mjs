/** Event dates and status in real Chrome (C10). READ-ONLY. node scripts/ui-test-event-dates.mjs [site] */
import puppeteer from "puppeteer-core";
import { createReport } from "./lib/report.mjs";
const SITE = process.argv[2] || "http://localhost:5198";
const R = createReport("C10-event-dates", "Event dates and status", "Real Chrome, read-only.");
const b = await puppeteer.launch({ executablePath: "C:/Program Files/Google/Chrome/Application/chrome.exe", headless: true });
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const errs = [];
try {
  for (const [w, tag] of [[390, "phone"], [1366, "desktop"]]) {
    const p = await b.newPage();
    await p.setViewport({ width: w, height: 900 });
    p.on("pageerror", (e) => errs.push(e.message));
    await p.goto(SITE + "/events", { waitUntil: "domcontentloaded", timeout: 90000 });
    await p.waitForSelector("[data-status]", { timeout: 90000 });
    await sleep(3000);
    await p.evaluate(() => [...document.querySelectorAll("button")].find((x) => /^reject$/i.test(x.innerText.trim()))?.click());
    const d = await p.evaluate(() => { const st = [...document.querySelectorAll("[data-status]")].map((x) => x.dataset.status); return { n: st.length, st, ranges: [...document.querySelectorAll("[data-range]")].map((x) => x.textContent), past: [...document.querySelectorAll("[data-status]")].filter((x) => x.dataset.status === "ongoing" && x.closest(".opacity-50")).length, side: document.documentElement.scrollWidth - innerWidth, h: document.body.textContent.includes("On now") }; });
    const c = (s) => d.st.filter((x) => x === s).length;
    R.ok(tag, "every event has a status and dates", d.n > 100 && d.ranges.length === d.n && d.ranges.every(Boolean), `${c("ongoing")} ongoing, ${c("upcoming")} upcoming, ${c("past")} past`);
    R.ok(tag, "running shows lead, then upcoming, then past", d.st.join().replace(/(ongoing,?)+/, "O").replace(/(upcoming,?)+/, "U").replace(/(past,?)+/, "P") === "OUP" && d.h);
    R.ok(tag, "running shows are not faded as past", d.past === 0);
    R.ok(tag, "ranges read like 22 October 2026 – 16 January 2027", d.ranges.some((x) => / – /.test(x)) && !d.ranges.some((x) => /Invalid|NaN|undefined/.test(x)), d.ranges.slice(0, 3).join(" | "));
    R.ok(tag, "fits the screen", d.side <= 0, `${d.side}px`);
    await p.screenshot({ path: R.shotPath(`list-${tag}.png`) });
    await p.evaluate(() => { const x = document.querySelector('[data-status="ongoing"]').closest(".group"); x.scrollIntoView({ block: "center" }); });
    await sleep(800);
    await p.screenshot({ path: R.shotPath(`ongoing-${tag}.png`) });
    const title = await p.evaluate(() => { const x = document.querySelector('[data-status="ongoing"]').closest(".group"); const t = x.querySelector("h3").textContent; x.click(); return t; });
    await sleep(5000);
    const t = await p.evaluate(() => document.body.innerText);
    R.ok(tag, "event page: Ongoing, full range, not 'Past event'", t.includes(title.slice(0, 12)) && /ongoing/i.test(t) && !/past event/i.test(t), title, `event-${tag}.png`);
    await p.screenshot({ path: R.shotPath(`event-${tag}.png`) });
    await p.close();
  }
} catch (e) { R.ok("Whole run", "ran to the end", false, e.message); }
R.ok("Whole run", "no page errors", !errs.length, errs.join(" | "));
await b.close();
const { passed, total } = R.write({ heading: SITE });
for (const r of R.results) console.log(r.pass ? "PASS" : "FAIL", "|", r.area, "|", r.check, "|", r.detail);
console.log(`${passed}/${total} passed — report: reports/C10-event-dates.html`);
process.exit(passed === total ? 0 : 1);
