import React, { useCallback, useEffect, useMemo, useState } from "react";
import { AlertTriangle, ExternalLink, Loader2, Play } from "lucide-react";
import { base44 } from "@/api/base44Client";
import { useDataRevision } from "@/lib/dataRevision";
import { loadAll } from "@/lib/loadAll";
import { CHAPTER_OPTIONS } from "@/lib/chaptersData";
import { CHAPTER_ZONES, EVENT_TYPES, dateRange, daysWaiting, draftSection } from "@/lib/aiEvents";

/**
 * Admin → AI Events (C8): review what the weekly check found, choose which
 * websites it reads, and see each week's report. Every approval goes through
 * a database function (034), so nothing here can publish by itself.
 */
const SECTIONS = [
  ["ready", "Ready to review"], ["checking", "Needs checking"], ["duplicates", "Possible duplicates"],
  ["organiser", "Awaiting organiser"], ["websites", "Websites"], ["history", "History"], ["settings", "Settings"],
];
const btn = "border border-border px-3 py-1.5 font-mono-caps text-[10px] text-muted-foreground transition-colors hover:border-primary hover:text-primary disabled:opacity-50";
const box = "w-full border border-border bg-background px-3 py-2 text-sm outline-none focus:border-primary";
const STATUS = { ok: "Read", unchanged: "No change", robots: "Not allowed by the site", blocked: "Blocked", empty: "Needs a browser", error: "Problem" };
const STATE = { checked: "Checked (trial)", published: "Published", rejected: "Rejected", declined: "Organiser declined" };
const when = (d) => (d ? new Date(d).toLocaleString("en-GB", { day: "numeric", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" }) : "never");

export default function AdminAiEventsPanel() {
  const [drafts, setDrafts] = useState([]);
  const [sources, setSources] = useState([]);
  const [runs, setRuns] = useState([]);
  const [settings, setSettings] = useState(null);
  const [section, setSection] = useState("ready");
  const [editing, setEditing] = useState(null);
  const [busy, setBusy] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [done, setDone] = useState("");
  const [progress, setProgress] = useState(null);
  const rev = useDataRevision();

  const load = useCallback(async () => {
    try {
      const all = (e, sort) => (e.page ? loadAll(e, { sort }) : e.list(sort, 1000));
      const [d, s, r, set] = await Promise.all([
        all(base44.entities.AiEventDraft, "-created_date"), all(base44.entities.AiEventSource, "name"),
        base44.entities.AiEventRun.list("-started_at", 20), base44.entities.AiEventSettings.list("updated_date", 1),
      ]);
      setDrafts(d); setSources(s); setRuns(r); setSettings(set[0] || null); setError("");
    } catch (e) { setError(`Could not load AI events: ${e?.message || e}`); } finally { setLoading(false); }
  }, []);
  // Held while editing, so returning to the window never wipes typed text.
  useEffect(() => { if (!editing) load(); }, [rev, editing, load]);

  const counts = useMemo(() => drafts.reduce((m, d) => { const k = draftSection(d); m[k] = (m[k] || 0) + 1; return m; }, {}), [drafts]);
  const say = (m) => { setDone(m); setError(""); };

  const act = async (d, action, patch = {}, note = null) => {
    setBusy(d.id); setError(""); setDone("");
    try {
      const state = await base44.auth.reviewAiEvent({ draftId: d.id, action, patch, note });
      setEditing(null);
      await load();
      say(action === "save" ? "Saved." : state === "published" ? `“${d.title}” is now live.` : state === "awaiting_organiser" ? "Approved. Waiting for the organiser." : state === "checked" ? "Marked as checked. Nothing was published (trial)." : state === "rejected" ? "Rejected. It will not be suggested again unless its dates change." : "Done.");
      return true;
    } catch (e) { setError(String(e?.message || e)); return false; } finally { setBusy(null); }
  };

  const run = async () => {
    setError(""); setDone(""); setProgress({ checked: 0, total: sources.filter((s) => s.active).length });
    try {
      let last = -1, stuck = 0;
      for (;;) {
        const p = await base44.auth.runAiEventCheck();
        setProgress(p);
        if (p.done) break;
        stuck = p.checked === last ? stuck + 1 : 0;
        last = p.checked;
        if (stuck > 5) throw new Error("The check is not moving. Press Run now to continue.");
      }
      await load();
      say("The check is finished.");
    } catch (e) { setError(String(e?.message || e)); } finally { setProgress(null); }
  };

  if (loading) return <div className="flex justify-center py-10"><Loader2 className="h-5 w-5 animate-spin text-muted-foreground" /></div>;

  const rows = drafts.filter((d) => draftSection(d) === section);
  const lastRun = runs[0];
  return (
    <div className="border border-border bg-card p-4 sm:p-6" data-testid="ai-events">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h3 className="font-heading text-2xl tracking-[-0.01em]">AI Events</h3>
          <p className="mt-2 text-sm text-muted-foreground">
            The AI reads gallery websites and prepares drafts. Nothing is public until it is approved.
            {" "}Last check: {when(lastRun?.started_at)}. Weekly schedule: {settings?.schedule_on ? "on (Monday morning, Hong Kong)" : "off"}.
          </p>
        </div>
        <button type="button" onClick={run} disabled={!!progress || !sources.some((s) => s.active)} className={`${btn} inline-flex items-center gap-2 border-primary text-primary`}>
          {progress ? <Loader2 className="h-3 w-3 animate-spin" /> : <Play className="h-3 w-3" />}
          {progress ? `Checking ${progress.checked ?? 0} of ${progress.total ?? "…"}` : "Run now"}
        </button>
      </div>

      {settings?.trial_mode !== false && (
        <p className="mt-4 border border-yellow-600/50 bg-yellow-500/10 p-3 text-sm text-yellow-600">Trial: nothing here is public. Approve only marks a draft as checked.</p>
      )}
      {error && <p className="mt-4 text-sm text-destructive" role="alert">{error}</p>}
      {done && <p className="mt-4 text-sm text-primary" role="status">{done}</p>}

      <div className="mt-5 flex flex-wrap gap-2">
        {SECTIONS.map(([k, label]) => (
          <button key={k} type="button" onClick={() => { setSection(k); setEditing(null); }} aria-pressed={section === k} className={`${btn} ${section === k ? "border-primary text-primary" : ""}`}>
            {label}{!["websites", "history", "settings"].includes(k) ? ` (${counts[k] || 0})` : ""}
          </button>
        ))}
      </div>

      {section === "websites" ? <Websites sources={sources} reload={load} say={say} setError={setError} />
        : section === "settings" ? settings ? <Settings key={settings.updated_date} settings={settings} reload={load} say={say} setError={setError} /> : <p className="py-8 text-sm text-muted-foreground">Settings are not set up yet.</p>
        : (
          <>
            {section === "history" && <Runs runs={runs} />}
            {rows.length === 0 ? <p className="py-10 text-center text-sm text-muted-foreground">{section === "history" ? "No decisions yet." : "Nothing here."}</p> : (
              <ul className="mt-5 divide-y divide-border border-t border-border">
                {rows.map((d) => (
                  <DraftRow key={d.id} d={d} busy={busy === d.id} editing={editing === d.id} setEditing={setEditing} act={act} dup={d.duplicate_of} trial={settings?.trial_mode !== false} />
                ))}
              </ul>
            )}
          </>
        )}
    </div>
  );
}

function DraftRow({ d, busy, editing, setEditing, act, dup, trial }) {
  const [other, setOther] = useState(null);
  useEffect(() => {
    let alive = true;
    const id = dup || d.update_of;
    setOther(null);
    if (id) base44.entities.Event.get(id).then((e) => alive && setOther(e)).catch(() => {});
    return () => { alive = false; };
  }, [dup, d.update_of]);
  const open = ["new", "changes"].includes(d.state);
  const late = d.state === "awaiting_organiser" && daysWaiting(d) >= 7;
  return (
    <li className="py-5">
      <p className="break-words font-heading text-xl">{d.title}</p>
      <p className="mt-1 text-sm text-muted-foreground [overflow-wrap:anywhere]">
        {dateRange(d)}{d.start_time ? ` · ${String(d.start_time).slice(0, 5)}` : ""} · {[d.venue, d.address, d.chapter].filter(Boolean).join(", ") || "location missing"} · {d.event_type}
        {STATE[d.state] ? ` · ${STATE[d.state]}` : ""}
        {late ? " · No reply from the organiser" : d.state === "awaiting_organiser" ? ` · waiting ${daysWaiting(d)} day${daysWaiting(d) === 1 ? "" : "s"}` : ""}
      </p>
      {d.note && <p className="mt-2 text-sm text-yellow-600">Note: {d.note}</p>}
      {d.update_of && open && <p className="mt-2 text-sm text-yellow-600">Approving will update the existing event{other ? ` “${other.title}”` : ""}.</p>}
      {open && (d.flags || []).length > 0 && (
        <ul className="mt-2 space-y-1">
          {d.flags.map((f, i) => (
            <li key={i} className="flex items-start gap-2 text-sm text-yellow-600"><AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" /><span>{String(f.field || "").replace(/_/g, " ")}: {f.message}</span></li>
          ))}
        </ul>
      )}
      {dup && (
        <div className="mt-3 border border-yellow-600/50 p-3 text-sm">
          <p className="text-yellow-600">May already be on the site{other ? ":" : "."}</p>
          {other && <p className="mt-1">{other.title} · {new Date(other.start_date).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" })} · {other.venue}</p>}
          <div className="mt-2 flex flex-wrap gap-2">
            <button type="button" className={btn} disabled={busy} onClick={() => act(d, "keep_both")}>Keep both</button>
            <button type="button" className={btn} disabled={busy} onClick={() => act(d, "update_existing")}>Update existing</button>
            <button type="button" className={btn} disabled={busy} onClick={() => act(d, "reject", {}, "Duplicate")}>Skip</button>
          </div>
        </div>
      )}
      {d.evidence?.date_text && <p className="mt-2 text-xs text-muted-foreground">On the page: “{d.evidence.date_text}”</p>}
      <div className="mt-3 flex flex-wrap items-center gap-2">
        <a href={d.source_url} target="_blank" rel="noreferrer" className={`${btn} inline-flex items-center gap-1`}><ExternalLink className="h-3 w-3" /> View source</a>
        {(open || d.state === "awaiting_organiser") && <button type="button" className={btn} disabled={busy} onClick={() => setEditing(editing ? null : d.id)}>{editing ? "Close" : "Edit"}</button>}
        {open && !dup && <button type="button" className={`${btn} border-primary text-primary`} disabled={busy || editing} onClick={() => act(d, "approve")}>{trial ? "Approve (trial)" : "Approve"}</button>}
        {(open || d.state === "awaiting_organiser") && <button type="button" className={btn} disabled={busy} onClick={() => act(d, "reject")}>Reject</button>}
        {["rejected", "declined", "checked"].includes(d.state) && <button type="button" className={btn} disabled={busy} onClick={() => act(d, "restore")}>Review again</button>}
        {busy && <Loader2 className="h-4 w-4 animate-spin" />}
      </div>
      {editing && <EditDraft d={d} busy={busy} save={(p) => act(d, "save", p)} />}
    </li>
  );
}

function EditDraft({ d, busy, save }) {
  const [f, setF] = useState(() => Object.fromEntries(["title", "description", "event_type", "start_date", "end_date", "start_time", "end_time", "timezone", "venue", "address", "chapter", "organiser", "booking_url"].map((k) => [k, /_time$/.test(k) ? String(d[k] || "").slice(0, 5) : d[k] || ""])));
  const set = (k, v) => setF((x) => ({ ...x, [k]: v, ...(k === "chapter" && CHAPTER_ZONES[v] ? { timezone: CHAPTER_ZONES[v] } : {}) }));
  const label = (k, text, child) => <label key={k} className="block font-mono-caps text-[10px] text-muted-foreground">{text}<div className="mt-1">{child}</div></label>;
  const input = (k, text, type = "text") => label(k, text, <input type={type} className={box} value={f[k]} onChange={(e) => set(k, e.target.value)} />);
  return (
    <form className="mt-4 grid gap-3 border border-border p-4 md:grid-cols-2" onSubmit={(e) => { e.preventDefault(); save(f); }}>
      {input("title", "Title")}
      {label("event_type", "Type", <select className={box} value={f.event_type} onChange={(e) => set("event_type", e.target.value)}>{EVENT_TYPES.map((t) => <option key={t}>{t}</option>)}</select>)}
      {input("start_date", "Starts", "date")}{input("end_date", "Ends", "date")}
      {input("start_time", "Start time (leave empty if not known)", "time")}{input("end_time", "End time", "time")}
      {label("chapter", "Chapter", <select className={box} value={f.chapter} onChange={(e) => set("chapter", e.target.value)}><option value="">Choose…</option>{CHAPTER_OPTIONS.map((c) => <option key={c}>{c}</option>)}</select>)}
      {label("timezone", "Time zone", <select className={box} value={f.timezone} onChange={(e) => set("timezone", e.target.value)}><option value="">—</option>{[...new Set([...Object.values(CHAPTER_ZONES), "UTC"])].map((z) => <option key={z}>{z}</option>)}</select>)}
      {input("venue", "Venue")}{input("address", "Address")}{input("organiser", "Organiser")}{input("booking_url", "Booking link", "url")}
      <div className="md:col-span-2">{label("description", "Description", <textarea rows={4} className={box} value={f.description} onChange={(e) => set("description", e.target.value)} />)}</div>
      <p className="text-xs text-muted-foreground md:col-span-2 [overflow-wrap:anywhere]">Source (kept): {d.source_url}</p>
      <div><button type="submit" disabled={busy} className={`${btn} border-primary text-primary`}>Save changes</button></div>
    </form>
  );
}

function Websites({ sources, reload, say, setError }) {
  const [q, setQ] = useState("");
  const [found, setFound] = useState([]);
  const [manual, setManual] = useState({ name: "", url: "", city: "" });
  const [busy, setBusy] = useState(false);
  const [confirm, setConfirm] = useState(null);
  const guard = async (fn, msg) => { setBusy(true); setError(""); try { await fn(); await reload(); say(msg); } catch (e) { setError(/duplicate key/i.test(e?.message) ? "That listing is already on the list." : String(e?.message || e)); } finally { setBusy(false); } };
  const search = async (e) => {
    e.preventDefault();
    if (!q.trim()) return;
    setBusy(true); setError("");
    try {
      const { rows } = await base44.entities.CollectorProfile.page({ where: { status: "approved" }, search: { q: q.trim(), columns: ["display_name", "based_in"] }, columns: "id,display_name,based_in,website", limit: 25 });
      const have = new Set(sources.map((s) => s.listing_id));
      setFound(rows.filter((r) => /^https?:\/\//i.test(r.website || "") && !have.has(r.id)));
      if (!rows.length) say("No listing matches.");
    } catch (x) { setError(String(x?.message || x)); } finally { setBusy(false); }
  };
  return (
    <div className="mt-6 space-y-6">
      <form onSubmit={search} className="flex flex-wrap gap-2">
        <input className={`${box} max-w-sm`} value={q} onChange={(e) => setQ(e.target.value)} placeholder="Find a listing by name or city" aria-label="Find a listing" />
        <button type="submit" disabled={busy} className={btn}>Search listings</button>
      </form>
      {found.length > 0 && (
        <ul className="divide-y divide-border border border-border">
          {found.map((r) => (
            <li key={r.id} className="flex flex-wrap items-center justify-between gap-2 p-3 text-sm">
              <span className="min-w-0 break-words">{r.display_name} <span className="text-muted-foreground">· {r.based_in} · {r.website}</span></span>
              <button type="button" disabled={busy} className={btn} onClick={() => guard(async () => { await base44.entities.AiEventSource.create({ listing_id: r.id, name: r.display_name, url: r.website.trim(), city: r.based_in || null }); setFound((f) => f.filter((x) => x.id !== r.id)); }, `${r.display_name} added.`)}>Add</button>
            </li>
          ))}
        </ul>
      )}
      <form className="grid gap-2 md:grid-cols-4" onSubmit={(e) => { e.preventDefault(); guard(async () => { await base44.entities.AiEventSource.create({ name: manual.name.trim(), url: manual.url.trim(), city: manual.city.trim() || null }); setManual({ name: "", url: "", city: "" }); }, "Website added."); }}>
        <input required className={box} value={manual.name} onChange={(e) => setManual({ ...manual, name: e.target.value })} placeholder="Or add another: name" aria-label="Name" />
        <input required type="url" pattern="https?://.+" className={box} value={manual.url} onChange={(e) => setManual({ ...manual, url: e.target.value })} placeholder="https://…" aria-label="Website" />
        <input className={box} value={manual.city} onChange={(e) => setManual({ ...manual, city: e.target.value })} placeholder="City (if only one)" aria-label="City" />
        <button type="submit" disabled={busy} className={btn}>Add website</button>
      </form>
      <p className="text-sm text-muted-foreground">{sources.filter((s) => s.active).length} of {sources.length} websites active.</p>
      <ul className="divide-y divide-border border-t border-border">
        {sources.map((s) => (
          <li key={s.id} className="flex flex-wrap items-center justify-between gap-3 py-3 text-sm">
            <div className="min-w-0">
              <p className={s.active ? "" : "text-muted-foreground line-through"}>{s.name}</p>
              <p className="text-xs text-muted-foreground [overflow-wrap:anywhere]">{s.url} · {s.city || "no city"} · last check {when(s.last_checked)}{s.last_status ? ` · ${STATUS[s.last_status] || s.last_status}` : ""}{s.last_detail ? ` (${s.last_detail})` : ""}</p>
            </div>
            <div className="flex gap-2">
              {/* Forgetting the last reading makes a resumed site be read again. */}
              <button type="button" disabled={busy} className={btn} onClick={() => guard(() => base44.entities.AiEventSource.update(s.id, { active: !s.active, last_hash: null }), s.active ? "Paused." : "Active again.")}>{s.active ? "Pause" : "Resume"}</button>
              {confirm === s.id
                ? <button type="button" disabled={busy} className={`${btn} border-destructive text-destructive`} onClick={() => guard(() => base44.entities.AiEventSource.delete(s.id), "Removed. Its drafts are kept.")}>Confirm remove</button>
                : <button type="button" disabled={busy} className={btn} onClick={() => setConfirm(s.id)}>Remove</button>}
            </div>
          </li>
        ))}
      </ul>
    </div>
  );
}

function Runs({ runs }) {
  if (!runs.length) return null;
  return (
    <div className="mt-6">
      <p className="font-mono-caps text-[11px] text-muted-foreground">Weekly reports</p>
      <ul className="mt-2 divide-y divide-border border-y border-border">
        {runs.map((r) => {
          const res = r.results || [];
          const bad = res.filter((x) => !["ok", "unchanged"].includes(x.status));
          return (
            <li key={r.id} className="py-3 text-sm">
              <details>
                <summary className="cursor-pointer">{when(r.started_at)} · {r.status} · {res.length} of {(r.source_ids || []).length} checked · {res.reduce((n, x) => n + (x.found || 0), 0)} drafts · {bad.length} could not be checked · AI ${Number(r.cost_usd || 0).toFixed(3)} · {r.report_sent_at ? "email sent" : r.report_error || "no email"}</summary>
                <ul className="mt-2 space-y-1 pl-4 text-xs text-muted-foreground">
                  {res.map((x, i) => <li key={i}>{x.name}: {STATUS[x.status] || x.status}{x.detail ? ` (${x.detail})` : ""} · {x.found || 0} drafts</li>)}
                </ul>
              </details>
            </li>
          );
        })}
      </ul>
    </div>
  );
}

function Settings({ settings, reload, say, setError }) {
  const [emails, setEmails] = useState((settings.report_emails || []).join(", "));
  const [busy, setBusy] = useState(false);
  const [confirm, setConfirm] = useState(false);
  const save = async (patch, msg) => {
    setBusy(true); setError("");
    try { await base44.entities.AiEventSettings.update(settings.id, { ...patch, updated_date: new Date().toISOString() }); await reload(); say(msg); } catch (e) { setError(String(e?.message || e)); } finally { setBusy(false); setConfirm(false); }
  };
  const list = emails.split(/[,\s]+/).filter(Boolean);
  const bad = list.filter((x) => !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(x));
  return (
    <div className="mt-6 max-w-xl space-y-6 text-sm">
      <div>
        <p>Weekly schedule: <b>{settings.schedule_on ? "on" : "off"}</b></p>
        <button type="button" disabled={busy} className={`${btn} mt-2`} onClick={() => save({ schedule_on: !settings.schedule_on }, settings.schedule_on ? "Schedule off." : "Schedule on. It runs early Monday morning, Hong Kong time.")}>{settings.schedule_on ? "Turn off" : "Turn on"}</button>
      </div>
      <div>
        <p>Trial: <b>{settings.trial_mode ? "on" : "off"}</b></p>
        <p className="text-muted-foreground">{settings.trial_mode ? "Approve only marks drafts as checked." : "Approved events are published."}</p>
        {settings.trial_mode && !confirm
          ? <button type="button" disabled={busy} className={`${btn} mt-2`} onClick={() => setConfirm(true)}>End trial</button>
          : <button type="button" disabled={busy} className={`${btn} mt-2 ${settings.trial_mode ? "border-destructive text-destructive" : ""}`} onClick={() => save({ trial_mode: !settings.trial_mode }, settings.trial_mode ? "Trial ended. Approved events will be published." : "Trial on. Nothing will be published.")}>{settings.trial_mode ? "Confirm: approved events go live" : "Turn trial on"}</button>}
      </div>
      <div>
        <label className="block" htmlFor="ai-report-emails">Send the weekly report to</label>
        <input id="ai-report-emails" className={`${box} mt-2`} value={emails} onChange={(e) => setEmails(e.target.value)} placeholder="name@example.com, name@example.com" />
        {bad.length > 0 && <p className="mt-1 text-destructive">Not an email: {bad.join(", ")}</p>}
        <button type="button" disabled={busy || bad.length > 0} className={`${btn} mt-2`} onClick={() => save({ report_emails: list }, "Saved.")}>Save emails</button>
      </div>
    </div>
  );
}
