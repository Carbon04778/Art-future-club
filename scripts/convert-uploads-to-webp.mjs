/**
 * Convert every in-use upload that is not real WebP into real WebP.
 *
 * WHY
 *
 * A full scan on 2026-10-04 found 1,190 of the 2,058 files in the uploads
 * bucket were not WebP. 364 were PNG or JPEG behind a ".webp" name (Safari's
 * canvas returns PNG when asked for WebP and the old uploader never checked);
 * 826 were plainly .png/.jpg/.jpeg/.heic/.avif/.gif. New uploads are fixed in
 * src/lib/toWebp.js; this handles what is already stored.
 *
 * WHAT IT DOES
 *
 *   node scripts/convert-uploads-to-webp.mjs             dry run: writes nothing
 *   node scripts/convert-uploads-to-webp.mjs --commit    convert and upload
 *   ... --commit --limit 5                               the first five only
 *
 * Only files referenced by a database row are converted. Unused uploads are
 * left alone, and zero-byte files are reported (there is nothing to convert —
 * the picture has to be uploaded again).
 *
 *   Fake .webp      re-encoded IN PLACE. Same path, same URL, so no database
 *                   change is needed and the site never points at a gap.
 *   Other formats   a new .webp beside the original. The original is NOT
 *                   deleted. Nothing uses the new file until the SQL below runs.
 *
 * Every original is first saved to backups/webp-migration/<project>/originals/
 * (git-ignored; NOT .tmp/, which test scripts once deleted wholesale),
 * so the in-place overwrites can be undone byte for byte.
 *
 * THE DATABASE CHANGE IS A SQL FILE, NOT AN API CALL
 *
 * Every table has a set_updated_date trigger, and the home page registry,
 * Venues and city chapters list by "-updated_date". Rewriting image URLs
 * through the API would stamp hundreds of rows as just-updated and reshuffle
 * those lists. The API cannot avoid that; SQL can, by pausing that trigger
 * for one transaction. So this writes:
 *
 *   backups/webp-migration/<project>/batch-<stamp>-apply.sql    run in the SQL editor
 *   backups/webp-migration/<project>/batch-<stamp>-revert.sql   puts every URL back
 *
 * Each UPDATE matches on the value read during this run, so a row a member has
 * edited since is skipped rather than overwritten.
 *
 * Needs SUPABASE_SERVICE_ROLE_KEY in .env (never VITE_-prefixed).
 */

import { createClient } from "@supabase/supabase-js";
import sharp from "sharp";
import { readFileSync, writeFileSync, mkdirSync, existsSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = fileURLToPath(new URL("..", import.meta.url));
const COMMIT = process.argv.includes("--commit");
/*
 * --project test  uses COPY_SUPABASE_URL / COPY_SUPABASE_SERVICE_ROLE_KEY:
 * the rehearsal copy restored from a backup. The default is the live project.
 */
const TARGET = process.argv.includes("--project")
  ? process.argv[process.argv.indexOf("--project") + 1]
  : "live";
if (!["live", "test"].includes(TARGET)) {
  console.error(`\n  --project must be "live" or "test", not "${TARGET}"\n`);
  process.exit(1);
}
const LIMIT = Number(process.argv[process.argv.indexOf("--limit") + 1]) || Infinity;

const BUCKET = "uploads";
const MAX_EDGE = 2000; // matches src/lib/toWebp.js
const QUALITY = 82;

// Views, not tables: they show their base tables' columns and update with them.
const VIEWS = new Set(["admin_listings", "profiles_public"]);

/* ------------------------------------------------------------------ setup */

const env = Object.fromEntries(
  readFileSync(join(ROOT, ".env"), "utf8")
    .split(/\r?\n/)
    .filter((l) => /^[A-Z_]+=/.test(l))
    .map((l) => [l.slice(0, l.indexOf("=")), l.slice(l.indexOf("=") + 1).trim()])
);
const [URL_VAR, KEY_VAR] = TARGET === "test"
  ? ["COPY_SUPABASE_URL", "COPY_SUPABASE_SERVICE_ROLE_KEY"]
  : ["VITE_SUPABASE_URL", "SUPABASE_SERVICE_ROLE_KEY"];
const URL_ = env[URL_VAR]?.replace(/\/+$/, "");
const KEY = env[KEY_VAR];
if (!URL_ || !KEY) {
  console.error(`\n  ${URL_VAR} and ${KEY_VAR} must be set in .env\n`);
  process.exit(1);
}
if (TARGET === "test" && URL_ === env.VITE_SUPABASE_URL?.replace(/\/+$/, "")) {
  console.error("\n  COPY_SUPABASE_URL is the live project. Refusing.\n");
  process.exit(1);
}
const REF = new URL(URL_).hostname.split(".")[0];
// Per project, so a rehearsal's manifest and SQL never mix with live's.
// Not .tmp/: test scripts once deleted that whole folder, backups included.
const OUT = join(ROOT, "backups", "webp-migration", REF);
console.log(`\n  PROJECT: ${TARGET.toUpperCase()} (${REF})`);
const supabase = createClient(URL_, KEY, { auth: { persistSession: false } });
const PUBLIC = `${URL_}/storage/v1/object/public/${BUCKET}/`;

mkdirSync(OUT, { recursive: true });
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const mb = (n) => (n / 1048576).toFixed(1);

/*
 * Storage answers 429 when pushed, and this connection drops TLS sessions
 * mid-transfer (see withRetry in import-galleries.mjs). Every network step
 * here is safe to repeat.
 */
/*
 * Every attempt also has a time limit. A request that stalled without ever
 * failing once left nothing pending but that promise, and Node exited — code
 * 0, half a batch done, no summary and no SQL. A stall is now an error, and
 * errors are retried.
 */
const ATTEMPT_MS = 180_000;
function timeLimit(promise, label) {
  let timer;
  const limit = new Promise((_, reject) => {
    timer = setTimeout(() => reject(new Error(`${label}: no response in ${ATTEMPT_MS / 1000}s`)), ATTEMPT_MS);
  });
  return Promise.race([promise, limit]).finally(() => clearTimeout(timer));
}

async function withRetry(label, fn, attempts = 8) {
  let last;
  for (let i = 1; i <= attempts; i++) {
    try {
      return await timeLimit(fn(), label);
    } catch (e) {
      last = e;
      await sleep(1500 * i);
    }
  }
  throw new Error(`${label}: ${last?.message || last}`);
}

async function getBytes(path, range) {
  return withRetry(`download ${path}`, async () => {
    const r = await fetch(PUBLIC + path.split("/").map(encodeURIComponent).join("/"), {
      ...(range ? { headers: { Range: range } } : {}),
      signal: AbortSignal.timeout(ATTEMPT_MS), // also stops the stalled transfer itself
    });
    if (r.status === 416) return Buffer.alloc(0); // zero-byte object
    // Listed but absent. A project restored from a backup has every file's
    // row and none of its bytes; retrying a 404 for each would take hours.
    if (r.status === 400 || r.status === 404) return null;
    if (r.status === 429 || r.status >= 500) throw new Error(`HTTP ${r.status}`);
    if (!r.ok) throw new Error(`HTTP ${r.status}`);
    return Buffer.from(await r.arrayBuffer());
  });
}

function sniff(b) {
  if (!b.length) return "empty";
  const s = (a, z) => b.toString("latin1", a, z);
  if (b[0] === 0xff && b[1] === 0xd8) return "jpeg";
  if (b[0] === 0x89 && s(1, 4) === "PNG") return "png";
  if (s(0, 4) === "RIFF" && s(8, 12) === "WEBP") return "webp";
  if (s(4, 8) === "ftyp") return /avi[fs]/.test(s(8, 12)) ? "avif" : "heic";
  if (s(0, 3) === "GIF") return "gif";
  return "other";
}

async function pool(items, n, fn) {
  let i = 0;
  await Promise.all(Array.from({ length: n }, async () => {
    while (i < items.length) { const k = i++; await fn(items[k], k); }
  }));
}

/* -------------------------------------------------------------- inventory */

async function listAll(prefix = "") {
  const out = [];
  for (let offset = 0; ; offset += 1000) {
    const { data, error } = await withRetry(`list ${prefix}`, async () => {
      const res = await supabase.storage.from(BUCKET).list(prefix, { limit: 1000, offset });
      if (res.error) throw res.error;
      return res;
    });
    if (error) throw error;
    for (const e of data) {
      const p = prefix ? `${prefix}/${e.name}` : e.name;
      if (e.id === null) out.push(...(await listAll(p)));
      else out.push({ path: p, size: e.metadata?.size ?? 0 });
    }
    if (data.length < 1000) break;
  }
  return out;
}

/** Table name -> { pk, types: { column: "text" | "text[]" | "jsonb" | ... } } */
async function schema() {
  const r = await withRetry("schema", async () => {
    const res = await fetch(`${URL_}/rest/v1/`, { headers: { apikey: KEY, Accept: "application/openapi+json" } });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    return res.json();
  });
  const out = {};
  for (const [name, def] of Object.entries(r.definitions || {})) {
    if (VIEWS.has(name)) continue;
    const props = def.properties || {};
    const pk = Object.entries(props).find(([, v]) => /Primary Key/.test(v.description || ""))?.[0];
    out[name] = { pk, types: Object.fromEntries(Object.entries(props).map(([c, v]) => [c, v.format])) };
  }
  return out;
}

const URL_RE = /https?:\/\/[^\s"'()<>\\]+\/storage\/v1\/object\/public\/uploads\/[^\s"'()<>\\?#]+/g;

function urlsIn(v, out = []) {
  if (typeof v === "string") { for (const m of v.matchAll(URL_RE)) out.push(m[0]); }
  else if (Array.isArray(v)) v.forEach((x) => urlsIn(x, out));
  else if (v && typeof v === "object") Object.values(v).forEach((x) => urlsIn(x, out));
  return out;
}

function pathOf(url) {
  const tail = url.slice(url.indexOf("/public/uploads/") + "/public/uploads/".length);
  try { return decodeURIComponent(tail); } catch { return tail; }
}

async function scanRows(tables) {
  const refs = []; // { table, pk, id, column, url, path }
  for (const [table, { pk }] of Object.entries(tables)) {
    if (!pk) continue;
    for (let from = 0; ; from += 1000) {
      const { data, error } = await withRetry(`read ${table}`, async () => {
        const res = await supabase.from(table).select("*").order(pk).range(from, from + 999);
        if (res.error) throw res.error;
        return res;
      });
      if (error) throw error;
      for (const row of data) for (const [column, value] of Object.entries(row)) {
        for (const url of urlsIn(value)) refs.push({ table, pk, id: row[pk], column, url, path: pathOf(url) });
      }
      if (data.length < 1000) break;
    }
  }
  return refs;
}

/* ------------------------------------------------------------- conversion */

async function convert(bytes, format) {
  let input = bytes;
  if (format === "heic") {
    // sharp's prebuilt libvips reads HEIC headers but cannot decode HEVC.
    const heicConvert = (await import("heic-convert")).default;
    input = Buffer.from(await heicConvert({ buffer: bytes, format: "JPEG", quality: 0.95 }));
  }
  const out = await sharp(input, { animated: false })
    .rotate() // honour EXIF orientation from phone photos
    .resize(MAX_EDGE, MAX_EDGE, { fit: "inside", withoutEnlargement: true })
    .webp({ quality: QUALITY })
    .toBuffer();
  if (sniff(out) !== "webp") throw new Error("conversion did not produce WebP");
  return out;
}

function webpPath(path, taken) {
  const base = path.replace(/\.[^./]+$/, "");
  let candidate = `${base}.webp`;
  for (let n = 2; taken.has(candidate); n++) candidate = `${base}-${n}.webp`;
  taken.add(candidate);
  return candidate;
}

/* -------------------------------------------------------------------- SQL */

const q = (s) => `'${String(s).replace(/'/g, "''")}'`;

function literal(value, type) {
  if (value === null || value === undefined) return "null";
  /*
   * A ";" inside article text made the Supabase SQL editor split a statement
   * there and warn "UPDATE without a WHERE clause". Postgres was never
   * confused, but the warning is one nobody should have to click through. In
   * JSON a ";" can be written ;: jsonb stores the same character, and the
   * file then has no semicolon except between statements.
   */
  if (type === "jsonb" || type === "json") return `${q(JSON.stringify(value).replace(/;/g, "\\u003b"))}::${type}`;
  if (type?.endsWith("[]")) return `array[${value.map(q).join(", ")}]::${type}`;
  return q(value);
}

function replaceDeep(v, map) {
  if (typeof v === "string") return v.replace(URL_RE, (u) => map.get(u) ?? u);
  if (Array.isArray(v)) return v.map((x) => replaceDeep(x, map));
  if (v && typeof v === "object") return Object.fromEntries(Object.entries(v).map(([k, x]) => [k, replaceDeep(x, map)]));
  return v;
}

/* -------------------------------------------------------------------- run */

console.log(COMMIT ? "\n  COMMIT — converting and uploading\n" : "\n  DRY RUN — nothing will be written\n");

const objects = await listAll();
const tables = await schema();
const refs = await scanRows(tables);
const inUse = new Set(refs.map((r) => r.path));
// --only <file>: a list of storage paths, one per line. Everything else is
// left alone — for trying the whole process on a handful of files first.
const ONLY = process.argv.includes("--only")
  ? new Set(readFileSync(process.argv[process.argv.indexOf("--only") + 1], "utf8").split(/\r?\n/).filter(Boolean))
  : null;
const used = objects.filter((o) => inUse.has(o.path) && (!ONLY || ONLY.has(o.path)));
console.log(`  bucket ${objects.length} files · ${refs.length} references in ${Object.keys(tables).length} tables · ${used.length} files in use${ONLY ? ` (limited by --only to ${ONLY.size})` : ""}`);

/*
 * Real format by the file's own bytes, never its name.
 *
 * A file that cannot be read after every retry is marked and left alone
 * rather than ending the run; on this connection one dropped download used to
 * stop everything. With --limit, reading stops once enough files are found,
 * so a small batch does not first read all ~1,800.
 */
const SKIP = ["webp", "empty", "missing", "unreadable"];
for (let i = 0; i < used.length; i += 30) {
  await pool(used.slice(i, i + 30), 3, async (o) => {
    try {
      const head = await getBytes(o.path, "bytes=0-31");
      o.format = head === null ? "missing" : sniff(head);
    } catch {
      o.format = "unreadable";
    }
  });
  if (used.slice(0, i + 30).filter((o) => o.format && !SKIP.includes(o.format)).length >= LIMIT) break;
}
const checked = used.filter((o) => o.format);

const missing = checked.filter((o) => o.format === "missing");
if (missing.length) console.log(`  listed but missing from storage (skipped): ${missing.length}`);
const unreadable = checked.filter((o) => o.format === "unreadable");
if (unreadable.length) {
  console.log(`  could not be read after retries, left alone (re-run to retry): ${unreadable.length}`);
  unreadable.forEach((o) => console.log(`    ${o.path}`));
}
const empty = checked.filter((o) => o.format === "empty");
const todo = checked.filter((o) => !SKIP.includes(o.format)).slice(0, LIMIT);
if (Number.isFinite(LIMIT)) console.log(`  read ${checked.length} of ${used.length} files to find this batch`);
const taken = new Set(objects.map((o) => o.path));
/*
 * A file already uploaded by an earlier, interrupted run keeps the name it was
 * uploaded under. Without this, a resumed run found its own .webp "taken",
 * named it "-2.webp", skipped the upload as done — and wrote SQL pointing 25
 * images at files that did not exist. Caught before that SQL was run.
 */
const earlier = existsSync(join(OUT, "manifest.json"))
  ? JSON.parse(readFileSync(join(OUT, "manifest.json"), "utf8"))
  : {};
for (const o of todo) {
  o.inPlace = /\.webp$/i.test(o.path);
  o.target = earlier[o.path]?.uploaded ? earlier[o.path].target
    : o.inPlace ? o.path
    : webpPath(o.path, taken);
}

const fmt = {};
todo.forEach((o) => (fmt[o.format] = (fmt[o.format] || 0) + 1));
console.log(`  to convert: ${todo.length} (${mb(todo.reduce((a, o) => a + o.size, 0))} MB)  ${JSON.stringify(fmt)}`);
console.log(`    in place (fake .webp): ${todo.filter((o) => o.inPlace).length}`);
console.log(`    new .webp + URL change: ${todo.filter((o) => !o.inPlace).length}`);
if (empty.length) {
  console.log(`  zero-byte files in use (cannot convert — re-upload needed): ${empty.length}`);
  for (const o of empty) {
    const where = [...new Set(refs.filter((r) => r.path === o.path).map((r) => `${r.table}.${r.column} ${r.id}`))];
    console.log(`    ${o.path.split("/").pop()}  ←  ${where.join(", ")}`);
  }
}

/* ---- storage: back up, convert, upload */

const manifestFile = join(OUT, "manifest.json");
const manifest = existsSync(manifestFile) ? JSON.parse(readFileSync(manifestFile, "utf8")) : {};
const failures = [];
let before = 0, after = 0, done = 0;

if (COMMIT) {
  await pool(todo, 2, async (o) => {
    if (manifest[o.path]?.uploaded) { done++; return; } // resumed run
    try {
      const bytes = await getBytes(o.path);
      const backup = join(OUT, "originals", o.path);
      mkdirSync(dirname(backup), { recursive: true });
      if (!existsSync(backup)) writeFileSync(backup, bytes);

      const webp = await convert(bytes, sniff(bytes));
      await withRetry(`upload ${o.target}`, async () => {
        const { error } = await supabase.storage.from(BUCKET).upload(o.target, webp, {
          contentType: "image/webp", cacheControl: "31536000", upsert: true,
        });
        if (error) throw error;
      });
      manifest[o.path] = { target: o.target, inPlace: o.inPlace, from: o.format, before: bytes.length, after: webp.length, uploaded: true };
      writeFileSync(manifestFile, JSON.stringify(manifest, null, 1));
      before += bytes.length; after += webp.length;
      if (++done % 25 === 0) console.log(`  ${done}/${todo.length}`);
    } catch (e) {
      failures.push(`${o.path}: ${e.message}`);
    }
  });
  console.log(`\n  converted ${done}/${todo.length}: ${mb(before)} MB -> ${mb(after)} MB`);
  if (failures.length) { console.log(`  ${failures.length} FAILED:`); failures.forEach((f) => console.log("   ", f)); }
}

/* ---- database: SQL for the URL changes */

// Only files whose new .webp actually exists (always true in a dry run's preview).
const moved = todo.filter((o) => !o.inPlace && (!COMMIT || manifest[o.path]?.uploaded));
const urlMap = new Map();
for (const o of moved) {
  const newUrl = supabase.storage.from(BUCKET).getPublicUrl(o.target).data.publicUrl;
  for (const r of refs.filter((r) => r.path === o.path)) urlMap.set(r.url, newUrl);
}

const cells = new Map(); // "table|id|column" -> ref
for (const r of refs) if (urlMap.has(r.url)) cells.set(`${r.table}|${r.id}|${r.column}`, r);

const apply = [], revert = [], touched = new Set();
for (const r of cells.values()) {
  const { data, error } = await withRetry(`reread ${r.table}`, async () => {
    const res = await supabase.from(r.table).select(r.column).eq(r.pk, r.id).single();
    if (res.error) throw res.error;
    return res;
  });
  if (error) throw error;
  const type = tables[r.table].types[r.column];
  const oldVal = data[r.column];
  const newVal = replaceDeep(oldVal, urlMap);
  if (JSON.stringify(oldVal) === JSON.stringify(newVal)) continue;
  touched.add(r.table);
  const where = (v) => `where ${r.pk} = ${q(r.id)} and ${r.column} = ${literal(v, type)}`;
  apply.push(`update public.${r.table} set ${r.column} = ${literal(newVal, type)} ${where(oldVal)};`);
  revert.push(`update public.${r.table} set ${r.column} = ${literal(oldVal, type)} ${where(newVal)};`);
}

/*
 * The live and test projects look identical in the dashboard, and batch 1's
 * SQL was once run in the wrong one. Each project carries a one-row label in
 * private.afc_environment (see sqlProjectGuard), and every file refuses to run
 * anywhere else — before it changes anything.
 */
function sqlProjectGuard(target, ref) {
  return [
    "do $$",
    "declare here text;",
    "begin",
    "  select name into here from private.afc_environment limit 1;",
    `  if here is distinct from '${target}' then`,
    `    raise exception 'WRONG PROJECT: this file is for ${target.toUpperCase()} (${ref}), but this database is labelled %. Nothing was changed.', coalesce(here, 'nothing (run the one-time label SQL first)');`,
    "  end if;",
    "end $$;",
  ];
}

function wrap(lines, title) {
  const t = [...touched].sort();
  return [
    `-- ${title}`,
    `-- Generated ${new Date().toISOString()} by scripts/convert-uploads-to-webp.mjs`,
    `-- FOR THE ${TARGET.toUpperCase()} PROJECT ONLY (${REF}). It checks, and stops anywhere else.`,
    `-- ${lines.length} updates. Runs as one transaction: all or nothing.`,
    `-- set_updated_date is paused so converted images do not reorder`,
    `-- "recently updated" lists; it is re-enabled before commit.`,
    "begin;",
    ...sqlProjectGuard(TARGET, REF),
    ...t.map((x) => `alter table public.${x} disable trigger set_updated_date;`),
    ...lines,
    ...t.map((x) => `alter table public.${x} enable trigger set_updated_date;`),
    "commit;",
    "",
  ].join("\n");
}

/*
 * One set of files per run, never overwritten: each batch keeps its own undo.
 * Run a batch's apply SQL before starting the next batch — until it runs, the
 * originals are still what the site points at, and the next run picks them
 * up again.
 */
const stamp = new Date().toISOString().replace(/[-:]/g, "").replace(/\..*/, "").replace("T", "-");
const name = COMMIT ? `batch-${stamp}` : "preview";
const applyFile = join(OUT, `${name}-apply.sql`);
const revertFile = join(OUT, `${name}-revert.sql`);
writeFileSync(applyFile, wrap(apply, `Point image URLs at the converted .webp files (${name})`));
writeFileSync(revertFile, wrap(revert, `UNDO ${name}: point image URLs back at the originals`));

// Which rows this run affected, so their pages can be checked afterwards.
const done_ = todo.filter((o) => !COMMIT || manifest[o.path]?.uploaded);
const pagesFile = join(OUT, `${name}-rows.json`);
writeFileSync(pagesFile, JSON.stringify(
  done_.flatMap((o) => refs.filter((r) => r.path === o.path)
    .map((r) => ({ table: r.table, id: r.id, column: r.column, path: o.path, target: o.target, inPlace: o.inPlace }))),
  null, 1));

const perTable = {};
for (const line of apply) { const t = line.split(" ")[1].replace("public.", ""); perTable[t] = (perTable[t] || 0) + 1; }
console.log(`\n  SQL: ${apply.length} row updates ${JSON.stringify(perTable)}`);
console.log(`    ${applyFile}`);
console.log(`    ${revertFile}`);
console.log(`    ${pagesFile}`);
console.log(COMMIT
  ? `\n  Storage done. Review ${name}-apply.sql, then run it in the Supabase SQL editor.\n`
  : "\n  Dry run only. Re-run with --commit to convert and upload.\n");
if (failures.length) process.exit(1);
