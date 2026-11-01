/**
 * B14 (adjusting a profile photo) in real Chrome, with a real sign-in.
 *
 * Nothing is saved: the photo is chosen, adjusted and cancelled. Uploading
 * on save is unchanged (the same call the collector and admin forms already
 * use on the live site), and the TEST project has no file storage.
 *
 *  1. TEST (:5198) — the artist's own form: choose a photo that is wider
 *     than tall (red left half, blue right half), drag it, zoom it, and read
 *     the colour at the centre of the result to prove the drag really moves
 *     the crop. Cancel. Same on a phone.
 *  2. TEST — "Adjust current photo" on the admin's own TEST collector
 *     profile. Its photo address is pointed, for the test only, at a real
 *     live photo (must open in the adjuster) and then at a missing one (must
 *     say so); the original address is put back afterwards. Cancelled, never
 *     saved through the form.
 *
 *   node scripts/ui-test-photo.mjs [test-site]
 * Report: reports/B14-profile-photo.html
 */
import puppeteer from "puppeteer-core";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { createReport } from "./lib/report.mjs";

const ROOT = fileURLToPath(new URL("..", import.meta.url));
const E = Object.fromEntries(readFileSync(join(ROOT, ".env"), "utf8").split(/\r?\n/).filter((l) => /^[A-Z_]+=/.test(l)).map((l) => [l.slice(0, l.indexOf("=")), l.slice(l.indexOf("=") + 1).trim()]));
const TEST_SITE = process.argv[2] || "http://localhost:5198";
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const R = createReport("B14-profile-photo", "B14 — adjusting the profile photo", "Real Chrome, real sign-in. Photos are chosen, adjusted and cancelled — nothing is saved anywhere.");
const b = await puppeteer.launch({ executablePath: "C:/Program Files/Google/Chrome/Application/chrome.exe", headless: true });

async function signIn(site, width = 1366) {
  const p = await b.newPage();
  await p.setViewport({ width, height: 900 });
  const errs = []; p.on("pageerror", (e) => errs.push(e.message));
  await p.goto(`${site}/login`, { waitUntil: "networkidle2" });
  await p.waitForSelector('input[type="email"]', { timeout: 60000 });
  await p.type('input[type="email"]', E.AFC_ADMIN_EMAIL);
  await p.type('input[type="password"]', E.AFC_ADMIN_PASSWORD);
  await Promise.all([p.waitForNavigation({ waitUntil: "networkidle2", timeout: 60000 }).catch(() => {}), p.click('button[type="submit"]')]);
  await p.evaluate(() => [...document.querySelectorAll("button")].find((x) => /^reject$/i.test(x.innerText.trim()))?.click());
  return { p, errs };
}
const picker = '[data-testid="profile-photo-picker"]';
const openForm = async (p, site, path) => {
  await p.goto(`${site}${path}`, { waitUntil: "networkidle2" });
  return p.waitForSelector(picker, { timeout: 60000 }).then(() => true).catch(() => false);
};
// A 1200×800 photo: red left half, blue right half — chosen through the real file box.
const choosePhoto = (p) => p.evaluate(async (sel) => {
  const c = document.createElement("canvas"); c.width = 1200; c.height = 800;
  const g = c.getContext("2d"); g.fillStyle = "#ff0000"; g.fillRect(0, 0, 600, 800); g.fillStyle = "#0000ff"; g.fillRect(600, 0, 600, 800);
  const blob = await new Promise((r) => c.toBlob(r, "image/png"));
  const input = document.querySelector(`${sel} input[type=file]`);
  const dt = new DataTransfer(); dt.items.add(new File([blob], "wide.png", { type: "image/png" }));
  input.files = dt.files;
  input.dispatchEvent(new Event("change", { bubbles: true }));
}, picker);
// What the round preview shows: its size, and the colour at its centre.
const previewInfo = (p) => p.evaluate(async (sel) => {
  const img = document.querySelector(`${sel} .rounded-full img`);
  if (!img || !img.src.startsWith("blob:")) return { src: img?.src || "" };
  if (!img.complete) await new Promise((r) => { img.onload = r; setTimeout(r, 2000); });
  const c = document.createElement("canvas"); c.width = img.naturalWidth; c.height = img.naturalHeight;
  const g = c.getContext("2d"); g.drawImage(img, 0, 0);
  const [r, , bl] = g.getImageData(Math.floor(c.width / 2), Math.floor(c.height / 2), 1, 1).data;
  return { src: "blob", w: img.naturalWidth, h: img.naturalHeight, centre: r > 200 && bl < 60 ? "red" : bl > 200 && r < 60 ? "blue" : `rgb(${r},?,${bl})` };
}, picker);
const cropBox = (p) => p.evaluate((sel) => {
  const box = document.querySelector(`${sel} [style*="aspect-ratio"]`);
  if (!box) return null;
  const r = box.getBoundingClientRect();
  return { x: r.left, y: r.top, w: r.width, h: r.height, circle: !!box.querySelector(".rounded-full[aria-hidden=true]") };
}, picker);
const drag = async (p, dx) => {
  await p.evaluate((sel) => document.querySelector(`${sel} [style*="aspect-ratio"]`)?.scrollIntoView({ block: "center" }), picker);
  await sleep(400);
  const box = await cropBox(p);
  const sx = box.x + box.w / 2, sy = box.y + box.h / 2;
  await p.mouse.move(sx, sy); await p.mouse.down();
  for (let i = 1; i <= 12; i++) { await p.mouse.move(sx + (dx * i) / 12, sy); await sleep(16); }
  await p.mouse.up();
  await sleep(900); // the crop box sends its adjusted copy once the drag settles
};
const pickerText = (p) => p.evaluate((sel) => document.querySelector(sel)?.innerText || "", picker);
const button = (p, re) => p.evaluate((sel, src) => { const x = [...document.querySelectorAll(`${sel} button`)].find((b) => new RegExp(src, "i").test(b.textContent)); if (x) x.click(); return !!x; }, picker, re);

// ================= 1. the artist's own form (TEST)
{
  const { p, errs } = await signIn(TEST_SITE);
  R.ok("Artist's form", "profile form opens with the photo picker", await openForm(p, TEST_SITE, "/profile/edit"));
  await sleep(1500);
  await p.evaluate((sel) => document.querySelector(sel)?.scrollIntoView({ block: "start" }), picker);
  await p.screenshot({ path: R.shotPath("1-before.png") });
  await choosePhoto(p);
  await sleep(1200);
  const box = await cropBox(p);
  R.ok("Artist's form", "choosing a photo opens the adjuster", !!box, JSON.stringify(box));
  R.ok("Artist's form", "the circle the profile shows is drawn on it", box?.circle);
  R.ok("Artist's form", "it says how: drag to position, slider to zoom", /drag the photo/i.test(await pickerText(p)) && /zoom/i.test(await pickerText(p)));
  const start = await previewInfo(p);
  R.ok("Artist's form", "the round preview shows the result — a square (1600×1600), not the wide original", start.w === 1600 && start.h === 1600, JSON.stringify(start));
  await p.screenshot({ path: R.shotPath("2-adjuster.png") });

  await drag(p, box.w); // as far right as it goes → the photo's left (red) half is centred
  const right = await previewInfo(p);
  R.ok("Drag", "dragging the photo right brings its left (red) side to the middle", right.centre === "red", JSON.stringify(right), "3-dragged-right.png");
  await p.screenshot({ path: R.shotPath("3-dragged-right.png") });
  await drag(p, -2 * box.w); // all the way left → the right (blue) half
  const left = await previewInfo(p);
  R.ok("Drag", "dragging it left brings the right (blue) side to the middle", left.centre === "blue", JSON.stringify(left), "4-dragged-left.png");
  await p.screenshot({ path: R.shotPath("4-dragged-left.png") });

  // zoom: the slider moves, and the result is still a full square
  await p.evaluate((sel) => {
    const s = document.querySelector(`${sel} input[type=range]`);
    const set = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value").set;
    set.call(s, "2.5"); s.dispatchEvent(new Event("input", { bubbles: true })); s.dispatchEvent(new Event("change", { bubbles: true }));
  }, picker);
  await sleep(900);
  const zoomed = await previewInfo(p);
  const zoomVal = await p.evaluate((sel) => document.querySelector(`${sel} input[type=range]`)?.value, picker);
  R.ok("Zoom", "the zoom slider works (2.5×) and the result is still a 1600×1600 square", zoomVal === "2.5" && zoomed.w === 1600 && zoomed.h === 1600, `zoom ${zoomVal} ${JSON.stringify(zoomed)}`, "5-zoomed.png");
  await p.screenshot({ path: R.shotPath("5-zoomed.png") });

  R.ok("Cancel", "Cancel is offered", await button(p, "^cancel"));
  await sleep(600);
  R.ok("Cancel", "Cancel closes the adjuster and nothing is waiting to upload", !(await cropBox(p)) && !(await previewInfo(p)).src.startsWith("blob"));
  R.ok("Whole form", "no page errors", errs.length === 0, errs.join(" | "));
  await p.close();
}

// ---- phone
{
  const { p } = await signIn(TEST_SITE, 390);
  await openForm(p, TEST_SITE, "/profile/edit");
  await sleep(1500);
  await choosePhoto(p);
  await sleep(1200);
  const box = await cropBox(p);
  const over = await p.evaluate(() => document.documentElement.scrollWidth - innerWidth);
  R.ok("Phone", "adjuster fits the screen", box && box.x >= 0 && box.x + box.w <= 390, JSON.stringify(box));
  R.ok("Phone", "no sideways scrolling", over <= 1, `${over}px`);
  await drag(p, box.w);
  R.ok("Phone", "dragging works on a phone-sized screen", (await previewInfo(p)).centre === "red", "", "6-phone.png");
  await p.evaluate((sel) => document.querySelector(sel)?.scrollIntoView({ block: "start" }), picker);
  await p.screenshot({ path: R.shotPath("6-phone.png") });
  await button(p, "^cancel");
  await p.close();
}

// ================= 2. "Adjust current photo" (TEST; photo address set for the test, then restored)
// Skipped against the live site: it changes a TEST row, which only makes sense on TEST.
if (!TEST_SITE.startsWith("https://")) {
  const T = E.COPY_SUPABASE_URL.replace(/\/+$/, "");
  if (!T.includes("jbcexmconizdqxnfyjba")) throw new Error("COPY_SUPABASE_URL is not the TEST project");
  const TH = { apikey: E.COPY_SUPABASE_SERVICE_ROLE_KEY, Authorization: `Bearer ${E.COPY_SUPABASE_SERVICE_ROLE_KEY}`, "Content-Type": "application/json", Prefer: "return=representation" };
  const admin = (await (await fetch(`${T}/rest/v1/profiles?select=id&email=eq.${encodeURIComponent(E.AFC_ADMIN_EMAIL)}`, { headers: TH })).json())[0];
  const row = (await (await fetch(`${T}/rest/v1/collector_profile?select=id,avatar_url&user_id=eq.${admin.id}`, { headers: TH })).json())[0];
  const setPhoto = async (url) => (await (await fetch(`${T}/rest/v1/collector_profile?id=eq.${row.id}`, { method: "PATCH", headers: TH, body: JSON.stringify({ avatar_url: url }) })).json())[0];
  // a real uploaded photo from the live site (public, read only)
  const live = (await (await fetch(`${E.VITE_SUPABASE_URL}/rest/v1/artist_profile?select=avatar_url&status=eq.approved&avatar_url=like.*supabase.co/storage*webp&limit=1`, { headers: { apikey: E.VITE_SUPABASE_ANON_KEY } })).json())[0].avatar_url;
  const { p, errs } = await signIn(TEST_SITE);
  try {
    await setPhoto(live);
    R.ok("Adjust current photo", "collector form opens with the same picker", await openForm(p, TEST_SITE, "/collector-profile"));
    await sleep(2000);
    const has = await p.evaluate((sel) => [...document.querySelectorAll(`${sel} button`)].some((b) => /adjust current photo/i.test(b.textContent)), picker);
    R.ok("Adjust current photo", "a profile with a photo offers 'Adjust current photo'", has);
    await button(p, "adjust current photo");
    await p.waitForFunction((sel) => document.querySelector(`${sel} [style*="aspect-ratio"]`), { timeout: 20000 }, picker).catch(() => {});
    await sleep(1200);
    await p.evaluate((sel) => document.querySelector(sel)?.scrollIntoView({ block: "start" }), picker);
    await p.screenshot({ path: R.shotPath("7-adjust-current.png") });
    R.ok("Adjust current photo", "the uploaded photo opens in the adjuster, ready to reposition", !!(await cropBox(p)), "", "7-adjust-current.png");
    const pv = await previewInfo(p);
    R.ok("Adjust current photo", "…and the round preview follows it", pv.src === "blob" && pv.w === 1600, JSON.stringify(pv));
    await button(p, "^cancel");
    await sleep(500);
    R.ok("Adjust current photo", "Cancel puts the saved photo back", !(await cropBox(p)) && (await p.evaluate((sel) => document.querySelector(`${sel} .rounded-full img`)?.src, picker)) === live);

    // a photo that can no longer be fetched
    await setPhoto("https://jbcexmconizdqxnfyjba.supabase.co/storage/v1/object/public/uploads/b14-missing-photo.webp");
    await openForm(p, TEST_SITE, "/collector-profile");
    await sleep(2000);
    await button(p, "adjust current photo");
    await p.waitForFunction((sel) => /can't be re-opened/i.test(document.querySelector(sel)?.innerText || ""), { timeout: 30000 }, picker).catch(() => {});
    R.ok("Adjust current photo", "a photo that can't be fetched gives a clear message instead of breaking", /choose the file again/i.test(await pickerText(p)) && !(await cropBox(p)), (await pickerText(p)).slice(0, 90), "8-cannot-reopen.png");
    await p.screenshot({ path: R.shotPath("8-cannot-reopen.png") });
  } catch (err) {
    R.ok("Adjust current photo", "test ran to the end", false, String(err?.message || err).slice(0, 150));
  } finally {
    const back = await setPhoto(row.avatar_url);
    R.ok("Clean-up", "the TEST profile's original photo address put back", back?.avatar_url === row.avatar_url, back?.avatar_url);
  }
  R.ok("Adjust current photo", "no page errors", errs.length === 0, errs.join(" | "));
  await p.close();
}

await b.close();
const { passed, total } = R.write({ heading: "Browser test (v12 code; real sign-in; nothing saved)" });
console.table(R.results.map((r) => ({ area: r.area, check: r.check.slice(0, 60), pass: r.pass ? "PASS" : "FAIL", detail: r.detail.slice(0, 40) })));
console.log(`${passed}/${total} passed — report: reports/B14-profile-photo.html`);
process.exit(passed === total ? 0 : 1);
