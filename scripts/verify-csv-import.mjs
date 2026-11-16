/**
 * C12 / B8 — CSV import of galleries and venues (Admin → Import CSV).
 *
 * Part 1, the rules (src/lib/listingCsv.js): reading CSV files the way
 * Google Sheets and Excel write them, headings, listing types, every check,
 * duplicates, what is saved, what an update may change.
 * Part 2, Julie's real earlier sheet: the 363 listings of the September
 * import (its manifest) as a CSV with her own headings and no type column.
 * Part 3, the screen (src/components/AdminImportPanel.jsx) against an
 * in-memory database: upload, preview, skip/update, drafts, map pins,
 * summary, Undo.
 *
 * Run: npm run verify:csv-import
 */
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { JSDOM } from "jsdom";

const ROOT = fileURLToPath(new URL("..", import.meta.url));
const dom = new JSDOM("<!doctype html><html><body><div id='root'></div></body></html>", { url: "http://localhost/admin", pretendToBeVisual: true });
const { window } = dom;
globalThis.window = window; globalThis.document = window.document;
Object.defineProperty(globalThis, "navigator", { value: window.navigator, configurable: true });
for (const k of ["HTMLElement", "Element", "Node", "Event", "MouseEvent", "KeyboardEvent", "SVGElement", "Image", "HTMLInputElement", "HTMLTextAreaElement", "HTMLSelectElement", "File", "Blob", "FileList"]) globalThis[k] = window[k];
globalThis.requestAnimationFrame = (cb) => setTimeout(() => cb(Date.now()), 0);
globalThis.ResizeObserver = window.ResizeObserver = class { observe() {} unobserve() {} disconnect() {} };
globalThis.IntersectionObserver = window.IntersectionObserver = class { observe() {} unobserve() {} disconnect() {} takeRecords() { return []; } };
globalThis.matchMedia = window.matchMedia = () => ({ matches: false, media: "", addListener() {}, removeListener() {}, addEventListener() {}, removeEventListener() {} });
globalThis.IS_REACT_ACT_ENVIRONMENT = false;
globalThis.__AFC_PIN_GAP_MS = 0;
globalThis.localStorage = window.localStorage;
window.URL.createObjectURL = () => "blob:x"; window.URL.revokeObjectURL = () => {};
let confirmAnswer = true;
window.confirm = () => confirmAnswer;

const L = await import("../src/lib/listingCsv.js");

let pass = 0;
const fails = [];
const check = (n, c, d = "") => (c ? pass++ : fails.push(`${n}${d ? ` — ${d}` : ""}`));
const tick = (ms = 30) => new Promise((r) => setTimeout(r, ms));

/* ================================================================ rules */

// ---- CSV reading
{
  const p = L.parseCsv('name,bio\r\n"Para Site","Founded in 1996, ""independent"",\nnon-profit"\r\n\r\n,\r\n');
  check("CSV: quoted commas, quotes and line breaks inside a cell", p.length === 2 && p[1][1] === 'Founded in 1996, "independent",\nnon-profit', JSON.stringify(p));
  check("CSV: blank lines and empty ',' lines are ignored", p.length === 2);
  check("CSV: a UTF-8 byte-order mark is not part of the first heading", L.parseCsv("﻿name,city\nA,B")[0][0] === "name");
  check("CSV: ';' between cells (Excel in many countries)", L.parseCsv("name;city\nA;Hong Kong")[1][1] === "Hong Kong");
  check("CSV: tabs between cells (Google Sheets .tsv)", L.parseCsv("name\tcity\nA, Ltd\tHong Kong")[1].join("|") === "A, Ltd|Hong Kong");
  check("CSV: no newline at the end", L.parseCsv("name\nLast")[1][0] === "Last");
  check("CSV: Chinese and accents survive", L.parseCsv("name\n藝術門 Über Café")[1][0] === "藝術門 Über Café");
}

// ---- headings
{
  check("heading: Julie's 'display_name' → name", L.columnFor("display_name") === "name");
  check("heading: 'based_in' → city, 'bio' → description, 'geo' → geo", L.columnFor("based_in") === "city" && L.columnFor("bio") === "description" && L.columnFor("geo") === "geo");
  check("heading: 'Contact Email', 'Phone Number', 'Opening Hours' (any case, spaces)", L.columnFor("Contact Email") === "email" && L.columnFor("Phone Number") === "phone" && L.columnFor(" Opening Hours ") === "opening_hours");
  check("heading: 'Listing Type' → listing_type", L.columnFor("Listing Type") === "listing_type");
  check("heading: unknown → not imported", L.columnFor("image") === null && L.columnFor("Notes") === null);
  const t = L.templateCsv();
  check("template: starts with a byte-order mark (Excel opens Chinese text right)", t.charCodeAt(0) === 0xfeff);
  const th = L.parseCsv(t);
  check("template: headings only — nothing in it can be imported by mistake", th.length === 1 && th[0].length === L.COLUMNS.length);
  check("template: every template heading reads back as its own column", th[0].every((h, i) => L.columnFor(h) === L.COLUMNS[i].key));
  check("template: has the fields Julie listed", ["name", "description", "address", "city", "country", "website", "contact_email", "phone", "opening_hours", "listing_type"].every((h) => th[0].includes(h)));
}

// ---- listing types
{
  const t = (v) => L.readType(v).type;
  check("type: Gallery / gallery / Galleries", t("Gallery") === "Gallery" && t("gallery") === "Gallery" && t("Galleries") === "Gallery");
  check("type: Museum, Event Space, event-space, Art Stores, Framer, Printers", t("Museum") === "Museum" && t("Event Space") === "Event Space" && t("event-space") === "Event Space" && t("Art Stores") === "Art Store" && t("Framer") === "Framer" && t("Printers") === "Printer");
  check("type: 'Venue' → Institution, with a note", t("Venue") === "Institution" && /Institution/.test(L.readType("Venue").note));
  check("type: unknown → none", t("Cafe") === null && t("") === null);
  check("type: never a person type (Collector)", t("Collector") === null && t("Curator") === null);
}

// ---- whole-file problems
{
  check("file: empty", L.readSheet([]).problems.length === 1);
  const noName = L.readSheet(L.parseCsv("city,website\nHong Kong,x.com"));
  check("file: no name column → cannot import, says which", noName.problems.some((p) => /"name"/.test(p)));
  const headOnly = L.readSheet(L.parseCsv("name,city"));
  check("file: headings but no rows", headOnly.problems.some((p) => /no listings/.test(p)));
  const twice = L.readSheet(L.parseCsv("display_name,name,city\nA,B,C"));
  check("file: two columns for one field → the template's own heading is used, the other is named", !twice.problems.length && twice.rows[0].values.name === "B" && twice.notes.some((n) => /"display_name" was not imported/.test(n)), JSON.stringify(twice.notes));
  const bad = L.readSheet(L.parseCsv("name,city\nCaf�,Hong Kong"));
  check("file: unreadable letters (not saved as UTF-8) → asks to save as CSV UTF-8", bad.problems.some((p) => /CSV UTF-8/.test(p)));
  const big = L.readSheet([["name", "city"], ...Array.from({ length: 2001 }, (_, i) => [`G${i}`, "Hong Kong"])]);
  check("file: more than 2000 rows refused", big.problems.some((p) => /at most 2000/.test(p)));
  const extra = L.readSheet(L.parseCsv("name,city,image,Notes\nA,Hong Kong,x.png,hi"));
  check("file: columns the site has no field for are named, not silently dropped", extra.notes.some((n) => /image, Notes/.test(n)) && !extra.problems.length);
  check("file: no listing_type column → asks for one type for the whole file", extra.needsType === true);
  check("file: row numbers are spreadsheet rows (heading = 1)", extra.rows[0].line === 2);
}

// ---- row checks
const SITE = [
  { id: "s1", display_name: "Para Site", type: "Gallery", based_in: "Hong Kong", address: "22/F Wing Wah Industrial Building, Quarry Bay", website: "https://www.para-site.art/", user_id: null, status: "approved", slug: "para-site", bio: "Old bio", phone: "", geo_lat: null, geo_lng: null, interests: ["Installation"] },
  { id: "s2", display_name: "Blindspot Gallery", type: "Gallery", based_in: "Hong Kong", website: "blindspotgallery.com", user_id: "member-9", status: "approved", slug: "blindspot-gallery" },
  { id: "s3", display_name: "Pearl Lam Galleries", type: "Gallery", based_in: "Shanghai", website: "", user_id: null, status: "approved", slug: "pearl-lam" },
];
const rowsOf = (csv, opts) => L.checkRows(L.readSheet(L.parseCsv(csv)).rows, SITE, opts);
{
  const H = "listing_type,name,city,address,website,contact_email,latitude,longitude,disciplines,instagram\n";
  const r = rowsOf(H + [
    "Gallery,New Space,Hong Kong,1 Queen's Road Central,newspace.hk,hello@newspace.hk,22.28,114.15,Painting; sculpture,@newspace",
    ",No Type,Hong Kong,,,,,,,",
    "Gallery,,Hong Kong,,,,,,,",
    "Gallery,No City,,,,,,,,",
    "Cafe,Wrong Type,Hong Kong,,,,,,,",
    "Gallery,Bad Email,Hong Kong,,,not-an-email,,,,",
    "Gallery,Bad Pin,Hong Kong,,,,95,114,,",
    "Gallery,new space,Hong Kong,,,,,,,",
    "Gallery,The Para-Site Ltd.,Hong Kong,,,,,,,",
    "Museum,Different Name,Hong Kong,,https://para-site.art,,,,,",
    "Gallery,Pearl Lam Galleries,Hong Kong,,,,,,,",
    "Gallery,Blindspot Gallery,Hong Kong,,,,,,,",
    "Gallery,Bad Links,Seattle,,not a site,,,,Painting; Weaving,https://example.com/x y",
    "Venue,Some Hall,Atlantis,,,,,,,",
    "Museum,Museum With Disciplines,Hong Kong,,,,,,Painting,",
  ].join("\n"));
  const at = (line) => r.find((x) => x.line === line);
  check("row: a complete row is Ready", at(2).state === "ready", JSON.stringify(at(2).errors.concat(at(2).warnings)));
  check("row: disciplines read case-insensitively", at(2).disciplines.join() === "Painting,Sculpture");
  check("row: coordinates read", at(2).coords?.lat === 22.28 && at(2).coords?.lng === 114.15);
  check("row: empty listing_type → problem", at(3).state === "problem" && /listing_type is empty/.test(at(3).errors.join()));
  check("row: empty name → problem", at(4).state === "problem" && /name is empty/.test(at(4).errors.join()));
  check("row: empty city → problem", at(5).state === "problem" && /city is empty/.test(at(5).errors.join()));
  check("row: unknown type → problem naming the allowed ones", at(6).state === "problem" && /Event Space/.test(at(6).errors.join()));
  check("row: bad email → problem", at(7).state === "problem" && /not an email/.test(at(7).errors.join()));
  check("row: latitude 95 → problem", at(8).state === "problem" && /latitude/.test(at(8).errors.join()));
  check("row: same listing twice in the file → second is a problem naming the first row", at(9).state === "problem" && /row 2/.test(at(9).errors.join()));
  check("duplicate: 'The Para-Site Ltd.' matches 'Para Site' (same name and city)", at(10).state === "duplicate" && at(10).match.id === "s1" && /same name and city/.test(at(10).matchedBy));
  check("duplicate: same website, different name", at(11).state === "duplicate" && at(11).match.id === "s1" && /website/.test(at(11).matchedBy));
  check("duplicate: same name in another city is still flagged, and says so", at(12).state === "duplicate" && /different city/.test(at(12).matchedBy));
  check("duplicate: a member-owned listing is found (the screen then refuses to update it)", at(13).state === "duplicate" && at(13).match.user_id === "member-9");
  check("warning: a website that is not a link → left empty, still importable", at(14).state === "ready" && /website/.test(at(14).warnings.join()));
  check("warning: an Instagram that cannot be read", /instagram/.test(at(14).warnings.join()));
  check("warning: an unknown discipline is named and left out", /Weaving/.test(at(14).warnings.join()) && at(14).disciplines.join() === "Painting");
  check("warning: Venue → Institution note; a city that is not a chapter", /Institution/.test(at(15).warnings.join()) && /not a chapter/.test(at(15).warnings.join()) && at(15).type === "Institution");
  check("warning: no address → no map pin", /no map pin/.test(at(15).warnings.join()));
  check("disciplines only on galleries", at(16).disciplines.length === 0 && /only used for galleries/.test(at(16).warnings.join()));
  const def = rowsOf("name,city\nNew One,Hong Kong", { defaultType: "Gallery" });
  check("no type column + 'every row is a Gallery' → Ready as Gallery", def[0].state === "ready" && def[0].type === "Gallery");
  check("no type column and nothing chosen → problem", rowsOf("name,city\nNew One,Hong Kong")[0].state === "problem");
}

// ---- what is saved
{
  const [r] = rowsOf("listing_type,name,city,country,address,description,website,contact_email,phone,opening_hours,instagram,facebook,disciplines,latitude,longitude\n" +
    'Gallery,Fresh Gallery,Hong Kong,Hong Kong,"G/F, 9 Hollywood Road, Central",About us,www.fresh.hk,Hello@Fresh.HK,+852 1234 5678,Tue-Sat 11-7,@freshhk,facebook.com/freshhk,Painting,22.28,114.15');
  const rec = L.recordFor(r, "pending");
  check("save: draft = 'pending' (waits in Approvals)", rec.status === "pending");
  check("save: no claim email, no owner", rec.claim_email === null && !("user_id" in rec));
  check("save: city → based_in, description → bio", rec.based_in === "Hong Kong" && rec.bio === "About us");
  check("save: country not repeated when the address has it", rec.address === "G/F, 9 Hollywood Road, Central, Hong Kong" || rec.address === "G/F, 9 Hollywood Road, Central", rec.address);
  const [r2] = rowsOf("listing_type,name,city,country,address\nGallery,X,Hong Kong,China,1 Road");
  check("save: country added to the end of the address", L.recordFor(r2, "approved").address === "1 Road, China");
  check("save: website and socials tidied", rec.website === "https://www.fresh.hk" && rec.instagram === "freshhk" && rec.facebook === "https://facebook.com/freshhk", `${rec.website} ${rec.instagram} ${rec.facebook}`);
  check("save: email lower-cased", rec.email === "hello@fresh.hk");
  check("save: phone, hours, disciplines, pin", rec.phone === "+852 1234 5678" && rec.opening_hours === "Tue-Sat 11-7" && rec.interests.join() === "Painting" && rec.geo_lat === 22.28);
  check("save: type kept", rec.type === "Gallery");
  check("save: publish now = 'approved'", L.recordFor(r, "approved").status === "approved");
  const [bad] = rowsOf("listing_type,name,city,website\nGallery,Y,Hong Kong,not a site");
  check("save: a website that is not a link is saved empty", L.recordFor(bad, "pending").website === "");
}

// ---- updating an existing listing
{
  const [r] = rowsOf("listing_type,name,city,address,description,phone,website,disciplines\nGallery,Para Site,Hong Kong,,New bio,+852 2517 4620,,Painting");
  const { patch, before } = L.patchFor(r, SITE[0]);
  check("update: changes only filled cells (bio, phone)", patch.bio === "New bio" && patch.phone === "+852 2517 4620");
  check("update: an empty cell never wipes (address, website kept)", !("address" in patch) && !("website" in patch));
  check("update: never renames, retypes, publishes or changes the owner", !["display_name", "type", "status", "user_id", "claim_email"].some((k) => k in patch));
  check("update: disciplines are added to, not replaced", patch.interests?.join() === "Installation,Painting");
  check("update: Undo has the old values", before.bio === "Old bio" && before.phone === "" && Array.isArray(before.interests));
  const same = L.patchFor(rowsOf("listing_type,name,city,description\nGallery,Para Site,Hong Kong,Old bio")[0], SITE[0]);
  check("update: nothing different → nothing to save", Object.keys(same.patch).length === 0);
}

// ---- results file is safe to open
check("results: a cell starting with = is not run as a formula", L.csvCell("=HYPERLINK(1)") === "'=HYPERLINK(1)");
check("results: commas and quotes are quoted", L.csvCell('a, "b"') === '"a, ""b"""');
check("name match ignores 'The', punctuation, Ltd and accents", L.nameKey("The Pearl-Lam Galleries Ltd.") === L.nameKey("pearl lam galleries") && L.nameKey("Galerie Über") === L.nameKey("galerie uber"));
check("website match ignores www, https and the last /", L.siteKey("https://www.Para-Site.art/") === L.siteKey("para-site.art"));
check("an Instagram link is not treated as the gallery's website", L.siteKey("https://www.instagram.com/x/") === null);

/* ================================================= Julie's earlier sheet */
{
  const manifest = JSON.parse(readFileSync(join(ROOT, "supabase/imports/gallery-import-2026-09/manifest.json"), "utf8"));
  const heads = ["display_name", "based_in", "bio", "address", "opening_hours", "phone", "email", "website", "instagram", "facebook", "linkedin", "seo_title", "seo_description", "seo_keywords", "geo", "image", "city"];
  const csv = L.toCsv([heads, ...manifest.map((m) => heads.map((h) => m[h] ?? ""))]);
  const sheet = L.readSheet(L.parseCsv(csv));
  check("Julie's sheet: 363 rows read", sheet.rows.length === 363, `${sheet.rows.length}`);
  check("Julie's sheet: her headings are understood; only 'image' is not imported", !sheet.problems.length && sheet.ignored.join() === "image", JSON.stringify(sheet.problems.concat(sheet.ignored)));
  check("Julie's sheet: 'city' used for the city, 'based_in' named as not imported", sheet.notes.some((n) => /"based_in" was not imported: "city"/.test(n)), JSON.stringify(sheet.notes));
  check("Julie's sheet: no type column → asks for one", sheet.needsType);
  const rows = L.checkRows(sheet.rows, [], { defaultType: "Gallery" });
  const probs = rows.filter((r) => r.state === "problem");
  check("Julie's sheet: as Galleries, on an empty site, every row is importable (or a repeat within the sheet)", probs.every((r) => /already on row/.test(r.errors.join())), probs.slice(0, 3).map((r) => `${r.line}: ${r.errors}`).join(" | "));
  check("Julie's sheet: coordinates from her 'geo' column", rows.filter((r) => r.coords).length >= 300, `${rows.filter((r) => r.coords).length}`);
  const onSite = manifest.map((m, i) => ({ id: `m${i}`, display_name: m.display_name, based_in: m.based_in, website: m.website, type: "Gallery", user_id: null }));
  const again = L.checkRows(sheet.rows, onSite, { defaultType: "Gallery" });
  check("Julie's sheet: imported again → every row is 'already on the site' (no double listings)", again.every((r) => r.state === "duplicate" || r.state === "problem") && again.filter((r) => r.state === "duplicate").length >= 350, `${again.filter((r) => r.state === "ready").length} would be created again`);
}

/* ============================================================ the screen */
const React = (await import("react")).default;
const { createRoot } = await import("react-dom/client");
const { MemoryRouter } = await import("react-router-dom");
const { base44 } = await import("../src/api/base44Client.js");

// An in-memory collector_profile table that behaves like Supabase paging.
let db = SITE.map((x) => ({ ...x }));
const log = { creates: [], updates: [], deletes: [], pins: [] };
const CP = base44.entities.CollectorProfile;
CP.page = async ({ limit, offset }) => ({ rows: db.slice(offset, offset + Math.min(limit, 1000)), count: db.length });
CP.list = async () => { throw new Error("the import must page through every listing, not list()"); };
CP.create = async (rec) => { const row = { id: `new${log.creates.length}`, ...rec }; db.push(row); log.creates.push(row); return row; };
CP.update = async (id, patch) => { const row = db.find((x) => x.id === id); Object.assign(row, patch); log.updates.push({ id, patch }); return row; };
CP.delete = async (id) => { db = db.filter((x) => x.id !== id); log.deletes.push(id); return { id }; };
base44.functions.invoke = async (name, { address }) => { log.pins.push(address); if (/nowhere/i.test(address)) throw new Error("Address not found"); return { lat: 22.3, lng: 114.2, placename: "Central", region: "Hong Kong" }; };

const AdminImportPanel = (await import("../src/components/AdminImportPanel.jsx")).default;
const c = document.getElementById("root");
const root = createRoot(c);
root.render(React.createElement(MemoryRouter, null, React.createElement(AdminImportPanel)));
await tick(100);

const $ = (sel) => c.querySelector(`[data-testid="${sel}"]`);
const $$ = (sel) => [...c.querySelectorAll(`[data-testid="${sel}"]`)];
const click = (el) => el.dispatchEvent(new window.MouseEvent("click", { bubbles: true }));
const pick = (el, v) => { Object.getOwnPropertyDescriptor(window.HTMLSelectElement.prototype, "value").set.call(el, v); el.dispatchEvent(new window.Event("change", { bubbles: true })); };
const upload = async (name, text) => {
  const input = $("import-file");
  const f = new window.File([text], name, { type: "text/csv" });
  Object.defineProperty(input, "files", { value: [f], configurable: true });
  input.dispatchEvent(new window.Event("change", { bubbles: true }));
  for (let i = 0; i < 100 && !$("import-preview") && !$("import-file-problems") && !$("import-error"); i++) await tick(20);
};
const until = async (fn, n = 200) => { for (let i = 0; i < n && !fn(); i++) await tick(20); return fn(); };

check("screen: template button and file box are there", !!$("import-template") && !!$("import-file"));

// a file that cannot be used
await upload("bad.csv", "city,website\nHong Kong,x.com");
check("screen: a file with no name column shows why, and nothing else", !!$("import-file-problems") && !$("import-preview") && /"name"/.test($("import-file-problems").textContent));

const FILE = [
  "listing_type,name,city,address,description,phone,latitude,longitude",
  "Gallery,Harbour Light Gallery,Hong Kong,8 Pottinger Street,A new space,,22.28,114.155",  // ready, has coordinates
  "Event Space,Kowloon Hall,Hong Kong,1 Nathan Road,,,,",                                // ready, pin looked up
  "Gallery,Para Site,Hong Kong,,Updated bio,+852 2517 4620,,",                            // duplicate → update
  "Gallery,Blindspot Gallery,Hong Kong,,Should never be saved,,,",                       // owned by a member
  "Gallery,Pearl Lam Galleries,Hong Kong,,,,,",                                          // duplicate → skip
  "Cafe,Wrong Type,Hong Kong,,,,,",                                                      // problem
  "Museum,Nowhere Museum,Hong Kong,Nowhere Street 99,,,,",                               // ready, pin not found
].join("\n");
await upload("hk.csv", FILE);
check("screen: preview appears", !!$("import-preview"));
check("screen: nothing saved before Import is pressed", log.creates.length === 0 && log.updates.length === 0);
check("screen: counts — 3 ready, 3 already on the site, 1 problem", /Ready 3/.test($("count-ready").textContent) && /site 3/.test($("count-duplicate").textContent) && /Problems 1/.test($("count-problem").textContent), [$("count-ready").textContent, $("count-duplicate").textContent, $("count-problem").textContent].join(" / "));
const row = (line) => c.querySelector(`[data-testid="import-row"][data-line="${line}"]`);
check("screen: the problem row says what is wrong", /not one the site has/.test(row(7).textContent));
check("screen: the member-owned listing cannot be updated (no choice offered)", !row(5).querySelector('[data-testid="dup-choice"]') && /Owned by a member/.test(row(5).textContent));
check("screen: a duplicate links to the listing already on the site", !!row(4).querySelector('a[href="/gallery/para-site"]'), row(4).innerHTML.match(/href="[^"]*"/)?.[0]);
check("screen: duplicates default to Skip", row(4).querySelector('[data-testid="dup-choice"]').value === "skip");
pick(row(4).querySelector('[data-testid="dup-choice"]'), "update");
await tick();
check("screen: the Import button counts 3 new and 1 update", /3 new, 1 update/.test($("import-run").textContent), $("import-run").textContent);
check("screen: drafts are the default", $("as-draft").checked && !$("as-live").checked);

// say No to the confirmation: nothing happens
confirmAnswer = false;
click($("import-run")); await tick(80);
check("screen: answering No at the confirmation saves nothing", log.creates.length === 0 && log.updates.length === 0);
confirmAnswer = true;
click($("import-run"));
await until(() => $("import-summary"));
check("screen: summary appears", !!$("import-summary"));
check("summary: 3 created, 1 updated, 2 skipped, 1 unsuccessful", $("sum-created").textContent === "3" && $("sum-updated").textContent === "1" && $("sum-skipped").textContent === "2" && $("sum-failed").textContent === "1", ["created", "updated", "skipped", "failed"].map((k) => $(`sum-${k}`).textContent).join("/"));
check("saved: new listings are drafts waiting in Approvals, unclaimed", log.creates.length === 3 && log.creates.every((r) => r.status === "pending" && r.claim_email === null && !r.user_id));
const harbour = log.creates.find((r) => r.display_name === "Harbour Light Gallery");
check("saved: coordinates from the file are used as they are (no lookup)", harbour.geo_lat === 22.28 && !log.pins.some((a) => /Pottinger/.test(a)));
const hall = log.creates.find((r) => r.display_name === "Kowloon Hall");
check("saved: a pin is looked up from the address when none is given", hall.geo_lat === 22.3 && hall.geo_placename === "Central" && hall.type === "Event Space");
const nowhere = log.creates.find((r) => r.display_name === "Nowhere Museum");
check("saved: an address the map cannot find still creates the listing (no pin) and is reported", nowhere && nowhere.geo_lat == null && /Nowhere Museum/.test($("import-summary").textContent));
check("saved: Para Site updated — new bio and phone only", log.updates.length === 1 && log.updates[0].id === "s1" && log.updates[0].patch.bio === "Updated bio" && !("display_name" in log.updates[0].patch) && !("status" in log.updates[0].patch));
check("saved: the member's Blindspot listing is untouched", !log.updates.some((u) => u.id === "s2") && db.find((x) => x.id === "s2").bio === undefined);
check("saved: Pearl Lam skipped, the wrong-type row never saved", !log.updates.some((u) => u.id === "s3") && !log.creates.some((r) => r.display_name === "Wrong Type"));
check("summary: the unsuccessful row is named with its reason", /Row 7, Wrong Type/.test($("import-summary").textContent));
check("summary: tells the admin the drafts are in Approvals", /Approvals/.test($("import-summary").textContent));
check("summary: results can be downloaded", !!$("import-results"));

// Undo
confirmAnswer = true;
click($("import-undo"));
await until(() => $("import-undone"));
check("undo: the 3 new listings are deleted", log.deletes.length === 3 && !db.some((x) => /^new/.test(x.id)));
check("undo: Para Site is put back exactly as it was", db.find((x) => x.id === "s1").bio === "Old bio" && db.find((x) => x.id === "s1").phone === "");
check("undo: says what it did", /3 deleted, 1 put back/.test($("import-undone").textContent), $("import-undone").textContent);
check("undo: the button goes away (cannot undo twice)", !$("import-undo"));

// publish straight away, and a file with no type column
click($("import-again")); await tick(60);
await upload("noType.csv", "display_name,based_in,bio\nFresh Space,Hong Kong,Hi");
check("no type column: asks what every row is, and nothing is Ready until chosen", !!$("default-type") && /Ready 0/.test($("count-ready").textContent));
pick($("default-type"), "Gallery"); await tick(60);
check("no type column: choosing Gallery makes the row Ready", /Ready 1/.test($("count-ready").textContent));
click($("as-live")); await tick();
const before = log.creates.length;
click($("import-run"));
await until(() => $("import-summary"));
check("publish straight away: saved as approved (live)", log.creates.length === before + 1 && log.creates.at(-1).status === "approved" && log.creates.at(-1).type === "Gallery");
const freshId = log.creates.at(-1).id;
root.unmount();

// Leave the tab (as when opening Approvals) and come back: Undo is remembered.
const root2 = createRoot(c);
root2.render(React.createElement(MemoryRouter, null, React.createElement(AdminImportPanel)));
await tick(100);
check("undo later: after leaving the tab and coming back, the last import can be undone", !!$("last-import") && /1 created, 0 updated/.test($("last-import").textContent), $("last-import")?.textContent);
const delBefore = log.deletes.length;
click($("last-import-undo"));
await until(() => $("import-undone"));
check("undo later: deletes what that import created", log.deletes.length === delBefore + 1 && log.deletes.at(-1) === freshId && !db.some((x) => x.id === freshId));
check("undo later: forgotten afterwards (cannot undo twice)", !$("last-import-undo") && window.localStorage.getItem("afc-last-csv-import") === null);
root2.unmount();
window.localStorage.setItem("afc-last-csv-import", "{not json");
const root3 = createRoot(c);
root3.render(React.createElement(MemoryRouter, null, React.createElement(AdminImportPanel)));
await tick(80);
check("undo later: a damaged saved value is ignored, the screen still opens", !!$("import-file") && !$("last-import"));
root3.unmount();

/* ========================================================= wiring checks */
const dash = readFileSync(join(ROOT, "src/pages/AdminDashboard.jsx"), "utf8");
check("admin: an 'Import CSV' tab, right after Add Listing", /"Add Listing", "Import CSV"/.test(dash) && /tab === "Import CSV" && <AdminImportPanel \/>/.test(dash));
const appr = readFileSync(join(ROOT, "src/components/AdminApprovalsPanel.jsx"), "utf8");
check("Approvals: reads every profile (live has 505 listings — more than the old 500)", /loadAll\(base44\.entities\.CollectorProfile/.test(appr) && !/CollectorProfile\.list\(/.test(appr));
const create = readFileSync(join(ROOT, "src/components/AdminCreatePanel.jsx"), "utf8");
check("Add Listing: duplicate check reads every listing", /loadAll\(base44\.entities\[entity\]/.test(create) && !/\.list\("-created_date", 500\)/.test(create));

console.log(`verify:csv-import — ${pass} passed, ${fails.length} failed`);
if (fails.length) { for (const f of fails) console.log("  ✗", f); process.exit(1); }
process.exit(0);
