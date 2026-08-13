import React, { useState, useEffect } from "react";
import { useParams, Link } from "react-router-dom";
import { base44 } from "@/api/base44Client";
import { Image } from "@/components/ui/image";
import { ArrowLeft, Loader2, Send, Check } from "lucide-react";
import SlimFooter from "@/components/SlimFooter";

export default function ForumPostDetail() {
  const { id } = useParams();
  const [post, setPost] = useState(null);
  const [replies, setReplies] = useState([]);
  const [user, setUser] = useState(null);
  const [profile, setProfile] = useState(null);
  const [replyBody, setReplyBody] = useState("");
  const [sending, setSending] = useState(false);
  const [error, setError] = useState("");
  const [justSent, setJustSent] = useState(false);

  useEffect(() => {
    base44.entities.ForumPost.get(id).then(setPost);
    base44.entities.ForumReply.filter({ post_id: id }, "created_date").then(setReplies);
    base44.auth.me().then((u) => {
      setUser(u);
      base44.entities.ArtistProfile.filter({ user_id: u.id }).then((res) => {
        if (res.length > 0) setProfile(res[0]);
      });
    });
  }, [id]);

  const handleReply = async (e) => {
    e.preventDefault();
    if (!replyBody.trim()) return;
    setError("");
    setSending(true);

    const text = replyBody.trim();
    try {
      const created = await base44.entities.ForumReply.create({
        post_id: id,
        author_id: user?.id,
        author_name: profile?.display_name || user?.full_name || "Anonymous",
        author_discipline: profile?.discipline || "",
        body: text,
      });

      // Clear the box and show the reply IMMEDIATELY, before the follow-up
      // work below. Previously this happened last, so the typed text sat
      // there while the count update and the notification completed — and if
      // either was slow or failed, it looked as though nothing had sent.
      setReplyBody("");
      setJustSent(true);
      setTimeout(() => setJustSent(false), 2500);
      if (created) setReplies((prev) => [...prev, created]);
      setPost((p) => ({ ...p, reply_count: (p?.reply_count ?? 0) + 1 }));

      // NOTE: reply_count is maintained by a database trigger
      // (public.sync_reply_count) which fires on insert into forum_reply.
      //
      // The app used to update it here as well, which was both redundant and
      // impossible: row-level security only permits updating your OWN post,
      // so replying to someone else's post matched zero rows and PostgREST
      // reported "Cannot coerce the result to a single JSON object". The
      // reply had already saved, so the failure was purely cosmetic — but it
      // surfaced as an error and made replying look broken.

      // Tell the post's author someone replied. Only the owner is notified,
      // and never for their own reply — otherwise the bell fires on your own
      // activity and people learn to ignore it.
      //
      // Wrapped separately: a failed notification must not lose the reply,
      // which has already been saved at this point.
      if (post?.author_id && post.author_id !== user?.id) {
        try {
          await base44.entities.Notification.create({
            user_id: post.author_id,
            type: "comment",
            from_user_name: profile?.display_name || user?.full_name || "A member",
            message: `${profile?.display_name || user?.full_name || "Someone"} replied to "${post.title}"`,
            link: `/community/post/${id}`,
            read: false,
          });
        } catch (err) {
          // Non-fatal: the reply is already saved. But log it — a silently
          // swallowed failure here is exactly why "notifications don't work"
          // was so hard to diagnose.
          console.error("Could not create reply notification:", err);
        }
      }
      // Re-sync from the database so the list matches exactly.
      const updated = await base44.entities.ForumReply.filter({ post_id: id }, "created_date");
      setReplies(updated);
    } catch (err) {
      // Without this the reply failed silently and the text simply stayed in
      // the box with no reason given.
      setError(String(err?.message || err) || "Could not post your reply.");
      setReplyBody(text);
      setJustSent(false);
    } finally {
      setSending(false);
    }
  };

  if (!post) {
    return (
      <div className="flex min-h-screen items-center justify-center">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  return (
    <>

      <article className="mx-auto max-w-3xl px-6 py-16 md:px-10">
        <Link to="/community" className="inline-flex items-center gap-2 font-mono-caps text-[11px] text-muted-foreground hover:text-foreground mb-10">
          <ArrowLeft className="h-3 w-3" /> Back to community
        </Link>
        <div className="flex items-center gap-3 mb-4">
          <span className="font-mono-caps text-[11px] text-primary">{post.category}</span>
          {post.author_chapter && <span className="font-mono-caps text-[11px] text-muted-foreground">{post.author_chapter}</span>}
        </div>
        <h1 className="font-heading text-4xl font-medium leading-[1.05] tracking-[-0.02em] md:text-6xl">
          {post.title}
        </h1>
        <p className="mt-4 font-mono-caps text-[11px] text-muted-foreground">
          {post.author_name || "Anonymous"}
          {post.author_discipline && ` · ${post.author_discipline}`}
        </p>

        {post.image_url && (
          // On the detail page the whole image must be visible, whatever its
          // dimensions. fittingType="fit" letterboxes instead of cropping; the
          // fixed 16:9 box was cutting the top and bottom off tall images.
          // A max height keeps a very tall portrait from filling the screen
          // while still showing all of it.
          <div className="mt-10" data-artwork>
            <Image
              src={post.image_url}
              alt={post.title}
              fittingType="fit"
              className="max-h-[70vh] w-full"
            />
          </div>
        )}

        <div className="mt-10 text-lg leading-relaxed whitespace-pre-wrap">{post.body}</div>

        {/* replies */}
        <div className="mt-16 border-t border-border pt-10">
          <p className="font-mono-caps text-[11px] text-muted-foreground mb-8">
            {replies.length} {replies.length === 1 ? "Reply" : "Replies"}
          </p>
          <ul className="space-y-8">
            {replies.map((r) => (
              <li key={r.id} className="border-l-2 border-border pl-6">
                <p className="font-mono-caps text-[11px] text-muted-foreground">
                  {r.author_name || "Anonymous"}
                  {r.author_discipline && ` · ${r.author_discipline}`}
                </p>
                <p className="mt-2 text-base leading-relaxed whitespace-pre-wrap">{r.body}</p>
              </li>
            ))}
          </ul>

          {/* reply form */}
          <form onSubmit={handleReply} className="mt-12">
            <p className="font-mono-caps text-[11px] text-muted-foreground mb-3">Leave a reply</p>
            <textarea
              className="w-full border border-border bg-transparent px-4 py-3 text-base leading-relaxed outline-none focus:border-foreground resize-none"
              rows={4}
              placeholder="Your response…"
              value={replyBody}
              onChange={(e) => setReplyBody(e.target.value)}
              required
            />
            {error && (
              <p className="mt-3 text-sm text-destructive">{error}</p>
            )}
            <div className="mt-3 flex flex-wrap items-center justify-end gap-4">
              {justSent && !error && (
                <span className="flex items-center gap-1.5 font-mono-caps text-[11px] text-primary">
                  <Check className="h-3 w-3" /> Reply posted
                </span>
              )}
              <button
                type="submit"
                disabled={sending}
                className="flex items-center gap-2 bg-primary px-5 py-3 font-mono-caps text-[11px] text-primary-foreground hover:opacity-80 disabled:opacity-50"
              >
                {sending ? <Loader2 className="h-3 w-3 animate-spin" /> : <Send className="h-3 w-3" />}
                {sending ? "Posting…" : "Post Reply"}
              </button>
            </div>
          </form>
        </div>
      </article>
      <SlimFooter />
    </>
  );
}