/**
 * CSV import of gallery, venue and Directory listings (C12 / B8 in
 * docs/CLIENT-REQUESTS.md). Everything here is plain functions — no
 * database, no React — so scripts/verify-csv-import.mjs can test every rule.
 *
 * The flow (src/components/AdminImportPanel.jsx):
 *   parseCsv(text)                      → rows of cells
 *   readSheet(cells)                    → { columns, rows, problems }
 *   checkRows(rows, existing)           → each row: ready / problem / duplicate
 *   recordFor(row) / patchFor(row, old) → what is saved
 *
 * Text only — images are added afterwards on each listing, as Julie asked.
 * No claim email: a wrong one hands a listing to the wrong person (Julie,
 * 2026-10-27: "Yes thanks").
 */
import { GALLERY_INTERESTS, VENUE_TYPES, DIRECTORY_TYPES } from "./venueTypes.js";
import { CHAPTER_NAMES } from "./chaptersData.js";
import { cleanWebsite, cleanSocial, websiteUrl, socialUrl } from "./links.js";

/* --------------------------------------------------------------- columns */

/**
 * The template's columns, in order. `aliases` are other headings people use —
 * Julie's earlier sheet used display_name, based_in, bio and geo — matched
 * ignoring case, spaces, dashes and underscores.
 */
export const COLUMNS = [
  { key: "listing_type", label: "listing_type", required: true, aliases: ["type", "listing type", "category", "kind"], help: "Gallery, Museum, Foundation, Institution, Event Space, Restaurant, Art Store, Framer or Printer. \"Venue\" is saved as Institution." },
  { key: "name", label: "name", required: true, aliases: ["display_name", "gallery name", "venue name", "listing name", "organisation", "organization", "organisation name", "organization name", "title"], help: "The name as it should appear on the site." },
  { key: "city", label: "city", required: true, aliases: ["based_in", "based in", "location city", "town"], help: "Use the chapter's name (e.g. Hong Kong) so the listing shows under that chapter." },
  { key: "country", label: "country", aliases: [], help: "Added to the end of the address if it is not already there." },
  { key: "address", label: "address", aliases: ["street address", "full address"], help: "Used for the map pin." },
  { key: "description", label: "description", aliases: ["bio", "about", "summary"], help: "" },
  { key: "website", label: "website", aliases: ["url", "web", "website url", "site"], help: "" },
  { key: "email", label: "contact_email", aliases: ["contact email", "email address", "e-mail"], help: "Shown on the listing as its contact email. It does NOT let anyone claim the listing." },
  { key: "phone", label: "phone", aliases: ["phone number", "telephone", "tel", "contact number"], help: "" },
  { key: "opening_hours", label: "opening_hours", aliases: ["opening hours", "hours", "open hours"], help: "" },
  { key: "instagram", label: "instagram", aliases: ["instagram url", "ig"], help: "Handle or full link." },
  { key: "facebook", label: "facebook", aliases: ["facebook url", "fb"], help: "" },
  { key: "linkedin", label: "linkedin", aliases: ["linkedin url"], help: "" },
  { key: "twitter", label: "twitter", aliases: ["x", "x twitter", "twitter url"], help: "" },
  { key: "disciplines", label: "disciplines", aliases: ["interests", "discipline", "mediums", "media"], help: `Galleries only, separated by ";". ${GALLERY_INTERESTS.join(", ")}.` },
  { key: "latitude", label: "latitude", aliases: ["lat"], help: "Optional. With longitude, places the map pin exactly." },
  { key: "longitude", label: "longitude", aliases: ["lng", "lon", "long"], help: "" },
  { key: "geo", label: "geo", aliases: ["coordinates", "lat lng", "latlng", "location"], help: "Optional: \"22.28,114.15\" in one cell, instead of latitude and longitude." },
  { key: "seo_title", label: "seo_title", aliases: ["seo title"], help: "" },
  { key: "seo_description", label: "seo_description", aliases: ["seo description", "meta description"], help: "" },
  { key: "seo_keywords", label: "seo_keywords", aliases: ["seo keywords", "keywords"], help: "" },
];

const squash = (s) => String(s ?? "").toLowerCase().replace(/[\s_\-/]+/g, "");
const HEADING = new Map();
for (const c of COLUMNS) for (const a of [c.key, c.label, ...c.aliases]) HEADING.set(squash(a), c.key);

/** The column a heading means, or null. */
export const columnFor = (heading) => HEADING.get(squash(heading)) ?? null;

/* ----------------------------------------------------------------- types */

/** What listing_type may be. Order is the order the help text shows. */
export const LISTING_TYPES = ["Gallery", ...VENUE_TYPES, ...DIRECTORY_TYPES];

/**
 * "gallery", "Galleries", "art stores", "event-space" → the saved type.
 * "Venue" is not a type on the site (each venue is a museum, foundation…);
 * it becomes Institution, the same default as Add Listing's Venue button.
 */
export function readType(v) {
  const s = squash(v);
  if (!s) return { type: null };
  if (s === "venue" || s === "venues") return { type: "Institution", note: "\"Venue\" saved as Institution — change it in Edit Listings if it is a museum, foundation, event space or restaurant." };
  for (const t of LISTING_TYPES) {
    const k = squash(t);
    if (s === k || s === `${k}s` || s === `${k}es` || (k.endsWith("y") && s === `${k.slice(0, -1)}ies`)) return { type: t };
  }
  return { type: null };
}

/* ------------------------------------------------------------------ CSV */

/**
 * RFC 4180 CSV: quoted cells may hold commas, line breaks and "" for a
 * quote. Handles a UTF-8 byte-order mark, CRLF, and files saved with ";" or
 * tabs between cells (Excel in many countries, and Google Sheets' .tsv).
 * Returns an array of rows, each an array of cell strings.
 */
export function parseCsv(text) {
  let s = String(text ?? "");
  if (s.charCodeAt(0) === 0xfeff) s = s.slice(1);
  const firstLine = s.slice(0, s.search(/\r?\n|$/));
  const count = (ch) => firstLine.split(ch).length - 1;
  const sep = count("\t") > count(",") && count("\t") >= count(";") ? "\t" : count(";") > count(",") ? ";" : ",";

  const rows = [];
  let row = [];
  let cell = "";
  let quoted = false;
  for (let i = 0; i < s.length; i++) {
    const ch = s[i];
    if (quoted) {
      if (ch === '"') {
        if (s[i + 1] === '"') { cell += '"'; i++; } else quoted = false;
      } else cell += ch;
    } else if (ch === '"' && cell === "") quoted = true;
    else if (ch === sep) { row.push(cell); cell = ""; }
    else if (ch === "\n" || ch === "\r") {
      if (ch === "\r" && s[i + 1] === "\n") i++;
      row.push(cell); rows.push(row); row = []; cell = "";
    } else cell += ch;
  }
  if (cell !== "" || row.length) { row.push(cell); rows.push(row); }
  // Lines with nothing in them (a trailing newline, ",,,," from a spreadsheet)
  return rows.filter((r) => r.some((c) => c.trim() !== ""));
}

/** One cell, safe for a spreadsheet: quoted if needed, never a formula. */
export function csvCell(v) {
  let s = v == null ? "" : String(v);
  if (/^[=+\-@\t\r]/.test(s)) s = `'${s}`;
  return /[",\r\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

export const toCsv = (rows) => rows.map((r) => r.map(csvCell).join(",")).join("\r\n") + "\r\n";

/** The template: headings only, so nothing in it can be imported by mistake. */
export const templateCsv = () => "﻿" + toCsv([COLUMNS.map((c) => c.label)]);

export const MAX_ROWS = 2000;

/**
 * Cells → named rows. `problems` are reasons the whole file cannot be used
 * (no heading row, no name column…); a bad ROW is reported by checkRows.
 */
export function readSheet(cells) {
  const problems = [];
  const notes = [];
  if (!cells.length) return { columns: [], ignored: [], rows: [], problems: ["The file is empty."], notes, needsType: false };
  const head = cells[0];
  const columns = head.map(columnFor);
  /*
   * Two headings for one field (Julie's earlier data has both "city" and
   * "based_in"): the template's own heading wins, else the first one; the
   * other is named in the preview as not imported.
   */
  const own = (h, k) => { const c = COLUMNS.find((x) => x.key === k); return squash(h) === squash(c.key) || squash(h) === squash(c.label); };
  const winner = {};
  head.forEach((h, i) => {
    const k = columns[i];
    if (!k) return;
    if (winner[k] == null || (own(h, k) && !own(head[winner[k]], k))) winner[k] = i;
  });
  head.forEach((h, i) => {
    const k = columns[i];
    if (k && winner[k] !== i) {
      notes.push(`"${h.trim()}" was not imported: "${head[winner[k]].trim()}" is used for ${k}.`);
      columns[i] = null;
    }
  });
  const ignored = head.filter((h, i) => h.trim() && !columns[i] && !columnFor(h)).map((h) => h.trim());
  const seen = new Set(columns.filter(Boolean));
  // No listing_type column is allowed: the admin then picks one type for the
  // whole file (Julie's earlier sheet had none — every row was a gallery).
  for (const c of COLUMNS.filter((x) => x.required && x.key !== "listing_type")) {
    if (!seen.has(c.key)) problems.push(`No "${c.label}" column. Download the template to see the headings.`);
  }
  const needsType = !seen.has("listing_type");
  if (ignored.length) notes.push(`Not imported (no matching field on the site): ${ignored.join(", ")}.`);
  const body = cells.slice(1);
  if (!body.length) problems.push("The file has headings but no listings under them.");
  if (body.length > MAX_ROWS) problems.push(`The file has ${body.length} listings; import at most ${MAX_ROWS} at a time.`);
  if (cells.some((r) => r.some((c) => c.includes("�")))) {
    problems.push("Some letters in the file are unreadable (shown as �). Save it again as \"CSV UTF-8\" and upload that.");
  }
  const rows = body.map((r, i) => {
    const values = {};
    columns.forEach((k, j) => { if (k) values[k] = (r[j] ?? "").trim(); });
    // Spreadsheet row number: heading is row 1.
    return { line: i + 2, values };
  });
  return { columns: [...seen], ignored, rows, problems, notes, needsType };
}

/* ------------------------------------------------------------- matching */

/** "The Pearl-Lam Galleries Ltd." and "pearl lam galleries" compare equal. */
export function nameKey(v) {
  return String(v ?? "")
    .normalize("NFKD").replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/&/g, " and ")
    .replace(/[^\p{L}\p{N}]+/gu, " ")
    .trim()
    .replace(/^the /, "")
    .replace(/ (ltd|limited|inc|llc|co)$/, "");
}

/** "https://www.Gallery.com/en/" → "gallery.com/en"; null when not a site. */
export function siteKey(v) {
  const u = websiteUrl(v);
  if (!u) return null;
  try {
    const x = new URL(u);
    const host = x.hostname.toLowerCase().replace(/^www\./, "");
    // instagram.com/… and linktr.ee/… are not the gallery's own site.
    if (/(^|\.)(instagram|facebook|linktr|linkedin|twitter|x|tiktok)\.(com|ee)$/.test(host)) return null;
    const path = x.pathname.replace(/\/+$/, "").toLowerCase();
    return path && path !== "/" ? `${host}${path}` : host;
  } catch { return null; }
}

/* ------------------------------------------------------------- checking */

const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;
const LIMITS = { name: 200, city: 120, address: 400, description: 8000, phone: 80, opening_hours: 500, seo_title: 200, seo_description: 1000, seo_keywords: 1000 };

function readCoords(v) {
  const lat = v.latitude, lng = v.longitude;
  let a = lat, b = lng;
  if ((!a || !b) && v.geo) [a, b] = v.geo.split(/[,;\s]+/).filter(Boolean);
  if (!a && !b) return { coords: null };
  const la = Number(a), ln = Number(b);
  if (!Number.isFinite(la) || !Number.isFinite(ln) || Math.abs(la) > 90 || Math.abs(ln) > 180) return { coords: null, bad: true };
  return { coords: { lat: la, lng: ln } };
}

function readDisciplines(v) {
  const want = String(v ?? "").split(/[;,|]+/).map((x) => x.trim()).filter(Boolean);
  const out = [];
  const unknown = [];
  for (const w of want) {
    const hit = GALLERY_INTERESTS.find((d) => squash(d) === squash(w));
    if (hit) { if (!out.includes(hit)) out.push(hit); } else unknown.push(w);
  }
  return { list: out, unknown };
}

/**
 * Every row, checked against the file and the site.
 *
 * existing: every collector_profile row (id, display_name, type, based_in,
 * address, website, user_id, status).
 *
 * Each result: { line, values, state, errors[], warnings[], type, coords,
 * disciplines, match } where state is
 *   "ready"     — can be created
 *   "problem"   — cannot be imported until the file is fixed (errors[])
 *   "duplicate" — a listing with the same name or website is already on the
 *                 site; the admin chooses skip or update (match = that row)
 */
export function checkRows(rows, existing = [], { defaultType = null } = {}) {
  const byName = new Map();
  const bySite = new Map();
  for (const e of existing) {
    const n = nameKey(e.display_name);
    if (n) { if (!byName.has(n)) byName.set(n, []); byName.get(n).push(e); }
    const s = siteKey(e.website);
    if (s) { if (!bySite.has(s)) bySite.set(s, []); bySite.get(s).push(e); }
  }
  const inFile = new Map(); // nameKey|city → first line

  return rows.map(({ line, values: given }) => {
    const errors = [];
    const warnings = [];
    // An empty listing_type cell, or no such column, takes the type chosen
    // for the whole file — if one was chosen.
    const v = given.listing_type || !defaultType ? given : { ...given, listing_type: defaultType };
    const { type, note } = readType(v.listing_type);
    if (!v.listing_type) errors.push("listing_type is empty.");
    else if (!type) errors.push(`listing_type "${v.listing_type}" is not one the site has. Use: ${LISTING_TYPES.join(", ")} (or Venue).`);
    if (note) warnings.push(note);
    if (!v.name) errors.push("name is empty.");
    if (!v.city) errors.push("city is empty.");
    for (const [k, max] of Object.entries(LIMITS)) {
      if ((v[k] || "").length > max) errors.push(`${k} is too long (${v[k].length} characters; at most ${max}).`);
    }
    if (v.email && !EMAIL.test(v.email)) errors.push(`contact_email "${v.email}" is not an email address.`);
    if (v.website && !websiteUrl(v.website)) warnings.push(`website "${v.website}" is not a link the site can open — left empty.`);
    for (const p of ["instagram", "facebook", "linkedin", "twitter"]) {
      if (v[p] && !socialUrl(p, v[p])) warnings.push(`${p} "${v[p]}" could not be read as a ${p} link — left empty.`);
    }
    const { coords, bad } = readCoords(v);
    if (bad) errors.push("latitude/longitude are not valid numbers (e.g. 22.2819, 114.1580).");
    const disc = readDisciplines(v.disciplines);
    if (disc.unknown.length) warnings.push(`disciplines not on the site, left out: ${disc.unknown.join(", ")}.`);
    if (type && type !== "Gallery" && disc.list.length) warnings.push("disciplines are only used for galleries — left out.");
    if (v.city && !CHAPTER_NAMES.some((c) => squash(c) === squash(v.city))) {
      warnings.push(`"${v.city}" is not a chapter yet, so this listing will not appear under any chapter filter.`);
    }
    if (!coords && !v.address) warnings.push("no address or coordinates — no map pin.");

    const key = `${nameKey(v.name)}|${squash(v.city)}`;
    if (v.name && inFile.has(key)) errors.push(`The same listing is already on row ${inFile.get(key)} of this file.`);
    else if (v.name) inFile.set(key, line);

    let match = null;
    let matchedBy = "";
    if (!errors.length) {
      const named = byName.get(nameKey(v.name)) || [];
      const sited = (siteKey(v.website) && bySite.get(siteKey(v.website))) || [];
      // Same name in the same city first, then same website, then same name.
      const sameCity = named.find((e) => [e.based_in, e.address].some((x) => squash(x).includes(squash(v.city))));
      match = sameCity || sited[0] || named[0] || null;
      matchedBy = match ? (match === sameCity ? "same name and city" : sited.includes(match) ? "same website" : "same name (different city)") : "";
    }
    const state = errors.length ? "problem" : match ? "duplicate" : "ready";
    return { line, values: v, state, errors, warnings, type, coords, disciplines: type === "Gallery" ? disc.list : [], match, matchedBy };
  });
}

/* ---------------------------------------------------------------- saving */

function fullAddress(v) {
  const a = (v.address || "").trim();
  const c = (v.country || "").trim();
  if (!c) return a;
  if (!a) return "";
  return a.toLowerCase().includes(c.toLowerCase()) ? a : `${a}, ${c}`;
}

const linkOrEmpty = (k, val) => {
  if (!val) return "";
  if (k === "website") return websiteUrl(val) ? cleanWebsite(val) : "";
  return socialUrl(k, val) ? cleanSocial(k, val) : "";
};

/** The text fields a row fills, with links tidied. Empty cells are "". */
function fields(r) {
  const v = r.values;
  return {
    display_name: v.name,
    based_in: v.city,
    address: fullAddress(v),
    bio: v.description || "",
    website: linkOrEmpty("website", v.website),
    email: (v.email || "").toLowerCase(),
    phone: v.phone || "",
    opening_hours: v.opening_hours || "",
    instagram: linkOrEmpty("instagram", v.instagram),
    facebook: linkOrEmpty("facebook", v.facebook),
    linkedin: linkOrEmpty("linkedin", v.linkedin),
    twitter: linkOrEmpty("twitter", v.twitter),
    seo_title: v.seo_title || "",
    seo_description: v.seo_description || "",
    seo_keywords: v.seo_keywords || "",
  };
}

/**
 * A new listing. status: "pending" waits in Approvals (imported as a draft
 * for review); "approved" is live at once. Unclaimed (no user_id), no claim
 * email — the same as Add Listing.
 */
export function recordFor(r, status) {
  const rec = {
    ...fields(r),
    type: r.type,
    status,
    claim_email: null,
    interests: r.disciplines || [],
    space_images: [],
    seeking: [],
  };
  if (r.coords) { rec.geo_lat = r.coords.lat; rec.geo_lng = r.coords.lng; }
  return rec;
}

/**
 * Updating a listing already on the site: only the cells that have
 * something in them. An empty cell never wipes what the listing has, and
 * name, type, status and ownership are never changed by an import.
 * Returns { patch, before } — `before` is what Undo puts back.
 */
export function patchFor(r, old) {
  const f = fields(r);
  delete f.display_name;
  const patch = {};
  for (const [k, val] of Object.entries(f)) if (val !== "" && val !== (old[k] ?? "")) patch[k] = val;
  if (r.type === "Gallery" && r.disciplines?.length) {
    const merged = [...new Set([...(Array.isArray(old.interests) ? old.interests : []), ...r.disciplines])];
    if (merged.length !== (old.interests || []).length) patch.interests = merged;
  }
  if (r.coords && (old.geo_lat !== r.coords.lat || old.geo_lng !== r.coords.lng)) { patch.geo_lat = r.coords.lat; patch.geo_lng = r.coords.lng; }
  const before = {};
  for (const k of Object.keys(patch)) before[k] = old[k] ?? null;
  return { patch, before };
}

/** The columns the import reads from existing listings. */
export const EXISTING_COLUMNS = "id,display_name,type,based_in,address,bio,website,email,phone,opening_hours,instagram,facebook,linkedin,twitter,interests,seo_title,seo_description,seo_keywords,geo_lat,geo_lng,user_id,status,slug";
