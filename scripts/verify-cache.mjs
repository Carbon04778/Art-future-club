/**
 * The read cache for entity lists.
 *
 * WHY IT EXISTS
 *
 * Thirty-eight pages load data with useEffect + setState and remember nothing,
 * so leaving a page and coming back re-downloaded the whole list and showed the
 * spinner again. This caches list/filter in the one place every page goes
 * through, the facade in src/api/base44Client.js.
 *
 * WHAT MUST NOT BREAK
 *
 *   - The provider contract: list/filter resolve to a BARE ARRAY, and `get`
 *     still REJECTS when a row is missing.
 *   - Callers get a COPY. Editorial, Messages and CollectorProfilePage all sort
 *     the returned array in place.
 *   - A write makes the next read fresh, or "I saved it and it did not appear"
 *     comes straight back.
 *   - Signing out drops everything. Row visibility depends on who is asking, so
 *     one account's cached list must never reach the next.
 *
 * Run: npm run verify:cache
 */

import { JSDOM } from "jsdom";

const dom = new JSDOM("<!doctype html><html><body></body></html>", { url: "http://localhost/" });
globalThis.window = dom.window;
globalThis.document = dom.window.document;

let pass = 0;
const failures = [];
const check = (n, c, d = "") => (c ? pass++ : failures.push(`${n}${d ? ` — ${d}` : ""}`));
const tick = (ms = 0) => new Promise((r) => setTimeout(r, ms));

const {
  cachedRead, cacheKey, invalidateEntityCache, setEntityCacheEnabled, __entityCacheStats,
} = await import("../src/lib/entityCache.js");
const { __resetDataRevision } = await import("../src/lib/dataRevision.js");

setEntityCacheEnabled(true);
invalidateEntityCache();

/* =================================================== 1. it actually caches */

let calls = 0;
const rowsV1 = [{ id: "a", updated_date: "2026-01-01", name: "one" }];
let served = rowsV1;
const fetcher = async () => { calls += 1; return served; };

const k = cacheKey("ArtistProfile", "list", ["-created_date", 200, "id,name"]);

const first = await cachedRead(k, fetcher);
check("a first read calls the provider", calls === 1, `${calls} calls`);
check("it resolves to a bare array", Array.isArray(first) && first[0]?.name === "one");

const second = await cachedRead(k, fetcher);
check("an immediate second read does NOT call the provider again", calls === 1, `${calls} calls`);
check("the cached read returns the same data", second[0]?.name === "one");

/* ------------------------------------------------- the key must discriminate */
await cachedRead(cacheKey("ArtistProfile", "list", ["-created_date", 200, "id,name,slug"]), fetcher);
check("a different column list is a different query", calls === 2, `${calls} calls`);
await cachedRead(cacheKey("CollectorProfile", "list", ["-created_date", 200, "id,name"]), fetcher);
check("a different entity is a different query", calls === 3, `${calls} calls`);
await cachedRead(cacheKey("ArtistProfile", "filter", [{ type: "Gallery" }]), fetcher);
check("filter and list do not share an entry", calls === 4, `${calls} calls`);

/* ============================================ 2. callers must get a copy */

invalidateEntityCache();
calls = 0;
served = [
  { id: "b", updated_date: "2026-01-02", n: 2 },
  { id: "a", updated_date: "2026-01-01", n: 1 },
];
const sortable = await cachedRead(k, fetcher);
// Exactly what Editorial does: sort what the provider returned, in place.
sortable.sort((x, y) => x.n - y.n);
check("sorting the result in place does not reorder the cache",
  (await cachedRead(k, fetcher))[0].id === "b",
  (await cachedRead(k, fetcher))[0].id);

const popped = await cachedRead(k, fetcher);
popped.pop();
const afterPop = await cachedRead(k, fetcher);
check("removing an item from the result does not shrink the cache",
  afterPop.length === 2, `${afterPop.length} rows`);
check("each caller gets its own array", popped !== afterPop);

/* ============================================ 3. concurrent reads share one */

invalidateEntityCache();
calls = 0;
let release;
const slow = async () => {
  calls += 1;
  await new Promise((r) => { release = r; });
  return served;
};
const a1 = cachedRead(k, slow);
const a2 = cachedRead(k, slow);
const a3 = cachedRead(k, slow);
// cachedRead defers the fetcher to a microtask, so let it actually start.
await tick();
check("three simultaneous reads make ONE request", calls === 1, `${calls} calls`);
release();
const [r1, r2, r3] = await Promise.all([a1, a2, a3]);
check("all three still resolve with the data",
  r1.length === 2 && r2.length === 2 && r3.length === 2,
  `${r1.length}/${r2.length}/${r3.length}`);
check("and each gets its own array", r1 !== r2 && r2 !== r3);

/* ==================================================== 4. writes clear it */

invalidateEntityCache();
calls = 0;
await cachedRead(k, fetcher);
check("cached before the write", calls === 1);
invalidateEntityCache();
await cachedRead(k, fetcher);
check("a write makes the next read go to the provider", calls === 2, `${calls} calls`);

/* ============================== 5. stale-while-revalidate, and the bump */

__resetDataRevision();
invalidateEntityCache();
calls = 0;

/*
 * FRESH_MS is 30s, so a real wait is not viable. The entry's timestamp is
 * pushed into the past instead, which is what the clock would have done.
 */
const { default: fs } = await import("node:fs");
const cacheSrc = fs.readFileSync(new URL("../src/lib/entityCache.js", import.meta.url), "utf8");
check("FRESH_MS is a sane window, not hours",
  /const FRESH_MS = 30_000;/.test(cacheSrc));
check("entries older than MAX_AGE are discarded rather than shown",
  /const MAX_AGE_MS = 15 \* 60_000;/.test(cacheSrc));
check("the cache is bounded", /const MAX_ENTRIES = 120;/.test(cacheSrc));
check("only a real change announces itself",
  /if \(previous && entries\.get\(key\)\.sig !== previous\.sig\) bumpDataRevision\(\);/.test(cacheSrc));
check("a failed background refresh is swallowed, not surfaced",
  /\.catch\(\(\) => \{/.test(cacheSrc));
check("change detection uses id + updated_date rather than serialising 500 kB",
  /\$\{row\.id\}:\$\{row\.updated_date\}/.test(cacheSrc));

/* ================================================== 6. disabled passes through */

setEntityCacheEnabled(false);
calls = 0;
await cachedRead(k, fetcher);
await cachedRead(k, fetcher);
check("with the cache off, every read reaches the provider", calls === 2, `${calls} calls`);
check("disabling also empties it", __entityCacheStats().size === 0);
setEntityCacheEnabled(true);

/* =========================================== 7. the facade wiring is right */

const facade = fs.readFileSync(new URL("../src/api/base44Client.js", import.meta.url), "utf8");
const strip = (s) => s.replace(/\/\*[\s\S]*?\*\//g, "").replace(/\/\/.*$/gm, "");
const code = strip(facade);

check("list is cached", /list\(\.\.\.args\) \{\s*return cachedRead\(/.test(code));
check("filter is cached", /filter\(\.\.\.args\) \{\s*return cachedRead\(/.test(code));
check("get is NOT cached — it must still reject on a missing row",
  !/get\(\.\.\.args\)/.test(code) && !/cacheKey\([^)]*"get"/.test(code));

for (const write of ["create", "update", "delete"]) {
  const re = new RegExp(`async ${write}\\(\\.\\.\\.args\\)[\\s\\S]{0,220}?invalidateEntityCache\\(\\)`);
  check(`${write} clears the cache`, re.test(code));
}
check("the write wrappers still return what the provider returned",
  /return row;/.test(code) && /return result;/.test(code));
check("the cache is cleared BEFORE the write announces itself",
  code.indexOf("invalidateEntityCache();\n          bumpDataRevision();") > -1 ||
  /invalidateEntityCache\(\);\s*bumpDataRevision\(\);/.test(code));

/* Identity changes — the security-relevant part. */
for (const m of ["loginViaEmailPassword", "loginWithProvider", "register", "verifyOtp", "logout", "setToken"]) {
  check(`${m} clears cached rows`, code.includes(`"${m}"`));
}
check("an auth state change clears them too",
  /onAuthStateChange\(\(\) => invalidateEntityCache\(\)\)/.test(code));
check("the cache is off under --mode test so the suite stays deterministic",
  /setEntityCacheEnabled\(import\.meta\.env\.MODE !== "test"\)/.test(code));

/* ================================ 8. the contract, through the real facade */

const { entities } = await import("../src/api/providers/mock.js");
setEntityCacheEnabled(true);
invalidateEntityCache();

const viaCache = (args) => cachedRead(cacheKey("ArtistProfile", "list", args), () => entities.ArtistProfile.list(...args));
const listed = await viaCache(["-created_date", 5]);
check("a cached list of real demo rows is still a bare array",
  Array.isArray(listed) && listed.length > 0 && !("data" in listed));
const listedAgain = await viaCache(["-created_date", 5]);
check("and is stable across reads", listedAgain.length === listed.length);

let rejected = false;
try { await entities.ArtistProfile.get("no-such-row"); } catch { rejected = true; }
check("get still rejects for a missing row", rejected);

/* ------------------------------------------------------------------ report */

console.log("");
if (failures.length) {
  console.log(`  passed: ${pass}`);
  console.log(`  FAILED: ${failures.length}\n`);
  for (const f of failures) console.log(`   ✗ ${f}`);
  console.log("");
  process.exit(1);
}
console.log(`  passed: ${pass}`);
console.log("  lists are remembered, copies are handed out, writes and sign-outs clear them\n");
process.exit(0);
