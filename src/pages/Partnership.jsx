import React, { useState } from "react";
import { Send, Loader2 } from "lucide-react";
import SlimFooter from "@/components/SlimFooter";
import { base44 } from "@/api/base44Client";

const PARTNERSHIP_TYPES = [
  {
    code: "01",
    title: "Event Sponsorship",
    description:
      "Brand your presence across our chapter gatherings, openings, salons and collector dinners in Hong Kong, London, New York, Los Angeles, Bangkok, Milano, Toronto and Zurich. From headline sponsorship to drinks-table activation.",
    examples: ["Logo placement at chapter events", "Brand mentions in invitations & comms", "Reserved guest seats for your team", "Custom activation concepts welcome"],
  },
  {
    code: "02",
    title: "Editorial Features",
    description:
      "Place your brand — clothing, accessories, objects, spaces — within our editorial photography and written features. We produce culture-first content; no advertorial. Partners are selected for resonance, not revenue alone.",
    examples: ["Fashion & accessories in editorial shoots", "Venue & space features", "Product placement in styled stories", "Collaborative creative direction"],
  },
  {
    code: "03",
    title: "Venue Partnership",
    description:
      "Open your space to the AFC network. Whether a gallery, hotel, restaurant or private members' club — becoming a venue partner aligns your space with the most engaged audience in contemporary art.",
    examples: ["Host chapter gatherings & dinners", "Private view co-production", "Featured venue in our city guides", "Cross-promotion to our member base"],
  },
  {
    code: "04",
    title: "Digital Advertising",
    description:
      "Targeted presence across the AFC platform — reaching curators, collectors, artists and galleries across eight global cities. High-context, design-led placements that respect the editorial environment.",
    examples: ["Featured banner placements", "Newsletter sponsorship", "Dedicated partner spotlights", "Chapter-specific targeting"],
  },
  {
    code: "05",
    title: "Arts Patronage",
    description:
      "Support the work without a transactional agenda. Patrons of the Arts fund residencies, commissions, open calls and community programming. Your contribution is acknowledged, not advertised — unless you prefer otherwise.",
    examples: ["Fund emerging artist commissions", "Sponsor open calls & residencies", "Support community programming", "Named patronage or anonymous giving"],
  },
];

export default function Partnership() {
  const [form, setForm] = useState({
    name: "",
    organisation: "",
    email: "",
    type: "",
    message: "",
  });
  const [sending, setSending] = useState(false);
  const [sent, setSent] = useState(false);

  const set = (k, v) => setForm((f) => ({ ...f, [k]: v }));

  const handleSubmit = async (e) => {
    e.preventDefault();
    setSending(true);
    try {
      await base44.integrations.Core.InvokeLLM({
        prompt: `A partnership enquiry was submitted on the Art Future Club platform. Acknowledge receipt and confirm the team will be in touch within 3 business days. Sign off as "The AFC Team". Keep it brief and warm but professional. Address: ${form.name} from ${form.organisation}.`,
      });
      setSent(true);
    } finally {
      setSending(false);
    }
  };

  const input =
    "w-full border border-border bg-transparent px-4 py-3 text-base outline-none focus:border-foreground placeholder:text-muted-foreground/50";

  return (
    <>

      {/* Enquire */}
      <div className="flex justify-end px-6 py-3 md:px-10 border-b border-border">
        <a href="#enquire" className="font-mono-caps text-[11px] text-primary border border-primary/50 px-3 py-1 hover:bg-primary hover:text-primary-foreground transition-colors">
          Enquire →
        </a>
      </div>

      {/* Hero */}
      <div className="atmospheric-space px-6 md:px-10 border-b border-border">
        <div className="max-w-5xl">
          <p className="font-mono-caps text-[11px] text-muted-foreground">Partnership &amp; Patronage</p>
          <h1 className="mt-4 font-heading text-[12vw] font-medium leading-[0.9] tracking-[-0.03em] md:text-[7vw]">
            Build with us.
          </h1>
          <p className="mt-8 max-w-2xl text-xl leading-relaxed text-muted-foreground">
            Art Future Club is a cultural engine operating across eight cities. We are selective about who we work with — because the integrity of the programme is the product. If your brand, space or values align with ours, we want to hear from you.
          </p>
          <div className="mt-10 flex flex-wrap gap-6">
            <div className="border border-border px-6 py-4">
              <p className="font-heading text-4xl font-medium">8</p>
              <p className="mt-1 font-mono-caps text-[10px] text-muted-foreground">Global Chapters</p>
            </div>
            <div className="border border-border px-6 py-4">
              <p className="font-heading text-4xl font-medium">40+</p>
              <p className="mt-1 font-mono-caps text-[10px] text-muted-foreground">Events Per Year</p>
            </div>
            <div className="border border-border px-6 py-4">
              <p className="font-heading text-4xl font-medium">Collectors</p>
              <p className="mt-1 font-mono-caps text-[10px] text-muted-foreground">Artists · Curators · Galleries</p>
            </div>
          </div>
        </div>
      </div>

      {/* Partnership types */}
      <div className="px-6 py-20 md:px-10">
        <p className="font-mono-caps text-[11px] text-muted-foreground mb-12">Partnership Formats</p>
        <div className="divide-y divide-border">
          {PARTNERSHIP_TYPES.map((p) => (
            <div key={p.code} className="grid grid-cols-1 gap-6 py-12 md:grid-cols-[80px_1fr_1fr]">
              <p className="font-mono-caps text-[11px] text-muted-foreground">{p.code}</p>
              <div>
                <h2 className="font-heading text-3xl font-medium tracking-[-0.02em] md:text-4xl">{p.title}</h2>
                <p className="mt-4 text-base leading-relaxed text-muted-foreground max-w-lg">{p.description}</p>
              </div>
              <ul className="space-y-2 md:pt-1">
                {p.examples.map((ex) => (
                  <li key={ex} className="flex items-start gap-2 font-mono-caps text-[11px] text-muted-foreground">
                    <span className="mt-0.5 text-primary">→</span>
                    {ex}
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>
      </div>

      {/* Quote / philosophy */}
      <div className="bg-black text-foreground px-6 py-20 md:px-10 border-y border-foreground/10">
        <p className="font-mono-caps text-[11px] text-foreground/40 mb-10">Our Approach</p>
        <blockquote className="font-heading text-[6vw] font-medium leading-[1.0] tracking-[-0.025em] max-w-4xl">
          <span className="outlined-text-light">We do not sell space.</span>
          <br />
          <span className="text-foreground">We build alliances.</span>
        </blockquote>
        <p className="mt-12 max-w-xl text-lg leading-relaxed text-foreground/60">
          Every partnership is conceived individually. We will never take on a partner whose values conflict with the communities we serve. The result is fewer, deeper, more meaningful collaborations — for both sides.
        </p>
      </div>

      {/* Enquiry form */}
      <div id="enquire" className="px-6 py-20 md:px-10">
        <div className="max-w-2xl">
          <p className="font-mono-caps text-[11px] text-muted-foreground">Get in Touch</p>
          <h2 className="mt-4 font-heading text-5xl font-medium tracking-[-0.02em]">Start a conversation.</h2>
          <p className="mt-4 text-base text-muted-foreground leading-relaxed">
            Tell us who you are and what kind of partnership you have in mind. We reply within 3 business days.
          </p>

          {sent ? (
            <div className="mt-12 border border-primary/30 bg-primary/5 p-8">
              <p className="font-mono-caps text-[11px] text-primary">Enquiry received</p>
              <p className="mt-2 font-heading text-2xl">Thank you for reaching out.</p>
              <p className="mt-2 text-sm text-muted-foreground">Our team will be in touch within 3 business days.</p>
            </div>
          ) : (
            <form onSubmit={handleSubmit} className="mt-12 space-y-6">
              <div className="grid grid-cols-1 gap-6 md:grid-cols-2">
                <div>
                  <label className="font-mono-caps text-[11px] text-muted-foreground">Your Name *</label>
                  <input className={`mt-2 ${input}`} value={form.name} onChange={(e) => set("name", e.target.value)} required placeholder="Full name" />
                </div>
                <div>
                  <label className="font-mono-caps text-[11px] text-muted-foreground">Organisation</label>
                  <input className={`mt-2 ${input}`} value={form.organisation} onChange={(e) => set("organisation", e.target.value)} placeholder="Brand, studio or institution" />
                </div>
              </div>
              <div>
                <label className="font-mono-caps text-[11px] text-muted-foreground">Email Address *</label>
                <input className={`mt-2 ${input}`} type="email" value={form.email} onChange={(e) => set("email", e.target.value)} required placeholder="your@email.com" />
              </div>
              <div>
                <label className="font-mono-caps text-[11px] text-muted-foreground">Partnership Type</label>
                <select className={`mt-2 ${input} bg-background`} value={form.type} onChange={(e) => set("type", e.target.value)}>
                  <option value="">Select the most relevant…</option>
                  {PARTNERSHIP_TYPES.map((p) => (
                    <option key={p.code} value={p.title}>{p.title}</option>
                  ))}
                  <option value="Other / Not Sure">Other / Not Sure</option>
                </select>
              </div>
              <div>
                <label className="font-mono-caps text-[11px] text-muted-foreground">Tell Us About Your Idea *</label>
                <textarea
                  className={`mt-2 ${input} resize-none`}
                  rows={6}
                  value={form.message}
                  onChange={(e) => set("message", e.target.value)}
                  required
                  placeholder="What kind of collaboration do you have in mind? Which cities are most relevant? Any budget range or timeline?"
                />
              </div>
              <button
                type="submit"
                disabled={sending}
                className="flex items-center gap-2 bg-primary text-primary-foreground px-8 py-4 font-mono-caps text-[11px] hover:opacity-90 disabled:opacity-50 transition-opacity"
              >
                {sending ? <Loader2 className="h-3 w-3 animate-spin" /> : <Send className="h-3 w-3" />}
                Send Enquiry
              </button>
            </form>
          )}
        </div>
      </div>

      <SlimFooter />
    </>
  );
}