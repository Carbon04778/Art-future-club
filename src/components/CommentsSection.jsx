import React, { useState, useEffect } from "react";
import { base44 } from "@/api/base44Client";
import { MessageCircle, Send, Check, Loader2 } from "lucide-react";

/**
 * `ownerId` and `ownerLabel` are optional. When supplied, the owner of the
 * thing being commented on is notified. They are optional so existing call
 * sites keep working; a comment without them simply notifies nobody.
 */
export default function CommentsSection({ targetId, targetType, userId, userName, ownerId, ownerLabel }) {
  const [comments, setComments] = useState([]);
  const [body, setBody] = useState("");
  const [open, setOpen] = useState(false);
  const [sending, setSending] = useState(false);
  const [error, setError] = useState("");
  const [posted, setPosted] = useState(false);

  useEffect(() => {
    if (!targetId) return;
    base44.entities.Comment.filter({ target_id: targetId, target_type: targetType }, "created_date", 50)
      .then(setComments);
  }, [targetId, targetType]);

  const submit = async (e) => {
    e.preventDefault();
    if (!body.trim() || !userId || sending) return;
    setError("");
    setSending(true);
    let c;
    try {
      c = await base44.entities.Comment.create({
        user_id: userId, user_name: userName || "Member",
        target_id: targetId, target_type: targetType, body: body.trim(),
      });
    } catch (err) {
      // Previously this had no error handling: a rejected insert left the
      // typed text sitting in the box with no explanation.
      setError(String(err?.message || err) || "Could not post your comment.");
      setSending(false);
      return;
    }
    setComments((prev) => [...prev, c]);
    setBody("");
    // Brief confirmation so posting does not feel like nothing happened.
    setPosted(true);
    setTimeout(() => setPosted(false), 2500);

    // Notify the owner — never yourself, and only when we know who they are.
    if (ownerId && ownerId !== userId) {
      try {
        await base44.entities.Notification.create({
          user_id: ownerId,
          type: "comment",
          from_user_name: userName || "A member",
          message: `${userName || "Someone"} commented on ${ownerLabel || "your work"}`,
          link: typeof window !== "undefined" ? window.location.pathname : "",
          read: false,
        });
      } catch (err) {
        // Non-fatal: the comment is already saved.
        console.error("Could not create comment notification:", err);
      }
    }

    setSending(false);
  };

  return (
    <div className="mt-2">
      <button
        onClick={(e) => { e.stopPropagation(); setOpen((v) => !v); }}
        className="flex items-center gap-1.5 font-mono-caps text-[11px] text-muted-foreground hover:text-foreground transition-colors"
      >
        <MessageCircle className="h-4 w-4" />
        {comments.length > 0 ? comments.length : ""}
        <span>{open ? "Hide" : "Comment"}</span>
      </button>

      {open && (
        <div className="mt-4 space-y-3" onClick={(e) => e.stopPropagation()}>
          {comments.map((c) => (
            <div key={c.id} className="flex gap-3">
              <div className="h-6 w-6 shrink-0 rounded-full bg-muted flex items-center justify-center">
                <span className="font-mono-caps text-[9px]">{c.user_name?.[0]}</span>
              </div>
              <div>
                <p className="font-mono-caps text-[10px] text-primary">{c.user_name}</p>
                <p className="text-sm text-foreground">{c.body}</p>
              </div>
            </div>
          ))}
          {error && (
            <p className="pt-1 text-xs text-destructive">{error}</p>
          )}
          {posted && !error && (
            <p className="flex items-center gap-1.5 pt-1 text-xs text-primary">
              <Check className="h-3 w-3" /> Comment posted
            </p>
          )}
          {userId ? (
            <form onSubmit={submit} className="flex gap-2 pt-1">
              <input
                value={body}
                onChange={(e) => setBody(e.target.value)}
                placeholder="Add a comment…"
                className="flex-1 border border-border bg-transparent px-3 py-2 text-sm outline-none focus:border-foreground"
              />
              <button type="submit" disabled={!body.trim() || sending} className="p-2 text-primary disabled:opacity-40">
                {sending ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Send className="h-3.5 w-3.5" />}
              </button>
            </form>
          ) : (
            <p className="font-mono-caps text-[10px] text-muted-foreground">Log in to comment</p>
          )}
        </div>
      )}
    </div>
  );
}