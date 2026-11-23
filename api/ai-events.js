/**
 * The AI events check (C8).
 *
 *   GET  from Vercel's schedule (vercel.json): starts or continues the weekly
 *        check. Needs CRON_SECRET. Does nothing while the schedule is off.
 *   POST from Admin → AI Events, signed in as admin: "Run now". Each call
 *        works for a short while and says whether there is more to do.
 *
 * Saves drafts only. Publishing happens in the database (migration 034).
 */
import { timingSafeEqual } from "node:crypto";
import { makeDb, sendReport, startRun, stepRun } from "./_lib/aiEventsJob.js";

export const config = { maxDuration: 300 };

const same = (a, b) => { const x = Buffer.from(String(a)), y = Buffer.from(String(b)); return x.length === y.length && timingSafeEqual(x, y); };

async function isAdmin(url, anon, token) {
  const H = { apikey: anon, Authorization: `Bearer ${token}`, "Content-Type": "application/json" };
  const r = await fetch(`${url}/rest/v1/rpc/is_admin`, { method: "POST", headers: H, body: "{}", signal: AbortSignal.timeout(10000) });
  return r.ok && (await r.json()) === true;
}

export default async function handler(req, res) {
  res.setHeader("Cache-Control", "no-store");
  const env = process.env;
  const url = (env.VITE_SUPABASE_URL || env.SUPABASE_URL || "").replace(/\/+$/, "");
  const anon = env.VITE_SUPABASE_ANON_KEY || env.SUPABASE_ANON_KEY || "";
  const missing = [["SUPABASE_SERVICE_ROLE_KEY", env.SUPABASE_SERVICE_ROLE_KEY], ["MISTRAL_API_KEY", env.MISTRAL_API_KEY]].filter((x) => !x[1]).map((x) => x[0]);
  const token = String(req.headers.authorization || "").replace(/^Bearer\s+/i, "");
  const send = (code, body) => { res.statusCode = code; res.setHeader("Content-Type", "application/json"); res.end(JSON.stringify(body)); };

  try {
    const cron = req.method === "GET";
    if (cron) {
      if (!env.CRON_SECRET || !token || !same(token, env.CRON_SECRET)) return send(401, { error: "Not allowed." });
    } else if (req.method === "POST") {
      if (!token || !url || !anon || !(await isAdmin(url, anon, token))) return send(403, { error: "Only an admin can run the check." });
    } else return send(405, { error: "Not allowed." });
    if (!url || missing.length) return send(503, { error: `Not set up yet: ${missing.join(", ")}` });

    const db = makeDb(url, env.SUPABASE_SERVICE_ROLE_KEY);
    const cfg = {
      key: env.MISTRAL_API_KEY, resendKey: env.RESEND_API_KEY, from: env.REPORT_FROM_EMAIL,
      siteUrl: (env.VITE_SITE_URL || "https://www.artfutureclub.com").replace(/\/+$/, ""),
      // Admin calls return quickly and are repeated; the schedule works longer.
      deadline: Date.now() + (cron ? 190_000 : 20_000),
    };
    if (cron) {
      const [s] = await db.get("ai_event_settings?select=*");
      const step = new URL(req.url, "http://x").searchParams.get("step");
      const running = await db.get("ai_event_run?status=eq.running&select=id");
      // "start" begins the week; later calls only finish what is unfinished.
      if (!running.length) {
        if (!s?.schedule_on || step !== "start") return send(200, { idle: true });
        await startRun(db, "schedule");
      }
      const p = await stepRun(db, cfg);
      if (!p.done && !p.busy && step === "last") {
        const [run] = await db.update("ai_event_run?status=eq.running", { status: "failed", finished_at: new Date().toISOString() });
        if (run) await sendReport(db, run, cfg);
      }
      return send(200, p);
    }
    const started = await startRun(db, "manual");
    const p = await stepRun(db, cfg);
    return send(200, { ...p, resumed: !started.started });
  } catch (e) {
    console.error("ai-events", e?.message);
    return send(500, { error: "The check hit a problem. Press Run now to continue." });
  }
}
