import React, { useState, useEffect } from "react";
import { artistPath, spacePath } from "@/lib/slugs";
import { Link } from "react-router-dom";
import { base44 } from "@/api/base44Client";
import { Image } from "@/components/ui/image";
import { Loader2, Check, X, Clock, ExternalLink, AlertTriangle } from "lucide-react";
import {
  STATUS,
  REVIEWABLE_STATUSES,
  effectiveStatus,
  isModeratedCollectorType,
} from "@/lib/profileReadiness";
import { useDataRevision } from "@/lib/dataRevision";

/**
 * The review queue.
 *
 * New artist, gallery and venue profiles are held until someone here approves
 * them. Admins are the only people who can see unapproved rows at all — the
 * read policies in migration 017 hide them from everyone else, including from
 * a direct API call.
 *
 * The panel deliberately shows the artwork and the bio inline rather than just
 * a name and a button. The whole purpose is to look at what is about to be
 * published, and an approve button next to a name invites approving without
 * looking.
 */
export default function AdminApprovalsPanel({ user }) {
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(true);
  const [busyId, setBusyId] = useState(null);
  const [rejecting, setRejecting] = useState(null); // row id
  const [reason, setReason] = useState("");
  const [error, setError] = useState("");
  const [done, setDone] = useState("");

  const load = () => {
    setLoading(true);
    setError("");
    Promise.allSettled([
      base44.entities.ArtistProfile.list("-created_date", 500),
      base44.entities.CollectorProfile.list("-created_date", 500),
    ])
      .then(([a, c]) => {
        const artists = (a.status === "fulfilled" ? a.value : []).map((r) => ({
          ...r,
          _kind: "artist",
          _entity: "ArtistProfile",
        }));
        // Private collectors and curators are not moderated, so they never
        // appear here even while their status column says otherwise.
        const spaces = (c.status === "fulfilled" ? c.value : [])
          .filter((r) => isModeratedCollectorType(r.type))
          .map((r) => ({ ...r, _kind: "gallery", _entity: "CollectorProfile" }));

        setRows(
          [...artists, ...spaces]
            .filter((r) => REVIEWABLE_STATUSES.includes(effectiveStatus(r)))
            .sort((x, y) => new Date(x.created_date || 0) - new Date(y.created_date || 0))
        );
      })
      .finally(() => setLoading(false));
  };

  // Reloads when a profile is submitted from anywhere, so the queue fills
  // without the admin refreshing the page.
  const rev = useDataRevision();
  useEffect(load, [rev]);

  const flash = (msg) => {
    setDone(msg);
    setTimeout(() => setDone(""), 2500);
  };

  const decide = async (row, approved, note = "") => {
    setError("");
    setBusyId(row.id);
    try {
      await base44.entities[row._entity].update(row.id, {
        status: approved ? STATUS.APPROVED : STATUS.REJECTED,
        review_note: note || null,
        reviewed_at: new Date().toISOString(),
        reviewed_by: user?.id ?? null,
      });
      setRows((prev) => prev.filter((r) => r.id !== row.id));
      flash(
        approved
          ? `${row.display_name} is now live.`
          : `${row.display_name} sent back with a note.`
      );
      setRejecting(null);
      setReason("");
    } catch (e) {
      const msg = String(e?.message || e);
      setError(
        /row-level security|policy|administrator/i.test(msg)
          ? "Permission denied. Run migration 017_profile_moderation.sql in Supabase, and confirm your account's role is 'admin'."
          : msg
      );
    } finally {
      setBusyId(null);
    }
  };

  return (
    <div className="border border-border bg-card p-6">
      <h3 className="font-heading text-2xl tracking-[-0.01em]">Approvals</h3>
      <p className="mt-2 text-sm text-muted-foreground">
        New artist, gallery and venue profiles waiting to go live. Nothing here
        is visible to the public yet.
      </p>
      <p className="mt-2 text-xs text-muted-foreground">
        Members who joined before approvals existed are unaffected, and a
        profile is reviewed once — later edits publish straight away.
      </p>

      {error && (
        <div className="mt-4 border border-destructive bg-destructive/10 p-4">
          <p className="font-mono-caps text-[11px] text-destructive">Could not save</p>
          <p className="mt-2 text-sm text-destructive">{error}</p>
        </div>
      )}
      {done && (
        <p className="mt-4 flex items-center gap-2 text-sm text-primary">
          <Check className="h-4 w-4" /> {done}
        </p>
      )}

      {loading ? (
        <div className="flex justify-center py-10">
          <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
        </div>
      ) : rows.length === 0 ? (
        <div className="mt-6 border border-border py-16 text-center">
          <p className="font-mono-caps text-[11px] text-muted-foreground">
            Nothing waiting for review.
          </p>
        </div>
      ) : (
        <ul className="mt-6 space-y-6">
          {rows.map((row) => {
            const works = row.portfolio_works || [];
            const isFlagged = effectiveStatus(row) === STATUS.FLAGGED;
            const href = row._kind === "artist"
              ? artistPath(row)
              : isModeratedCollectorType(row.type) && row.type !== "Gallery"
              ? spacePath(row, true)
              : spacePath(row, false);

            return (
              <li key={`${row._entity}-${row.id}`} className="border border-border p-5">
                <div className="flex flex-wrap items-start gap-4">
                  <div className="h-16 w-16 shrink-0 overflow-hidden rounded-full bg-muted flex items-center justify-center">
                    {row.avatar_url ? (
                      <Image
                        src={row.avatar_url}
                        alt={row.display_name}
                        fittingType="fill"
                        className="h-full w-full object-cover"
                      />
                    ) : (
                      <span className="font-heading text-xl text-muted-foreground">
                        {row.display_name?.[0]}
                      </span>
                    )}
                  </div>

                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="font-mono-caps text-[10px] text-primary">
                        {row._kind === "artist" ? row.discipline || "Artist" : row.type || "Venue"}
                      </span>
                      {isFlagged && (
                        <span className="flex items-center gap-1 border border-yellow-600 px-2 py-0.5 font-mono-caps text-[9px] text-yellow-600">
                          <AlertTriangle className="h-3 w-3" /> Flagged
                        </span>
                      )}
                      <span className="flex items-center gap-1 font-mono-caps text-[9px] text-muted-foreground">
                        <Clock className="h-3 w-3" />
                        {row.created_date
                          ? new Date(row.created_date).toLocaleDateString("en-GB", {
                              day: "numeric", month: "short", year: "numeric",
                            })
                          : "—"}
                      </span>
                    </div>
                    <p className="mt-1 font-heading text-2xl tracking-[-0.01em]">
                      {row.display_name}
                    </p>
                    <p className="font-mono-caps text-[10px] text-muted-foreground">
                      {[row.based_in, row.chapter, row.address].filter(Boolean).join(" · ") || "—"}
                    </p>
                    {row.bio && (
                      <p className="mt-3 max-w-2xl text-sm leading-relaxed text-muted-foreground">
                        {row.bio}
                      </p>
                    )}
                    {/* Admins can open an unapproved profile because the read
                        policy admits them; a visitor following the same link
                        gets "not found". */}
                    <Link
                      to={href}
                      className="mt-3 inline-flex items-center gap-1.5 font-mono-caps text-[10px] text-primary hover:underline"
                    >
                      <ExternalLink className="h-3 w-3" /> Open the full profile
                    </Link>
                  </div>
                </div>

                {works.length > 0 && (
                  <div className="mt-5">
                    <p className="font-mono-caps text-[10px] text-muted-foreground">
                      {works.length} artwork{works.length === 1 ? "" : "s"}
                    </p>
                    <div className="mt-3 flex flex-wrap gap-3">
                      {works.slice(0, 6).map((w, i) => (
                        <div key={i} className="w-28">
                          <div className="aspect-square overflow-hidden bg-muted" data-artwork>
                            {w.image_url && (
                              <Image
                                src={w.image_url}
                                alt={w.title || "Artwork"}
                                fittingType="fill"
                                className="h-full w-full object-cover"
                              />
                            )}
                          </div>
                          <p className="mt-1 truncate font-mono-caps text-[9px] text-muted-foreground">
                            {w.title || "Untitled"}
                          </p>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {rejecting === row.id ? (
                  <div className="mt-5 border-t border-border pt-4">
                    <label className="font-mono-caps text-[10px] text-muted-foreground">
                      Why is this being sent back? The member sees this.
                    </label>
                    <textarea
                      rows={3}
                      value={reason}
                      onChange={(e) => setReason(e.target.value)}
                      placeholder="e.g. The profile photo is a company logo rather than a portrait, and the bio is empty."
                      className="mt-2 w-full resize-none border border-border bg-background px-3 py-2 text-sm outline-none focus:border-primary"
                    />
                    <div className="mt-3 flex flex-wrap items-center gap-3">
                      <button
                        type="button"
                        onClick={() => decide(row, false, reason.trim())}
                        disabled={!reason.trim() || busyId === row.id}
                        className="flex items-center gap-2 border border-destructive px-5 py-2 font-mono-caps text-[10px] text-destructive transition-colors hover:bg-destructive hover:text-background disabled:opacity-40"
                      >
                        {busyId === row.id ? <Loader2 className="h-3 w-3 animate-spin" /> : <X className="h-3 w-3" />}
                        Send back
                      </button>
                      <button
                        type="button"
                        onClick={() => { setRejecting(null); setReason(""); }}
                        className="font-mono-caps text-[10px] text-muted-foreground hover:text-foreground"
                      >
                        Cancel
                      </button>
                      {!reason.trim() && (
                        <span className="text-xs text-muted-foreground">
                          A reason is required — without one they cannot tell what to fix.
                        </span>
                      )}
                    </div>
                  </div>
                ) : (
                  <div className="mt-5 flex flex-wrap items-center gap-3 border-t border-border pt-4">
                    <button
                      type="button"
                      onClick={() => decide(row, true)}
                      disabled={busyId === row.id}
                      className="flex items-center gap-2 bg-primary px-6 py-2.5 font-mono-caps text-[10px] text-primary-foreground transition-opacity hover:opacity-80 disabled:opacity-50"
                    >
                      {busyId === row.id ? <Loader2 className="h-3 w-3 animate-spin" /> : <Check className="h-3 w-3" />}
                      Approve and publish
                    </button>
                    <button
                      type="button"
                      onClick={() => { setRejecting(row.id); setReason(""); }}
                      disabled={busyId === row.id}
                      className="flex items-center gap-2 border border-border px-5 py-2.5 font-mono-caps text-[10px] text-muted-foreground transition-colors hover:border-destructive hover:text-destructive disabled:opacity-50"
                    >
                      <X className="h-3 w-3" /> Send back
                    </button>
                  </div>
                )}
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
