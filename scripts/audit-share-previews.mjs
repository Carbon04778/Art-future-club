/**
 * Every share preview ("thumbnail") on the site, checked the way WhatsApp
 * checks it. READ-ONLY.
 *
 * For every public page — artists, galleries, venues, Directory listings,
 * events, articles, open calls, chapters — it:
 *   1. fetches the page as WhatsApp does (crawler user-agent, raw HTML only),
 *   2. reads the og:image the page offers,
 *   3. downloads that image and checks it loads, is really an image, is under
 *      WhatsApp's ~300 KB limit, and is the record's OWN picture — not the
 *      site's generic home-page picture while the record has one of its own.
 *
 *   node scripts/audit-share-previews.mjs [site] [--only=kind,kind] [--limit=N]
 *     site   default https://www.artfutureclub.com (records are read from the
 *            database in .env VITE_SUPABASE_URL with the service key)
 * Report: reports/share-previews.html, every row in reports/share-previews.csv
 */
import { readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import sharp from "sharp";
import { createReport } from "./lib/report.mjs";
import { artistPath, spacePath, eventPath, articlePath, pathId } from "../src/lib/slugs.js";
import { isVenueType, isDirectoryType } from "../src/lib/venueTypes.js";
import { CHAPTERS } from "../src/lib/chaptersData.js";

const ROOT = fileURLToPath(new URL("..", import.meta.url));
const E = Object.fromEntries(readFileSync(join(ROOT, ".env"), "utf8").split(/\r?\n/).filter((l) => /^[A-Z_]+=/.test(l)).map((l) => [l.slice(0, l.indexOf("=")), l.slice(l.indexOf("=") + 1).trim()]));
const args = process.argv.slice(2);
const SITE = (args.find((a) => !a.startsWith("--")) || "https://www.artfutureclub.com").replace(/\/+$/, "");
const ONLY = (args.find((a) => a.startsWith("--only="))?.slice(7) || "").split(",").filter(Boolean);
const LIMIT = Number(args.find((a) => a.startsWith("--limit="))?.slice(8) || 0);
const U = E.VITE_SUPABASE_URL.replace(/\/+$/, "");
const SH = { apikey: E.SUPABASE_SERVICE_ROLE_KEY, Authorization: `Bearer ${E.SUPABASE_SERVICE_ROLE_KEY}` };
const UA = "WhatsApp/2.23.20.0 A";
const MAX_BYTES = 300 * 1024;
const DEFAULT_IMG = "/images/AdobeStock_528827486.jpg";

const rest = async (q) => {
  const out = [];
  for (let from = 0; ; from += 1000) {
    const r = await fetch(`${U}/rest/v1/${q}`, { headers: { ...SH, Range: `${from}-${from + 999}` } });
    const rows = await r.json();
    if (!Array.isArray(rows)) throw new Error(`${q}: ${JSON.stringify(rows)}`);
    out.push(...rows);
    if (rows.length < 1000) return out;
  }
};
const firstImg = (list, key = "image_url") => (Array.isArray(list) ? list : []).map((x) => (typeof x === "string" ? x : x?.[key] || x?.url)).find(Boolean) || "";

/* What each kind of page shows, and every picture the record has. */
const pages = [];
const want = (k) => !ONLY.length || ONLY.includes(k);
if (want("artist")) for (const r of await rest("artist_profile?select=id,slug,display_name,avatar_url,portfolio_works&status=eq.approved&order=display_name"))
  pages.push({ kind: "artist", name: r.display_name, path: artistPath(r), own: r.avatar_url || firstImg(r.portfolio_works), any: [r.avatar_url, ...(r.portfolio_works || []).map((w) => w?.image_url)].filter(Boolean) });
if (want("space")) for (const r of await rest("collector_profile?select=id,slug,display_name,type,avatar_url,cover_image_url,space_images&status=eq.approved&order=display_name")) {
  if (!(r.type === "Gallery" || isVenueType(r.type) || isDirectoryType(r.type))) continue; // people are members-only pages
  pages.push({ kind: isDirectoryType(r.type) ? "directory" : isVenueType(r.type) ? "venue" : "gallery", name: r.display_name, path: spacePath(r, isVenueType(r.type)), own: r.cover_image_url || r.avatar_url || firstImg(r.space_images), any: [r.cover_image_url, r.avatar_url, ...(Array.isArray(r.space_images) ? r.space_images : []).map((x) => (typeof x === "string" ? x : x?.url || x?.image_url))].filter(Boolean) });
}
if (want("event")) for (const r of await rest("event?select=id,slug,title,image_url&order=start_date.desc"))
  pages.push({ kind: "event", name: r.title, path: eventPath(r), own: r.image_url || "", any: [r.image_url].filter(Boolean) });
if (want("article")) for (const r of await rest("article?select=id,slug,title,og_image_url,cover_image_url,images,closing_image_url&published=eq.true&order=title"))
  pages.push({ kind: "article", name: r.title, path: articlePath(r), own: r.og_image_url || r.cover_image_url || firstImg(r.images) || r.closing_image_url || "", any: [r.og_image_url, r.cover_image_url, ...(Array.isArray(r.images) ? r.images : []).map((x) => (typeof x === "string" ? x : x?.url || x?.image_url)), r.closing_image_url].filter(Boolean) });
if (want("opencall")) for (const r of await rest("open_call?select=*&order=created_date.desc"))
  pages.push({ kind: "open call", name: r.title, path: `/open-calls/${pathId(r)}`, own: r.image_url || "", any: [r.image_url].filter(Boolean) });
if (want("chapter")) for (const c of CHAPTERS)
  pages.push({ kind: "chapter", name: c.city, path: `/chapter/${c.slug}`, own: c.image || "", any: [c.image].filter(Boolean) });
const todo = LIMIT ? pages.slice(0, LIMIT) : pages;

const meta = (html, prop) => {
  const m = html.match(new RegExp(`<meta[^>]+(?:property|name)="${prop}"[^>]+content="([^"]*)"`, "i"));
  return m ? m[1].replace(/&amp;/g, "&") : "";
};
/** The stored file an og:image stands for (unwraps /api/og-image?src=). */
const sourceOf = (og) => {
  try { const u = new URL(og, SITE); return u.pathname === "/api/og-image" ? decodeURIComponent(u.searchParams.get("src") || "") : u.href; } catch { return og; }
};
const same = (a, b) => {
  if (!a || !b) return false;
  const norm = (s) => { try { const u = new URL(s, SITE); return decodeURIComponent(u.pathname); } catch { return s; } };
  return norm(a) === norm(b);
};

async function check(p) {
  const row = { ...p, page: 0, og: "", status: 0, type: "", bytes: 0, size: "", verdict: "", why: "" };
  try {
    const res = await fetch(`${SITE}${encodeURI(p.path)}`, { headers: { "User-Agent": UA }, redirect: "follow" });
    row.page = res.status;
    const html = await res.text();
    row.og = meta(html, "og:image");
    row.title = meta(html, "og:title") || (html.match(/<title>([^<]*)/i)?.[1] ?? "");
  } catch (e) { row.verdict = "BROKEN"; row.why = `page did not load: ${e.message}`; return row; }
  if (!row.og) { row.verdict = "BROKEN"; row.why = "the page offers no og:image at all (blank card)"; return row; }
  try {
    const img = await fetch(new URL(row.og, SITE).href, { headers: { "User-Agent": UA } });
    row.status = img.status;
    row.type = img.headers.get("content-type") || "";
    const buf = Buffer.from(await img.arrayBuffer());
    row.bytes = buf.length;
    if (img.ok && /^image\//.test(row.type)) {
      const m = await sharp(buf).metadata().catch(() => null);
      row.size = m ? `${m.width}x${m.height} ${m.format}` : "unreadable";
    }
  } catch (e) { row.status = -1; row.why = e.message; }
  const src = sourceOf(row.og);
  const isDefault = same(src, DEFAULT_IMG);
  const isBrand = /[?&]card=brand\b/.test(row.og);
  // What it SHOULD show: the first of the page's own pictures that really loads.
  row.expected = await firstLoading(p.any);
  const ok = row.status === 200 && /^image\/(jpeg|png|gif)/.test(row.type) && row.bytes > 0 && row.bytes <= MAX_BYTES && row.size && row.size !== "unreadable";
  if (!ok) {
    row.verdict = "BROKEN";
    row.why = row.status !== 200 ? `picture answers ${row.status} (blank card)`
      : !/^image\//.test(row.type) ? `not a picture (${row.type})`
      : !/^image\/(jpeg|png|gif)/.test(row.type) ? `${row.type} — WhatsApp may not show it`
      : row.bytes > MAX_BYTES ? `${Math.round(row.bytes / 1024)} KB — over WhatsApp's ~300 KB, shown blank`
      : `unreadable picture`;
  } else if (isDefault) {
    row.verdict = "WRONG";
    row.why = row.expected ? "shows the home-page picture, but it has its own" : "shows the home-page picture (should be the club card)";
  } else if (isBrand) {
    row.verdict = row.expected ? "WRONG" : "CLUB CARD";
    row.why = row.expected ? "shows the club card, but it has its own picture that loads" : "no picture of its own that loads, so the club card";
  } else if (!row.expected) {
    row.verdict = "WRONG"; row.why = "shows a picture, but none of its own loads";
  } else if (!same(src, row.expected)) {
    row.verdict = "WRONG"; row.why = `shows a different picture than its own first working one`;
  } else {
    row.verdict = "OK";
  }
  return row;
}

/** The first URL in the list that answers 200 with an image. Cached per URL. */
const loadCache = new Map();
async function firstLoading(list) {
  for (const u of list) {
    let abs;
    try { abs = new URL(u, "https://www.artfutureclub.com").href; } catch { continue; }
    if (!loadCache.has(abs)) loadCache.set(abs, fetch(abs).then(async (r) => { await r.arrayBuffer(); return r.ok && /^image\//.test(r.headers.get("content-type") || ""); }).catch(() => false));
    if (await loadCache.get(abs)) return u;
  }
  return "";
}

console.log(`Checking ${todo.length} share previews on ${SITE} …`);
const results = [];
let i = 0;
await Promise.all(Array.from({ length: 6 }, async () => {
  while (i < todo.length) {
    const p = todo[i++];
    results.push(await check(p));
    if (results.length % 50 === 0) console.log(`  ${results.length}/${todo.length}`);
  }
}));
results.sort((a, b) => a.kind.localeCompare(b.kind) || String(a.name).localeCompare(String(b.name)));

const kinds = [...new Set(results.map((r) => r.kind))];
const R = createReport("share-previews", "Share previews (thumbnails) — every public page", `${SITE}, fetched as WhatsApp. ${results.length} pages. Read-only.`);
for (const k of kinds) {
  const rs = results.filter((r) => r.kind === k);
  const c = (v) => rs.filter((r) => r.verdict === v).length;
  R.ok(k, `${rs.length} pages: ${c("OK")} their own picture, ${c("CLUB CARD")} club card (nothing of their own loads), ${c("WRONG")} wrong picture, ${c("BROKEN")} broken`, c("WRONG") + c("BROKEN") === 0);
  for (const r of rs.filter((r) => r.verdict === "WRONG" || r.verdict === "BROKEN")) R.ok(k, `${r.verdict}: ${r.name} — ${r.why}`, false, `${r.path}`);
}
const csv = ["kind,name,path,verdict,why,page_status,image_status,content_type,bytes,size,og_image,should_show",
  ...results.map((r) => [r.kind, r.name, r.path, r.verdict, r.why, r.page, r.status, r.type, r.bytes, r.size, r.og, r.expected].map((v) => `"${String(v ?? "").replace(/"/g, '""')}"`).join(","))].join("\r\n");
writeFileSync(join(ROOT, "reports/share-previews.csv"), "﻿" + csv);
const { passed, total } = R.write({ heading: "By kind of page" });

console.log("\nkind        pages  own-picture  club-card  WRONG  BROKEN");
for (const k of kinds) {
  const rs = results.filter((r) => r.kind === k);
  const c = (v) => rs.filter((r) => r.verdict === v).length;
  console.log(`${k.padEnd(11)} ${String(rs.length).padStart(5)} ${String(c("OK")).padStart(12)} ${String(c("CLUB CARD")).padStart(10)} ${String(c("WRONG")).padStart(6)} ${String(c("BROKEN")).padStart(7)}`);
}
console.log(`\nTOTAL ${results.length} pages: ${results.filter((r) => r.verdict === "OK").length} own picture, ${results.filter((r) => r.verdict === "CLUB CARD").length} club card, ${bad0().length} wrong or broken`);
function bad0() { return results.filter((r) => r.verdict === "WRONG" || r.verdict === "BROKEN"); }
const bad = results.filter((r) => r.verdict === "WRONG" || r.verdict === "BROKEN");
const reasons = {};
for (const r of bad) { const key = `${r.kind}: ${r.why.replace(/\d+ KB/, "N KB").replace(/\(\d+\)/, "")}`; reasons[key] = (reasons[key] || 0) + 1; }
console.log("\nproblems by reason:");
for (const [k, n] of Object.entries(reasons).sort((a, b) => b[1] - a[1])) console.log(`  ${String(n).padStart(4)}  ${k}`);
console.log(`\n${passed}/${total} report lines passed — reports/share-previews.html, all rows in reports/share-previews.csv`);
process.exit(bad.length ? 1 : 0);
