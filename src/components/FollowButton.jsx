import React, { useState, useEffect } from "react";
import { base44 } from "@/api/base44Client";
import { UserPlus, UserCheck } from "lucide-react";

export default function FollowButton({ artistProfile, currentUserId }) {
  const [following, setFollowing] = useState(false);
  const [followId, setFollowId] = useState(null);
  const [count, setCount] = useState(0);

  useEffect(() => {
    if (!artistProfile?.user_id) return;
    base44.entities.Follow.filter({ following_id: artistProfile.user_id }).then((follows) => {
      setCount(follows.length);
      if (currentUserId) {
        const mine = follows.find((f) => f.follower_id === currentUserId);
        if (mine) { setFollowing(true); setFollowId(mine.id); }
      }
    });
  }, [artistProfile?.user_id, currentUserId]);

  const toggle = async () => {
    if (!currentUserId) return;
    if (following) {
      await base44.entities.Follow.delete(followId);
      setFollowing(false); setFollowId(null); setCount((c) => c - 1);
    } else {
      const f = await base44.entities.Follow.create({
        follower_id: currentUserId,
        following_id: artistProfile.user_id,
        following_name: artistProfile.display_name,
      });
      setFollowing(true); setFollowId(f.id); setCount((c) => c + 1);
    }
  };

  if (!currentUserId) return (
    <div className="flex items-center gap-1.5 font-mono-caps text-[11px] text-muted-foreground">
      <UserPlus className="h-4 w-4" />
      {count > 0 && <span>{count} followers</span>}
    </div>
  );

  return (
    <button
      onClick={toggle}
      className={`flex items-center gap-2 font-mono-caps text-[11px] px-4 py-2 border transition-colors ${following ? "border-foreground bg-foreground text-background" : "border-border text-muted-foreground hover:border-foreground hover:text-foreground"}`}
    >
      {following ? <UserCheck className="h-3.5 w-3.5" /> : <UserPlus className="h-3.5 w-3.5" />}
      {following ? "Following" : "Follow"}
      {count > 0 && <span className="opacity-60">· {count}</span>}
    </button>
  );
}