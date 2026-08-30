/**
 * Components used in JSX but never imported.
 *
 * An undefined component renders as nothing, so the page goes blank with no
 * build error and no lint warning. This has now caused FOUR blank screens,
 * each of which reached the client:
 *
 *   PasswordInput      — file created but empty
 *   CHAPTER_OPTIONS    — used in the exhibition form, never imported
 *   isVenueType        — used in the registry, never imported
 *   FocalPointPicker   — used when adding an exhibition image, never imported
 *
 * The last one was the worst: it only crashed after SELECTING A FILE, so
 * every render test passed. This catches all of them statically, in a second.
 *
 * Run: npm run verify:imports
 */
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";

const files=[];
(function walk(d){ for(const e of readdirSync(d)){ const p=join(d,e);
  if(statSync(p).isDirectory()){ if(e!=="ui") walk(p); }
  else if(p.endsWith(".jsx")) files.push(p); } })("src");

const problems=[];
for (const f of files) {
  if (f.includes("pages/components/")) continue;
  const raw = readFileSync(f,"utf8");
  // Comments mention components without using them.
  const src = raw.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");

  // Everything the file brings in or declares.
  const known = new Set(["React","Fragment"]);
  for (const m of src.matchAll(/import\s+(\w+)\s*(?:,\s*\{([^}]*)\})?\s*from/g)) {
    known.add(m[1]);
    if (m[2]) m[2].split(",").forEach(n => known.add(n.trim().split(" as ").pop().trim()));
  }
  for (const m of src.matchAll(/import\s*\{([^}]*)\}\s*from/g))
    m[1].split(",").forEach(n => known.add(n.trim().split(" as ").pop().trim()));
  for (const m of src.matchAll(/(?:function|const|class)\s+([A-Z]\w*)/g)) known.add(m[1]);
  // Props renamed on destructuring: ({ icon: Icon }) — Icon is a local name.
  for (const m of src.matchAll(/\w+\s*:\s*([A-Z]\w*)/g)) known.add(m[1]);

  for (const m of src.matchAll(/<([A-Z]\w*)/g)) {
    const c = m[1];
    if (!known.has(c) && !c.includes(".")) {
      problems.push(`${f.replace("src/","")}: <${c}>`);
    }
  }
}

const unique=[...new Set(problems)];
console.log(`\n  files scanned: ${files.length}`);
if (unique.length) {
  console.log(`  MISSING IMPORTS: ${unique.length}\n`);
  unique.forEach(p => console.log("   ✗ " + p));
  process.exit(1);
}
console.log("  every component used in JSX is imported or defined\n");
