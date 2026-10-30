import React, { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { Loader2, Lock } from "lucide-react";
import { base44 } from "@/api/base44Client";
import { applySeo, SITE_NAME } from "@/lib/seo";

/**
 * Collectors are for collectors and premium members only (B10 — Julie:
 * "We want to keep collectors as private as possible").
 *
 * The rule is enforced by the database (migration 029); this asks the same
 * question so the page can say why it is empty instead of showing nothing.
 * Collector pages are never indexed by search engines.
 *
 * Renders `children(user)` when allowed.
 */
export default function CollectorsGate({ title = "Collectors", children }) {
  const [state, setState] = useState(null); // null | { allowed, failed, user }

  const check = () => {
    setState(null);
    Promise.all([
      base44.auth.me().catch(() => null),
      base44.auth.canSeeCollectors().catch(() => ({ allowed: false, failed: true })),
    ]).then(([user, access]) => setState({ ...access, user }));
  };
  useEffect(check, []);

  useEffect(() => applySeo({ title: `${title} — ${SITE_NAME}`, noindex: true }), [title]);

  if (state === null) {
    return <div className="flex justify-center py-32"><Loader2 className="h-5 w-5 animate-spin text-muted-foreground" /></div>;
  }
  if (state.failed) {
    return (
      <div className="mx-auto max-w-xl px-6 py-24 text-center" role="alert" data-testid="collectors-failed">
        <p className="font-mono-caps text-[11px] text-muted-foreground">Couldn't load this page. Check your connection.</p>
        <button type="button" onClick={check} className="mt-4 font-mono-caps text-[11px] text-primary underline">Try again</button>
      </div>
    );
  }
  if (!state.allowed) {
    return (
      <div className="mx-auto max-w-xl px-6 py-24 text-center" data-testid="collectors-locked">
        <Lock className="mx-auto h-5 w-5 text-primary" />
        <h1 className="mt-4 font-heading text-4xl tracking-[-0.02em]">For collectors and premium members</h1>
        <p className="mt-3 text-sm text-muted-foreground leading-relaxed">
          AFC keeps its collectors private. Their profiles and collections are visible to other collectors and to premium members.
        </p>
        <div className="mt-8 flex flex-wrap items-center justify-center gap-4">
          <Link to="/upgrade" className="bg-primary px-6 py-3 font-mono-caps text-[11px] text-primary-foreground hover:opacity-80">Upgrade Membership ↑</Link>
          {!state.user && <Link to="/login" className="font-mono-caps text-[11px] text-muted-foreground underline hover:text-foreground">Already a member? Sign in</Link>}
        </div>
      </div>
    );
  }
  return children(state.user);
}
