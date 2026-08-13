import React, { useState } from "react";
import { base44 } from "@/api/base44Client";
import { X, Loader2, ShoppingBag } from "lucide-react";

export default function InquiryModal({ work, artistProfile, type = "purchase", onClose }) {
  const [form, setForm] = useState({ buyer_name: "", buyer_email: "", message: "" });
  const [saving, setSaving] = useState(false);
  const [sent, setSent] = useState(false);
  const set = (k, v) => setForm((f) => ({ ...f, [k]: v }));
  const input = "w-full border border-border bg-transparent px-4 py-3 text-base outline-none focus:border-foreground";

  const handleSubmit = async (e) => {
    e.preventDefault();
    setSaving(true);
    await base44.entities.Inquiry.create({
      artist_id: artistProfile?.user_id || artistProfile?.id,
      artist_name: artistProfile?.display_name,
      work_title: work?.title || "Commission",
      work_image_url: work?.image_url || "",
      price: work?.price || "",
      currency: work?.currency || "",
      buyer_name: form.buyer_name,
      buyer_email: form.buyer_email,
      message: form.message,
      status: "new",
      type,
    });
    setSaving(false);
    setSent(true);
  };

  return (
    <div className="fixed inset-0 z-50 bg-background/90 backdrop-blur-sm flex items-center justify-center p-6" onClick={onClose}>
      <div className="bg-card border border-border w-full max-w-md" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between px-6 py-5 border-b border-border">
          <div className="flex items-center gap-2">
            <ShoppingBag className="h-4 w-4" />
            <p className="font-mono-caps text-[11px]">{type === "commission" ? "Commission Request" : "Enquire to Purchase"}</p>
          </div>
          <button onClick={onClose}><X className="h-4 w-4 text-muted-foreground" /></button>
        </div>

        {sent ? (
          <div className="p-8 text-center">
            <p className="font-heading text-2xl mb-3">Enquiry Sent</p>
            <p className="text-muted-foreground text-sm mb-6">Your message has been logged and the artist will be notified. We'll be in touch soon.</p>
            <button onClick={onClose} className="font-mono-caps text-[11px] text-primary hover:underline">Close</button>
          </div>
        ) : (
          <form onSubmit={handleSubmit} className="p-6 space-y-4">
            {work && (
              <div className="bg-muted p-4 mb-2">
                <p className="font-heading text-lg">{work.title}</p>
                <p className="font-mono-caps text-[10px] text-muted-foreground">by {artistProfile?.display_name}</p>
                {work.price && <p className="font-mono-caps text-[11px] text-primary mt-1">{work.currency || "USD"} {work.price}</p>}
              </div>
            )}
            <div>
              <label className="font-mono-caps text-[11px] text-muted-foreground">Your Name *</label>
              <input className={`${input} mt-2`} value={form.buyer_name} onChange={(e) => set("buyer_name", e.target.value)} required />
            </div>
            <div>
              <label className="font-mono-caps text-[11px] text-muted-foreground">Email *</label>
              <input type="email" className={`${input} mt-2`} value={form.buyer_email} onChange={(e) => set("buyer_email", e.target.value)} required />
            </div>
            <div>
              <label className="font-mono-caps text-[11px] text-muted-foreground">Message *</label>
              <textarea className={`${input} mt-2 resize-none`} rows={4} value={form.message} onChange={(e) => set("message", e.target.value)}
                placeholder={type === "commission" ? "Describe what you'd like commissioned — style, size, timeline, budget…" : "Introduce yourself and express your interest…"} required />
            </div>
            <div className="flex flex-wrap items-center gap-4 pt-2">
              <button type="submit" disabled={saving} className="flex items-center gap-2 bg-primary px-8 py-4 font-mono-caps text-[11px] text-primary-foreground hover:opacity-80 disabled:opacity-50">
                {saving && <Loader2 className="h-3 w-3 animate-spin" />} Send Enquiry
              </button>
              <button type="button" onClick={onClose} className="font-mono-caps text-[11px] text-muted-foreground">Cancel</button>
            </div>
          </form>
        )}
      </div>
    </div>
  );
}