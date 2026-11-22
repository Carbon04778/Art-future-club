/**
 * Open call links (migrations 032 + 033), checked in the database itself.
 * TEST ONLY: inserts open calls with the live titles, a duplicate and a very
 * long title, reads the link each was given, renames one, then deletes them.
 *
 *   node scripts/check-open-call-slugs.mjs
 */
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = fileURLToPath(new URL("..", import.meta.url));
const E = Object.fromEntries(readFileSync(join(ROOT, ".env"), "utf8").split(/\r?\n/).filter((l) => /^[A-Z_]+=/.test(l)).map((l) => [l.slice(0, l.indexOf("=")), l.slice(l.indexOf("=") + 1).trim()]));
const U = E.COPY_SUPABASE_URL.replace(/\/+$/, "");
if (!U.includes("jbcexmconizdqxnfyjba")) throw new Error("COPY_SUPABASE_URL is not the TEST project");
const H = { apikey: E.COPY_SUPABASE_SERVICE_ROLE_KEY, Authorization: `Bearer ${E.COPY_SUPABASE_SERVICE_ROLE_KEY}`, "Content-Type": "application/json", Prefer: "return=representation" };
const rest = async (q, o = {}) => { const r = await fetch(`${U}/rest/v1/${q}`, { headers: H, ...o }); const t = await r.text(); if (!r.ok) throw new Error(`${r.status} ${t}`); return t ? JSON.parse(t) : null; };

const TAG = `zz slug check ${Date.now()}`;
const cases = [
  ["CYBER-PUNK: The Living World  The code finishes booting — and a world walks out of the screen.", "cyber-punk-the-living-world"],
  ["CODE & PATTERN: The Hidden Order  Look closer — there was a system inside the chaos all along.", "code-pattern-the-hidden-order"],
  ["Open Call 01 — GLITCH: The Broken Screen  The screen fails — beautifully.", "open-call-01-glitch-the-broken-screen"],
  ["Open Call for Inlaks–AAA Art Grant 2027", "open-call-for-inlaks-aaa-art-grant-2027"],
  ["Open Call for Inlaks–AAA Art Grant 2027", "open-call-for-inlaks-aaa-art-grant-2027-2"],
  ["A very long open call title that keeps going well past the limit for a readable web address", null],
  ["Málaga Residency — Café Été", "malaga-residency-cafe-ete"],
  ["艺术开放征集", "<id>"],
];
const made = [];
let pass = 0, fail = 0;
const ok = (name, cond, detail = "") => { cond ? pass++ : fail++; console.log(`${cond ? "PASS" : "FAIL"}  ${name}${detail ? `  — ${detail}` : ""}`); };
try {
  // A previous run's leftovers would make the duplicate case wrong.
  const clash = await rest(`open_call?select=id,title&slug=in.(${cases.map(([, s]) => s).filter((s) => s && s !== "<id>").join(",")})`);
  if (clash.length) throw new Error(`TEST already has calls with these links: ${clash.map((c) => c.title).join(" | ")}`);
  for (const [title] of cases) {
    const [row] = await rest("open_call", { method: "POST", body: JSON.stringify({ title, organizer: TAG, type: "Open Call" }) });
    made.push(row);
  }
  cases.forEach(([title, want], i) => {
    const got = made[i].slug;
    if (want === "<id>") ok(`no Latin letters → falls back to the id`, got === made[i].id, got);
    else if (want === null) ok(`a very long title is cut at a whole word, ≤ 66 characters`, got.length <= 66 && "a-very-long-open-call-title-that-keeps-going-well-past-the-limit-for-a-readable-web-address".startsWith(got) && "a-very-long-open-call-title-that-keeps-going-well-past-the-limit-for-a-readable-web-address"[got.length] === "-", `${got} (${got.length})`);
    else ok(`"${title.slice(0, 45)}…" → ${want}`, got === want, got);
  });
  // Renaming keeps the link.
  const [renamed] = await rest(`open_call?id=eq.${made[0].id}`, { method: "PATCH", body: JSON.stringify({ title: "CYBER-PUNK: Renamed" }) });
  ok("renaming a call keeps its link", renamed.slug === "cyber-punk-the-living-world", renamed.slug);
  // An admin can still set a link by hand.
  const [hand] = await rest(`open_call?id=eq.${made[1].id}`, { method: "PATCH", body: JSON.stringify({ slug: "Hand Made Link" }) });
  ok("a link set by hand is kept (tidied)", hand.slug === "hand-made-link", hand.slug);
} finally {
  for (const r of made) await rest(`open_call?id=eq.${r.id}`, { method: "DELETE" });
  const left = await rest(`open_call?select=id&organizer=eq.${encodeURIComponent(TAG)}`);
  ok("everything the check created was deleted from TEST", left.length === 0, `${made.length} removed`);
}
console.log(`\n${pass}/${pass + fail} passed`);
process.exit(fail ? 1 : 0);
