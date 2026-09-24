/**
 * Sending things to Google Analytics, when the visitor has allowed it.
 *
 * WHY PAGE VIEWS ARE SENT BY HAND
 *
 * This is a single-page app: one index.html, and the router swaps the content.
 * The Google tag counts one page view, when the page first loads, and never
 * learns that somebody moved from the home page to a gallery to an artist. All
 * 36 routes would report as a handful of landing pages, which reads as a site
 * with no depth.
 *
 * So the tag is configured with send_page_view: false in index.html, and every
 * view — including the first — is sent from the router. Configuring it that way
 * matters: leave it on and the first view is counted twice.
 *
 * WHY THE GUARD IS HERE AND NOT ONLY IN CONSENT MODE
 *
 * Consent mode already stops Google storing anything without permission, and
 * sends cookieless pings instead. That is the designed behaviour and it is
 * fine. But not sending at all until somebody has agreed is easier to explain
 * to a regulator than "we sent it, but anonymously", and costs nothing.
 */
import { analyticsAllowed } from "@/lib/consent";

const MEASUREMENT_ID = "G-B2W9TZH3JX";

const gtag = (...args) => {
  if (typeof window === "undefined" || typeof window.gtag !== "function") return false;
  window.gtag(...args);
  return true;
};

/**
 * One page view. `path` should include the query string if it matters, and
 * nothing else — never an email or a token, which would end up in reports.
 */
export function trackPageView(path, title) {
  if (!analyticsAllowed()) return;
  gtag("event", "page_view", {
    page_path: path,
    page_title: title || (typeof document !== "undefined" ? document.title : undefined),
    page_location: typeof window !== "undefined" ? window.location.href : undefined,
    send_to: MEASUREMENT_ID,
  });
}

/**
 * Anything worth counting that is not a page view.
 *
 * Use GA4's own names where they exist — sign_up, generate_lead, search — so
 * the reports Google builds for free actually populate. Params should describe
 * the thing, never the person.
 */
export function trackEvent(name, params = {}) {
  if (!analyticsAllowed()) return;
  gtag("event", name, { ...params, send_to: MEASUREMENT_ID });
}

/* The handful of actions worth measuring on this site, named once so call
 * sites cannot drift into sign_up / signup / signUp. */
export const EVENTS = {
  SIGN_UP: "sign_up",
  /** An enquiry to a gallery or artist — arguably the site's real conversion. */
  ENQUIRY: "generate_lead",
  NEWSLETTER: "newsletter_signup",
  MEMBERSHIP_START: "begin_checkout",
  SEARCH: "search",
  MAP_OPEN_LISTING: "map_open_listing",
  DIRECTIONS: "get_directions",
};
