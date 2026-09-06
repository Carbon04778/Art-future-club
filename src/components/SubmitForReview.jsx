import React, { useState } from "react";
import { base44 } from "@/api/base44Client";
import { Check, Circle, Loader2, Clock, AlertTriangle } from "lucide-react";
import { STATUS, effectiveStatus, readiness } from "@/lib/profileReadiness";

/**
 * The gate between a member finishing their profile and it going public.
 *
 * Shows what is still missing, lets them submit once it is complete, and
 * reports where the submission has got to.
 *
 * This is presentation only. A member who bypasses it and writes
 * status:"approved" straight to the API is refused by the database trigger in
 * migration 017 — and by the equivalent guard in the demo provider.
 *
 * Props:
 *   profile   the CURRENT form state, so the checklist updates as they type
 *   entity    "ArtistProfile" | "CollectorProfile"
 *   profileId row id — absent until the profile has been saved once
 *   kind      "artist" | "gallery"
 *   onSubmitted(updatedRow)
 */
export default function SubmitForReview({ profile, entity, profileId, kind = "artist", onSubmitted }) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  /*
   * A profile that has not been saved yet has no row, and therefore no status.
   *
   * effectiveStatus() falls back to "approved" for rows written before
   * moderation existed — correct grandfathering for a REAL row, but an unsaved
   * profile is not a legacy row. Passing it through told a brand-new member
   * "Live on the site. Your profile is public." before they had created
   * anything at all, with no checklist and no submit button.
   *
   * profileId is the only reliable signal that a row exists.
   */
  const status = profileId ? effectiveStatus(profile) : STATUS.DRAFT;
  const { met, missing, ready, total } = readiness(profile, kind);

  const submit = async () => {
    setError("");
    setBusy(true);
    try {
      const updated = await base44.entities[entity].update(profileId, {
        status: STATUS.PENDING,
      });
      onSubmitted?.(updated);
    } catch (e) {
      // Never swallow this. A submission that silently fails looks to the
      // member exactly like one that worked.
      setError(String(e?.message || e) || "Could not submit for review.");
    } finally {
      setBusy(false);
    }
  };

  /* ------------------------------------------------------------- approved */
  if (status === STATUS.APPROVED) {
    return (
      <div className="mb-8 border border-green-600 p-5">
        <p className="flex items-center gap-2 font-mono-caps text-[11px] text-green-600">
          <Check className="h-4 w-4" /> Live on the site
        </p>
        <p className="mt-2 text-sm text-muted-foreground">
          Your profile is public. Any changes you make from here are published
          straight away.
        </p>
      </div>
    );
  }

  /* -------------------------------------------------- waiting on an admin */
  if (status === STATUS.PENDING || status === STATUS.FLAGGED) {
    return (
      <div className="mb-8 border border-primary p-5">
        <p className="flex items-center gap-2 font-mono-caps text-[11px] text-primary">
          <Clock className="h-4 w-4" /> With the AFC team for review
        </p>
        <p className="mt-2 text-sm text-muted-foreground">
          Your profile has been submitted and is not public yet. We will email
          you once it has been looked at. You can keep editing in the meantime —
          the team sees whatever is saved when they open it.
        </p>
      </div>
    );
  }

  /* ---------------------------------------------------- sent back to edit */
  const wasRejected = status === STATUS.REJECTED;

  return (
    <div className={`mb-8 border p-5 ${wasRejected ? "border-destructive" : "border-border"}`}>
      {wasRejected ? (
        <>
          <p className="flex items-center gap-2 font-mono-caps text-[11px] text-destructive">
            <AlertTriangle className="h-4 w-4" /> Changes needed before this can go live
          </p>
          {profile?.review_note && (
            <p className="mt-2 border-l-2 border-destructive pl-3 text-sm text-foreground">
              {profile.review_note}
            </p>
          )}
          <p className="mt-2 text-sm text-muted-foreground">
            Make the changes above and submit again.
          </p>
        </>
      ) : (
        <>
          <p className="font-mono-caps text-[11px] text-muted-foreground">
            Not published yet
          </p>
          <p className="mt-2 text-sm text-muted-foreground">
            New profiles are checked by the AFC team before they appear on the
            public site. Complete the list below, then submit.
          </p>
        </>
      )}

      <p className="mt-5 font-mono-caps text-[10px] text-muted-foreground">
        Ready to submit — {met.length} of {total}
      </p>
      <ul className="mt-3 space-y-2">
        {[...met.map((r) => [r, true]), ...missing.map((r) => [r, false])].map(
          ([req, done]) => (
            <li key={req.key} className="flex items-center gap-2">
              {done ? (
                <Check className="h-3.5 w-3.5 shrink-0 text-green-600" />
              ) : (
                <Circle className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
              )}
              <span
                className={`font-mono-caps text-[11px] ${
                  done ? "text-muted-foreground line-through" : "text-foreground"
                }`}
              >
                {req.label}
              </span>
            </li>
          )
        )}
      </ul>

      {/* Save first: submitting sends the SAVED row for review, so unsaved
          edits would not be part of what the team looks at. */}
      {!profileId && (
        <p className="mt-4 text-xs text-muted-foreground">
          Save your profile first, then you can submit it.
        </p>
      )}

      {error && <p className="mt-4 text-sm text-destructive">{error}</p>}

      <button
        type="button"
        onClick={submit}
        disabled={!ready || !profileId || busy}
        className="mt-5 flex items-center gap-2 bg-primary px-6 py-3 font-mono-caps text-[11px] text-primary-foreground transition-opacity hover:opacity-80 disabled:opacity-40"
      >
        {busy && <Loader2 className="h-3 w-3 animate-spin" />}
        {wasRejected ? "Submit again" : "Submit for review"}
      </button>
      {!ready && (
        <p className="mt-2 text-xs text-muted-foreground">
          {missing.length} thing{missing.length === 1 ? "" : "s"} still to add.
        </p>
      )}
    </div>
  );
}
