import React, { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { readConsent, saveConsent } from "@/lib/consent";

/**
 * The cookie banner.
 *
 * REJECT IS AS PROMINENT AS ACCEPT, DELIBERATELY
 *
 * Regulators have fined sites for exactly the opposite — a coloured "Accept
 * all" beside a grey "Manage preferences" — and the reasoning is simple: if
 * refusing is harder than agreeing, the agreement is not freely given. So the
 * two buttons are the same size, the same weight, side by side.
 *
 * It BLOCKS. Nothing is sent to Google until somebody chooses, so there is no
 * honest version of this that lets the visitor ignore it and carry on being
 * measured.
 *
 * It appears for everyone, not only the EEA and UK — see src/lib/consent.js
 * for why that is the right way round to be wrong while we have no traffic
 * data at all.
 *
 * Reopened from the footer's "Cookie settings", which is not optional: a
 * decision you cannot change is not a decision.
 */
export default function ConsentBanner() {
  const [decided, setDecided] = useState(true); // assume decided until checked
  const [detail, setDetail] = useState(false);
  const [analytics, setAnalytics] = useState(true);

  useEffect(() => {
    setDecided(readConsent() !== null);
    const reopen = () => {
      setDetail(false);
      setAnalytics(true);
      setDecided(false);
    };
    window.addEventListener("afc:consent-reopen", reopen);
    return () => window.removeEventListener("afc:consent-reopen", reopen);
  }, []);

  if (decided) return null;

  const decide = (choice, source) => {
    saveConsent(choice, source);
    setDecided(true);
  };

  const button =
    "flex-1 border px-5 py-3 font-mono-caps text-[11px] transition-colors sm:flex-none sm:min-w-[150px]";

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label="Cookie choices"
      className="fixed inset-x-0 bottom-0 z-[2000] border-t border-border bg-background/98 backdrop-blur"
    >
      <div className="mx-auto max-w-4xl px-6 py-5 md:px-10">
        <p className="font-mono-caps text-[11px] text-muted-foreground">Cookies</p>
        <p className="mt-2 text-sm leading-relaxed">
          We use analytics cookies to understand which galleries and artists people
          look at, so we can make the site better. Nothing is collected until you
          choose. Read our{" "}
          <Link to="/cookies" className="underline hover:text-primary">
            cookie policy
          </Link>
          .
        </p>

        {detail && (
          <div className="mt-4 space-y-3 border border-border p-4">
            <label className="flex items-start gap-3">
              <input
                type="checkbox"
                checked
                disabled
                className="mt-1"
                aria-label="Strictly necessary cookies, always on"
              />
              <span>
                <span className="block font-mono-caps text-[10px]">Strictly necessary</span>
                <span className="block text-xs text-muted-foreground">
                  Keeps you signed in and the site working. Always on, and no choice
                  to make — without it there is no site.
                </span>
              </span>
            </label>
            <label className="flex items-start gap-3">
              <input
                type="checkbox"
                checked={analytics}
                onChange={(e) => setAnalytics(e.target.checked)}
                className="mt-1"
              />
              <span>
                <span className="block font-mono-caps text-[10px]">Analytics</span>
                <span className="block text-xs text-muted-foreground">
                  Google Analytics: which pages are visited, and roughly from where.
                  Never your name or your email.
                </span>
              </span>
            </label>
            <p className="text-xs text-muted-foreground">
              We run no advertising cookies at all, so there is nothing to switch off.
            </p>
          </div>
        )}

        <div className="mt-4 flex flex-col gap-2 sm:flex-row sm:items-center">
          {/* Same size, same weight. Refusing must not be harder than agreeing. */}
          <button
            type="button"
            onClick={() => decide({ analytics: false, ads: false }, detail ? "preferences" : "banner")}
            className={`${button} border-border hover:border-foreground`}
          >
            Reject
          </button>
          <button
            type="button"
            onClick={() =>
              decide({ analytics: detail ? analytics : true, ads: false }, detail ? "preferences" : "banner")
            }
            className={`${button} border-foreground bg-foreground text-background hover:opacity-90`}
          >
            {detail ? "Save choices" : "Accept"}
          </button>
          {!detail && (
            <button
              type="button"
              onClick={() => setDetail(true)}
              className="px-2 py-3 text-left font-mono-caps text-[11px] text-muted-foreground underline hover:text-foreground sm:ml-2"
            >
              Choose what to allow
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

/** Footer link target: reopens the banner so a choice can be changed. */
export function openConsentPreferences() {
  window.dispatchEvent(new Event("afc:consent-reopen"));
}
