/**
 * Trial of the AI events reader on real gallery websites. READ-ONLY: reads
 * public listings and public pages, saves nothing to any database.
 *
 *   node scripts/trial-ai-events.mjs ["Name 1" "Name 2" ...]
 * Report: reports/C8-trial.html
 */
import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { readSite } from "../api/_lib/aiEventsJob.js";
import { dateRange } from "../src/lib/aiEvents.js";

const ROOT = fileURLToPath(new URL("..", import.meta.url));
const E = Object.fromEntries(readFileSync(join(ROOT, ".env"), "utf8").split(/\r?\n/).filter((l) => /^[A-Z_]+=/.test(l)).map((l) => [l.slice(0, l.indexOf("=")), l.slice(l.indexOf("=") + 1).trim()]));
const DEFAULT = ["10 Chancery Lane Gallery", "Axel Vervoordt Gallery", "Gagosian", "MASSIMODECARLO", "Square Street Gallery", "CHAT Centre for Heritage, Arts and Textile", "Jockey Club Creative Arts Centre", "Aabee Bleue Project", "10 A.M. Gallery", "Galerie Andres Thalmann", "Luca Tommasi Arte Contemporanea"];
const names = process.argv.slice(2).length ? process.argv.slice(2) : DEFAULT;
const r = await fetch(`${E.VITE_SUPABASE_URL}/rest/v1/collector_profile?select=id,display_name,based_in,website&website=not.is.null&limit=1000`, { headers: { apikey: E.VITE_SUPABASE_ANON_KEY, Authorization: `Bearer ${E.VITE_SUPABASE_ANON_KEY}` } });
const listings = await r.json();
const picked = names.map((n) => listings.find((l) => l.display_name === n)).filter(Boolean);
const today = new Date().toISOString().slice(0, 10);
const esc = (s) => String(s ?? "").replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));
let body = "", cost = 0, total = 0;
for (const l of picked) {
  const x = await readSite({ id: l.id, name: l.display_name, url: l.website, city: l.based_in }, { key: E.MISTRAL_API_KEY, today });
  cost += x.cost; total += x.events.length;
  console.log(`\n# ${l.display_name} (${l.based_in}) => ${x.status} ${x.detail} $${x.cost.toFixed(4)}`);
  body += `<h2>${esc(l.display_name)} <small>${esc(l.based_in)}</small></h2><p>${esc(x.status)} ${esc(x.detail)}</p>`;
  for (const e of x.events) {
    console.log(`  - ${e.title} | ${dateRange(e)} | ${e.start_time || "-"} | ${[e.venue, e.address, e.chapter].filter(Boolean).join(", ")} | booking ${e.booking_url ? "yes" : "no"} | text ${e.description ? e.description.length : 0} | img ${e.image_url ? "yes" : "no"}\n      quoted: ${e.evidence.date_text}\n      flags: ${e.flags.map((f) => `${f.field}: ${f.message}`).join(" / ") || "none"}\n      ${e.source_url}`);
    body += `<table><tr><th>Event<td><b>${esc(e.title)}</b> (${esc(e.event_type)})<tr><th>Dates<td>${esc(dateRange(e))}${e.start_time ? `, ${esc(e.start_time)}` : ""}<br><small>On the page: ${esc(e.evidence.date_text)}</small><tr><th>Place<td>${esc([e.venue, e.address, e.chapter].filter(Boolean).join(", "))}<tr><th>Text<td>${esc(e.description || "none")}<tr><th>To check<td>${esc(e.flags.map((f) => `${f.field}: ${f.message}`).join("; ") || "nothing")}<tr><th>Source<td><a href="${esc(e.source_url)}">${esc(e.source_url)}</a></table>`;
  }
}
mkdirSync(join(ROOT, "reports"), { recursive: true });
writeFileSync(join(ROOT, "reports", "C8-trial.html"), `<!doctype html><meta charset="utf-8"><title>AI events trial</title><style>body{font:15px/1.5 system-ui;max-width:1000px;margin:24px auto;padding:0 16px}table{border-collapse:collapse;width:100%;margin:0 0 14px}td,th{border:1px solid #ccc;padding:6px;text-align:left;vertical-align:top}th{width:90px}</style><h1>AI events trial, ${today}</h1><p>${picked.length} websites, ${total} drafts, AI cost $${cost.toFixed(4)}. Read-only: nothing saved to the website.</p>${body}`);
console.log(`\n${picked.length} sites, ${total} drafts, $${cost.toFixed(4)} — reports/C8-trial.html`);
