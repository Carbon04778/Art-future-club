import React, { useState, useEffect } from "react";
import { base44 } from "@/api/base44Client";
import { Heart } from "lucide-react";

export default function LikeButton({ targetId, targetType, userId }) {
  const [liked, setLiked] = useState(false);
  const [count, setCount] = useState(0);
  const [likeId, setLikeId] = useState(null);

  useEffect(() => {
    if (!targetId) return;
    base44.entities.Like.filter({ target_id: targetId, target_type: targetType }).then((likes) => {
      setCount(likes.length);
      if (userId) {
        const mine = likes.find((l) => l.user_id === userId);
        if (mine) { setLiked(true); setLikeId(mine.id); }
      }
    });
  }, [targetId, targetType, userId]);

  const toggle = async (e) => {
    e.stopPropagation();
    if (!userId) return;
    if (liked) {
      await base44.entities.Like.delete(likeId);
      setLiked(false); setLikeId(null); setCount((c) => c - 1);
    } else {
      const l = await base44.entities.Like.create({ user_id: userId, target_id: targetId, target_type: targetType });
      setLiked(true); setLikeId(l.id); setCount((c) => c + 1);
    }
  };

  return (
    <button
      onClick={toggle}
      className={`flex items-center gap-1.5 font-mono-caps text-[11px] transition-colors ${liked ? "text-red-500" : "text-muted-foreground hover:text-red-400"} ${!userId ? "opacity-50 cursor-default" : ""}`}
      title={userId ? (liked ? "Unlike" : "Like") : "Log in to like"}
    >
      <Heart className={`h-4 w-4 ${liked ? "fill-red-500" : ""}`} />
      <span>{count > 0 ? count : ""}</span>
    </button>
  );
}