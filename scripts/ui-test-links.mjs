/**
 * B13 (website and social links) in real Chrome.
 *
 *  A. Live data, READ-ONLY (dev server on :5199, or the live site): every
 *     published artist with a link, and galleries — all the unusual values
 *     plus a sample of ordinary ones. Each page must carry exactly the link
 *     lib/links.js works out, and none of the broken shapes the old pages
 *     produced ("instagram.com/https://…", a website pointing back into this
 *     site, TikTok without its "@").
 *  B. TEST project, REAL SAVES (dev server on :5198 pointed at TEST): typing
 *     "www." and "@" into the real forms, saving, reading what the database
 *     stored, then putting every original value back. Skipped for the live
 *     site.
 *
 *   node scripts/ui-test-links.mjs [site] [test-site]
 *     defaults: http://localhost:5199  http://localhost:5198
 * Report: reports/B13-links.html
 */
import puppeteer from "puppeteer-core";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { createReport } from "./lib/report.mjs";
import { websiteUrl, socialUrl } from "../src/lib/links.js";

const ROOT = fileURLToPath(new URL("..", import.meta.url));
const E = Object.fromEntries(readFileSync(join(ROOT, ".env"), "utf8").split(/\r?\n/).filter((l) => /^[A-Z_]+=/.test(l)).map((l) => [l.slice(0, l.indexOf("=")), l.slice(l.indexOf("=") + 1).trim()]));
const SITE = process.argv[2] || "http://localhost:5199";
const TEST_SITE = process.argv[3] || "http://localhost:5198";
const LIVE = SITE.startsWith("https://");
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const anon = async (q) => (await fetch(`${E.VITE_SUPABASE_URL}/rest/v1/${q}`, { headers: { apikey: E.VITE_SUPABASE_ANON_KEY } })).json();

const R = createReport("B13-links", "B13 — Instagram and website links", "Real Chrome. Part A reads the live data and changes nothing. Part B saves through the real forms on the TEST project and puts the original values back.");
const b = await puppeteer.launch({ executablePath: "C:/Program Files/Google/Chrome/Application/chrome.exe", headless: true });

async function open(url, width = 1366) {
  const p = await b.newPage();
  await p.setViewport({ width, height: 900 });
  const errs = [];
  p.on("pageerror", (e) => errs.push(e.message));
  for (let i = 0; i < 3; i++) { try { await p.goto(url, { waitUntil: "networkidle2", timeout: 90000 }); break; } catch {} }
  await p.waitForFunction(() => document.querySelector("h1")?.innerText.trim(), { timeout: 45000 }).catch(() => {});
  await sleep(2500);
  await p.evaluate(() => [...document.querySelectorAll("button")].find((x) => /^reject$/i.test(x.innerText.trim()))?.click());
  return { p, errs };
}
const hrefs = (p) => p.evaluate(() => [...document.querySelectorAll("a[href]")].map((a) => a.href));
const BROKEN = [
  [/instagram\.com\/https?:/i, "instagram.com/https://…"],
  [/tiktok\.com\/(?!@)[^/?#]+$/i, "TikTok without its @"],
  [/^https?:\/\/(localhost(:\d+)?|(www\.)?artfutureclub\.com)\/(artists|gallery|collector-profile)\/[^/]*\.(com|hk|net|org|art|io|co)\b/i, "a website pointing back into this site"],
  [/^https?:\/\/(localhost(:\d+)?|(www\.)?artfutureclub\.com)\/(artists|gallery)\/(www\.|https?:)/i, "a website pointing back into this site"],
];

// ================= A. live data, read-only
const artists = (await anon("artist_profile?select=slug,display_name,website,instagram,twitter,tiktok,linkedin&status=eq.approved&limit=2000"))
  .filter((r) => r.slug && [r.website, r.instagram, r.twitter, r.tiktok, r.linkedin].some((v) => v && String(v).trim()));
const galleriesAll = (await anon("collector_profile?select=slug,display_name,type,website,instagram,facebook,linkedin&status=eq.approved&limit=5000")).filter((r) => r.slug);
const odd = (r) => [r.website, r.instagram].some((v) => v && String(v).trim() && !/^https:\/\/(www\.)?[a-z0-9-]+\.[a-z]/i.test(String(v).trim()));
const galleries = [...galleriesAll.filter(odd), ...galleriesAll.filter((r) => !odd(r) && r.instagram).filter((_, i) => i % 25 === 0)];

const expectFor = (r, kind) => {
  const want = [];
  if (websiteUrl(r.website)) want.push(["Website", websiteUrl(r.website)]);
  if (socialUrl("instagram", r.instagram)) want.push(["Instagram", socialUrl("instagram", r.instagram)]);
  if (kind === "artist") {
    if (socialUrl("twitter", r.twitter)) want.push(["X", socialUrl("twitter", r.twitter)]);
    if (socialUrl("tiktok", r.tiktok)) want.push(["TikTok", socialUrl("tiktok", r.tiktok)]);
    if (socialUrl("linkedin", r.linkedin)) want.push(["LinkedIn", socialUrl("linkedin", r.linkedin)]);
  } else {
    if (socialUrl("facebook", r.facebook)) want.push(["Facebook", socialUrl("facebook", r.facebook)]);
    if (socialUrl("linkedin", r.linkedin)) want.push(["LinkedIn", socialUrl("linkedin", r.linkedin)]);
  }
  return want;
};

const sweep = [...artists.map((r) => ["artist", `/artists/${r.slug}`, r]), ...galleries.map((r) => ["gallery", `/gallery/${r.slug}`, r])];
let missing = [], broken = [], pageErrs = [], checked = 0, linksSeen = 0;
const queue = [...sweep];
await Promise.all([0, 1, 2].map(async () => {
  while (queue.length) {
    const [kind, path, r] = queue.shift();
    // A tab can be lost over 160 page loads (the browser, not the site).
    // Retry once in a fresh tab; a page that fails twice counts as not
    // checked, which fails the run — it is never quietly skipped.
    let got = null, errs = [];
    for (let attempt = 0; attempt < 2 && !got; attempt++) {
      let p;
      try {
        ({ p, errs } = await open(`${SITE}${path}`));
        got = await hrefs(p);
      } catch (err) {
        if (attempt === 1) pageErrs.push(`${path}: could not be checked — ${String(err?.message || err).slice(0, 80)}`);
      } finally {
        await p?.close().catch(() => {});
      }
    }
    if (!got) continue;
    for (const [label, href] of expectFor(r, kind)) {
      linksSeen++;
      if (!got.includes(href)) missing.push(`${r.display_name} (${path}) ${label}: expected ${href}`);
    }
    for (const h of got) for (const [re, what] of BROKEN) if (re.test(h)) broken.push(`${r.display_name} (${path}): ${what} — ${h}`);
    if (errs.length) pageErrs.push(`${path}: ${errs[0]}`);
    checked++;
  }
}));
R.ok("A · Every page", `${checked} profile pages opened (${artists.length} artists with links, ${galleries.length} galleries incl. every unusual value)`, checked === sweep.length, `${checked}/${sweep.length}`);
R.ok("A · Every page", `all ${linksSeen} expected links present, each exactly as worked out`, missing.length === 0, missing.slice(0, 4).join(" | "));
R.ok("A · Every page", "no broken link shapes anywhere on those pages", broken.length === 0, broken.slice(0, 4).join(" | "));
R.ok("A · Every page", "no page errors", pageErrs.length === 0, pageErrs.slice(0, 3).join(" | "));

// The three cases Julie's message is about, named, with pictures.
const named = async (label, path, want, shot) => {
  const { p } = await open(`${SITE}${path}`);
  const got = await hrefs(p);
  await p.evaluate((w) => [...document.querySelectorAll("a")].find((a) => a.href === w)?.scrollIntoView({ block: "center" }), want);
  await sleep(600);
  await p.screenshot({ path: R.shotPath(shot) });
  R.ok("A · The reported cases", label, got.includes(want), want, shot);
  await p.close();
  return got;
};
const loyal = galleriesAll.find((g) => g.slug === "loyal");
if (loyal) {
  const got = await named(`Gallery saved with a full Instagram URL (Loyal) → opens Instagram`, "/gallery/loyal", "https://www.instagram.com/loyalgallery/", "1-gallery-instagram.png");
  R.ok("A · The reported cases", "…and the broken 'instagram.com/https://…' link is gone", !got.some((h) => /instagram\.com\/https?:/i.test(h)));
}
const eva = artists.find((a) => a.slug === "eva-ku");
if (eva) {
  const got = await named(`Artist website typed as "www.evaku.hk" → opens evaku.hk`, "/artists/eva-ku", "https://www.evaku.hk/", "2-artist-www.png");
  R.ok("A · The reported cases", "…and no longer points back into this site", !got.some((h) => /\/artists\/www\./i.test(h)));
}
const nance = artists.find((a) => a.slug === "nance-lokos");
if (nance) await named(`Artist Instagram typed as "@by_nance" → opens instagram.com/by_nance`, "/artists/nance-lokos", "https://www.instagram.com/by_nance", "3-artist-at.png");
const tik = artists.find((a) => /^@/.test(a.tiktok || ""));
if (tik) await named(`Artist TikTok typed as "${tik.tiktok}" → opens with the @ TikTok needs`, `/artists/${tik.slug}`, socialUrl("tiktok", tik.tiktok), "4-artist-tiktok.png");

// phone
{
  const { p } = await open(`${SITE}/gallery/loyal`, 390);
  const over = await p.evaluate(() => document.documentElement.scrollWidth - innerWidth);
  R.ok("A · Phone", "gallery page: no sideways scrolling", over <= 1, `${over}px`);
  await p.close();
}

// ================= B. TEST project, real saves
if (!LIVE) {
  const T = E.COPY_SUPABASE_URL.replace(/\/+$/, "");
  if (!T.includes("jbcexmconizdqxnfyjba")) throw new Error("COPY_SUPABASE_URL is not the TEST project");
  const TK = E.COPY_SUPABASE_SERVICE_ROLE_KEY;
  const TH = { apikey: TK, Authorization: `Bearer ${TK}`, "Content-Type": "application/json" };
  const tdb = async (q) => (await fetch(`${T}/rest/v1/${q}`, { headers: TH })).json();
  const tpatch = async (table, id, body) => (await fetch(`${T}/rest/v1/${table}?id=eq.${id}`, { method: "PATCH", headers: { ...TH, Prefer: "return=representation" }, body: JSON.stringify(body) })).json();

  const admin = (await tdb(`profiles?select=id&email=eq.${encodeURIComponent(E.AFC_ADMIN_EMAIL)}`))[0];
  const before = (await tdb(`artist_profile?select=*&user_id=eq.${admin.id}`))[0];
  const LINKS = ["website", "instagram", "twitter", "tiktok", "linkedin"];
  const original = Object.fromEntries(LINKS.map((k) => [k, before[k]]));
  R.ok("B · Setup", `TEST project; the admin's own TEST artist profile ("${before.display_name}")`, !!before, JSON.stringify(original).slice(0, 150));

  const p = await b.newPage();
  await p.setViewport({ width: 1366, height: 900 });
  const errs = []; p.on("pageerror", (e) => errs.push(e.message));
  await p.goto(`${TEST_SITE}/login`, { waitUntil: "networkidle2" });
  await p.waitForSelector('input[type="email"]', { timeout: 30000 });
  await p.type('input[type="email"]', E.AFC_ADMIN_EMAIL);
  await p.type('input[type="password"]', E.AFC_ADMIN_PASSWORD);
  await Promise.all([p.waitForNavigation({ waitUntil: "networkidle2", timeout: 60000 }).catch(() => {}), p.click('button[type="submit"]')]);
  await p.evaluate(() => [...document.querySelectorAll("button")].find((x) => /^reject$/i.test(x.innerText.trim()))?.click());

  // fill an input React will notice: select what is there, type over it
  const fill = async (sel, value) => {
    await p.waitForSelector(sel, { timeout: 30000 });
    await p.click(sel, { clickCount: 3 });
    await p.keyboard.press("Backspace");
    await p.type(sel, value);
  };

  try {
    // ---- 1. the artist's own profile form
    await p.goto(`${TEST_SITE}/profile/edit`, { waitUntil: "networkidle2" });
    await p.waitForFunction(() => document.querySelector('input[placeholder="yourstudio.com"]'), { timeout: 45000 });
    await sleep(2500);
    await p.evaluate(() => {
      const handles = [...document.querySelectorAll('input[placeholder="@handle"]')];
      handles[0]?.setAttribute("data-t", "ig");
      handles[2]?.setAttribute("data-t", "tt");
    });
    await fill('input[placeholder="yourstudio.com"]', "www.b13-check.example.com");
    await fill('input[data-t="ig"]', "@b13_check");
    await fill('input[data-t="tt"]', "@b13_tok");
    const valid = await p.evaluate(() => document.querySelector('input[placeholder="yourstudio.com"]').closest("form").checkValidity());
    R.ok("B · Artist's own form", `the form accepts "www.b13-check.example.com" (it used to say "Please enter a URL")`, valid);
    await p.screenshot({ path: R.shotPath("5-form-typed.png") });
    await p.evaluate(() => document.querySelector('input[placeholder="yourstudio.com"]').closest("form").requestSubmit());
    let after;
    for (let i = 0; i < 20; i++) { await sleep(1000); after = (await tdb(`artist_profile?select=*&id=eq.${before.id}`))[0]; if (after.website !== original.website) break; }
    R.ok("B · Artist's own form", `saved website: "https://www.b13-check.example.com"`, after.website === "https://www.b13-check.example.com", after.website, "5-form-typed.png");
    R.ok("B · Artist's own form", `saved Instagram: "b13_check" (the @ removed)`, after.instagram === "b13_check", after.instagram);
    R.ok("B · Artist's own form", `saved TikTok: "b13_tok"`, after.tiktok === "b13_tok", after.tiktok);
    const changed = Object.keys(after).filter((k) => JSON.stringify(after[k]) !== JSON.stringify(before[k]));
    const expected = ["website", "instagram", "tiktok", "updated_date"];
    R.ok("B · Artist's own form", "nothing else on the profile changed", changed.every((k) => expected.includes(k)), changed.join(", "));

    // the profile page reads them back as working links
    const { p: view } = await open(`${TEST_SITE}/artists/${after.slug}`);
    const got = await hrefs(view);
    await view.screenshot({ path: R.shotPath("6-profile-after-save.png") });
    R.ok("B · Artist's own form", "profile page: Website opens https://www.b13-check.example.com/", got.includes("https://www.b13-check.example.com/"), "", "6-profile-after-save.png");
    R.ok("B · Artist's own form", "profile page: Instagram opens instagram.com/b13_check", got.includes("https://www.instagram.com/b13_check"));
    R.ok("B · Artist's own form", "profile page: TikTok opens tiktok.com/@b13_tok", got.includes("https://www.tiktok.com/@b13_tok"));
    await view.close();
  } catch (err) {
    R.ok("B · Artist's own form", "test ran to the end", false, String(err?.message || err).slice(0, 150));
  } finally {
    // Put back every column the save changed (not only the links), except the timestamp.
    const now = (await tdb(`artist_profile?select=*&id=eq.${before.id}`))[0] || {};
    const restore = { ...original, ...Object.fromEntries(Object.keys(now).filter((k) => k !== "updated_date" && JSON.stringify(now[k]) !== JSON.stringify(before[k])).map((k) => [k, before[k]])) };
    const back = (await tpatch("artist_profile", before.id, restore))[0];
    R.ok("B · Clean-up", "the TEST profile's original links put back", LINKS.every((k) => back?.[k] === original[k]), JSON.stringify(LINKS.map((k) => back?.[k])).slice(0, 150));
    R.ok("B · Clean-up", "the TEST profile is otherwise exactly as before", Object.keys(before).filter((k) => k !== "updated_date").every((k) => JSON.stringify(back?.[k]) === JSON.stringify(before[k])));
  }

  // ---- 2. admin Edit Listings on a gallery saved with full URLs
  const g = (await tdb("collector_profile?select=*&slug=eq.loyal"))[0];
  if (g) {
    const gLinks = ["website", "instagram", "facebook", "linkedin"];
    const gOriginal = Object.fromEntries(gLinks.map((k) => [k, g[k]]));
    try {
      // The admin tabs can take a while on a cold dev server: wait, reload once.
      let tabs = false;
      for (let tries = 0; tries < 2 && !tabs; tries++) {
        await p.goto(`${TEST_SITE}/admin`, { waitUntil: "networkidle2" });
        tabs = await p.waitForFunction(() => [...document.querySelectorAll("button")].some((x) => /^edit listings$/i.test(x.innerText.trim())), { timeout: 60000 }).then(() => true).catch(() => false);
      }
      R.ok("B · Admin Edit Listings", "admin page opened", tabs);
      await p.evaluate(() => [...document.querySelectorAll("button")].find((x) => /^edit listings$/i.test(x.innerText.trim()))?.click());
      await sleep(2500);
      await fill('input[placeholder="Search by name, email or city"]', g.display_name);
      await sleep(3000);
      // open the editor whose form shows this gallery's website
      let opened = false;
      for (let k = 0; k < 6 && !opened; k++) {
        await p.evaluate(() => [...document.querySelectorAll("button")].find((x) => /^close$/i.test(x.innerText.trim()))?.click());
        await sleep(1200);
        const clicked = await p.evaluate((k) => { const e = [...document.querySelectorAll("button")].filter((x) => /^edit$/i.test(x.innerText.trim()) && x.offsetParent); if (!e[k]) return false; e[k].click(); return true; }, k);
        if (!clicked) break;
        await sleep(3000);
        opened = await p.evaluate((w) => [...document.querySelectorAll('input[placeholder="https://"]')].some((i) => i.value === w), g.website);
      }
      R.ok("B · Admin Edit Listings", `opened "${g.display_name}" in the admin editor`, opened);
      const saveBtn = () => p.evaluate(() => [...document.querySelectorAll("button")].find((x) => /^save changes/i.test(x.innerText.trim()))?.click());
      // (a) save without touching anything: the full URLs must stay exactly as they were
      await saveBtn();
      await sleep(4000);
      const g1 = (await tdb(`collector_profile?select=*&id=eq.${g.id}`))[0];
      R.ok("B · Admin Edit Listings", "saving without changes leaves every link byte-for-byte as it was", gLinks.every((k) => g1[k] === gOriginal[k]), JSON.stringify(gLinks.map((k) => g1[k])).slice(0, 150));
      // (b) type "www." into the website box
      await p.evaluate(() => [...document.querySelectorAll("button")].find((x) => /^close$/i.test(x.innerText.trim()))?.click());
      await sleep(1200);
      for (let k = 0; k < 6; k++) {
        const clicked = await p.evaluate((k) => { const e = [...document.querySelectorAll("button")].filter((x) => /^edit$/i.test(x.innerText.trim()) && x.offsetParent); if (!e[k]) return false; e[k].click(); return true; }, k);
        if (!clicked) break;
        await sleep(3000);
        if (await p.evaluate((w) => { const i = [...document.querySelectorAll('input[placeholder="https://"]')].find((x) => x.value === w); if (i) i.setAttribute("data-t", "web"); return !!i; }, g.website)) break;
        await p.evaluate(() => [...document.querySelectorAll("button")].find((x) => /^close$/i.test(x.innerText.trim()))?.click());
        await sleep(1200);
      }
      await fill('input[data-t="web"]', "www.loyalgallery.com");
      await saveBtn();
      let g2;
      for (let i = 0; i < 15; i++) { await sleep(1000); g2 = (await tdb(`collector_profile?select=*&id=eq.${g.id}`))[0]; if (g2.website !== g.website) break; }
      R.ok("B · Admin Edit Listings", `website typed "www.loyalgallery.com" saved as "https://www.loyalgallery.com"`, g2.website === "https://www.loyalgallery.com", g2.website);
      R.ok("B · Admin Edit Listings", "the gallery's Instagram, Facebook and LinkedIn URLs untouched", ["instagram", "facebook", "linkedin"].every((k) => g2[k] === gOriginal[k]));
    } catch (err) {
      R.ok("B · Admin Edit Listings", "test ran to the end", false, String(err?.message || err).slice(0, 150));
    } finally {
      const now = (await tdb(`collector_profile?select=*&id=eq.${g.id}`))[0] || {};
      const restore = { ...gOriginal, ...Object.fromEntries(Object.keys(now).filter((k) => k !== "updated_date" && JSON.stringify(now[k]) !== JSON.stringify(g[k])).map((k) => [k, g[k]])) };
      const back = (await tpatch("collector_profile", g.id, restore))[0];
      R.ok("B · Clean-up", "the TEST gallery is otherwise exactly as before", Object.keys(g).filter((k) => k !== "updated_date").every((k) => JSON.stringify(back?.[k]) === JSON.stringify(g[k])));
      R.ok("B · Clean-up", "the TEST gallery's original links put back", gLinks.every((k) => back?.[k] === gOriginal[k]));
    }
  }
  R.ok("B · Whole run", "no page errors", errs.length === 0, errs.join(" | "));
  await p.close();
}

await b.close();
const { passed, total } = R.write({ heading: LIVE ? "Live site after deploy (read-only)" : "Browser test (v12 code; A: live data read-only, B: TEST project)" });
console.table(R.results.map((r) => ({ area: r.area, check: r.check.slice(0, 60), pass: r.pass ? "PASS" : "FAIL", detail: r.detail.slice(0, 40) })));
console.log(`${passed}/${total} passed — report: reports/B13-links.html`);
process.exit(passed === total ? 0 : 1);
