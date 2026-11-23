/**
 * How many websites can a weekly run handle? Reads every gallery website of
 * one city, READ-ONLY, nothing saved.  node scripts/trial-ai-events-many.mjs "Hong Kong"
 */
import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { readSite } from "../api/_lib/aiEventsJob.js";
import { hostOf, isSocial, listingFits, siteKey } from "../src/lib/aiEvents.js";
const E = Object.fromEntries(readFileSync(".env", "utf8").split(/\r?\n/).filter((l) => /^[A-Z_]+=/.test(l)).map((l) => [l.slice(0, l.indexOf("=")), l.slice(l.indexOf("=") + 1).trim()]));
const city = process.argv[2] || "Hong Kong";
const rows = await fetch(`${E.VITE_SUPABASE_URL}/rest/v1/collector_profile?select=id,display_name,based_in,website,type&website=not.is.null&limit=1000`, { headers: { apikey: E.VITE_SUPABASE_ANON_KEY, Authorization: `Bearer ${E.VITE_SUPABASE_ANON_KEY}` } }).then((r) => r.json());
const seen = new Set();
const list = rows.filter((r) => { const k = siteKey(r.website); if (!/^https?:/i.test(r.website) || !k || isSocial(r.website) || seen.has(k) || ["Collector", "Curator", "Advisor", "Art Store", "Framer", "Printer"].includes(r.type) || !listingFits(r.based_in, city)) return false; seen.add(k); return true; });
const today = new Date().toISOString().slice(0, 10), t0 = Date.now(), done = [], todo = [...list];
const worker = async () => { for (let l = todo.shift(); l; l = todo.shift()) { const t = Date.now(); const x = await readSite({ id: l.id, name: l.display_name, url: l.website.trim(), city: l.based_in }, { key: E.MISTRAL_API_KEY, today }); done.push({ ...x, name: l.display_name, host: hostOf(l.website), ms: Date.now() - t }); if (done.length % 20 === 0) console.log(done.length, "of", list.length, Math.round((Date.now() - t0) / 1000) + "s"); } };
await Promise.all(Array.from({ length: 6 }, worker));
const by = {}; for (const d of done) by[d.status] = (by[d.status] || 0) + 1;
const ev = done.flatMap((d) => d.events), ms = done.map((d) => d.ms).sort((a, b) => a - b);
console.log(city, list.length, "websites in", Math.round((Date.now() - t0) / 1000), "s;", JSON.stringify(by), "; drafts", ev.length, "dated", ev.filter((e) => e.start_date).length, "no hard flags", ev.filter((e) => !e.flags.some((f) => !f.soft)).length, "; $" + done.reduce((n, d) => n + d.cost, 0).toFixed(3), "; per site median", ms[ms.length >> 1], "p95", ms[Math.floor(ms.length * 0.95)], "max", ms.at(-1));
const why = {}; for (const d of done) if (!["ok"].includes(d.status)) why[d.status + ": " + d.detail] = (why[d.status + ": " + d.detail] || 0) + 1; console.log(why);
console.log("titles with Chinese:", ev.filter((e) => /[\u4e00-\u9fff]/.test(e.title)).slice(0, 8).map((e) => `${e.title} | ${e.start_date} | ${e.evidence.date_text}`));
mkdirSync("reports", { recursive: true }); writeFileSync("reports/C8-many.json", JSON.stringify(done, null, 1));
