import React, { useState, useEffect } from "react";
import { Link } from "react-router-dom";
import { base44 } from "@/api/base44Client";
import { Bell, MessageCircle, MessageSquare, Mail, ArrowUpRight } from "lucide-react";
import SlimFooter from "@/components/SlimFooter";
import { formatDistanceToNow } from "date-fns";
import useNotifications, { markNotificationsSeen } from "@/hooks/useNotifications";

const ICONS = {
  message: <Mail className="h-4 w-4 text-primary" />,
  reply: <MessageSquare className="h-4 w-4 text-accent" />,
  comment: <MessageCircle className="h-4 w-4 text-highlight" />,
};

const LABELS = {
  message: "Message",
  reply: "Reply",
  comment: "Comment",
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

  const { items, loading, unreadCount } = useNotifications(user?.id);

  // Mark everything as seen when leaving, not on arrival — otherwise the
  // highlight disappears before you have had a chance to read it.
  useEffect(() => {
    return () => {
      if (user?.id) markNotificationsSeen(user.id);
    };
  }, [user?.id]);

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
            <li key={n.id}>
              <Link
                to={n.link}
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