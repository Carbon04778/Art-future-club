import React, { useEffect, useState } from "react";
import { ExternalLink, Loader2 } from "lucide-react";
import { base44 } from "@/api/base44Client";
import { useDataRevision } from "@/lib/dataRevision";
import { dateRange } from "@/lib/aiEvents";

/**
 * A gallery owner approves events the AFC team prepared for their listing
 * (C8). The database only returns drafts for listings this member owns.
 */
export default function OrganiserEventDrafts({ user }) {
  const [rows, setRows] = useState([]);
  const [asking, setAsking] = useState(null);
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(null);
  const [msg, setMsg] = useState("");
  const rev = useDataRevision();

  useEffect(() => {
    if (!user?.id) return undefined;
    let alive = true;
    (async () => {
      const mine = await base44.entities.CollectorProfile.filter({ user_id: user.id }, "-created_date", 20).catch(() => []);
      // An admin can read every draft; here they see only their own listings'.
      const list = mine.length
        ? await base44.entities.AiEventDraft.filter({ state: "awaiting_organiser", listing_id: { $in: mine.map((m) => m.id) } }, "start_date", 100).catch(() => [])
        : [];
      if (alive) setRows(list);
    })();
    return () => { alive = false; };
  }, [user?.id, rev]);

  const act = async (d, action, text = null) => {
    setBusy(d.id); setMsg("");
    try {
      await base44.auth.organiserReviewAiEvent({ draftId: d.id, action, note: text });
      setRows((r) => r.filter((x) => x.id !== d.id));
      setAsking(null); setNote("");
      setMsg(action === "approve" ? `“${d.title}” is now live.` : action === "change" ? "Sent back to the AFC team." : `“${d.title}” will not be published.`);
    } catch (e) { setMsg(String(e?.message || e)); } finally { setBusy(null); }
  };

  if (!rows.length && !msg) return null;
  const btn = "border border-border px-4 py-2 font-mono-caps text-[10px] hover:border-primary hover:text-primary disabled:opacity-50";
  return (
    <section className="mb-10 border border-primary/60 p-5" data-testid="organiser-drafts">
      <h2 className="font-heading text-2xl">Events to approve</h2>
      <p className="mt-1 text-sm text-muted-foreground">Found on your website and checked by the AFC team. Nothing is public until you approve it.</p>
      {msg && <p className="mt-3 text-sm text-primary" role="status">{msg}</p>}
      <ul className="mt-4 divide-y divide-border">
        {rows.map((d) => (
          <li key={d.id} className="py-4">
            <p className="break-words font-heading text-xl">{d.title}</p>
            <p className="mt-1 text-sm text-muted-foreground">
              {dateRange(d)}{d.start_time ? ` · ${d.start_time.slice(0, 5)}${d.end_time ? `–${d.end_time.slice(0, 5)}` : ""}` : ""} · {[d.venue, d.address, d.chapter].filter(Boolean).join(", ")}
            </p>
            {d.description && <p className="mt-2 whitespace-pre-line text-sm">{d.description}</p>}
            <div className="mt-2 flex flex-wrap gap-4">
              {d.booking_url && <a href={d.booking_url} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 text-xs text-primary underline"><ExternalLink className="h-3 w-3" /> Booking link</a>}
              <a href={d.source_url} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 text-xs text-primary underline"><ExternalLink className="h-3 w-3" /> View source</a>
            </div>
            {asking === d.id ? (
              <div className="mt-3">
                <textarea value={note} onChange={(e) => setNote(e.target.value)} maxLength={1000} rows={2} aria-label="What should change?" placeholder="What should change?" className="w-full border border-border bg-transparent p-3 text-sm" />
                <div className="mt-2 flex gap-2">
                  <button type="button" className={btn} disabled={busy === d.id || !note.trim()} onClick={() => act(d, "change", note)}>Send</button>
                  <button type="button" className={btn} onClick={() => setAsking(null)}>Cancel</button>
                </div>
              </div>
            ) : (
              <div className="mt-3 flex flex-wrap items-center gap-2">
                <button type="button" className={`${btn} border-primary text-primary`} disabled={!!busy} onClick={() => act(d, "approve")}>Approve and publish</button>
                <button type="button" className={btn} disabled={!!busy} onClick={() => { setAsking(d.id); setNote(""); }}>Request a change</button>
                <button type="button" className={btn} disabled={!!busy} onClick={() => act(d, "decline")}>Decline</button>
                {busy === d.id && <Loader2 className="h-4 w-4 animate-spin" />}
              </div>
            )}
          </li>
        ))}
      </ul>
    </section>
  );
}
