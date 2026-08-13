import React from "react";
import SlimFooter from "@/components/SlimFooter";

export default function MembershipPolicy() {
  return (
    <>
      <div className="mx-auto max-w-3xl px-6 py-24 md:px-10">
        <p className="font-mono-caps text-[11px] text-muted-foreground">Legal — Membership</p>
        <h1 className="mt-4 font-heading text-5xl font-medium leading-[0.95] tracking-[-0.03em]">Membership Policy</h1>
        <p className="mt-4 font-mono-caps text-[11px] text-muted-foreground">Last updated: July 2026</p>

        <div className="mt-16 space-y-10 text-base leading-relaxed text-foreground/80">
          <section>
            <h2 className="font-heading text-xl font-medium text-foreground mb-3">Plans & Pricing</h2>
            <p>AFC offers the following membership plans:</p>
            <ul className="mt-3 space-y-2">
              <li><strong className="text-foreground">Premium Portfolio — $12/month:</strong> Enhanced profile visibility, portfolio analytics, and priority listing in the artists directory.</li>
              <li><strong className="text-foreground">Featured Listing — $49 one-time:</strong> A dedicated featured placement in the gallery and directory for a defined period.</li>
              <li><strong className="text-foreground">Gallery Partnership — $99/month:</strong> Full gallery partnership status, curatorial collaboration access, and promotional support across chapters.</li>
            </ul>
          </section>

          <section>
            <h2 className="font-heading text-xl font-medium text-foreground mb-3">Billing</h2>
            <p>Monthly subscriptions are billed on a recurring basis from the date of your initial purchase. One-time payments are charged at the time of purchase. All prices are in USD and exclusive of any applicable taxes.</p>
          </section>

          <section>
            <h2 className="font-heading text-xl font-medium text-foreground mb-3">Cancellation</h2>
            <p>You may cancel a monthly subscription at any time. Cancellation takes effect at the end of the current billing period; you will retain access to member features until that date. No refunds are issued for partial billing periods.</p>
          </section>

          <section>
            <h2 className="font-heading text-xl font-medium text-foreground mb-3">Refunds</h2>
            <p>One-time payments are non-refundable once the featured placement has been activated. If you believe there has been an error in billing, contact us within 14 days of the charge and we will review your request.</p>
          </section>

          <section>
            <h2 className="font-heading text-xl font-medium text-foreground mb-3">Changes to Plans</h2>
            <p>AFC reserves the right to modify membership pricing and features. Existing subscribers will be given at least 30 days' notice before any price change takes effect.</p>
          </section>

          <section>
            <h2 className="font-heading text-xl font-medium text-foreground mb-3">Contact</h2>
            <p>For membership enquiries, contact us at <a href="mailto:hello@artfuture.club" className="text-primary hover:underline">hello@artfuture.club</a>.</p>
          </section>
        </div>
      </div>
      <SlimFooter />
    </>
  );
}