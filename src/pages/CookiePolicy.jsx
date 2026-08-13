import React from "react";
import SlimFooter from "@/components/SlimFooter";

export default function CookiePolicy() {
  return (
    <>
      <div className="mx-auto max-w-3xl px-6 py-24 md:px-10">
        <p className="font-mono-caps text-[11px] text-muted-foreground">Legal — Cookies</p>
        <h1 className="mt-4 font-heading text-5xl font-medium leading-[0.95] tracking-[-0.03em]">Cookie Policy</h1>
        <p className="mt-4 font-mono-caps text-[11px] text-muted-foreground">Last updated: July 2026</p>

        <div className="mt-16 space-y-10 text-base leading-relaxed text-foreground/80">
          <section>
            <h2 className="font-heading text-xl font-medium text-foreground mb-3">What Are Cookies?</h2>
            <p>Cookies are small text files stored on your device when you visit a website. They help us recognise your browser and remember your preferences to improve your experience on the AFC platform.</p>
          </section>

          <section>
            <h2 className="font-heading text-xl font-medium text-foreground mb-3">Types of Cookies We Use</h2>
            <ul className="space-y-3">
              <li><strong className="text-foreground">Essential Cookies:</strong> Required for the platform to function correctly — authentication, session management, and security.</li>
              <li><strong className="text-foreground">Functional Cookies:</strong> Remember your preferences such as language, filters, and display settings.</li>
              <li><strong className="text-foreground">Analytics Cookies:</strong> Help us understand how users interact with the platform so we can improve performance and content. Data is aggregated and anonymised.</li>
              <li><strong className="text-foreground">Marketing Cookies:</strong> Used to deliver relevant promotions. We only use these with your consent.</li>
            </ul>
          </section>

          <section>
            <h2 className="font-heading text-xl font-medium text-foreground mb-3">Third-Party Cookies</h2>
            <p>Some cookies are set by third-party services we use, including payment processors and analytics providers. These parties have their own privacy policies governing the use of such cookies.</p>
          </section>

          <section>
            <h2 className="font-heading text-xl font-medium text-foreground mb-3">Managing Cookies</h2>
            <p>You can control and delete cookies through your browser settings. Disabling essential cookies may affect the functionality of the platform. For analytics and marketing cookies, you may opt out at any time by contacting us.</p>
          </section>

          <section>
            <h2 className="font-heading text-xl font-medium text-foreground mb-3">Contact</h2>
            <p>Questions about our cookie use? Reach us at <a href="mailto:hello@artfuture.club" className="text-primary hover:underline">hello@artfuture.club</a>.</p>
          </section>
        </div>
      </div>
      <SlimFooter />
    </>
  );
}