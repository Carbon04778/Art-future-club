/**
 * Google Analytics behind Consent Mode v2.
 *
 * WHAT MUST HOLD, AND WHY IT IS WORTH A TEST
 *
 * The whole mechanism is an ORDER: every consent signal denied, then a stored
 * choice re-applied, then the tag loads. Get that order wrong and the banner
 * is decoration — the tag has already fired for every visitor in the EEA
 * before anybody was asked. Nothing about the page looks different when it is
 * wrong, which is exactly why it needs checking.
 *
 * The rest is the handful of things that quietly make analytics useless or
 * unlawful: a second Google tag double-counting every visitor, send_page_view
 * left on in a single-page app, a Reject button made harder to press than
 * Accept, or a consent record with no timestamp to show a regulator.
 *
 * Offline: reads the source, makes no network calls.
 *
 * Run: npm run verify:consent
 */
import { readFileSync } from "node:fs";

let pass = 0;
const failures = [];
const check = (name, condition, detail = "") => {
  if (condition) pass++;
  else failures.push(`${name}${detail ? ` — ${detail}` : ""}`);
};

const read = (rel) => readFileSync(new URL(rel, import.meta.url), "utf8");
const html = read("../index.html");
const consent = read("../src/lib/consent.js");
const analytics = read("../src/lib/analytics.js");
const banner = read("../src/components/ConsentBanner.jsx");
const app = read("../src/App.jsx");
const footer = read("../src/components/SlimFooter.jsx");

const MEASUREMENT_ID = "G-B2W9TZH3JX";

/* ------------------------------------------------------------ the ordering */

const defaultAt = html.indexOf("'consent', 'default'");
const tagAt = html.indexOf("googletagmanager.com/gtag/js");
const updateAt = html.indexOf("'consent', 'update'");

check("the Google tag is on the page at all", tagAt > -1);
check("consent defaults are declared", defaultAt > -1);
check(
  "defaults are declared BEFORE the tag loads",
  defaultAt > -1 && tagAt > -1 && defaultAt < tagAt,
  "the tag would fire before anybody was asked"
);
check(
  "a stored choice is re-applied before the tag loads",
  updateAt > -1 && tagAt > -1 && updateAt < tagAt,
  "a returning visitor who accepted would be treated as denied at first"
);

/* ------------------------------------------------- everything starts denied */

const defaultBlock = html.slice(defaultAt, html.indexOf("}", defaultAt));
for (const signal of ["ad_storage", "ad_user_data", "ad_personalization", "analytics_storage"]) {
  check(`${signal} defaults to denied`, new RegExp(`${signal}:\\s*'denied'`).test(defaultBlock), defaultBlock.slice(0, 120));
}
check(
  "all four Consent Mode v2 signals are present",
  ["ad_storage", "ad_user_data", "ad_personalization", "analytics_storage"].every((s) => consent.includes(s)),
  "v2 requires the two ad_user_* signals even with no advertising"
);

/* --------------------------------------------------------- exactly one tag */

const tagLoads = (html.match(/googletagmanager\.com\/gtag\/js/g) || []).length;
check("exactly one Google tag loader", tagLoads === 1, `${tagLoads} found — more than one double-counts every visitor`);
check(
  "no Tag Manager container as well",
  !html.includes("googletagmanager.com/gtm.js") && !/GTM-[A-Z0-9]+/.test(html),
  "GTM alongside GA4 counts every visitor twice"
);
check("the measurement id is the one we were given", html.includes(MEASUREMENT_ID));

/* ------------------------------------------- single-page app page views */

check(
  "the tag does not send its own page view",
  /send_page_view:\s*false/.test(html),
  "left on, the first view is counted twice and later routes not at all"
);
check("page views are sent from the router", app.includes("trackPageView"), "36 routes would report as a few landing pages");
check("the router reports every path change", app.includes("useLocation") && app.includes("pathname"));
check("page views carry the path", analytics.includes("page_path"));

/* ------------------------------------------------------ nothing before consent */

check(
  "analytics calls are gated on the stored choice",
  analytics.includes("analyticsAllowed()"),
  "consent mode alone would still send cookieless pings"
);
check("the gate is checked for page views and events", (analytics.match(/analyticsAllowed\(\)/g) || []).length >= 2);

/* -------------------------------------------------------------- the banner */

check("the banner is mounted once, at the app root", (app.match(/<ConsentBanner/g) || []).length === 1);
check("the banner only appears when no choice is stored", banner.includes("readConsent() !== null"));
check("the banner offers Reject", />\s*Reject\s*</.test(banner));
check("the banner offers Accept", /Accept/.test(banner));
check(
  "Reject and Accept share one style, so neither is harder to press",
  banner.includes("const button =") &&
    (banner.match(/\$\{button\}/g) || []).length >= 2,
  "a Reject made quieter than Accept is what regulators have fined"
);
check("granular choice is offered", banner.includes("Choose what to allow"));
check("the cookie policy is linked from the banner", banner.includes('to="/cookies"'));

/* ------------------------------------- the choice can be changed afterwards */

check("the footer can reopen the choice", footer.includes("openConsentPreferences"));
check("reopening is wired to the banner", banner.includes("afc:consent-reopen"));

/* ---------------------------------------------- the record, for a regulator */

check("the decision is stored with a timestamp", consent.includes("at: new Date().toISOString()"));
check("the decision is stored against a policy version", consent.includes("POLICY_VERSION"));
check(
  "a decision made under an older policy counts as no decision",
  consent.includes("saved.version !== POLICY_VERSION"),
  "changing what is tracked has to re-ask"
);
check(
  "storage failure is treated as undecided, not as consent",
  consent.includes("return null;") && consent.includes("catch"),
  "private browsing must not read as agreement"
);

/* ----------------------------------------------------------------- report */

console.log(`\n  passed: ${pass}`);
if (failures.length) {
  console.log(`  FAILED: ${failures.length}\n`);
  failures.forEach((f) => console.log(`   ✗ ${f}`));
  process.exit(1);
}
console.log("  analytics loads behind consent, and the choice is recorded\n");
