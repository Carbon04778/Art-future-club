/**
 * Free-plan limits, in one place.
 *
 * They are currently OFF while the club builds out the site: members and
 * galleries can add as much as they like, and nothing prompts them to
 * upgrade. Payments are untouched — the Stripe checkout still works, and
 * anyone who does subscribe keeps their subscription.
 *
 * TO TURN THE LIMITS BACK ON, set this to true. That is the only change
 * needed; every check reads from here rather than testing a number inline,
 * which is how they came to be scattered across four files in the first
 * place.
 */
export const LIMITS_ENABLED = false;

/** Portfolio works a free artist may add. */
export const FREE_ARTWORK_LIMIT = 4;

/** Works a free gallery may show. */
export const FREE_GALLERY_WORK_LIMIT = 4;

/**
 * Has this member reached a limit?
 *
 * Always false while limits are disabled, so callers do not each need to
 * remember to check the switch.
 */
export const atLimit = (count, limit) => LIMITS_ENABLED && count >= limit;

/**
 * Should paid-only content be locked?
 *
 * Open call links are the main case. While limits are off, everything is
 * open to everyone.
 */
export const isLocked = (isPaidMember) => LIMITS_ENABLED && !isPaidMember;
