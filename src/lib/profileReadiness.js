/**
 * Profile moderation — statuses, and what a profile needs before it may be
 * submitted for review.
 *
 * WHY THIS EXISTS
 *
 * A new member could previously sign up, fill in anything at all, and be live
 * on the public site immediately. There was no point at which anybody looked.
 *
 * WHAT THIS IS NOT
 *
 * It is NOT the completeness percentage in ProfileCompletenessScore. That is a
 * nudge, and reaching 100% there requires a website and an Instagram handle —
 * neither of which says anything about whether the content is safe to publish,
 * and plenty of legitimate artists have neither. Gating on it would lock real
 * members out permanently.
 *
 * This is a separate, smaller list: the things a reviewer actually needs in
 * order to judge a profile. The percentage is left alone.
 *
 * SECURITY NOTE
 *
 * Nothing here is a security boundary. The browser holds the anon key, so the
 * real gate is the RLS policy and the status trigger in
 * supabase/migrations/017_profile_moderation.sql. This module only decides
 * what the member is shown and when the submit button becomes available.
 */

// Relative, with the extension: the demo provider imports this module, and
// scripts/verify-provider.mjs loads that provider under plain Node, where the
// "@/" alias does not exist and extensionless specifiers do not resolve.
import { VENUE_TYPES } from "./venueTypes.js";

/* ------------------------------------------------------------------ status */

export const STATUS = {
  /** Being built. Never submitted. Not public. */
  DRAFT: "draft",
  /** Submitted, waiting for an admin. Not public. */
  PENDING: "pending",
  /** An admin approved it. Public. */
  APPROVED: "approved",
  /** An admin sent it back with a reason. Not public; the member may resubmit. */
  REJECTED: "rejected",
  /**
   * Reserved for the automated screening planned for a later phase. Treated
   * exactly like PENDING — hidden from the public and surfaced in the admin
   * queue — so that system can set this value and work immediately, with no
   * further migration and no change here.
   */
  FLAGGED: "flagged",
};

export const ALL_STATUSES = Object.values(STATUS);

/** Statuses whose rows the public may see. Mirrors the RLS policy in 017. */
export const PUBLIC_STATUSES = [STATUS.APPROVED];

/** Statuses that belong in the admin review queue. */
export const REVIEWABLE_STATUSES = [STATUS.PENDING, STATUS.FLAGGED];

export const isPublicStatus = (status) => PUBLIC_STATUSES.includes(status);

/**
 * Rows written before moderation existed have no status at all. They are
 * grandfathered as approved — migration 017 backfills the column, and this
 * keeps the app consistent for any row that slips through (and for the demo
 * provider's seed data).
 */
export const effectiveStatus = (profile) => profile?.status || STATUS.APPROVED;

/* ------------------------------------------------------- which rows moderate */

/**
 * collector_profile holds galleries, venues AND private collectors, curators
 * and advisors. Only the ones that publish a public page with imagery are
 * moderated; a collector profile is a thin, largely private record.
 *
 * Kept in step with the SQL in migration 017 by scripts/verify-moderation.mjs,
 * because a list duplicated across JS and SQL is exactly the kind of thing
 * that drifts in this codebase.
 */
export const MODERATED_COLLECTOR_TYPES = ["Gallery", ...VENUE_TYPES];

export const isModeratedCollectorType = (type) =>
  MODERATED_COLLECTOR_TYPES.includes(type);

/* ------------------------------------------------------------ requirements */

const hasText = (v) => typeof v === "string" && v.trim().length > 0;

/** At least one portfolio entry that actually carries an image. */
const hasArtworkWithImage = (works) =>
  Array.isArray(works) && works.some((w) => hasText(w?.image_url));

const ARTIST_REQUIREMENTS = [
  { key: "display_name", label: "Your name or studio name", check: (p) => hasText(p.display_name) },
  { key: "avatar_url", label: "A profile photo", check: (p) => hasText(p.avatar_url) },
  { key: "bio", label: "A short bio describing your practice", check: (p) => hasText(p.bio) },
  { key: "discipline", label: "Your discipline", check: (p) => hasText(p.discipline) },
  {
    key: "location",
    label: "Where you are based, or your chapter",
    check: (p) => hasText(p.based_in) || hasText(p.chapter),
  },
  {
    key: "portfolio_works",
    label: "At least one artwork, with an image",
    check: (p) => hasArtworkWithImage(p.portfolio_works),
  },
];

/**
 * Galleries and venues are deliberately NOT asked for artworks. A space can be
 * perfectly legitimate before it has uploaded a single piece, and blocking it
 * on that would stop new partners listing at all. A logo, a description and an
 * address are enough for a reviewer to judge it.
 */
const GALLERY_REQUIREMENTS = [
  { key: "display_name", label: "The gallery or venue name", check: (p) => hasText(p.display_name) },
  { key: "avatar_url", label: "A logo or profile photo", check: (p) => hasText(p.avatar_url) },
  { key: "bio", label: "A short description of the space", check: (p) => hasText(p.bio) },
  { key: "type", label: "What kind of space this is", check: (p) => hasText(p.type) },
  {
    key: "location",
    label: "An address, or the city you are based in",
    check: (p) => hasText(p.address) || hasText(p.based_in),
  },
];

export const requirementsFor = (kind) =>
  kind === "artist" ? ARTIST_REQUIREMENTS : GALLERY_REQUIREMENTS;

/**
 * What is still missing before this profile may be submitted.
 *
 * @param profile the form state or the saved row
 * @param kind    "artist" | "gallery"
 * @returns { met, missing, ready, total }
 */
export function readiness(profile, kind = "artist") {
  const list = requirementsFor(kind);
  const safe = profile || {};
  const met = list.filter((r) => r.check(safe));
  const missing = list.filter((r) => !r.check(safe));
  return { met, missing, ready: missing.length === 0, total: list.length };
}
