import React from "react";
import SlimFooter from "@/components/SlimFooter";

export default function PrivacyPolicy() {
  return (
    <>
      <div className="mx-auto max-w-3xl px-6 py-24 md:px-10">
        <p className="font-mono-caps text-[11px] text-muted-foreground">Legal — Data Privacy</p>
        <h1 className="mt-4 font-heading text-5xl font-medium leading-[0.95] tracking-[-0.03em]">Privacy Policy</h1>
        <p className="mt-4 font-mono-caps text-[11px] text-muted-foreground">Last updated: July 2026</p>

        <div className="mt-16 space-y-10 text-base leading-relaxed text-foreground/80">
          <section>
            <h2 className="font-heading text-xl font-medium text-foreground mb-3">1. Information We Collect</h2>
            <p>We collect information you provide directly to us, such as your name, email address, biography, portfolio content, and payment information when you register or use our services. We also collect usage data and device information automatically when you use the platform.</p>
          </section>

          <section>
            <h2 className="font-heading text-xl font-medium text-foreground mb-3">2. How We Use Your Information</h2>
            <p>We use your information to provide and improve the AFC platform, process transactions, send service-related communications, facilitate connections between artists and collectors, and comply with legal obligations.</p>
          </section>

          <section>
            <h2 className="font-heading text-xl font-medium text-foreground mb-3">3. Sharing of Information</h2>
            <p>We do not sell your personal data. We may share information with trusted service providers who assist us in operating the platform (e.g. payment processors, hosting providers), and as required by law.</p>
          </section>

          <section>
            <h2 className="font-heading text-xl font-medium text-foreground mb-3">4. Data Retention</h2>
            <p>We retain your personal data for as long as your account is active or as needed to provide services. You may request deletion of your account and associated data at any time by contacting us.</p>
          </section>

          <section>
            <h2 className="font-heading text-xl font-medium text-foreground mb-3">5. Your Rights</h2>
            <p>Depending on your jurisdiction, you may have rights to access, correct, delete, or restrict the processing of your personal data. To exercise these rights, contact us at <a href="mailto:hello@artfuture.club" className="text-primary hover:underline">hello@artfuture.club</a>.</p>
          </section>

          <section>
            <h2 className="font-heading text-xl font-medium text-foreground mb-3">6. Security</h2>
            <p>We implement appropriate technical and organisational measures to protect your personal data against unauthorised access, alteration, disclosure, or destruction.</p>
          </section>

          <section>
            <h2 className="font-heading text-xl font-medium text-foreground mb-3">7. Changes to This Policy</h2>
            <p>We may update this Privacy Policy periodically. We will notify you of significant changes via email or a prominent notice on our platform.</p>
          </section>
        </div>
      </div>
      <SlimFooter />
    </>
  );
}