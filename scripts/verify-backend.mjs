/**
 * Verifies the facade picks the right backend from the environment.
 * Run: npm run verify:backend
 */

import { readFileSync, writeFileSync, mkdirSync, rmSync } from "node:fs";

const TMP = new URL("../.tmp/", import.meta.url);
mkdirSync(TMP, { recursive: true });

const facade = readFileSync(
  new URL("../src/api/base44Client.js", import.meta.url),
  "utf8"
);

let pass = 0;
const failures = [];
const check = (name, cond, detail = "") =>
  cond ? pass++ : failures.push(`${name}${detail ? ` — ${detail}` : ""}`);

/**
 * Loads the facade with a fake import.meta.env and stubbed providers, then
 * reports which backend it selected.
 */
async function backendFor(env, tag) {
  const src = facade
    .replace(
      /import \* as mockProvider from "@\/api\/providers\/mock";/,
      'const mockProvider = { entities:{}, auth:{}, integrations:{}, functions:{}, BACKEND:"mock" };'
    )
    .replace(
      /import \* as supabaseProvider from "@\/api\/providers\/supabase";/,
      'const supabaseProvider = { entities:{}, auth:{}, integrations:{}, functions:{}, BACKEND:"supabase" };'
    )
    .replace(/import\.meta\.env/g, "globalThis.__ENV__");

  globalThis.__ENV__ = env;
  const file = new URL(`./facade-${tag}.mjs`, TMP);
  writeFileSync(file, src);
  // `file` is already a file: URL, so import it directly. Converting via
  // .pathname breaks on Windows: it yields "/C:/Users/..." which then gets a
  // drive letter prepended, producing "C:\C:\Users\...".
  const mod = await import(file.href);
  return mod.BACKEND;
}

const URL_ = "https://x.supabase.co";
const KEY = "anon-key";

check(
  "no credentials -> mock",
  (await backendFor({}, "a")) === "mock"
);

check(
  "both credentials -> supabase",
  (await backendFor({ VITE_SUPABASE_URL: URL_, VITE_SUPABASE_ANON_KEY: KEY }, "b")) ===
    "supabase"
);

check(
  "url only (incomplete) -> mock, not a half-configured client",
  (await backendFor({ VITE_SUPABASE_URL: URL_ }, "c")) === "mock"
);

check(
  "key only (incomplete) -> mock",
  (await backendFor({ VITE_SUPABASE_ANON_KEY: KEY }, "d")) === "mock"
);

check(
  "empty strings treated as missing",
  (await backendFor({ VITE_SUPABASE_URL: "", VITE_SUPABASE_ANON_KEY: "" }, "e")) === "mock"
);

check(
  "VITE_USE_MOCK=true forces demo even with credentials",
  (await backendFor(
    { VITE_SUPABASE_URL: URL_, VITE_SUPABASE_ANON_KEY: KEY, VITE_USE_MOCK: "true" },
    "f"
  )) === "mock"
);

check(
  "VITE_USE_MOCK=false does not force demo",
  (await backendFor(
    { VITE_SUPABASE_URL: URL_, VITE_SUPABASE_ANON_KEY: KEY, VITE_USE_MOCK: "false" },
    "g"
  )) === "supabase"
);

rmSync(TMP, { recursive: true, force: true });

console.log(`\n  passed: ${pass}`);
if (failures.length) {
  console.log(`  FAILED: ${failures.length}\n`);
  failures.forEach((f) => console.log(`   ✗ ${f}`));
  process.exit(1);
}
console.log("  backend auto-selection is correct\n");
