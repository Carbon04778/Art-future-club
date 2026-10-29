import React, { useEffect, useState } from "react";
import { base44 } from "@/api/base44Client";
import { Loader2, Check, AlertTriangle, RotateCcw } from "lucide-react";
import { useDataRevision } from "@/lib/dataRevision";
import { switchConsequences } from "@/components/ProfileSwitchPanel";

/**
 * Profile type change requests, in the Approvals tab (A1).
 *
 * Each request says what will NOT move across — counted from the member's
 * real profile ("12 artworks and a CV") — so the admin can check with the
 * member before approving, as agreed with Julie. Approving and undoing run
 * database functions (migration 027) that do the whole change in one step.
 */
export default function AdminSwitchRequests() {
  const [pending, setPending] = useState(null);
  const [recent, setRecent] = useState([]);
  const [busy, setBusy] = useState(null);
  const [rejecting, setRejecting] = useState(null);
  const [note, setNote] = useState("");
  const [error, setError] = useState("");
  const [done, setDone] = useState("");
  const rev = useDataRevision();

  const load = async () => {
    setError("");
    try {
      const [p, r] = await Promise.all([
        base44.entities.ProfileSwitchRequest.filter({ status: "pending" }, "created_date", 100),
        base44.entities.ProfileSwitchRequest.filter({ status: "approved" }, "-reviewed_at", 10),
      ]);
      setPending(await Promise.all(p.map(withDetails)));
      setRecent(r.filter((x) => x.archive_id));
    } catch {
      // Not installed yet (migration 027) — show nothing rather than an error.
      setPending([]);
    }
  };
  useEffect(() => { load(); }, [rev]);

  const flash = (m) => { setDone(m); setTimeout(() => setDone(""), 3000); };

  const decide = async (req, approve) => {
    setBusy(req.id);
    setError("");
    try {
      await base44.auth.reviewProfileSwitch({ requestId: req.id, approve, note: approve ? null : note });
      flash(approve ? `${req.display_name} is now ${req.to_type}.` : `${req.display_name}'s request was declined.`);
      setRejecting(null); setNote("");
      await load();
    } catch (e) {
      setError(String(e?.message || e));
    } finally {
      setBusy(null);
    }
  };

  const undo = async (req) => {
    if (!window.confirm(`Put ${req.display_name}'s previous ${req.from_type} profile back? Their current ${req.to_type} profile is saved first, so this can be undone too.`)) return;
    setBusy(req.id);
    setError("");
    try {
      await base44.auth.restoreProfileArchive(req.archive_id);
      flash(`${req.display_name}'s ${req.from_type} profile is back.`);
      await load();
    } catch (e) {
      setError(String(e?.message || e));
    } finally {
      setBusy(null);
    }
  };

  if (pending === null) return null;
  if (pending.length === 0 && recent.length === 0) return null;

  return (
    <div className="mb-8 border border-border p-5" data-testid="switch-requests">
      <h4 className="font-mono-caps text-[11px] text-primary">Profile type changes</h4>
      <p className="mt-1 text-xs text-muted-foreground">
        Members asking to change type. Their current profile stays live until you approve.
      </p>
      {error && <p className="mt-3 text-sm text-destructive" role="alert">{error}</p>}
      {done && <p className="mt-3 flex items-center gap-2 text-sm text-primary"><Check className="h-4 w-4" /> {done}</p>}

      {pending.length > 0 && (
        <ul className="mt-4 space-y-4">
          {pending.map((req) => (
            <li key={req.id} className="border border-border p-4" data-testid="switch-request">
              <p className="text-sm">
                <strong>{req.display_name}</strong>: {req.from_type} → <span className="text-primary">{req.to_type}</span>
                {req.to_discipline && <> (main discipline: {req.to_discipline})</>}
              </p>
              <p className="mt-1 font-mono-caps text-[10px] text-muted-foreground">Asked {new Date(req.created_date).toLocaleDateString()}</p>
              {req.reason && <p className="mt-2 text-sm text-muted-foreground">“{req.reason}”</p>}
              {req._warnings.length > 0 && (
                <div className="mt-3 flex gap-2 border border-amber-500/50 bg-amber-500/10 p-3 text-sm" data-testid="switch-warning">
                  <AlertTriangle className="h-4 w-4 shrink-0 text-amber-600" />
                  <span>Will NOT move to the new profile: {req._warnings.join(", ")}. It is kept in the archive and can be restored.</span>
                </div>
              )}
              {rejecting === req.id ? (
                <div className="mt-3 space-y-2">
                  <textarea value={note} onChange={(e) => setNote(e.target.value)} rows={2} placeholder="Note to the member (optional)"
                    className="w-full resize-none border border-border bg-transparent px-3 py-2 text-sm outline-none focus:border-foreground" />
                  <div className="flex gap-3">
                    <button type="button" disabled={busy === req.id} onClick={() => decide(req, false)} className="border border-destructive px-4 py-2 font-mono-caps text-[11px] text-destructive disabled:opacity-50">Decline</button>
                    <button type="button" onClick={() => { setRejecting(null); setNote(""); }} className="font-mono-caps text-[11px] text-muted-foreground">Back</button>
                  </div>
                </div>
              ) : (
                <div className="mt-3 flex flex-wrap gap-3">
                  <button type="button" disabled={busy === req.id} onClick={() => decide(req, true)}
                    className="flex items-center gap-2 bg-primary px-4 py-2 font-mono-caps text-[11px] text-primary-foreground hover:opacity-80 disabled:opacity-50">
                    {busy === req.id && <Loader2 className="h-3 w-3 animate-spin" />} Approve change
                  </button>
                  <button type="button" onClick={() => setRejecting(req.id)} className="border border-border px-4 py-2 font-mono-caps text-[11px] text-muted-foreground hover:border-destructive hover:text-destructive">
                    Decline
                  </button>
                </div>
              )}
            </li>
          ))}
        </ul>
      )}

      {recent.length > 0 && (
        <div className="mt-5">
          <p className="font-mono-caps text-[10px] text-muted-foreground">Recently changed (the previous profile is archived)</p>
          <ul className="mt-2 space-y-2">
            {recent.map((req) => (
              <li key={req.id} className="flex flex-wrap items-center justify-between gap-3 text-sm" data-testid="switch-recent">
                <span>{req.display_name}: {req.from_type} → {req.to_type}</span>
                <button type="button" disabled={busy === req.id} onClick={() => undo(req)}
                  className="flex items-center gap-1 font-mono-caps text-[10px] text-muted-foreground underline hover:text-foreground disabled:opacity-50">
                  <RotateCcw className="h-3 w-3" /> Undo — restore the {req.from_type} profile
                </button>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}

/** Count, from the member's real profile, what would not move across. */
async function withDetails(req) {
  const warnings = [];
  const { stays } = switchConsequences(req.from_type, req.to_type);
  if (stays.length) {
    try {
      if (req.from_kind === "artist") {
        const p = (await base44.entities.ArtistProfile.filter({ id: req.from_id }))[0];
        const works = (p?.portfolio_works || []).length;
        const cv = p?.cv || {};
        const cvItems = ["exhibitions", "education", "awards"].reduce((n, k) => n + (cv[k] || []).length, 0) + (cv.statement ? 1 : 0);
        if (works) warnings.push(`${works} artwork${works === 1 ? "" : "s"}`);
        if (cvItems) warnings.push("a CV");
        if ((p?.disciplines || []).length > 1) warnings.push(`${p.disciplines.length} disciplines`);
      } else {
        const p = (await base44.entities.CollectorProfile.filter({ id: req.from_id }))[0];
        const gw = await base44.entities.GalleryWork.filter({ gallery_id: req.from_id }).catch(() => []);
        if (gw.length) warnings.push(`${gw.length} gallery work${gw.length === 1 ? "" : "s"}`);
        if (p?.address || p?.opening_hours) warnings.push("address and opening hours");
        if (p?.cover_image_url) warnings.push("a cover photo");
      }
    } catch {
      warnings.push(stays.join(", ").toLowerCase());
    }
  }
  return { ...req, _warnings: warnings };
}
