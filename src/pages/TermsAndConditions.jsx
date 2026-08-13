import React from "react";
import SlimFooter from "@/components/SlimFooter";

export default function TermsAndConditions() {
  return (
    <>
      <div className="mx-auto max-w-3xl px-6 py-24 md:px-10">
        <p className="font-mono-caps text-[11px] text-muted-foreground">Legal — Terms of Use</p>
        <h1 className="mt-4 font-heading text-5xl font-medium leading-[0.95] tracking-[-0.03em]">Terms & Conditions</h1>
        <p className="mt-4 font-mono-caps text-[11px] text-muted-foreground">Last updated: July 2026</p>

        <div className="mt-16 space-y-10 text-base leading-relaxed text-foreground/80">
          <section>
            <h2 className="font-heading text-xl font-medium text-foreground mb-3">1. Acceptance of Terms</h2>
            <p>By accessing or using the Art Future Club platform ("AFC", "we", "us", or "our"), you agree to be bound by these Terms and Conditions. If you do not agree to these terms, please do not use our platform.</p>
          </section>

          <section>
            <h2 className="font-heading text-xl font-medium text-foreground mb-3">2. Use of the Platform</h2>
            <p>You agree to use AFC solely for lawful purposes and in a manner that does not infringe the rights of others. You must not upload content that is defamatory, obscene, fraudulent, or in violation of any intellectual property rights.</p>
          </section>

          <section>
            <h2 className="font-heading text-xl font-medium text-foreground mb-3">3. User Accounts</h2>
            <p>You are responsible for maintaining the confidentiality of your account credentials. You are liable for all activities that occur under your account. AFC reserves the right to suspend or terminate accounts that violate these terms.</p>
          </section>

          <section>
            <h2 className="font-heading text-xl font-medium text-foreground mb-3">4. Content Ownership</h2>
            <p>Artists retain full ownership of artwork and content they upload to AFC. By submitting content, you grant AFC a non-exclusive, royalty-free licence to display and promote your work within the platform and its associated marketing materials.</p>
          </section>

          <section>
            <h2 className="font-heading text-xl font-medium text-foreground mb-3">5. Transactions</h2>
            <p>AFC facilitates connections between artists and collectors but is not a party to any transaction. Any purchase or commission agreed between parties is solely between those parties. AFC accepts no liability for disputes arising from such transactions.</p>
          </section>

          <section>
            <h2 className="font-heading text-xl font-medium text-foreground mb-3">6. Limitation of Liability</h2>
            <p>To the fullest extent permitted by law, AFC shall not be liable for any indirect, incidental, special, or consequential damages arising out of your use of the platform.</p>
          </section>

          <section>
            <h2 className="font-heading text-xl font-medium text-foreground mb-3">7. Changes to Terms</h2>
            <p>We reserve the right to modify these terms at any time. Continued use of the platform following any changes constitutes your acceptance of the revised terms.</p>
          </section>

          <section>
            <h2 className="font-heading text-xl font-medium text-foreground mb-3">8. Contact</h2>
            <p>For any questions regarding these terms, contact us at <a href="mailto:hello@artfuture.club" className="text-primary hover:underline">hello@artfuture.club</a>.</p>
          </section>
        </div>
      </div>
      <SlimFooter />
    </>
  );
}