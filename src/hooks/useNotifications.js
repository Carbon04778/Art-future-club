import { useState, useEffect, useCallback, useRef } from "react";
import { base44 } from "@/api/base44Client";
import { STATUS, effectiveStatus, isModeratedCollectorType } from "@/lib/profileReadiness";
import { isVenueType } from "@/lib/venueTypes";
import { artistPath, spacePath, eventPath } from "@/lib/slugs";

/**
 * Notifications derived from data that already exists.
 *
 * WHY DERIVED AND NOT STORED
 *
 * The original approach wrote a row to the `notification` table at the moment
 * something happened. If that write failed — as it did when a CHECK constraint
 * rejected it — the notification was lost permanently and invisibly.
 *
 * Reading the source data instead means the notification exists because the
 * event exists. Nothing extra is written, so nothing can silently fail, and it
 * works retroactively for anything that happened before a type was added.
 *
 * WHAT CHANGED
 *
 * It only ever covered three things: messages, forum replies and comments.
 * Nobody was told about an enquiry on their work, a new follower, someone
 * collecting a piece, or — after moderation shipped — whether their profile
 * had been approved. Admins were not told a profile was waiting for review.
 *
 * READ STATE
 *
 * Every notification carries a stable `key`, and `notification_read` records
 * which keys a member has read (migration 018). Previously this was a single
 * timestamp in localStorage: opening the page marked everything read at once,
 * and nothing stayed read on another device.
 */

/* Bounded so a busy account cannot turn one poll into a huge fetch. */
const LIMIT = 60;
const SCAN = 200;
/* Anything older than this is not news. Keeps the derived set small. */
const WINDOW_DAYS = 60;

export const NOTIFICATION_KINDS = [
  "message",
  "reply",
  "comment",
  "inquiry",
  "collected",
  "follow",
  "review",
  "new_work",
  "new_exhibition",
  "review_queue",
];

const sinceIso = () =>
  new Date(Date.now() - WINDOW_DAYS * 86_400_000).toISOString();

const recent = (rows, field = "created_date") => {
  const cutoff = sinceIso();
  return (rows || []).filter((r) => !r?.[field] || r[field] >= cutoff);
};

const settled = (res) => (res.status === "fulfilled" ? res.value || [] : []);

export default function useNotifications(userId, options = {}) {
  const { isAdmin = false } = options;
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(true);
  const [readKeys, setReadKeys] = useState(() => new Set());
  // Avoids a re-render loop: the loader reads this without depending on it.
  const readKeysRef = useRef(readKeys);
  readKeysRef.current = readKeys;

  const load = useCallback(async () => {
    if (!userId) {
      setItems([]);
      setLoading(false);
      return;
    }

    /* ---------------------------------------------------------- who am I */
    const [artistRes, collectorRes, readRes] = await Promise.allSettled([
      base44.entities.ArtistProfile.filter({ user_id: userId }, "-created_date", 5),
      base44.entities.CollectorProfile.filter({ user_id: userId }, "-created_date", 5),
      base44.entities.NotificationRead.filter({ user_id: userId }, "-read_at", 500).catch(() => []),
    ]);
    const myArtists = settled(artistRes);
    const myCollectors = settled(collectorRes);
    const myProfiles = [...myArtists, ...myCollectors];
    const myProfileIds = new Set(myProfiles.map((p) => p.id));

    const alreadyRead = new Set(settled(readRes).map((r) => r.notification_key));
    setReadKeys(alreadyRead);

    /* ------------------------------------------------------- what happened */
    /*
     * A gallery's works are their own rows, and a comment on one carries the
     * WORK's id as its target — not the gallery's profile id. Without these,
     * a gallery owner would never be told about a comment on a piece they are
     * showing, because the ownership test below would not match.
     */
    const myGalleryWorks = myCollectors.length
      ? await base44.entities.GalleryWork
          .filter({ gallery_id: { $in: myCollectors.map((c) => c.id) } }, "-created_date", SCAN, "id,title,gallery_id")
          .catch(() => [])
      : [];
    const myWorkIds = new Set(myGalleryWorks.map((w) => w.id));

    const [
      msgRes, postRes, replyRes, commentRes, inquiryRes,
      collectedRes, followerRes, followingRes,
    ] = await Promise.allSettled([
      base44.entities.Message.filter({ recipient_id: userId }, "-created_date", LIMIT),
      base44.entities.ForumPost.filter({ author_id: userId }, "-created_date", 50),
      // One query, filtered here. This used to run once PER POST.
      base44.entities.ForumReply.list("-created_date", SCAN),
      // One query. This used to run once per profile, fetching 200 comments
      // each time with identical arguments.
      base44.entities.Comment.list("-created_date", SCAN),
      base44.entities.Inquiry.filter({ artist_user_id: userId }, "-created_date", LIMIT),
      base44.entities.CollectedWork.list("-created_date", SCAN),
      base44.entities.Follow.filter({ following_id: userId }, "-created_date", LIMIT),
      base44.entities.Follow.filter({ follower_id: userId }, "-created_date", 100),
    ]);

    const out = [];
    const push = (n) => out.push(n);

    /* -------------------------------------------------------- 1. messages */
    for (const m of recent(settled(msgRes))) {
      push({
        key: `message-${m.id}`,
        kind: "message",
        who: m.sender_name || "A member",
        text: m.body?.slice(0, 90) || "Sent you a message",
        at: m.created_date,
        link: "/messages",
        // Messages carry a real read flag of their own, which is more
        // authoritative than a read marker.
        forcedUnread: m.read === false,
      });
    }

    /* ------------------------------------------- 2. replies to my posts */
    const myPosts = settled(postRes);
    const myPostsById = new Map(myPosts.map((p) => [p.id, p]));
    for (const r of recent(settled(replyRes))) {
      const post = myPostsById.get(r.post_id);
      if (!post || r.author_id === userId) continue;
      push({
        key: `reply-${r.id}`,
        kind: "reply",
        who: r.author_name || "A member",
        text: `replied to "${post.title}"`,
        at: r.created_date,
        link: `/community/post/${post.id}`,
      });
    }

    /* --------------------------------------- 3. comments on my own work */
    /*
     * A comment target is one of three shapes:
     *   "<profileId>"            the profile itself
     *   "<profileId>-work-<n>"   one of an artist's portfolio works
     *   "<galleryWorkId>"        a row in gallery_work
     */
    const mine = (targetId) =>
      myProfileIds.has(targetId) ||
      myWorkIds.has(targetId) ||
      [...myProfileIds].some((id) => String(targetId).startsWith(`${id}-`));
    for (const c of recent(settled(commentRes))) {
      if (c.user_id === userId || !mine(c.target_id)) continue;
      push({
        key: `comment-${c.id}`,
        kind: "comment",
        who: c.user_name || "A member",
        text: `commented on your work — "${c.body?.slice(0, 60)}"`,
        at: c.created_date,
        link: myArtists[0] ? artistPath(myArtists[0]) : "/",
      });
    }

    /* ---------------------------------------------------- 4. enquiries */
    for (const q of recent(settled(inquiryRes))) {
      push({
        key: `inquiry-${q.id}`,
        kind: "inquiry",
        who: q.buyer_name || "Someone",
        text:
          q.type === "commission"
            ? `wants to commission you${q.work_title ? ` — ${q.work_title}` : ""}`
            : `enquired about "${q.work_title || "your work"}"${q.price ? ` (${q.currency || ""} ${q.price})` : ""}`,
        at: q.created_date,
        link: myArtists[0] ? artistPath(myArtists[0]) : "/",
      });
    }

    /* ------------------------------------- 5. someone collected my work */
    for (const w of recent(settled(collectedRes))) {
      if (w.user_id === userId) continue;
      if (!myProfileIds.has(w.artist_id)) continue;
      push({
        key: `collected-${w.id}`,
        kind: "collected",
        who: "A collector",
        text: `added "${w.work_title || "your work"}" to their collection`,
        at: w.created_date,
        link: myArtists[0] ? artistPath(myArtists[0]) : "/",
      });
    }

    /* -------------------------------------------------- 6. new followers */
    for (const f of recent(settled(followerRes))) {
      if (f.follower_id === userId) continue;
      push({
        key: `follow-${f.id}`,
        kind: "follow",
        who: "A member",
        text: "started following you",
        at: f.created_date,
        link: myArtists[0] ? artistPath(myArtists[0]) : "/",
      });
    }

    /* ------------------------------- 7. my profile was reviewed (017) */
    for (const p of myProfiles) {
      const status = effectiveStatus(p);
      if (!p.reviewed_at) continue;
      if (status === STATUS.APPROVED) {
        push({
          key: `review-${p.id}-${p.reviewed_at}`,
          kind: "review",
          who: "AFC team",
          text: `approved "${p.display_name}" — your profile is now live`,
          at: p.reviewed_at,
          link: p.discipline ? artistPath(p) : spacePath(p, false),
        });
      } else if (status === STATUS.REJECTED) {
        push({
          key: `review-${p.id}-${p.reviewed_at}`,
          kind: "review",
          who: "AFC team",
          text: p.review_note
            ? `asked for changes to "${p.display_name}" — ${p.review_note.slice(0, 90)}`
            : `asked for changes to "${p.display_name}"`,
          at: p.reviewed_at,
          link: p.discipline ? "/profile/edit" : "/collector-profile",
        });
      }
    }

    /* ------------------ 8. new work from artists and galleries I follow */
    const followingIds = settled(followingRes)
      .map((f) => f.following_id)
      .filter(Boolean);

    if (followingIds.length) {
      const [fArtistRes, fSpaceRes] = await Promise.allSettled([
        base44.entities.ArtistProfile.filter(
          { user_id: { $in: followingIds } }, "-updated_date", 100,
          "id,display_name,user_id,portfolio_works,status,slug"
        ),
        base44.entities.CollectorProfile.filter(
          { user_id: { $in: followingIds } }, "-updated_date", 100,
          "id,display_name,user_id,type,status,slug"
        ),
      ]);
      const fArtists = settled(fArtistRes);
      const fSpaces = settled(fSpaceRes);

      // Only from profiles the public can actually see.
      const visible = (p) =>
        effectiveStatus(p) === STATUS.APPROVED ||
        (p.type && !isModeratedCollectorType(p.type));

      const cutoff = sinceIso();

      /* An artist's works are a JSON list, dated by added_date — stamped on
       * save since this release. Works with no stamp predate it and are not
       * announced, which is what stops a back catalogue arriving at once. */
      for (const a of fArtists) {
        if (!visible(a)) continue;
        (a.portfolio_works || []).forEach((w, i) => {
          if (!w?.added_date || w.added_date < cutoff) return;
          push({
            key: `newwork-${a.id}-${i}-${w.added_date}`,
            kind: "new_work",
            who: a.display_name || "An artist you follow",
            text: `added a new work — "${w.title || "Untitled"}"`,
            at: w.added_date,
            link: artistPath(a),
          });
        });
      }

      const spaceById = new Map(fSpaces.filter(visible).map((s) => [s.id, s]));
      if (spaceById.size) {
        const [gwRes, evRes] = await Promise.allSettled([
          base44.entities.GalleryWork.list("-created_date", SCAN,
            "id,title,gallery_id,created_date"),
          base44.entities.Event.list("-created_date", SCAN,
            "id,title,organizer_id,organizer_name,created_date,start_date,slug"),
        ]);
        for (const w of recent(settled(gwRes))) {
          const space = spaceById.get(w.gallery_id);
          if (!space) continue;
          push({
            key: `newwork-gallery-${w.id}`,
            kind: "new_work",
            who: space.display_name || "A gallery you follow",
            text: `added a new work — "${w.title || "Untitled"}"`,
            at: w.created_date,
            link: spacePath(space, isVenueType(space.type)),
          });
        }
        const followedUserIds = new Set(followingIds);
        for (const e of recent(settled(evRes))) {
          if (!e.organizer_id || !followedUserIds.has(e.organizer_id)) continue;
          push({
            key: `newevent-${e.id}`,
            kind: "new_exhibition",
            who: e.organizer_name || "A space you follow",
            text: `announced "${e.title}"`,
            at: e.created_date,
            link: eventPath(e),
          });
        }
      }
    }

    /* --------------------------- 9. admins: profiles awaiting review */
    if (isAdmin) {
      const [pendA, pendC] = await Promise.allSettled([
        base44.entities.ArtistProfile.filter({ status: STATUS.PENDING }, "-created_date", LIMIT,
          "id,display_name,created_date,status,slug"),
        base44.entities.CollectorProfile.filter({ status: STATUS.PENDING }, "-created_date", LIMIT,
          "id,display_name,created_date,status,type,slug"),
      ]);
      for (const p of [...settled(pendA), ...settled(pendC)]) {
        push({
          key: `queue-${p.id}-${p.created_date}`,
          kind: "review_queue",
          who: p.display_name || "A new member",
          text: "is waiting for review",
          at: p.created_date,
          link: "/admin",
        });
      }
    }

    /* ------------------------------------------------------------ finish */
    /*
     * A message carries its own `read` flag, which is authoritative — if the
     * member opened the conversation, it is read whether or not a marker
     * exists. Everything else is unread until a marker says otherwise.
     */
    const isUnread = (n) =>
      n.forcedUnread === false ? false : !alreadyRead.has(n.key);

    setItems(
      out
        .map((n) => ({ ...n, unread: isUnread(n) }))
        .sort((a, b) => new Date(b.at || 0) - new Date(a.at || 0))
        .slice(0, 100)
    );
    setLoading(false);
  }, [userId, isAdmin]);

  useEffect(() => {
    let alive = true;
    const run = () => { if (alive) load(); };
    run();
    // 90s, not 30s. This does about a dozen queries; a third of a minute was
    // wasteful for something that is rarely time-critical.
    const interval = setInterval(run, 90_000);
    window.addEventListener("focus", run);
    return () => {
      alive = false;
      clearInterval(interval);
      window.removeEventListener("focus", run);
    };
  }, [load]);

  /** Mark ONE notification read, and keep it read on every device. */
  const markRead = useCallback(
    async (key) => {
      if (!userId || !key) return;
      setReadKeys((prev) => new Set(prev).add(key));
      setItems((prev) => prev.map((n) => (n.key === key ? { ...n, unread: false } : n)));
      try {
        await base44.entities.NotificationRead.create({
          user_id: userId,
          notification_key: key,
          read_at: new Date().toISOString(),
        });
      } catch {
        /* Already marked, or offline. The optimistic update stands; the next
         * load reconciles from the database. */
      }
    },
    [userId]
  );

  const markAllRead = useCallback(async () => {
    const unreadNow = items.filter((n) => n.unread);
    // Messages have their own read flag — clear that too, or the count would
    // come straight back on the next poll.
    await Promise.allSettled([
      ...unreadNow.map((n) => markRead(n.key)),
      ...unreadNow
        .filter((n) => n.kind === "message")
        .map((n) =>
          base44.entities.Message.update(n.key.replace("message-", ""), { read: true })
        ),
    ]);
  }, [items, markRead]);

  return {
    items,
    loading,
    unreadCount: items.filter((n) => n.unread).length,
    reload: load,
    markRead,
    markAllRead,
  };
}
