import React, { useState } from "react";
import { base44 } from "@/api/base44Client";
import { Loader2, Mail, Check } from "lucide-react";

/**
 * Inline newsletter signup shown at the foot of editorial articles.
 */
export default function NewsletterSubscribe() {
  const [email, setEmail] = useState("");
  const [consent, setConsent] = useState(false);
  const [status, setStatus] = useState("idle"); // idle | submitting | done | error
  const [error, setError] = useState("");

  const submit = async (e) => {
    e.preventDefault();
    setError("");
    if (!email.trim()) { setError("Please enter your email address."); return; }
    if (!consent) { setError("Please tick the box to confirm you'd like to subscribe."); return; }
    setStatus("submitting");
    try {
      await base44.entities.NewsletterSubscriber.create({
        email: email.trim().toLowerCase(),
        consent: true,
        source: "article",
      });
      setStatus("done");
      setEmail("");
      setConsent(false);
    } catch (err) {
      setError(err?.message || "Something went wrong. Please try again.");
      setStatus("error");
    }
  };

  if (status === "done") {
    return (
      <div className="border border-border bg-card px-8 py-12 text-center">
        <span className="mx-auto flex h-10 w-10 items-center justify-center border border-primary text-primary">
          <Check className="h-5 w-5" />
        </span>
        <p className="mt-4 font-heading text-2xl">You're on the list.</p>
        <p className="mt-1 text-sm text-muted-foreground">Watch your inbox for what's next at Art Future Club.</p>
      </div>
    );
  }

  return (
    <form onSubmit={submit} className="border border-border bg-card px-8 py-12">
      <p className="font-heading text-2xl md:text-3xl tracking-[-0.01em]">
        We have so many exciting things going on, be the first to find out!
      </p>
      <div className="mt-5 flex flex-col gap-3 sm:flex-row">
        <div className="relative flex-1">
          <Mail className="pointer-events-none absolute left-4 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <input
            type="email"
            value={email}
            onChange={(e) => { setEmail(e.target.value); if (status === "error") setStatus("idle"); }}
            placeholder="your@email.com"
            className="w-full border border-border bg-background pl-11 pr-4 py-3 text-base outline-none focus:border-foreground"
            aria-label="Email address"
          />
        </div>
        <button
          type="submit"
          disabled={status === "submitting"}
          className="flex items-center justify-center gap-2 bg-primary px-8 py-3 font-mono-caps text-[11px] text-primary-foreground hover:opacity-80 disabled:opacity-50"
        >
          {status === "submitting" && <Loader2 className="h-3 w-3 animate-spin" />}
          Subscribe
        </button>
      </div>
      <label className="mt-4 flex items-start gap-3 cursor-pointer">
        <input
          type="checkbox"
          checked={consent}
          onChange={(e) => setConsent(e.target.checked)}
          className="mt-0.5 h-4 w-4 accent-primary"
        />
        <span className="text-sm text-muted-foreground">Yes, subscribe me to your newsletter.</span>
      </label>
      {error && <p className="mt-3 text-xs text-destructive">{error}</p>}
    </form>
  );
}