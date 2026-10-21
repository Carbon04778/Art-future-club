/**
 * Verifies website and social links (B13 in docs/CLIENT-REQUESTS.md).
 *
 *  - every way people actually typed a link (taken from the live data on
 *    2026-10-20) becomes a working address, or no link at all;
 *  - tidying on save changes only what is wrong, never a good value;
 *  - the server pre-render reads websites the same way as the browser;
 *  - no page still glues "instagram.com/" onto a saved value.
 *
 * Run: npm run verify:links
 */
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { websiteUrl, websiteLabel, socialUrl, socialHandle, socialLabel, cleanWebsite, cleanSocial, cleanLinks } from "../src/lib/links.js";

const ROOT = fileURLToPath(new URL("..", import.meta.url));
let pass = 0;
const fails = [];
const check = (n, c, d = "") => (c ? pass++ : fails.push(`${n}${d ? ` — ${d}` : ""}`));
const eq = (n, got, want) => check(n, got === want, `got ${JSON.stringify(got)}, want ${JSON.stringify(want)}`);

// ---- websites
const sites = [
  ["https://www.margynall.com", "https://www.margynall.com/", "margynall.com"],
  ["https://yandilao.wixsite.com/tonnaekwong", "https://yandilao.wixsite.com/tonnaekwong", "yandilao.wixsite.com/tonnaekwong"],
  ["www.evaku.hk", "https://www.evaku.hk/", "evaku.hk"],
  ["www.artmajeur.com/glen-joyce", "https://www.artmajeur.com/glen-joyce", "artmajeur.com/glen-joyce"],
  ["anna.com", "https://anna.com/", "anna.com"],
  ["  https://anna.com/  ", "https://anna.com/", "anna.com"],
  ["https:/www.boydandbyrd.com", "https://www.boydandbyrd.com/", "boydandbyrd.com"],
  ["HTTP://Anna.com", "http://anna.com/", "anna.com"],
  ["httpcats.com", "https://httpcats.com/", "httpcats.com"],
];
for (const [v, href, label] of sites) {
  eq(`website ${JSON.stringify(v)} → href`, websiteUrl(v), href);
  eq(`website ${JSON.stringify(v)} → label`, websiteLabel(v), label);
}
for (const v of ["", null, undefined, "n/a", "none", "Louise Alexander Gallery", "induction gallery", "zurich@hauserwirth.com", "https://www linkea .tech", "localhost", "javascript:alert(1)"]) {
  eq(`website ${JSON.stringify(v)} → no link`, websiteUrl(v), null);
}

// ---- Instagram: the forms people really used
const ig = [
  ["anna", "https://www.instagram.com/anna", "@anna"],
  ["@by_nance", "https://www.instagram.com/by_nance", "@by_nance"],
  [" @anna ", "https://www.instagram.com/anna", "@anna"],
  ["mariart.breathinglight", "https://www.instagram.com/mariart.breathinglight", "@mariart.breathinglight"],
  ["https://www.instagram.com/loyalgallery/", "https://www.instagram.com/loyalgallery/", "@loyalgallery"],
  ["https://www.instagram.com/boogiewoogiephotography/?hl=en", "https://www.instagram.com/boogiewoogiephotography/?hl=en", "@boogiewoogiephotography"],
  ["http://instagram.com/sovern.la", "http://instagram.com/sovern.la", "@sovern.la"],
  ["instagram.com/anna", "https://instagram.com/anna", "@anna"],
  ["www.instagram.com/anna/", "https://www.instagram.com/anna/", "@anna"],
];
for (const [v, href, label] of ig) {
  eq(`instagram ${JSON.stringify(v)} → href`, socialUrl("instagram", v), href);
  eq(`instagram ${JSON.stringify(v)} → label`, socialLabel("instagram", v), label);
  check(`instagram ${JSON.stringify(v)} → never instagram.com/https://`, !/instagram\.com\/https?:/i.test(socialUrl("instagram", v) || ""));
}
for (const v of ["tonnaeart @tonnaekwong", "Elysee ipenda ", "zurich@hauserwirth.com", "n/a", ""]) {
  eq(`instagram ${JSON.stringify(v)} → no link`, socialUrl("instagram", v), null);
}

// ---- the other platforms
eq("tiktok @eejwah → with the @ TikTok needs", socialUrl("tiktok", "@eejwah"), "https://www.tiktok.com/@eejwah");
eq("tiktok eejwah → with the @", socialUrl("tiktok", "eejwah"), "https://www.tiktok.com/@eejwah");
eq("tiktok URL kept", socialUrl("tiktok", "https://www.tiktok.com/@eejwah"), "https://www.tiktok.com/@eejwah");
eq("tiktok 'none' → no link", socialUrl("tiktok", "none"), null);
eq("twitter @IJWBAA", socialUrl("twitter", "@IJWBAA"), "https://x.com/IJWBAA");
eq("twitter 'n/a' → no link", socialUrl("twitter", "n/a"), null);
eq("an Instagram URL in the TikTok box still opens", socialUrl("tiktok", "https://www.instagram.com/lolo_hoihoi/"), "https://www.instagram.com/lolo_hoihoi/");
eq("linkedin URL kept", socialUrl("linkedin", "https://www.linkedin.com/in/juliepetris/"), "https://www.linkedin.com/in/juliepetris/");
eq("linkedin label", socialLabel("linkedin", "https://www.linkedin.com/in/juliepetris/"), "juliepetris");
eq("linkedin company", socialHandle("linkedin", "http://www.linkedin.com/company/fahey-klein-gallery/"), "fahey-klein-gallery");
eq("linkedin bare name (as the gallery box allowed)", socialUrl("linkedin", "john-doe"), "https://www.linkedin.com/in/john-doe");
eq("linkedin with spaces → no link", socialUrl("linkedin", "https://www.linkedin.com/in/Wai Sze Clark-Burton "), null);
eq("facebook URL kept", socialUrl("facebook", "https://www.facebook.com/loyalgallerypage/"), "https://www.facebook.com/loyalgallerypage/");
eq("instagram handle from a different site's URL → none", socialHandle("instagram", "https://www.facebook.com/x"), null);

// ---- tidying on save: only what is wrong changes
const keep = ["https://www.margynall.com", "https://www.instagram.com/loyalgallery/", "anna", "https://www.instagram.com/boogiewoogiephotography/?hl=en", "Louise Alexander Gallery", "n/a", ""];
for (const v of keep) {
  eq(`clean website keeps ${JSON.stringify(v)}`, cleanWebsite(v), v);
  if (v !== "https://www.margynall.com") eq(`clean instagram keeps ${JSON.stringify(v)}`, cleanSocial("instagram", v), v);
}
eq("clean website www. → https://", cleanWebsite("www.evaku.hk"), "https://www.evaku.hk");
eq("clean website bare → https://", cleanWebsite("anna.com/shop"), "https://anna.com/shop");
eq("clean website https:/ typo", cleanWebsite("https:/www.boydandbyrd.com"), "https://www.boydandbyrd.com");
eq("clean website trims", cleanWebsite("  https://anna.com  "), "https://anna.com");
eq("clean instagram @ → handle", cleanSocial("instagram", "@by_nance"), "by_nance");
eq("clean instagram www.instagram.com/x → https://", cleanSocial("instagram", "www.instagram.com/anna"), "https://www.instagram.com/anna");
eq("clean tiktok @ → handle", cleanSocial("tiktok", "@eejwah"), "eejwah");
eq("clean keeps a value with spaces as typed", cleanSocial("instagram", "tonnaeart @tonnaekwong"), "tonnaeart @tonnaekwong");
const artistForm = { display_name: "A", website: "www.a.com", instagram: "@a", twitter: "", tiktok: "@t", linkedin: "", portfolio_works: [{ title: "x" }] };
const cleaned = cleanLinks(artistForm);
check("cleanLinks adds no field (artists have no facebook column)", !("facebook" in cleaned) && Object.keys(cleaned).length === Object.keys(artistForm).length);
check("cleanLinks leaves other fields alone", cleaned.display_name === "A" && cleaned.portfolio_works === artistForm.portfolio_works);
eq("cleanLinks website", cleaned.website, "https://www.a.com");
eq("cleanLinks instagram", cleaned.instagram, "a");
check("cleanLinks does not change the original", artistForm.website === "www.a.com");
// what was read back still works after tidying
for (const v of ["www.evaku.hk", "@by_nance", "https:/www.boydandbyrd.com", "https://www.instagram.com/loyalgallery/"]) {
  check(`tidied ${JSON.stringify(v)} still links the same place`,
    (websiteUrl(cleanWebsite(v)) || socialUrl("instagram", cleanSocial("instagram", v))) === (websiteUrl(v) && !/instagram/.test(v) ? websiteUrl(v) : socialUrl("instagram", v)) || websiteUrl(cleanWebsite(v)) === websiteUrl(v));
}

// ---- the server pre-render agrees with the browser on websites
const pre = readFileSync(join(ROOT, "api/prerender.js"), "utf8");
const body = pre.match(/const outsideUrl = \(v\) => \{[\s\S]*?\n\};/)?.[0];
check("prerender has outsideUrl", !!body);
const outsideUrl = body ? new Function(`${body}; return outsideUrl;`)() : () => "missing";
for (const v of [...sites.map((s) => s[0]), "", "n/a", "Louise Alexander Gallery", "zurich@hauserwirth.com", "kalingku71", "@anna", "https://www.instagram.com/loyalgallery/"]) {
  eq(`prerender agrees on ${JSON.stringify(v)}`, outsideUrl(v), websiteUrl(v));
}
check("prerender sameAs goes through outsideUrl", /sameAs: \[row\.website, row\.instagram, row\.twitter, row\.linkedin\]\.map\(outsideUrl\)/.test(pre));
check("prerender Website fact goes through outsideUrl", /outsideUrl\(row\.website\) && \["Website"/.test(pre));

// ---- no page builds links the old way any more
const files = [];
const walk = (d) => { for (const f of readdirSync(d)) { const p = join(d, f); if (statSync(p).isDirectory()) walk(p); else if (/\.(jsx?|tsx?)$/.test(f)) files.push(p); } };
walk(join(ROOT, "src"));
const oldWays = [
  [/instagram\.com\/\$\{[^}]*\.instagram/, "glues instagram.com/ onto a saved value"],
  [/(twitter|tiktok)\.com\/\$\{profile/, "glues a platform onto a saved value"],
  [/href=\{profile\.(website|linkedin|instagram)\}/, "links a saved value exactly as typed"],
  [/href=\{profile\.website\}/, "links a website exactly as typed"],
];
for (const f of files) {
  const s = readFileSync(f, "utf8");
  for (const [re, what] of oldWays) check(`${f.slice(ROOT.length)} no longer ${what}`, !re.test(s));
}
for (const f of ["src/pages/ArtistProfileEdit.jsx", "src/pages/CollectorProfilePage.jsx", "src/pages/GalleryProfile.jsx"]) {
  const s = readFileSync(join(ROOT, f), "utf8");
  check(`${f}: the website box accepts "www." (not a strict URL field)`, !/set\("(website|linkedin)"[^>]*type="url"/.test(s));
  check(`${f}: links tidied on save`, /cleanLinks\(form\)/.test(s));
}

console.log(`verify:links — ${pass} passed, ${fails.length} failed`);
if (fails.length) { for (const f of fails) console.log("  ✗", f); process.exit(1); }
