/**
 * Bulk-import gallery listings from a verified manifest, undoably.
 *
 *   node scripts/import-galleries.mjs                       dry run: reports, writes nothing
 *   node scripts/import-galleries.mjs --city bangkok        dry run for one city
 *   node scripts/import-galleries.mjs --commit              import (asks for "yes" first)
 *   node scripts/import-galleries.mjs --commit --city maine
 *   node scripts/import-galleries.mjs --revert              remove everything this batch created
 *   node scripts/import-galleries.mjs --revert --city maine
 *
 * Credentials: the ADMIN account's login, the same permissions the "Add
 * Listing" tab has. No service-role key anywhere. Read from AFC_ADMIN_EMAIL /
 * AFC_ADMIN_PASSWORD or prompted for; never stored.
 *
 * WHAT MAKES IT UNDOABLE
 *
 * Every row's id is computed from (batch, city, name) rather than generated
 * by the database, so it is known BEFORE anything is inserted. The revert SQL
 * — supabase/imports/<batch>.revert.sql — lists exactly those ids and only
 * those, and is written to disk before the first insert. A gallery a member
 * created themselves, even with an identical name, has a random id and can
 * never match it. Images go under one storage folder unique to the batch;
 * the same file deletes that folder.
 *
 * WHAT IT WILL NOT DO
 *
 *   - Import a row whose name already exists on the site (case- and
 *     punctuation-insensitive). Those are listed and skipped.
 *   - Import a row that has no verified image (the manifest's `image` is null).
 *   - Re-import a row whose id already exists — so it is safe to run again
 *     after a failure; it carries on from where it stopped.
 *   - Touch anything on --revert other than ids in the manifest and objects
 *     under the batch's storage folder.
 *
 * The images are the Drive originals: 2000×2000 PNGs of ~2 MB each. They are
 * converted to WebP at the same size the browser upload path uses, which
 * turns ~750 MB into ~20 MB — the free storage tier is 1 GB.
 */
import { createClient } from "@supabase/supabase-js";
import sharp from "sharp";
import { createHash } from "node:crypto";
import { readFileSync, writeFileSync, existsSync, mkdirSync } from "node:fs";
import { createInterface } from "node:readline/promises";
import { stdin, stdout } from "node:process";
import { fileURLToPath } from "node:url";
import { join } from "node:path";

const ROOT = fileURLToPath(new URL("..", import.meta.url));
const BATCH = "gallery-import-2026-09";
const MANIFEST = join(ROOT, "supabase", "imports", BATCH, "manifest.json");
const REVERT_SQL = join(ROOT, "supabase", "imports", `${BATCH}.revert.sql`);
const BUCKET = "uploads";
const MAX_EDGE = 2000; // matches compressImage in the Supabase provider

/* ----------------------------------------------------------------- args */
const args = process.argv.slice(2);
const flag = (f) => args.includes(f);
const opt = (f) => { const i = args.indexOf(f); return i >= 0 ? args[i + 1] : undefined; };
const COMMIT = flag("--commit");
const REVERT = flag("--revert");
const CITY = opt("--city")?.toLowerCase();
if (COMMIT && REVERT) fail("--commit and --revert are opposites; pick one.");

/* ------------------------------------------------------------------ env */
readEnv();
const URL_ = process.env.VITE_SUPABASE_URL;
const ANON = process.env.VITE_SUPABASE_ANON_KEY;
if (!URL_ || !ANON) fail("VITE_SUPABASE_URL / VITE_SUPABASE_ANON_KEY missing — run from the project root with a .env present.");

/* ------------------------------------------------------------ manifest */
const all = JSON.parse(readFileSync(MANIFEST, "utf8"));
const rows = all
  .filter((r) => !CITY || r.cityKey === CITY)
  .map((r) => ({ ...r, id: stableId(r), storagePath: null }));
if (!rows.length) fail(`No rows for --city ${CITY}. Cities: ${[...new Set(all.map((r) => r.cityKey))].join(", ")}`);

/* -------------------------------------------------------------- main */
const supabase = createClient(URL_, ANON, { auth: { persistSession: false } });
const rl = createInterface({ input: stdin, output: stdout });
async function main() {
  try {
    const me = await signIn();
    const prefix = `${me.id}/${BATCH}/`;
    rows.forEach((r) => { r.storagePath = `${prefix}${r.cityKey}/${fileSlug(r.display_name)}.webp`; });

    // The revert file is written from the FULL manifest, every run, before any
    // write — so it always covers the whole batch, whichever city ran today.
    writeRevertSql(all.map((r) => stableId(r)));

    if (REVERT) await revert();
    else await importRows();
  } finally {
    rl.close();
    await supabase.auth.signOut().catch(() => {});
  }
}

/* --------------------------------------------------------------- import */
async function importRows() {
  const existing = await loadExistingGalleries();
  const byName = new Map(existing.map((g) => [norm(g.display_name), g]));
  const byId = new Set(existing.map((g) => g.id));

  const plan = { skipNoImage: [], skipDuplicate: [], alreadyDone: [], todo: [] };
  for (const r of rows) {
    if (byId.has(r.id)) plan.alreadyDone.push(r);
    else if (!r.image) plan.skipNoImage.push(r);
    else if (byName.has(norm(r.display_name))) plan.skipDuplicate.push({ r, hit: byName.get(norm(r.display_name)) });
    else plan.todo.push(r);
  }

  console.log(`\n${BATCH}${CITY ? ` — ${CITY}` : ""}: ${rows.length} rows in manifest`);
  console.log(`  already imported (same id)      ${plan.alreadyDone.length}`);
  console.log(`  skipped — no verified image     ${plan.skipNoImage.length}${list(plan.skipNoImage.map((r) => r.display_name))}`);
  console.log(`  skipped — name already on site  ${plan.skipDuplicate.length}${list(plan.skipDuplicate.map(({ r, hit }) => `${r.display_name}  (existing: ${hit.display_name}, ${hit.type}, ${hit.user_id ? "claimed" : "unclaimed"})`))}`);
  console.log(`  to import                       ${plan.todo.length}`);
  perCity(plan.todo);
  console.log(`\n  revert file: ${REVERT_SQL}`);

  if (!COMMIT) { console.log("\nDry run — nothing written. Add --commit to import."); return; }
  if (!plan.todo.length) { console.log("\nNothing to do."); return; }

  const ok = await rl.question(`\nImport ${plan.todo.length} galleries into the LIVE database? Type yes to continue: `);
  if (ok.trim().toLowerCase() !== "yes") { console.log("Cancelled."); return; }

  let done = 0; const failed = [];
  for (const r of plan.todo) {
    try {
      const avatar_url = await uploadImage(r);
      const { error } = await supabase.from("collector_profile").insert(rowToInsert(r, avatar_url));
      if (error) throw new Error(error.message);
      done++;
      process.stdout.write(`\r  ${done}/${plan.todo.length}  ${r.display_name.padEnd(50).slice(0, 50)}`);
    } catch (e) {
      failed.push(`${r.city}: ${r.display_name} — ${e.message}`);
    }
  }
  console.log(`\n\nImported ${done}. Failed ${failed.length}.`);
  if (failed.length) {
    console.log(failed.map((f) => "  " + f).join("\n"));
    console.log("\nRe-run the same command to retry the failures; rows already imported are skipped.");
  }
}

function rowToInsert(r, avatar_url) {
  const [lat, lng] = parseGeo(r.geo);
  return {
    id: r.id,
    display_name: r.display_name,
    type: "Gallery",
    // Admin-created listings are already vetted — same as the Add Listing tab.
    status: "approved",
    // Lets the gallery claim its listing by registering with this address.
    claim_email: r.email ? r.email.toLowerCase() : null,
    avatar_url,
    based_in: r.based_in || null,
    bio: r.bio || null,
    address: r.address || null,
    opening_hours: r.opening_hours || null,
    phone: r.phone || null,
    email: r.email || null,
    website: r.website || null,
    instagram: r.instagram || null,
    facebook: r.facebook || null,
    linkedin: r.linkedin || null,
    seo_title: r.seo_title || null,
    seo_description: r.seo_description || null,
    seo_keywords: r.seo_keywords || null,
    geo_lat: lat,
    geo_lng: lng,
    geo_placename: r.city,
    space_images: [],
    interests: [],
    seeking: [],
  };
}

/**
 * Retry a network step that is safe to repeat.
 *
 * WHY THIS EXISTS
 *
 * The storage upload had no retry at all while the Drive download had four, and
 * on a flaky connection that cost 12 of Boston's 50 rows and 27 of Los
 * Angeles's 113 — every one of them "upload: fetch failed", a dropped TLS
 * connection rather than anything wrong with the data. Each loss meant another
 * full pass over the city.
 *
 * Both steps are idempotent, so repeating them is safe: the upload is
 * upsert: true, and the download only writes a cache file.
 */
async function withRetry(label, fn, attempts = 5) {
  let lastErr;
  for (let attempt = 1; attempt <= attempts; attempt++) {
    try {
      return await fn();
    } catch (e) {
      lastErr = e;
      if (attempt < attempts) await sleep(800 * attempt);
    }
  }
  throw new Error(`${label}: ${lastErr?.message || lastErr}`);
}

async function uploadImage(r) {
  const raw = await downloadDrive(r.image.id);
  const webp = await sharp(raw)
    .resize(MAX_EDGE, MAX_EDGE, { fit: "inside", withoutEnlargement: true })
    .webp({ quality: 82 })
    .toBuffer();
  await withRetry("upload", async () => {
    const { error } = await supabase.storage.from(BUCKET).upload(r.storagePath, webp, {
      contentType: "image/webp", cacheControl: "31536000", upsert: true,
    });
    if (error) throw new Error(error.message);
  });
  return supabase.storage.from(BUCKET).getPublicUrl(r.storagePath).data.publicUrl;
}

async function downloadDrive(fileId) {
  const cacheDir = join(ROOT, ".tmp", BATCH);
  mkdirSync(cacheDir, { recursive: true });
  const cached = join(cacheDir, `${fileId}.bin`);
  if (existsSync(cached)) return readFileSync(cached);
  // Six attempts rather than four, and labelled: a bare "fetch failed" in the
  // failure list gave no clue whether Drive or the upload had dropped.
  return withRetry("drive", async () => {
    const res = await fetch(`https://drive.google.com/uc?export=download&id=${fileId}`, { headers: { "User-Agent": "Mozilla/5.0" } });
    const type = res.headers.get("content-type") || "";
    if (!res.ok || !type.startsWith("image/")) throw new Error(`http ${res.status} ${type}`);
    const buf = Buffer.from(await res.arrayBuffer());
    writeFileSync(cached, buf);
    return buf;
  }, 6);
}

/* --------------------------------------------------------------- revert */
async function revert() {
  const ids = rows.map((r) => r.id);
  const { data: present, error } = await supabase.from("collector_profile").select("id, display_name").in("id", ids);
  if (error) fail(error.message);
  console.log(`\nRevert ${BATCH}${CITY ? ` — ${CITY}` : ""}: ${present.length} of ${ids.length} manifest rows currently exist on the site.`);
  if (!present.length) { console.log("Nothing to remove."); return; }
  const ok = await rl.question(`Delete these ${present.length} galleries and their images from the LIVE database? Type yes to continue: `);
  if (ok.trim().toLowerCase() !== "yes") { console.log("Cancelled."); return; }

  const { error: delErr } = await supabase.from("collector_profile").delete().in("id", ids);
  if (delErr) fail(delErr.message);
  const paths = rows.map((r) => r.storagePath);
  for (let i = 0; i < paths.length; i += 100) {
    const { error: rmErr } = await supabase.storage.from(BUCKET).remove(paths.slice(i, i + 100));
    if (rmErr) console.log("  storage:", rmErr.message);
  }
  console.log(`Removed ${present.length} galleries and their images.`);
}

function writeRevertSql(ids) {
  const sql = `-- ===========================================================================
-- REVERT ${BATCH}
--
-- Removes ONLY the galleries created by scripts/import-galleries.mjs for this
-- batch, and only their images. The ids below were fixed before the import
-- ran; nothing created any other way can have one of them.
--
-- Paste into the Supabase SQL editor and run. Safe to run more than once.
-- Written automatically by the import script — do not edit by hand.
-- ===========================================================================

delete from public.collector_profile
where id in (
${ids.map((id) => `  '${id}'`).join(",\n")}
);

-- The logos uploaded for this batch (all under one folder).
delete from storage.objects
where bucket_id = '${BUCKET}'
  and name like '%/${BATCH}/%';
`;
  mkdirSync(join(ROOT, "supabase", "imports"), { recursive: true });
  writeFileSync(REVERT_SQL, sql);
}

/* -------------------------------------------------------------- helpers */
async function signIn() {
  const email = process.env.AFC_ADMIN_EMAIL || (await rl.question("Admin email: "));
  const password = process.env.AFC_ADMIN_PASSWORD || (await rl.question("Admin password: "));
  const { data, error } = await supabase.auth.signInWithPassword({ email: email.trim(), password });
  if (error) fail(`Sign-in failed: ${error.message}`);
  const { data: prof } = await supabase.from("profiles").select("role").eq("id", data.user.id).maybeSingle();
  if (prof?.role !== "admin") fail(`${email} is not an admin. The import needs the admin account.`);
  console.log(`Signed in as ${email} (admin).`);
  return data.user;
}

async function loadExistingGalleries() {
  const out = [];
  for (let from = 0; ; from += 1000) {
    const { data, error } = await supabase.from("collector_profile")
      .select("id, display_name, type, user_id").range(from, from + 999);
    if (error) fail(error.message);
    out.push(...data);
    if (data.length < 1000) break;
  }
  return out;
}

/** Deterministic UUID v5 from the batch, city and name. */
function stableId(r) {
  const h = createHash("sha1").update(`afc:${BATCH}:${r.cityKey}:${r.display_name}`).digest("hex");
  return `${h.slice(0, 8)}-${h.slice(8, 12)}-5${h.slice(13, 16)}-${((parseInt(h[16], 16) & 0x3) | 0x8).toString(16)}${h.slice(17, 20)}-${h.slice(20, 32)}`;
}
const norm = (s) => (s || "").normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().replace(/&/g, "and").replace(/[^a-z0-9]/g, "");
const fileSlug = (s) => norm(s).slice(0, 60) || "gallery";
function parseGeo(s) {
  const m = /(-?\d+(?:\.\d+)?)\s*,\s*(-?\d+(?:\.\d+)?)/.exec(s || "");
  return m ? [Number(m[1]), Number(m[2])] : [null, null];
}
function perCity(list) {
  const c = {};
  for (const r of list) c[r.city] = (c[r.city] || 0) + 1;
  for (const [city, n] of Object.entries(c)) console.log(`      ${city.padEnd(14)} ${n}`);
}
const list = (items) => (items.length ? "\n" + items.map((i) => `      - ${i}`).join("\n") : "");
const sleep = (ms) => new Promise((s) => setTimeout(s, ms));
function fail(msg) { console.error("\n" + msg); process.exit(1); }
function readEnv() {
  const p = join(ROOT, ".env");
  if (!existsSync(p)) return;
  for (const line of readFileSync(p, "utf8").split(/\r?\n/)) {
    const m = /^\s*([\w.]+)\s*=\s*(.*)\s*$/.exec(line);
    if (m && !(m[1] in process.env)) process.env[m[1]] = m[2].replace(/^["']|["']$/g, "");
  }
}

await main();
