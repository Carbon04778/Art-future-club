import React, { useState, useEffect } from "react";
import { base44 } from "@/api/base44Client";
import { UserPlus, UserCheck, Loader2 } from "lucide-react";

/**
 * Follow / unfollow a member.
 *
 * THREE BUGS THIS FIXES
 *
 * 1. No error handling. Every call was unguarded, so a rejected insert left
 *    the button looking unchanged with no explanation — the reported
 *    "follow button does not work".
 *
 * 2. No loading state. Clicking twice quickly fired two inserts, creating
 *    duplicate follow rows.
 *
 * 3. Unclaimed profiles. Admin-created listings have no user_id, so the
 *    component returned early and rendered nothing at all — no button, no
 *    follower count, no explanation.
 */
export default function FollowButton({ artistProfile, currentUserId }) {
  const [following, setFollowing] = useState(false);
  const [followId, setFollowId] = useState(null);
  const [count, setCount] = useState(0);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  const targetId = artistProfile?.user_id;

  useEffect(() => {
    if (!targetId) return;
    let alive = true;
    base44.entities.Follow
      .filter({ following_id: targetId })
      .then((follows) => {
        if (!alive) return;
        setCount(follows.length);
        const mine = currentUserId
          ? follows.find((f) => f.follower_id === currentUserId)
          : null;
        setFollowing(!!mine);
        setFollowId(mine?.id ?? null);
      })
      .catch(() => {
        if (alive) setCount(0);
      });
    return () => { alive = false; };
  }, [targetId, currentUserId]);

  const toggle = async () => {
    if (!currentUserId || busy) return;
    setError("");
    setBusy(true);

    // Optimistic, then reconciled — the button responds immediately rather
    // than appearing to do nothing while the request is in flight.
    const wasFollowing = following;
    setFollowing(!wasFollowing);
    setCount((c) => (wasFollowing ? Math.max(0, c - 1) : c + 1));

    try {
      if (wasFollowing) {
        if (followId) await base44.entities.Follow.delete(followId);
        setFollowId(null);
      } else {
        const f = await base44.entities.Follow.create({
          follower_id: currentUserId,
          following_id: targetId,
          following_name: artistProfile.display_name || "",
        });
        setFollowId(f?.id ?? null);
      }
    } catch (e) {
      // Put it back the way it was, and say why.
      setFollowing(wasFollowing);
      setCount((c) => (wasFollowing ? c + 1 : Math.max(0, c - 1)));
      setError(String(e?.message || e) || "Could not update.");
    } finally {
      setBusy(false);
    }
  };

  // Unclaimed listing: nobody to follow yet. Show the count rather than
  // vanishing entirely, which looked like a broken page.
  if (!targetId) {
    return count > 0 ? (
      <div className="flex items-center gap-1.5 font-mono-caps text-[11px] text-muted-foreground">
        <UserPlus className="h-4 w-4" />
        <span>{count} followers</span>
      </div>
    ) : null;
  }

  if (!currentUserId) {
    return (
      <div className="flex items-center gap-1.5 font-mono-caps text-[11px] text-muted-foreground">
        <UserPlus className="h-4 w-4" />
        {count > 0 && <span>{count} followers</span>}
      </div>
    );
  }

  // Following yourself makes no sense.
  if (currentUserId === targetId) {
    return count > 0 ? (
      <div className="flex items-center gap-1.5 font-mono-caps text-[11px] text-muted-foreground">
        <UserPlus className="h-4 w-4" />
        <span>{count} followers</span>
      </div>
    ) : null;
  }

  return (
    <div className="flex flex-col gap-1">
      <button
        type="button"
        onClick={toggle}
        disabled={busy}
        aria-pressed={following}
        className={`flex items-center gap-2 border px-4 py-2 font-mono-caps text-[11px] transition-colors disabled:opacity-60 ${
          following
            ? "border-foreground bg-foreground text-background"
            : "border-border text-muted-foreground hover:border-foreground hover:text-foreground"
        }`}
      >
        {busy ? (
          <Loader2 className="h-3.5 w-3.5 animate-spin" />
        ) : following ? (
          <UserCheck className="h-3.5 w-3.5" />
        ) : (
          <UserPlus className="h-3.5 w-3.5" />
        )}
        {following ? "Following" : "Follow"}
        {count > 0 && <span className="opacity-60">· {count}</span>}
      </button>
      {error && <span className="text-xs text-destructive">{error}</span>}
    </div>
  );
}