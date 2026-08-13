import { useState, useEffect, useCallback } from "react";
import { base44 } from "@/api/base44Client";

/**
 * Notifications derived from data that already exists.
 *
 * The previous approach wrote a row to the `notification` table at the moment
 * something happened. If that write failed — as it did when a CHECK constraint
 * rejected it — the notification was lost permanently and the failure was
 * invisible.
 *
 * This reads the source data instead:
 *
 *   unread messages      -> message.recipient_id = me, read = false
 *   replies to my posts  -> forum_reply on a forum_post I authored
 *   comments on my work  -> comment whose target belongs to my profile
 *
 * Because the reply exists, the notification exists. Nothing extra is written,
 * so nothing can silently fail, and it works retroactively for anything that
 * happened before this was added.
 *
 * "Seen" is tracked as a single timestamp per member in localStorage rather
 * than a flag per item, so viewing the page requires no database write.
 */

const SEEN_KEY = "afc_notifications_seen_at";

function seenAt(userId) {
  if (typeof window === "undefined" || !userId) return 0;
  const v = window.localStorage.getItem(`${SEEN_KEY}:${userId}`);
  return v ? Number(v) : 0;
}

export function markNotificationsSeen(userId) {
  if (typeof window === "undefined" || !userId) return;
  window.localStorage.setItem(`${SEEN_KEY}:${userId}`, String(Date.now()));
}

export default function useNotifications(userId) {
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    if (!userId) {
      setItems([]);
      setLoading(false);
      return;
    }

    // Settled, not all: one failing query must not blank the whole list.
    const [msgRes, postRes, artistRes, collectorRes] = await Promise.allSettled([
      base44.entities.Message.filter({ recipient_id: userId }, "-created_date", 100),
      base44.entities.ForumPost.filter({ author_id: userId }, "-created_date", 100),
      base44.entities.ArtistProfile.filter({ user_id: userId }, "-created_date", 5),
      base44.entities.CollectorProfile.filter({ user_id: userId }, "-created_date", 5),
    ]);

    const messages = msgRes.status === "fulfilled" ? msgRes.value : [];
    const myPosts = postRes.status === "fulfilled" ? postRes.value : [];
    const myProfiles = [
      ...(artistRes.status === "fulfilled" ? artistRes.value : []),
      ...(collectorRes.status === "fulfilled" ? collectorRes.value : []),
    ];

    const out = [];

    /* ---------------------------------------------------------- messages */
    for (const m of messages) {
      out.push({
        id: `msg-${m.id}`,
        kind: "message",
        who: m.sender_name || "A member",
        text: m.body?.slice(0, 90) || "Sent you a message",
        at: m.created_date,
        link: "/messages",
        unread: m.read === false,
      });
    }

    /* ------------------------------------------- replies to my posts ---- */
    if (myPosts.length) {
      const replyLists = await Promise.allSettled(
        myPosts.map((p) =>
          base44.entities.ForumReply.filter({ post_id: p.id }, "-created_date", 50)
        )
      );
      replyLists.forEach((res, i) => {
        if (res.status !== "fulfilled") return;
        const post = myPosts[i];
        for (const r of res.value) {
          // Your own reply to your own post is not news.
          if (r.author_id === userId) continue;
          out.push({
            id: `reply-${r.id}`,
            kind: "reply",
            who: r.author_name || "A member",
            text: `replied to "${post.title}"`,
            at: r.created_date,
            link: `/community/post/${post.id}`,
          });
        }
      });
    }

    /* --------------------------------------- comments on my own work ---- */
    if (myProfiles.length) {
      const commentLists = await Promise.allSettled(
        myProfiles.map((p) =>
          // Artwork comments use "<profileId>-work-N" as the target, and the
          // profile itself uses the bare id, so a prefix match covers both.
          base44.entities.Comment.list("-created_date", 200).then((all) =>
            all.filter(
              (c) => c.target_id === p.id || String(c.target_id).startsWith(`${p.id}-`)
            )
          )
        )
      );
      commentLists.forEach((res, i) => {
        if (res.status !== "fulfilled") return;
        const profile = myProfiles[i];
        for (const c of res.value) {
          if (c.user_id === userId) continue;
          out.push({
            id: `comment-${c.id}`,
            kind: "comment",
            who: c.user_name || "A member",
            text: `commented on your work — "${c.body?.slice(0, 60)}"`,
            at: c.created_date,
            link: profile.display_name
              ? `/artists/${profile.id}`
              : "/",
          });
        }
      });
    }

    /* ------------------------------------------------------------ sort */
    const since = seenAt(userId);
    const sorted = out
      .map((n) => ({
        ...n,
        // Messages carry their own read flag; everything else is "new since
        // you last opened this page".
        unread: n.unread ?? (n.at ? new Date(n.at).getTime() > since : false),
      }))
      .sort((a, b) => new Date(b.at || 0) - new Date(a.at || 0))
      .slice(0, 100);

    setItems(sorted);
    setLoading(false);
  }, [userId]);

  useEffect(() => {
    let alive = true;
    const run = () => {
      if (alive) load();
    };
    run();
    const interval = setInterval(run, 30000);
    // Returning to the tab is when a stale badge is most obvious.
    window.addEventListener("focus", run);
    return () => {
      alive = false;
      clearInterval(interval);
      window.removeEventListener("focus", run);
    };
  }, [load]);

  return { items, loading, unreadCount: items.filter((n) => n.unread).length, reload: load };
}