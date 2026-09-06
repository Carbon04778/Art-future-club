import React from "react";
import { STATUS, effectiveStatus } from "@/lib/profileReadiness";

/**
 * "Only you can see this" marker for a profile that is not yet published.
 *
 * WHY THIS EXISTS
 *
 * Row-level security returns a member their OWN unapproved profile, which is
 * correct — they must be able to open and edit it. But the public directories
 * simply render whatever the API returns, so a signed-in member browsing the
 * artists or galleries page saw their own pending profile sitting in the
 * listing and reasonably concluded it had gone live. It had not: nobody else
 * could see it.
 *
 * This is the difference between "the row is hidden" and "the member can tell
 * it is hidden". The first was already true; only the second was missing.
 *
 * Renders nothing for an approved profile, so it is safe to drop into any
 * card unconditionally.
 */
export default function UnpublishedBadge({ profile, className = "" }) {
  const status = effectiveStatus(profile);
  if (status === STATUS.APPROVED) return null;

  const waiting = status === STATUS.PENDING || status === STATUS.FLAGGED;

  return (
    <span
      title={
        waiting
          ? "Submitted for review. Only you can see this until the AFC team publishes it."
          : "Not submitted yet. Only you can see this."
      }
      className={`font-mono-caps text-[9px] px-1 py-0.5 border ${
        waiting ? "border-primary text-primary" : "border-yellow-600 text-yellow-600"
      } ${className}`}
    >
      {waiting ? "In review — only you" : "Not published — only you"}
    </span>
  );
}
