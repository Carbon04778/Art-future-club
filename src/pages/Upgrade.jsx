import React, { useState, useEffect } from "react";
import { base44 } from "@/api/base44Client";
import { Check, Loader2, Star, Zap, Building2 } from "lucide-react";
import SlimFooter from "@/components/SlimFooter";

const PLANS = [
  {
    key: "premium_portfolio",
    name: "Premium Portfolio",
    price: "$12",
    period: "/ month",
    currency: "USD",
    badge: "Most Popular",
    icon: Star,
    description: "Showcase your full body of work with no limits.",
    features: [
      "Unlimited portfolio works",
      "Priority placement in Artists Directory",
      "Premium badge on your profile",
      "Featured in chapter spotlights",
    ],
  },
  {
    key: "featured_listing",
    name: "Featured Listing",
    price: "$49",
    period: "one-time · 30 days",
    currency: "USD",
    badge: null,
    icon: Zap,
    description: "Maximum visibility across the entire AFC network for 30 days.",
    features: [
      "Featured on the homepage",
      "Pinned to top of Artists Directory",
      "Highlighted in community forum",
      "Featured badge on your profile",
    ],
  },
  {
    key: "gallery_partnership",
    name: "Gallery Partnership",
    price: "$99",
    period: "/ month",
    currency: "USD",
    badge: "For Galleries",
    icon: Building2,
    description: "A dedicated presence for galleries and institutions on the AFC network.",
    features: [
      "Gallery profile with full artist roster",
      "Featured placement across all chapters",
      "Event & exhibition promotion",
      "Partner badge on your profile",
      "Monthly spotlight in the editorial",
    ],
  },
];

export default function Upgrade() {
  const [user, setUser] = useState(null);
  const [subscriptions, setSubscriptions] = useState([]);
  const [loading, setLoading] = useState({});
  const [error, setError] = useState("");

  useEffect(() => {
    base44.auth.me().then((u) => {
      setUser(u);
      base44.entities.Subscription.filter({ user_id: u.id, status: "active" }).then(setSubscriptions);
    }).catch(() => {});
  }, []);

  const isActive = (plan) => subscriptions.some((s) => s.plan === plan);

  const handleCheckout = async (plan) => {
    // Block checkout inside iframe (preview)
    if (window.self !== window.top) {
      alert("Checkout is only available from the published app, not the preview.");
      return;
    }
    if (!user) {
      window.location.href = "/login?next=/upgrade";
      return;
    }
    setLoading((l) => ({ ...l, [plan]: true }));
    try {
      const res = await base44.functions.invoke("createCheckout", {
        plan,
        success_url: `${window.location.origin}/upgrade?success=1`,
        cancel_url: `${window.location.origin}/upgrade`,
      });
      // The provider returns the function's payload directly, so the URL is
      // res.url. Reading res.data.url was always undefined, which meant a
      // successful checkout session silently did nothing.
      const url = res?.url || res?.data?.url;
      if (url) {
        window.location.href = url;
        return;
      }
      throw new Error("No checkout URL was returned.");
    } catch (err) {
      // Surface the real reason instead of "Something went wrong" — that
      // message hid configuration errors that are simple to fix once seen.
      const msg = String(err?.message || err);
      setError(
        /not configured|Invalid or unconfigured plan/i.test(msg)
          ? "Payments are not configured yet. The plan's Stripe price ID is missing."
          : /Unauthorized/i.test(msg)
          ? "Please sign in again and retry."
          : /Failed to send|non-2xx|fetch/i.test(msg)
          ? "Could not reach the payment service. The createCheckout function may not be deployed."
          : msg
      );
    } finally {
      setLoading((l) => ({ ...l, [plan]: false }));
    }
  };

  const success = new URLSearchParams(window.location.search).get("success");

  return (
    <>
      <div className="mx-auto max-w-4xl px-6 py-16 md:px-10">
        {error && (
          <div className="mb-6 border border-destructive/40 bg-destructive/10 p-4 text-sm text-destructive">
            {error}
          </div>
        )}
        {success && (
          <div className="mb-10 border border-primary/40 bg-primary/5 p-6 text-center">
            <p className="font-heading text-2xl">Payment successful — welcome to the network.</p>
            <p className="mt-2 font-mono-caps text-[11px] text-muted-foreground">Your plan is now active. Refresh your profile to see changes.</p>
          </div>
        )}

        <p className="font-mono-caps text-[11px] text-muted-foreground">Art Future Club — <span className="text-primary">Network</span></p>
        <h1 className="mt-3 font-heading text-5xl font-medium tracking-[-0.02em] md:text-7xl">Upgrade</h1>
        <p className="mt-4 max-w-xl text-lg text-muted-foreground leading-relaxed">
          The <span className="text-primary">directory</span> and <span className="text-accent">community</span> remain free. Upgrade for greater <span className="text-highlight">visibility</span> and an unrestricted portfolio.
        </p>

        <div className="mt-14 grid grid-cols-1 gap-6 md:grid-cols-2 lg:grid-cols-3">
          {PLANS.map((plan) => {
            const active = isActive(plan.key);
            const Icon = plan.icon;
            return (
              <div key={plan.key} className={`border p-8 flex flex-col gap-6 ${active ? "border-primary" : "border-border"}`}>
                {plan.badge && (
                  <span className="self-start font-mono-caps text-[10px] border border-primary px-2 py-1 text-primary">{plan.badge}</span>
                )}
                <div className="flex items-start justify-between">
                  <div>
                    <Icon className="h-5 w-5 text-primary mb-3" />
                    <h2 className="font-heading text-3xl tracking-[-0.01em]">{plan.name}</h2>
                    <p className="mt-1 text-sm text-muted-foreground">{plan.description}</p>
                  </div>
                </div>
                <div>
                  <span className="font-heading text-5xl font-medium">{plan.price}</span>
                  <span className="ml-2 font-mono-caps text-[11px] text-muted-foreground">{plan.period}</span>
                </div>
                <ul className="space-y-2 flex-1">
                  {plan.features.map((f) => (
                    <li key={f} className="flex items-center gap-2 text-sm">
                      <Check className="h-3.5 w-3.5 shrink-0 text-primary" />
                      {f}
                    </li>
                  ))}
                </ul>
                {active ? (
                  <div className="w-full py-4 text-center font-mono-caps text-[11px] text-primary border border-primary">
                    Active ✓
                  </div>
                ) : (
                  <button
                    onClick={() => handleCheckout(plan.key)}
                    disabled={loading[plan.key]}
                    className="flex items-center justify-center gap-2 w-full bg-primary py-4 font-mono-caps text-[11px] text-primary-foreground hover:opacity-80 disabled:opacity-50"
                  >
                    {loading[plan.key] ? <Loader2 className="h-3 w-3 animate-spin" /> : null}
                    Get {plan.name}
                  </button>
                )}
              </div>
            );
          })}
        </div>

        <p className="mt-8 font-mono-caps text-[10px] text-muted-foreground text-center">
          Payments processed securely via Stripe. Cancel anytime from your account.
        </p>
      </div>
      <SlimFooter />
    </>
  );
}