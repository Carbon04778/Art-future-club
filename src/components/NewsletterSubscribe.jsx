import React, { useState } from "react";
import { useLocation } from "react-router-dom";
import { base44 } from "@/api/base44Client";
import { Loader2, Mail, Check } from "lucide-react";

/**
 * Newsletter signup, for anyone — no account needed (E1/E2).
 *
 * Saved through auth.subscribeNewsletter, which does not ask for the row back:
 * only admins may read the list, so asking made every visitor's signup fail
 * ("new row violates row-level security policy"). Found 2026-11-27.
 *
 *   variant "card"   the full box (articles, home page)
 *   variant "inline" one line, for a page's top or a footer
 * `source` records where people signed up, e.g. "events" or "footer".
 */
const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;

export default function NewsletterSubscribe({
  variant = "card",
  source = "article",
  title = "We have so many exciting things going on, be the first to find out!",
  note = "",
}) {
  const { pathname } = useLocation();
  const [email, setEmail] = useState("");
  const [consent, setConsent] = useState(false);
  const [trap, setTrap] = useState("");
  const [status, setStatus] = useState("idle"); // idle | submitting | done | already | error
  const [error, setError] = useState("");
  const id = `nl-${source}`;

  const submit = async (e) => {
    e.preventDefault();
    setError("");
    const clean = email.trim().toLowerCase();
    if (!EMAIL.test(clean) || clean.length > 254) { setError("Please enter a valid email address."); return; }
    if (!consent) { setError("Please tick the box to confirm you'd like to subscribe."); return; }
    // Filled in only by bots, which see the hidden field. Looks the same to them.
    if (trap) { setStatus("done"); return; }
    setStatus("submitting");
    try {
      const r = await base44.auth.subscribeNewsletter({ email: clean, source: source === "footer" ? `footer ${pathname}`.slice(0, 120) : source });
      setStatus(r?.already ? "already" : "done");
      setEmail("");
      setConsent(false);
    } catch {
      setError("Sorry, that did not work. Please try again in a moment.");
      setStatus("error");
    }
  };

  const inline = variant === "inline";
  if (status === "done" || status === "already") {
    return (
      <div className={inline ? "flex items-center gap-3 py-2" : "border border-border bg-card px-8 py-12 text-center"} role="status" data-newsletter={source}>
        <span className={`${inline ? "" : "mx-auto"} flex h-10 w-10 shrink-0 items-center justify-center border border-primary text-primary`}>
          <Check className="h-5 w-5" />
        </span>
        <div>
          <p className={inline ? "font-heading text-xl" : "mt-4 font-heading text-2xl"}>{status === "already" ? "You're already on the list." : "You're on the list."}</p>
          <p className="mt-1 text-sm text-muted-foreground">Watch your inbox for what's next at Art Future Club.</p>
        </div>
      </div>
    );
  }

  return (
    <form onSubmit={submit} noValidate className={inline ? "" : "border border-border bg-card px-6 py-10 sm:px-8 sm:py-12"} data-newsletter={source}>
      <p className={inline ? "font-heading text-xl tracking-[-0.01em]" : "font-heading text-2xl md:text-3xl tracking-[-0.01em]"}>{title}</p>
      {note && <p className="mt-1 text-sm text-muted-foreground">{note}</p>}
      <div className={`${inline ? "mt-3" : "mt-5"} flex flex-col gap-3 sm:flex-row ${inline ? "max-w-xl" : ""}`}>
        <div className="relative min-w-0 flex-1">
          <Mail className="pointer-events-none absolute left-4 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <input
            id={id}
            type="email"
            inputMode="email"
            autoComplete="email"
            value={email}
            onChange={(e) => { setEmail(e.target.value); if (status === "error") setStatus("idle"); }}
            placeholder="your@email.com"
            className="w-full border border-border bg-background py-3 pl-11 pr-4 text-base outline-none focus:border-foreground"
            aria-label="Email address"
          />
        </div>
        <button
          type="submit"
          disabled={status === "submitting"}
          className="flex shrink-0 items-center justify-center gap-2 bg-primary px-8 py-3 font-mono-caps text-[11px] text-primary-foreground hover:opacity-80 disabled:opacity-50"
        >
          {status === "submitting" && <Loader2 className="h-3 w-3 animate-spin" />}
          Subscribe
        </button>
      </div>
      {/* Hidden from people; bots fill it in. */}
      <input type="text" name="website" value={trap} onChange={(e) => setTrap(e.target.value)} tabIndex={-1} autoComplete="off" aria-hidden="true" className="absolute -left-[9999px] h-px w-px opacity-0" />
      <label className="mt-3 flex cursor-pointer items-start gap-3">
        <input type="checkbox" checked={consent} onChange={(e) => setConsent(e.target.checked)} className="mt-0.5 h-4 w-4 shrink-0 accent-primary" />
        <span className="text-sm text-muted-foreground">Yes, subscribe me to your newsletter. No account needed; you can unsubscribe at any time.</span>
      </label>
      {error && <p className="mt-3 text-sm text-destructive" role="alert">{error}</p>}
    </form>
  );
}
