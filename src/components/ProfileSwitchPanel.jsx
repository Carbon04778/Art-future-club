import React, { useEffect, useState } from "react";
import { base44 } from "@/api/base44Client";
import { Loader2 } from "lucide-react";
import { COLLECTOR_TYPES, isVenueType } from "@/lib/venueTypes";
import { DISCIPLINES } from "@/lib/disciplines";

/**
 * "Change profile type" on a member's own profile (A1 in
 * docs/CLIENT-REQUESTS.md).
 *
 * Julie: anyone who signed up as the wrong type can ask to switch, in either
 * direction, and it goes to the approval queue. Their profile stays as it is
 * until an admin approves. The request is made by a database function
 * (migration 027) — the profile itself is never changed from here.
 *
 * `currentType` is "Artist" or the space's type ("Collector", "Gallery", …).
 */
export const SWITCH_TYPES = ["Artist", ...COLLECTOR_TYPES];

const isArtistSide = (t) => t === "Artist";

/** What does and does not move across, for a given switch. */
export function switchConsequences(fromType, toType) {
  if (!toType || fromType === toType) return { moves: [], stays: [] };
  if (isArtistSide(fromType) === isArtistSide(toType)) {
    return { moves: ["Everything — it is the same profile with a different type"], stays: [] };
  }
  const moves = ["Name", "Profile photo", "Bio", "Location", "Website and social links", "Followers"];
  const stays = isArtistSide(fromType)
    ? ["Artworks", "CV (statement, exhibitions, education, awards)", "Disciplines"]
    : ["Address and opening hours", "Gallery works and exhibitions", "Cover photo"];
  return { moves, stays };
}

export default function ProfileSwitchPanel({ userId, currentType }) {
  const [requests, setRequests] = useState(null);
  const [open, setOpen] = useState(false);
  const [toType, setToType] = useState("");
  const [discipline, setDiscipline] = useState("");
  const [reason, setReason] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  const load = () =>
    base44.entities.ProfileSwitchRequest.filter({ user_id: userId }, "-created_date", 5)
      .then(setRequests)
      .catch(() => setRequests([]));

  useEffect(() => { if (userId) load(); }, [userId]);

  const pending = requests?.find((r) => r.status === "pending");
  const lastDone = requests?.find((r) => r.status === "rejected" || r.status === "approved");
  const { moves, stays } = switchConsequences(currentType, toType);
  const choices = SWITCH_TYPES.filter((t) => t !== currentType);
  const label = (t) => (isVenueType(t) ? `${t} (venue)` : t);

  const send = async (e) => {
    e.preventDefault();
    setBusy(true);
    setError("");
    try {
      await base44.auth.requestProfileSwitch({ toType, discipline: toType === "Artist" ? discipline : null, reason });
      setOpen(false);
      setToType(""); setDiscipline(""); setReason("");
      await load();
    } catch (err) {
      setError(String(err?.message || err) || "Could not send the request. Please try again.");
    } finally {
      setBusy(false);
    }
  };
  const cancel = async () => {
    setBusy(true);
    setError("");
    try { await base44.auth.cancelProfileSwitch(); await load(); }
    catch (err) { setError(String(err?.message || err)); }
    finally { setBusy(false); }
  };

  if (!userId || requests === null) return null;

  return (
    <section className="border border-border p-6 space-y-4" data-testid="profile-switch">
      <p className="font-mono-caps text-[11px] text-muted-foreground">Profile type</p>
      <p className="text-sm">
        Your profile is <span className="text-primary">{label(currentType)}</span>.
        {" "}Signed up as the wrong type? You can ask the AFC team to change it.
      </p>

      {pending && (
        <div className="border border-primary/40 bg-primary/5 p-4 space-y-2" data-testid="switch-pending">
          <p className="text-sm">
            Request sent: <strong>{label(pending.from_type)} → {label(pending.to_type)}</strong>. It is waiting for
            the AFC team to approve. Your profile stays exactly as it is until then.
          </p>
          <button type="button" onClick={cancel} disabled={busy} className="font-mono-caps text-[11px] text-muted-foreground underline hover:text-foreground disabled:opacity-50">
            Cancel request
          </button>
        </div>
      )}

      {!pending && lastDone?.status === "rejected" && (
        <div className="border border-destructive/40 p-4 text-sm" data-testid="switch-rejected">
          Your request to become {label(lastDone.to_type)} was not approved.
          {lastDone.review_note && <> Note from the AFC team: “{lastDone.review_note}”</>}
        </div>
      )}

      {!pending && !open && (
        <button type="button" onClick={() => setOpen(true)} className="font-mono-caps text-[11px] text-primary underline hover:opacity-80">
          Change profile type
        </button>
      )}

      {!pending && open && (
        <form onSubmit={send} className="space-y-4" data-testid="switch-form">
          <div>
            <label className="font-mono-caps text-[11px] text-muted-foreground">Change to</label>
            <select required value={toType} onChange={(e) => setToType(e.target.value)}
              className="mt-2 w-full border border-border bg-background px-4 py-3 text-base outline-none focus:border-foreground">
              <option value="">Choose…</option>
              {choices.map((t) => <option key={t} value={t}>{label(t)}</option>)}
            </select>
          </div>

          {toType === "Artist" && (
            <div>
              <label className="font-mono-caps text-[11px] text-muted-foreground">Your main discipline</label>
              <select required value={discipline} onChange={(e) => setDiscipline(e.target.value)}
                className="mt-2 w-full border border-border bg-background px-4 py-3 text-base outline-none focus:border-foreground">
                <option value="">Choose…</option>
                {DISCIPLINES.map((d) => <option key={d}>{d}</option>)}
              </select>
            </div>
          )}

          {toType && (
            <div className="grid gap-4 text-sm sm:grid-cols-2" data-testid="switch-consequences">
              <div>
                <p className="font-mono-caps text-[10px] text-muted-foreground">Moves across</p>
                <ul className="mt-1 list-disc pl-5">{moves.map((m) => <li key={m}>{m}</li>)}</ul>
              </div>
              {stays.length > 0 && (
                <div>
                  <p className="font-mono-caps text-[10px] text-destructive">Does NOT move across</p>
                  <ul className="mt-1 list-disc pl-5">{stays.map((s) => <li key={s}>{s}</li>)}</ul>
                  <p className="mt-2 text-xs text-muted-foreground">Nothing is deleted — the AFC team keeps your current profile and can restore it.</p>
                </div>
              )}
            </div>
          )}

          <div>
            <label className="font-mono-caps text-[11px] text-muted-foreground">Anything the team should know? (optional)</label>
            <textarea value={reason} onChange={(e) => setReason(e.target.value)} rows={2} maxLength={500}
              className="mt-2 w-full resize-none border border-border bg-transparent px-4 py-3 text-base outline-none focus:border-foreground" />
          </div>

          <div className="flex flex-wrap items-center gap-4">
            <button type="submit" disabled={busy || !toType} className="flex items-center gap-2 bg-primary px-6 py-3 font-mono-caps text-[11px] text-primary-foreground hover:opacity-80 disabled:opacity-50">
              {busy && <Loader2 className="h-3 w-3 animate-spin" />} Send request for approval
            </button>
            <button type="button" onClick={() => { setOpen(false); setError(""); }} className="font-mono-caps text-[11px] text-muted-foreground">Cancel</button>
          </div>
        </form>
      )}

      {error && <p className="text-sm text-destructive" role="alert">{error}</p>}
    </section>
  );
}
