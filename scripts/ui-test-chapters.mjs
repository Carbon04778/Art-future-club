/**
 * Seattle and Taipei chapters, and the About Us team (A2), in real Chrome.
 * Read-only — saves nothing — so the same run works on the TEST dev server
 * and on the live site after deploy.
 *
 *   node scripts/ui-test-chapters.mjs [site]   (default http://localhost:5198)
 * Report: reports/A2-chapters.html
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
const NEW = [
  { city: "Seattle", slug: "seattle", ch: "Ch.09", credit: "Artwork by: Erynne Byrd-Quigtar", tagline: "Pacific Northwest craft, tech culture and independent spirit.", about: "Seattle's chapter draws on the Pacific Northwest" },
  { city: "Taipei", slug: "taipei", ch: "Ch.10", credit: "Artwork by: Adam Dupuis", tagline: "A vibrant East Asian hub for contemporary art and cultural dialogue.", about: "Taipei's chapter sits at the heart of one of East Asia" },
];

const R = createReport("A2-chapters", "Seattle and Taipei chapters · About Us team", LIVE ? "Real Chrome on the live site, read-only." : "Real Chrome, v12 code on the TEST project, read-only.");
const b = await puppeteer.launch({ executablePath: "C:/Program Files/Google/Chrome/Application/chrome.exe", headless: true });
const errs = [];
const open = async (path, width = 1366) => {
  const p = await b.newPage();
  await p.setViewport({ width, height: width < 600 ? 844 : 900 });
  p.on("pageerror", (e) => errs.push(`${path}: ${e.message}`));
  await p.goto(`${SITE}${path}`, { waitUntil: "networkidle2", timeout: 120000 });
  await sleep(2500);
  await p.evaluate(() => [...document.querySelectorAll("button")].find((x) => /^reject$/i.test(x.innerText.trim()))?.click());
  return p;
};
// every picture on the page has loaded (lazy ones are asked to load first)
const imagesLoaded = (p, sel) => p.evaluate(async (s) => {
  const imgs = [...document.querySelectorAll(s)];
  for (const i of imgs) i.loading = "eager";
  await new Promise((r) => setTimeout(r, 2500));
  return imgs.map((i) => ({ src: i.getAttribute("src"), alt: i.alt, w: i.naturalWidth, ok: i.complete && i.naturalWidth > 0 && !/placeholder/.test(i.currentSrc) }));
}, sel);
const sideScroll = (p) => p.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
// textContent, not innerText: the site capitalises labels with CSS and
// innerText returns those capitals ("ARTWORK BY: …").
const text = (p) => p.evaluate(() => document.body.textContent.replace(/\s+/g, " "));
const credits = (p) => p.evaluate(() => [...document.querySelectorAll("*")].filter((e) => e.children.length === 0 && /by: /.test(e.textContent)).map((e) => e.textContent.trim()));
const hasChoice = (p, label) => p.evaluate((l) => [...document.querySelectorAll("button, option, a")].some((x) => x.textContent.trim() === l), label);

try {
  // ---- the two chapter pages, phone and desktop
  for (const c of NEW) {
    for (const [width, tag] of [[390, "phone"], [1366, "desktop"]]) {
      const p = await open(`/chapter/${c.slug}`, width);
      const t = await text(p);
      const img = (await imagesLoaded(p, `img[src*="chapter-${c.slug}"]`))[0];
      const shot = `${c.slug}-${tag}.png`;
      await p.screenshot({ path: R.shotPath(shot) });
      R.ok(`${c.city} (${tag})`, "the chapter page opens with its name, tagline and about text", t.includes(c.city) && t.includes(c.tagline) && t.includes(c.about), "", shot);
      R.ok(`${c.city} (${tag})`, "the chapter picture loads", !!img?.ok, img ? `${img.w}px wide` : "no picture");
      R.ok(`${c.city} (${tag})`, "no empty 'Local Pulse' line", !/local pulse/i.test(t));
      R.ok(`${c.city} (${tag})`, "fits the screen (no sideways scroll)", (await sideScroll(p)) <= 0);
      await p.close();
    }
  }

  // ---- an existing chapter is unchanged
  {
    const p = await open("/chapter/zurich");
    const t = await text(p);
    R.ok("Zurich (unchanged)", "still shows its Local Pulse line", /local pulse/i.test(t) && t.includes("3 active exhibitions"));
    await p.close();
  }

  // ---- where chapters are listed
  {
    const p = await open("/");
    await p.evaluate(() => [...document.querySelectorAll("button")].find((x) => /^chapters/i.test(x.innerText.trim()))?.click());
    await sleep(800);
    const menu = await p.evaluate(() => [...document.querySelectorAll('header a[href^="/chapter/"]')].map((a) => a.textContent.replace(/\s+/g, " ").trim()));
    R.ok("Lists", "header Chapters menu lists Ch.09 Seattle and Ch.10 Taipei", NEW.every((c) => menu.some((m) => m.includes(c.ch) && m.includes(c.city))), `${menu.length} chapters in menu`);
    const homeLinks = await p.evaluate(() => [...document.querySelectorAll('main a[href^="/chapter/"], a[href^="/chapter/"]')].map((a) => a.getAttribute("href")));
    R.ok("Lists", "home page links to both new chapter pages", NEW.every((c) => homeLinks.filter((h) => h === `/chapter/${c.slug}`).length >= 2));
    const shown = await credits(p);
    for (const c of NEW) R.ok("Lists", `home chapters section credits ${c.city}: "${c.credit}"`, shown.includes(c.credit));
    R.ok("Lists", "home page still credits every older chapter", shown.length === 10 && shown.includes("Artwork by: Richard Crosbie") && shown.includes("Artwork by: Saskia Key"), `${shown.length} credits`);
    const footer = await p.evaluate(() => [...document.querySelectorAll("li")].map((l) => l.innerText.trim()).join(" | "));
    R.ok("Lists", "home footer lists the chapters, now with Seattle and Taipei", footer.includes("Toronto · Zurich · Seattle") && /(^|\| )Taipei( \||$)/.test(footer));
    await p.close();
  }
  for (const [path, what] of [["/artists", "Artists filter"], ["/events", "Events filter"], ["/venues", "Venues filter"]]) {
    const p = await open(path);
    R.ok("Lists", `${what} offers Seattle and Taipei`, (await hasChoice(p, "Seattle")) && (await hasChoice(p, "Taipei")));
    await p.close();
  }
  {
    const p = await open(`/artists?chapter=${encodeURIComponent("Seattle")}`, 390);
    R.ok("Lists", "Artists filtered to Seattle opens cleanly on a phone (no artists yet is fine)", (await sideScroll(p)) <= 0 && /artist/i.test(await text(p)));
    await p.close();
  }
  {
    const p = await open("/partnership");
    R.ok("Lists", "Partnership page names every chapter", (await text(p)).includes("Toronto, Zurich, Seattle and Taipei"));
    await p.close();
  }

  // ---- Community is for members: sign in (view only) and check its filter
  {
    const p = await open("/login");
    await p.type('input[type="email"]', E.AFC_ADMIN_EMAIL);
    await p.type('input[type="password"]', E.AFC_ADMIN_PASSWORD);
    await Promise.all([p.waitForNavigation({ waitUntil: "networkidle2", timeout: 90000 }).catch(() => {}), p.click('button[type="submit"]')]);
    await p.goto(`${SITE}/community`, { waitUntil: "networkidle2", timeout: 120000 });
    await p.waitForFunction(() => /Chapter:/.test(document.body.textContent), { timeout: 30000 }).catch(() => {});
    R.ok("Lists", "Community location filter offers Seattle and Taipei (signed in)", (await hasChoice(p, "Seattle")) && (await hasChoice(p, "Taipei")));
    await p.close();
  }

  // ---- About Us
  for (const [width, tag] of [[390, "phone"], [1366, "desktop"]]) {
    const p = await open("/about", width);
    const imgs = await imagesLoaded(p, ".group img");
    const t = await text(p);
    const grid = await p.evaluateHandle(() => document.querySelector(".group")?.closest(".grid"));
    const shot = `about-${tag}.png`;
    await grid.screenshot({ path: R.shotPath(shot) });
    R.ok(`About Us (${tag})`, "8 team photos, every one loads", imgs.length === 8 && imgs.every((i) => i.ok), imgs.filter((i) => !i.ok).map((i) => i.alt).join(", ") || `${imgs.length} photos`, shot);
    R.ok(`About Us (${tag})`, "Erynne Byrd-Quigtar — Editorial Editor — Seattle", /Erynne Byrd-Quigtar/.test(t) && imgs.some((i) => i.alt === "Erynne Byrd-Quigtar" && i.ok));
    R.ok(`About Us (${tag})`, "Heidi Mak — Editorial Editor — Hong Kong", /Editorial Editor ?Heidi Mak ?Hong Kong/.test(t) && imgs.some((i) => i.alt === "Heidi Mak" && i.ok));
    R.ok(`About Us (${tag})`, "Christie Melville shows the new photo", imgs.some((i) => i.alt === "Christie Melville" && i.w === 901), `${imgs.find((i) => i.alt === "Christie Melville")?.w}px wide (new 901, old 1024)`);
    R.ok(`About Us (${tag})`, "fits the screen (no sideways scroll)", (await sideScroll(p)) <= 0);
    await p.close();
  }
} catch (err) {
  R.ok("Whole run", "test ran to the end", false, String(err?.message || err).slice(0, 160));
}
R.ok("Whole run", "no page errors", errs.length === 0, errs.join(" | ").slice(0, 300));
await b.close();
const { passed, total } = R.write({ heading: LIVE ? "Live site after deploy (read-only)" : "Browser test (v12 code, TEST project, read-only)" });
console.table(R.results.map((r) => ({ area: r.area, check: r.check.slice(0, 70), pass: r.pass ? "PASS" : "FAIL", detail: r.detail.slice(0, 34) })));
console.log(`${passed}/${total} passed — report: reports/A2-chapters.html`);
process.exit(passed === total ? 0 : 1);
