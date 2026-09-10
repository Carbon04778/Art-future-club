import React, { useState, useEffect } from "react";
import { Link } from "react-router-dom";
import { base44 } from "@/api/base44Client";
import {
  Bell, MessageCircle, MessageSquare, Mail, ArrowUpRight, ShoppingBag,
  Bookmark, UserPlus, BadgeCheck, Image as ImageIcon, CalendarDays, ClipboardCheck,
} from "lucide-react";
import SlimFooter from "@/components/SlimFooter";
import { formatDistanceToNow } from "date-fns";
import useNotifications from "@/hooks/useNotifications";

const ICONS = {
  message: <Mail className="h-4 w-4 text-primary" />,
  reply: <MessageSquare className="h-4 w-4 text-accent" />,
  comment: <MessageCircle className="h-4 w-4 text-highlight" />,
  inquiry: <ShoppingBag className="h-4 w-4 text-primary" />,
  collected: <Bookmark className="h-4 w-4 text-accent" />,
  follow: <UserPlus className="h-4 w-4 text-highlight" />,
  review: <BadgeCheck className="h-4 w-4 text-green-600" />,
  new_work: <ImageIcon className="h-4 w-4 text-primary" />,
  new_exhibition: <CalendarDays className="h-4 w-4 text-accent" />,
  review_queue: <ClipboardCheck className="h-4 w-4 text-yellow-600" />,
};

const LABELS = {
  message: "Message",
  reply: "Reply",
  comment: "Comment",
  inquiry: "Enquiry",
  collected: "Collected",
  follow: "New follower",
  review: "Your profile",
  new_work: "New work",
  new_exhibition: "Exhibition",
  review_queue: "Waiting for review",
};

export default function Notifications() {
  const [user, setUser] = useState(null);
  const [authChecked, setAuthChecked] = useState(false);

  useEffect(() => {
    base44.auth
      .me()
      .then(setUser)
      .catch(() => setUser(null))
      .finally(() => setAuthChecked(true));
  }, []);

  /*
   * Admins also see profiles waiting for review, which is the only way anyone
   * learns the moderation queue has something in it.
   */
  const { items, loading, unreadCount, markRead, markAllRead } = useNotifications(
    user?.id,
    { isAdmin: user?.role === "admin" }
  );

  /*
   * Nothing is marked read on arrival or on leaving any more.
   *
   * It used to write a single "seen" timestamp to localStorage when the page
   * unmounted, which marked EVERYTHING read whether or not it had been looked
   * at, and only on that one browser. Each notification is now marked when it
   * is actually opened, and that is stored per member so it stays read on
   * their phone too.
   */

  return (
    <>
      <div className="mx-auto max-w-2xl px-6 py-16 md:px-10">
        <div className="mb-10 flex flex-wrap items-center gap-4">
          <Bell className="h-6 w-6" />
          <h1 className="font-heading text-4xl font-medium tracking-[-0.02em]">
            Notifications
          </h1>
          {unreadCount > 0 && (
            <span className="bg-primary px-2 py-0.5 font-mono-caps text-[11px] text-primary-foreground">
              {unreadCount} new
            </span>
          )}
          {unreadCount > 0 && (
            <button
              type="button"
              onClick={markAllRead}
              className="ml-auto font-mono-caps text-[10px] text-muted-foreground transition-colors hover:text-primary"
            >
              Mark all as read
            </button>
          )}
        </div>

        {(!authChecked || loading) && (
          <div className="flex justify-center py-16">
            <div className="h-6 w-6 animate-spin rounded-full border-2 border-border border-t-foreground" />
          </div>
        )}

        {authChecked && !user && (
          <div className="border border-border py-16 text-center">
            <p className="font-mono-caps text-[11px] text-muted-foreground">
              Sign in to see your notifications.
            </p>
            <Link
              to="/login"
              className="mt-4 inline-block font-mono-caps text-[11px] text-primary hover:underline"
            >
              Sign in →
            </Link>
          </div>
        )}

        {authChecked && user && !loading && items.length === 0 && (
          <div className="border border-border py-16 text-center">
            <Bell className="mx-auto mb-4 h-8 w-8 text-muted-foreground" />
            <p className="font-mono-caps text-[11px] text-muted-foreground">
              Nothing yet. Messages, replies to your posts and comments on your
              work will appear here.
            </p>
          </div>
        )}

        <ul className="space-y-px">
          {items.map((n) => (
            // n.key, not n.id — a derived notification has no row of its own.
            <li key={n.key}>
              <Link
                to={n.link}
                // Opening it marks that ONE read, and it stays read on every
                // device. Navigation is unaffected: the write is fired and not
                // awaited, so the page changes immediately.
                onClick={() => markRead(n.key)}
                className={`flex items-start gap-4 border-b border-border px-5 py-4 transition-colors hover:bg-muted/40 ${
                  n.unread ? "bg-primary/5" : ""
                }`}
              >
                <div className="mt-0.5 shrink-0">
                  {ICONS[n.kind] || <Bell className="h-4 w-4" />}
                </div>
                <div className="min-w-0 flex-1">
                  <p className="font-mono-caps text-[10px] text-muted-foreground">
                    {LABELS[n.kind] || "Update"}
                  </p>
                  <p className="mt-1 text-sm leading-relaxed">
                    <span className="text-foreground">{n.who}</span>{" "}
                    <span className="text-foreground/70">{n.text}</span>
                  </p>
                  <p className="mt-1 font-mono-caps text-[10px] text-muted-foreground">
                    {n.at
                      ? formatDistanceToNow(new Date(n.at), { addSuffix: true })
                      : ""}
                  </p>
                </div>
                <div className="mt-1 flex shrink-0 items-center gap-2">
                  {n.unread && <span className="h-2 w-2 rounded-full bg-primary" />}
                  <ArrowUpRight className="h-3 w-3 text-muted-foreground" />
                </div>
              </Link>
            </li>
          ))}
        </ul>
      </div>
      <SlimFooter />
    </>
  );
}