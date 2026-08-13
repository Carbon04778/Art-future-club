import React, { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { base44 } from "@/api/base44Client";
import { Bookmark } from "lucide-react";

/**
 * Lets a collector save (collect) a portfolio work to their profile gallery.
 * Mirrors LikeButton: toggles a CollectedWork record for the current user.
 */
export default function CollectButton({ userId, artistId, artistName, work, workRef }) {
  const navigate = useNavigate();
  const [collected, setCollected] = useState(false);
  const [recordId, setRecordId] = useState(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!userId || !workRef) return;
    let alive = true;
    base44.entities.CollectedWork.filter({ user_id: userId, work_ref: workRef }).then((res) => {
      if (!alive) return;
      if (res.length > 0) { setCollected(true); setRecordId(res[0].id); }
    });
    return () => { alive = false; };
  }, [userId, workRef]);

  const toggle = async (e) => {
    e.stopPropagation();
    if (!userId) { navigate("/login"); return; }
    if (busy) return;
    setBusy(true);
    try {
      if (collected) {
        await base44.entities.CollectedWork.delete(recordId);
        setCollected(false); setRecordId(null);
      } else {
        const rec = await base44.entities.CollectedWork.create({
          user_id: userId,
          artist_id: artistId,
          artist_name: artistName,
          work_ref: workRef,
          work_title: work?.title,
          work_image_url: work?.image_url,
          work_medium: work?.medium,
          work_dimensions: work?.dimensions,
          work_year: work?.year,
          work_description: work?.description,
          work_price: work?.price,
          work_currency: work?.currency || "USD",
        });
        setCollected(true); setRecordId(rec.id);
      }
    } catch {}
    setBusy(false);
  };

  return (
    <button
      onClick={toggle}
      className={`flex items-center gap-1.5 font-mono-caps text-[11px] transition-colors ${collected ? "text-primary" : "text-muted-foreground hover:text-primary"} ${!userId ? "opacity-50" : ""}`}
      title={userId ? (collected ? "Remove from collection" : "Add to collection") : "Log in to collect"}
    >
      <Bookmark className={`h-4 w-4 ${collected ? "fill-primary" : ""}`} />
      <span>{collected ? "Collected" : "Collect"}</span>
    </button>
  );
}