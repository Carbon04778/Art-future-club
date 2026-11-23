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

/**
 * Is anything on the site asking for payment?
 *
 * OFF — owner, 2026-11-23: "remove every places that ask for payment for now
 * save all in files till further notice". Nothing was deleted. While this is
 * false:
 *   - /upgrade and /membership-policy send visitors to the home page,
 *   - the "Membership" / "Membership Policy" footer links, the Community
 *     sidebar and profile-editor "Upgrade ↑" links are hidden,
 *   - every "Upgrade Membership" button (Collectors, Open Calls, free-limit
 *     pop-ups) is hidden,
 *   - the free-plan limits stay off even if LIMITS_ENABLED is set to true,
 *     because a limit with no way to upgrade would simply block people,
 *   - the "Membership" paragraph on About Us is hidden,
 *   - /membership-policy is left out of the sitemap.
 * Stripe, existing subscriptions, premium badges and the admin
 * Subscriptions tab are untouched.
 *
 * TO BRING PAYMENTS BACK: set this to true. Full list in
 * docs/PAYMENTS-PAUSED.md.
 */
export const PAYMENTS_ENABLED = false;

/** Free-plan limits apply only when both switches are on. */
export const LIMITS_ACTIVE = LIMITS_ENABLED && PAYMENTS_ENABLED;

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
export const atLimit = (count, limit) => LIMITS_ACTIVE && count >= limit;

/**
 * Should paid-only content be locked?
 *
 * Open call links are the main case. While limits are off, everything is
 * open to everyone.
 */
export const isLocked = (isPaidMember) => LIMITS_ACTIVE && !isPaidMember;

/**
 * Is "Continue with Google" offered on the sign-in and join pages?
 *
 * OFF, because it does not work. The button calls
 * signInWithOAuth({ provider: "google" }), and Google is not among the
 * providers enabled on the Supabase project — only email is. Checked
 * 2026-09-24 against /auth/v1/settings, which reported:
 *
 *   ON : email
 *   off: google, apple, facebook, github, and the rest
 *
 * So the button sat above the email form, first thing anyone tried, and
 * returned an error. Hidden rather than deleted: the markup and the provider
 * call are correct, and nothing about them needs rewriting.
 *
 * TO TURN IT BACK ON: enable Google in Supabase (Authentication ->
 * Providers), which needs OAuth credentials and a consent screen in Google
 * Cloud — a different setup from the Maps API key, which needs no consent
 * screen at all. Then set this to true. Nothing else changes.
 */
export const GOOGLE_SIGN_IN_ENABLED = false;
