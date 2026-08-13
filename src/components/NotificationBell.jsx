import React from "react";
import { Link } from "react-router-dom";
import { Bell } from "lucide-react";
import useNotifications from "@/hooks/useNotifications";

/**
 * Unread indicator in the header.
 *
 * Counts are derived from the underlying data — unread messages, replies to
 * your posts, comments on your work — rather than from rows in a notification
 * table. Nothing has to be written when an event happens, so nothing can fail
 * silently and leave the bell empty.
 */
export default function NotificationBell({ userId }) {
  const { unreadCount } = useNotifications(userId);

  const label =
    unreadCount === 0
      ? "Notifications"
      : `${unreadCount} unread notification${unreadCount > 1 ? "s" : ""}`;

  return (
    <Link
      to="/notifications"
      aria-label={label}
      title={label}
      className="relative flex items-center text-muted-foreground hover:text-foreground"
    >
      <Bell className="h-4 w-4" />
      {unreadCount > 0 && (
        <span className="absolute -top-1.5 -right-1.5 h-4 w-4 rounded-full bg-primary flex items-center justify-center font-mono-caps text-[9px] text-primary-foreground">
          {unreadCount > 9 ? "9+" : unreadCount}
        </span>
      )}
    </Link>
  );
}