/**
 * What the visitor has agreed to, and telling Google about it.
 *
 * HOW CONSENT MODE WORKS HERE
 *
 * index.html sets every signal to `denied` BEFORE the Google tag loads, so
 * nothing is stored and no identified hit is sent until somebody chooses. That
 * ordering is the whole mechanism: a banner that appears after the tag has
 * already fired is decoration.
 *
 * The same inline script re-applies a stored choice synchronously, so a
 * returning visitor who accepted is not treated as denied for the first few
 * hundred milliseconds of every visit.
 *
 * WHY THE CHOICE IS RECORDED, NOT JUST APPLIED
 *
 * GDPR asks you to be able to show that consent was given: when, and to what.
 * A boolean in localStorage cannot show that. So the record carries a
 * timestamp and a policy version, and bumping POLICY_VERSION asks everybody
 * again — which is what you want when the tracking actually changes, and the
 * only honest way to handle it.
 *
 * WHY STRICT EVERYWHERE, FOR NOW
 *
 * The banner blocks for every visitor, not only in the EEA and UK. Deciding by
 * region needs to know where a visitor is, and until analytics is running
 * nobody knows what share of traffic that even is. Strict everywhere is the
 * safe direction to be wrong in: relaxing later with real numbers is a small
 * change, while discovering you under-protected EEA visitors is not.
 */

export const POLICY_VERSION = 1;
const KEY = "afc_consent_v1";

/** The four Consent Mode v2 signals, plus the two that are not a choice. */
const SIGNALS = (choice) => ({
  ad_storage: choice.ads ? "granted" : "denied",
  ad_user_data: choice.ads ? "granted" : "denied",
  ad_personalization: choice.ads ? "granted" : "denied",
  analytics_storage: choice.analytics ? "granted" : "denied",
  // Not consent choices: one keeps the site working, the other is security.
  functionality_storage: "granted",
  security_storage: "granted",
});

const gtag = (...args) => {
  if (typeof window === "undefined") return;
  window.dataLayer = window.dataLayer || [];
  // The real gtag shim is defined in index.html before the tag loads. Falling
  // back to dataLayer.push keeps this working if the script is ever absent.
  if (typeof window.gtag === "function") window.gtag(...args);
  else window.dataLayer.push(args);
};

/**
 * The stored decision, or null if the visitor has not made one — which is what
 * makes the banner appear.
 *
 * A choice recorded against an older policy version counts as no choice: the
 * terms they agreed to are not the terms now in force.
 */
export function readConsent() {
  if (typeof window === "undefined") return null;
  try {
    const raw = window.localStorage.getItem(KEY);
    if (!raw) return null;
    const saved = JSON.parse(raw);
    if (!saved || saved.version !== POLICY_VERSION) return null;
    if (typeof saved.analytics !== "boolean" || typeof saved.ads !== "boolean") return null;
    return saved;
  } catch {
    // Private browsing, or storage disabled. Treated as undecided, which means
    // denied — the safe reading.
    return null;
  }
}

/** Hand the decision to Google. Safe to call before the tag has loaded. */
export function applyConsent(choice) {
  gtag("consent", "update", SIGNALS(choice));
}

/**
 * Record a decision and apply it. Returns what was stored.
 * `source` says which control was used, which is useful when reading the
 * records back: an "accept all" from the banner is not the same as a choice
 * made deliberately in preferences.
 */
export function saveConsent({ analytics, ads }, source = "banner") {
  const choice = {
    analytics: !!analytics,
    ads: !!ads,
    version: POLICY_VERSION,
    at: new Date().toISOString(),
    source,
  };
  try {
    window.localStorage.setItem(KEY, JSON.stringify(choice));
  } catch {
    // Unstorable: apply it for this visit rather than refusing the choice.
  }
  applyConsent(choice);
  return choice;
}

/** Forget the decision, so the banner asks again. Used by "Cookie settings". */
export function clearConsent() {
  try {
    window.localStorage.removeItem(KEY);
  } catch {
    /* nothing to clear */
  }
}

/** True once analytics may actually record anything. */
export const analyticsAllowed = () => readConsent()?.analytics === true;
