import React, { useState, useEffect } from "react";
import { base44 } from "@/api/base44Client";
import { Loader2, Search, Trash2, Check, Download } from "lucide-react";

/**
 * Newsletter subscribers.
 *
 * Read access is admin-only because this is personal data. Deleting requires
 * migration 012 — before that there was no delete policy at all, so an
 * unsubscribe request could not be honoured from the interface.
 */
export default function AdminSubscribersPanel() {
  const [subscribers, setSubscribers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [query, setQuery] = useState("");
  const [busyId, setBusyId] = useState(null);
  const [confirmId, setConfirmId] = useState(null);
  const [error, setError] = useState("");
  const [done, setDone] = useState("");

  const load = () => {
    setLoading(true);
    base44.entities.NewsletterSubscriber.list("-created_date", 500)
      .then(setSubscribers)
      .catch((e) => setError(String(e?.message || e)))
      .finally(() => setLoading(false));
  };

  useEffect(load, []);

  const remove = async (s) => {
    setError("");
    setBusyId(s.id);
    try {
      await base44.entities.NewsletterSubscriber.delete(s.id);
      setSubscribers((prev) => prev.filter((x) => x.id !== s.id));
      setDone(`${s.email} removed.`);
      setTimeout(() => setDone(""), 2500);
    } catch (e) {
      const msg = String(e?.message || e);
      setError(
        /row-level security|policy|coerce/i.test(msg)
          ? "Could not remove. Run migration 012_admin_delete_subscribers.sql in Supabase."
          : msg
      );
    } finally {
      setBusyId(null);
      setConfirmId(null);
    }
  };

  /** Export as CSV so the list can be used in a mailing tool. */
  const exportCsv = () => {
    const rows = [
      ["email", "consent", "source", "subscribed"],
      ...subscribers.map((s) => [
        s.email,
        s.consent ? "yes" : "no",
        s.source || "",
        s.created_date || "",
      ]),
    ];
    const csv = rows
      .map((r) => r.map((v) => `"${String(v).replace(/"/g, '""')}"`).join(","))
      .join("\n");
    const url = URL.createObjectURL(new Blob([csv], { type: "text/csv" }));
    const a = document.createElement("a");
    a.href = url;
    a.download = `afc-subscribers-${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const filtered = subscribers.filter((s) =>
    (s.email || "").toLowerCase().includes(query.trim().toLowerCase())
  );

  return (
    <div className="border border-border bg-card p-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h3 className="font-heading text-2xl tracking-[-0.01em]">Newsletter</h3>
          <p className="mt-2 text-sm text-muted-foreground">
            {subscribers.length} subscriber{subscribers.length === 1 ? "" : "s"}.
            Remove anyone who asks to be unsubscribed.
          </p>
        </div>
        {subscribers.length > 0 && (
          <button
            type="button"
            onClick={exportCsv}
            className="flex items-center gap-2 border border-border px-4 py-2 font-mono-caps text-[11px] text-muted-foreground transition-colors hover:border-primary hover:text-primary"
          >
            <Download className="h-3 w-3" /> Export CSV
          </button>
        )}
      </div>

      <div className="relative mt-6">
        <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
        <input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Search by email"
          className="w-full border border-border bg-background py-3 pl-10 pr-4 text-base outline-none focus:border-primary"
        />
      </div>

      {error && <p className="mt-4 text-sm text-destructive">{error}</p>}
      {done && (
        <p className="mt-4 flex items-center gap-2 text-sm text-primary">
          <Check className="h-4 w-4" /> {done}
        </p>
      )}

      {loading ? (
        <div className="flex justify-center py-10">
          <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
        </div>
      ) : filtered.length === 0 ? (
        <p className="py-10 text-center text-sm text-muted-foreground">
          {subscribers.length === 0 ? "No subscribers yet." : "Nobody matches that search."}
        </p>
      ) : (
        <ul className="mt-6 divide-y divide-border border-t border-border">
          {filtered.map((s) => (
            <li key={s.id} className="flex flex-wrap items-center gap-3 py-4">
              <div className="min-w-0 flex-1">
                <p className="truncate font-body text-sm">{s.email}</p>
                <p className="truncate font-mono-caps text-[10px] text-muted-foreground">
                  {s.source || "unknown source"}
                  {s.consent === false ? " · NO CONSENT" : ""}
                </p>
              </div>
              <div className="flex items-center gap-2">
                {busyId === s.id && (
                  <Loader2 className="h-3 w-3 animate-spin text-muted-foreground" />
                )}
                {confirmId === s.id ? (
                  <>
                    <button
                      type="button"
                      onClick={() => remove(s)}
                      disabled={busyId === s.id}
                      className="border border-destructive px-3 py-1.5 font-mono-caps text-[10px] text-destructive transition-colors hover:bg-destructive hover:text-background disabled:opacity-50"
                    >
                      Remove permanently
                    </button>
                    <button
                      type="button"
                      onClick={() => setConfirmId(null)}
                      className="px-2 font-mono-caps text-[10px] text-muted-foreground hover:text-foreground"
                    >
                      Cancel
                    </button>
                  </>
                ) : (
                  <button
                    type="button"
                    onClick={() => setConfirmId(s.id)}
                    disabled={busyId === s.id}
                    className="flex items-center gap-1.5 border border-border px-3 py-1.5 font-mono-caps text-[10px] text-muted-foreground transition-colors hover:border-destructive hover:text-destructive disabled:opacity-50"
                  >
                    <Trash2 className="h-3 w-3" /> Remove
                  </button>
                )}
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}