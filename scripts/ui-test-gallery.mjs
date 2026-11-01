/**
 * Real-browser test of B5 (article gallery slider). Read-only: article pages
 * only display, so it uses the real articles.
 *   node scripts/ui-test-gallery.mjs [new-site] [old-site-for-before-shots]
 * Report: reports/B5-article-gallery.html
 */
import puppeteer from "puppeteer-core";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { createReport } from "./lib/report.mjs";

const ROOT = fileURLToPath(new URL("..", import.meta.url));
const E = Object.fromEntries(readFileSync(join(ROOT, ".env"), "utf8").split(/\r?\n/).filter((l) => /^[A-Z_]+=/.test(l)).map((l) => [l.slice(0, l.indexOf("=")), l.slice(l.indexOf("=") + 1).trim()]));
const NEW = process.argv[2] || "http://localhost:5199";
const OLD = process.argv[3] || "";
const LIVE = NEW.startsWith("https://");
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const get = async (q) => (await fetch(`${E.VITE_SUPABASE_URL}/rest/v1/${q}`, { headers: { apikey: E.VITE_SUPABASE_ANON_KEY } })).json();
const arts = await get("article?select=slug,title,layout,images,closing_image_url&published=eq.true&limit=2000");
const galleryOf = (a) => {
  const imgs = a.images || []; const intro = ["image_after_intro", "intro_middle"].includes(a.layout);
  let g = intro ? imgs.slice(1) : imgs; if (a.layout === "image_before_close" && !a.closing_image_url) g = imgs.slice(0, -1);
  return g;
};
const runOf = (a) => galleryOf(a).filter((i) => !(i && i.full === true));
// a big clean gallery (no full-width splits), an article with full-width images, one with a single image
const big = arts.filter((a) => runOf(a).length >= 4 && galleryOf(a).every((i) => !(i && i.full))).sort((a, b) => runOf(b).length - runOf(a).length)[0];
const withFull = arts.find((a) => (a.images || []).some((i) => i && i.full === true));
const single = arts.find((a) => galleryOf(a).length === 1);
const N = runOf(big).length;

const R = createReport("B5-article-gallery", "B5 — article gallery, one image at a time", "Real Chrome on the real articles (read-only).");
const b = await puppeteer.launch({ executablePath: "C:/Program Files/Google/Chrome/Application/chrome.exe", headless: true });
async function open(site, slug, width = 1366) {
  const p = await b.newPage(); await p.setViewport({ width, height: 900 });
  const errs = []; p.on("pageerror", (e) => errs.push(e.message));
  for (let i = 0; i < 3; i++) { try { await p.goto(`${site}/editorial/${slug}`, { waitUntil: "networkidle2", timeout: 90000 }); break; } catch {} }
  await p.waitForFunction(() => document.querySelector("h1"), { timeout: 45000 }).catch(() => {});
  await sleep(2000);
  await p.evaluate(() => [...document.querySelectorAll("button")].find((x) => /^reject$/i.test(x.innerText.trim()))?.click());
  return { p, errs };
}
const counter = (p) => p.evaluate(() => document.querySelector('[aria-roledescription="carousel"]')?.closest("figure")?.querySelector('[aria-live="polite"]')?.textContent.trim() || "");
const visibleSlides = (p) => p.evaluate(() => {
  const car = document.querySelector('[aria-roledescription="carousel"]'); if (!car) return -1;
  const box = car.getBoundingClientRect();
  return [...car.querySelectorAll('[aria-roledescription="slide"]')].filter((s) => { const r = s.getBoundingClientRect(); return r.right > box.left + 5 && r.left < box.right - 5; }).length;
});
const shotGallery = async (p, file) => {
  await p.evaluate(() => (document.querySelector('[aria-roledescription="carousel"]') || [...document.querySelectorAll(".grid")].find((g) => g.querySelector("img")))?.scrollIntoView({ block: "center" }));
  await sleep(900); await p.screenshot({ path: R.shotPath(file) }); return file;
};

// BEFORE (the site as it is now), for comparison
if (OLD) {
  const { p } = await open(OLD, big.slug);
  R.ok("Before", `"${big.title.slice(0, 45)}" — the gallery today (${N} images)`, true, "for comparison", await shotGallery(p, "0-before.png"));
  await p.close();
}

// AFTER
{
  const { p, errs } = await open(NEW, big.slug);
  R.ok("Slider", `"${big.title.slice(0, 45)}": gallery is a slider`, (await visibleSlides(p)) >= 1, "", await shotGallery(p, "1-after.png"));
  R.ok("Slider", "exactly ONE image visible at a time", (await visibleSlides(p)) === 1, `${await visibleSlides(p)} visible`);
  R.ok("Slider", `counter starts at 1 / ${N}`, (await counter(p)) === `1 / ${N}`, await counter(p));
  const click = (label) => p.evaluate((l) => [...document.querySelectorAll('[aria-roledescription="carousel"] button')].find((x) => x.textContent.toLowerCase().includes(l))?.click(), label);
  await click("next slide"); await sleep(900);
  R.ok("Arrows", "Next → 2", (await counter(p)) === `2 / ${N}`, await counter(p));
  await click("previous slide"); await sleep(900);
  R.ok("Arrows", "Previous → back to 1", (await counter(p)) === `1 / ${N}`, await counter(p));
  await click("previous slide"); await sleep(900);
  R.ok("Arrows", `wraps round: Previous from 1 → ${N}`, (await counter(p)) === `${N} / ${N}`, await counter(p));
  await p.evaluate(() => document.querySelector('[aria-roledescription="carousel"]')?.focus());
  await p.keyboard.press("ArrowRight"); await sleep(900);
  R.ok("Keyboard", "→ key moves to the next image", (await counter(p)) === `1 / ${N}`, await counter(p));
  await p.evaluate(() => document.querySelectorAll('button[aria-label^="Show image"]')[2]?.click()); await sleep(900);
  R.ok("Dots", "clicking the 3rd dot shows image 3", (await counter(p)) === `3 / ${N}`, await counter(p));
  // swipe (mouse drag) left
  const box = await p.evaluate(() => { const r = document.querySelector('[aria-roledescription="carousel"]').getBoundingClientRect(); return { x: r.left + r.width / 2, y: r.top + r.height / 2, w: r.width }; });
  await p.mouse.move(box.x + box.w * 0.3, box.y); await p.mouse.down();
  for (let s = 1; s <= 10; s++) { await p.mouse.move(box.x + box.w * 0.3 - s * box.w * 0.06, box.y); await sleep(16); }
  await p.mouse.up(); await sleep(1200);
  R.ok("Swipe", "dragging left moves to the next image", (await counter(p)) === `4 / ${N}`, await counter(p));
  const imgs = await p.evaluate(() => [...document.querySelectorAll('[aria-roledescription="carousel"] img')].map((i) => i.getAttribute("src")));
  const want = runOf(big).map((i) => (typeof i === "string" ? i : i.url || i.image_url));
  R.ok("Images", `all ${N} gallery images are in the slider`, want.every((u) => imgs.includes(u)), `${imgs.length} in slider`);
  const loaded = await p.evaluate(() => [...document.querySelectorAll('[aria-roledescription="carousel"] img')].filter((i) => i.complete && i.naturalWidth === 0).length);
  R.ok("Images", "no broken images in the slider", loaded === 0, `${loaded} broken`);
  R.ok("Page", "no page errors", errs.length === 0, errs.join(" | "));
  await p.close();
}

// Phone
{
  const { p, errs } = await open(NEW, big.slug, 390);
  const fit = await p.evaluate(() => {
    const car = document.querySelector('[aria-roledescription="carousel"]'); if (!car) return null;
    const btns = [...car.querySelectorAll("button")].filter((x) => /slide/i.test(x.textContent)).map((x) => x.getBoundingClientRect());
    return { overflow: document.documentElement.scrollWidth - innerWidth, arrowsOnScreen: btns.length === 2 && btns.every((r) => r.left >= 0 && r.right <= innerWidth) };
  });
  R.ok("Phone", "no sideways scrolling", fit && fit.overflow <= 1, JSON.stringify(fit));
  R.ok("Phone", "both arrows on screen", fit?.arrowsOnScreen, "", await shotGallery(p, "2-phone.png"));
  R.ok("Phone", "no page errors", errs.length === 0, errs.join(" | "));
  await p.close();
}

// Full-width images (the bug fixed with B5)
if (withFull) {
  const { p } = await open(NEW, withFull.slug);
  const fulls = withFull.images.filter((i) => i && i.full === true).map((i) => i.url || i.image_url);
  const res = await p.evaluate((urls) => {
    const article = document.querySelector("h1")?.closest("div");
    const w = article?.getBoundingClientRect().width || 0;
    return urls.map((u) => { const img = [...document.querySelectorAll("img")].find((i) => i.getAttribute("src") === u); const r = img?.closest("figure")?.getBoundingClientRect(); return { inSlider: !!img?.closest('[aria-roledescription="carousel"]'), wide: r ? r.width > w * 0.8 : false }; });
  }, fulls);
  R.ok("Full width", `"${withFull.title.slice(0, 40)}": ticked images now show full width`, res.every((x) => x.wide && !x.inSlider), JSON.stringify(res), await shotGallery(p, "3-full-width.png"));
  await p.close();
}

// Single image: unchanged
if (single) {
  const { p } = await open(NEW, single.slug);
  const slider = await p.evaluate(() => !!document.querySelector('[aria-roledescription="carousel"]'));
  R.ok("Single image", `"${single.title.slice(0, 40)}": a lone gallery image is not a slider`, !slider);
  await p.close();
}

await b.close();
const { passed, total } = R.write({ heading: LIVE ? "Live site after deploy (read-only)" : "Browser test (v12, real articles, read-only)", note: `Slider article: "${big.title}" (${N} images).` });
console.table(R.results.map((r) => ({ area: r.area, check: r.check.slice(0, 55), pass: r.pass ? "PASS" : "FAIL", detail: r.detail.slice(0, 40) })));
console.log(`${passed}/${total} passed — report: reports/B5-article-gallery.html`);
process.exit(passed === total ? 0 : 1);
