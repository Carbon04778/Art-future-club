import React, { useState, useEffect } from "react";
import { Link } from "react-router-dom";
import { base44 } from "@/api/base44Client";
import { Plus, ExternalLink, X, Loader2, Calendar, MapPin } from "lucide-react";
import SlimFooter from "@/components/SlimFooter";
import { format, isPast } from "date-fns";

const TYPES = ["All", "Open Call", "Residency", "Grant", "Fellowship", "Competition", "Exhibition", "Other"];

export default function OpenCalls() {
  const [calls, setCalls] = useState([]);
  const [filter, setFilter] = useState("All");
  const [showForm, setShowForm] = useState(false);
  const [user, setUser] = useState(null);
  const [isPaidMember, setIsPaidMember] = useState(false);

  useEffect(() => {
    base44.entities.OpenCall.list("-created_date", 100).then(setCalls);
    base44.auth.me().then((u) => {
      setUser(u);
      base44.entities.Subscription.filter({ user_id: u.id, status: "active" }).then((subs) => {
        setIsPaidMember(Array.isArray(subs) && subs.length > 0);
      }).catch(() => setIsPaidMember(false));
    }).catch(() => {});
  }, []);

  const filtered = filter === "All" ? calls : calls.filter((c) => c.type === filter);
  const active = filtered.filter((c) => !c.deadline || !isPast(new Date(c.deadline)));
  const expired = filtered.filter((c) => c.deadline && isPast(new Date(c.deadline)));

  return (
    <>
      {user?.role === "admin" && (
        <div className="flex justify-end px-6 py-3 md:px-10 border-b border-border">
          <button onClick={() => setShowForm(true)} className="flex items-center gap-1.5 bg-primary px-4 py-2 font-mono-caps text-[11px] text-primary-foreground hover:opacity-80">
            <Plus className="h-3 w-3" /> Post Opportunity
          </button>
        </div>
      )}

      <div className="px-6 py-16 md:px-10 max-w-5xl mx-auto">
        <p className="font-mono-caps text-[11px] text-muted-foreground">AFC — Opportunities Board</p>
        <h1 className="mt-3 font-heading text-5xl font-medium tracking-[-0.02em] md:text-7xl">Open Calls</h1>
        <p className="mt-4 text-lg text-muted-foreground"><span className="text-primary">Residencies</span>, <span className="text-accent">grants</span>, <span className="text-highlight">fellowships</span> and calls for submissions.</p>

        <div className="mt-10 flex flex-wrap gap-2">
          {TYPES.map((t) => (
            <button key={t} onClick={() => setFilter(t)}
              className={`font-mono-caps text-[11px] px-3 py-1.5 border transition-colors ${filter === t ? "border-foreground bg-foreground text-background" : "border-border text-muted-foreground hover:border-foreground"}`}>
              {t}
            </button>
          ))}
        </div>

        <div className="mt-12 space-y-4">
          {active.length === 0 && expired.length === 0 && (
            <div className="py-16 text-center border border-border">
              <p className="font-mono-caps text-[11px] text-muted-foreground">No opportunities posted yet.</p>
            </div>
          )}
          {active.map((c) => <CallCard key={c.id} call={c} isPaidMember={isPaidMember} />)}
          {expired.length > 0 && (
            <>
              <p className="font-mono-caps text-[11px] text-muted-foreground pt-8 pb-2">Past Deadlines</p>
              {expired.map((c) => <CallCard key={c.id} call={c} expired isPaidMember={isPaidMember} />)}
            </>
          )}
        </div>
      </div>

      <SlimFooter />

      {showForm && (
        <OpenCallForm
          user={user}
          onClose={() => setShowForm(false)}
          onCreated={() => { setShowForm(false); base44.entities.OpenCall.list("-created_date", 100).then(setCalls); }}
        />
      )}
    </>
  );
}

function CallCard({ call, expired, isPaidMember }) {
  const [showUpgrade, setShowUpgrade] = useState(false);
  return (
    <div className={`border border-border p-6 ${expired ? "opacity-50" : ""}`}>
      <div className="flex items-start justify-between gap-4">
        <div className="flex-1">
          <div className="flex items-center gap-3 mb-2">
            <span className="font-mono-caps text-[10px] border border-border px-2 py-0.5 text-muted-foreground">{call.type}</span>
            {call.is_free && <span className="font-mono-caps text-[10px] border border-green-600 px-2 py-0.5 text-green-700">Free</span>}
            {expired && <span className="font-mono-caps text-[10px] border border-destructive px-2 py-0.5 text-destructive">Closed</span>}
          </div>
          {call.image_url && <img src={call.image_url} alt={call.title} className="aspect-video w-full mb-4 object-cover" />}
          <h3 className="font-heading text-2xl tracking-[-0.01em]">{call.title}</h3>
          <p className="mt-1 font-mono-caps text-[11px] text-primary">{call.organizer}</p>
          {call.description && <p className="mt-3 text-sm text-muted-foreground leading-relaxed line-clamp-3">{call.description}</p>}
          <div className="mt-4 flex flex-wrap gap-5">
            {call.location && (
              <span className="flex items-center gap-1.5 font-mono-caps text-[11px] text-muted-foreground">
                <MapPin className="h-3 w-3" /> {call.location}
              </span>
            )}
            {call.deadline && (
              <span className="flex items-center gap-1.5 font-mono-caps text-[11px] text-muted-foreground">
                <Calendar className="h-3 w-3" /> Deadline: {format(new Date(call.deadline), "d MMM yyyy")}
              </span>
            )}
            {call.prize && <span className="font-mono-caps text-[11px] text-primary">Prize: {call.prize}</span>}
            {!call.is_free && call.fee && <span className="font-mono-caps text-[11px] text-accent">Fee: {call.fee}</span>}
          </div>
        </div>
        {call.external_link && (
          <a
            href={isPaidMember ? call.external_link : undefined}
            target="_blank" rel="noreferrer"
            className="shrink-0 flex items-center gap-1.5 border border-border px-4 py-2 font-mono-caps text-[11px] text-muted-foreground hover:border-primary hover:text-primary transition-colors"
            onClick={(e) => { e.stopPropagation(); if (!isPaidMember) { e.preventDefault(); setShowUpgrade(true); } }}>
            <ExternalLink className="h-3 w-3" /> Apply
          </a>
        )}
      </div>

      {showUpgrade && (
        <div className="fixed inset-0 z-[70] bg-background/90 backdrop-blur-sm flex items-center justify-center p-6" onClick={() => setShowUpgrade(false)}>
          <div className="bg-card border border-border w-full max-w-md p-8" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between mb-4">
              <span className="font-mono-caps text-[11px] text-primary">Membership Required</span>
              <button onClick={() => setShowUpgrade(false)}><X className="h-4 w-4 text-muted-foreground" /></button>
            </div>
            <h3 className="font-heading text-3xl tracking-[-0.02em]">Join to apply</h3>
            <p className="mt-3 text-sm text-muted-foreground leading-relaxed">
              Applying to open calls is a <span className="text-primary">paid-member</span> benefit. Upgrade to unlock residencies, grants and submissions across the <span className="text-primary">network</span>.
            </p>
            <div className="mt-6 flex items-center gap-3">
              <Link to="/upgrade" className="bg-primary px-6 py-3 font-mono-caps text-[11px] text-primary-foreground hover:opacity-80">Upgrade Membership ↑</Link>
              <button onClick={() => setShowUpgrade(false)} className="font-mono-caps text-[11px] text-muted-foreground hover:text-foreground">Maybe later</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function OpenCallForm({ user, onClose, onCreated }) {
  const [form, setForm] = useState({ title: "", type: "Open Call", organizer: "", description: "", location: "", deadline: "", prize: "", is_free: true, fee: "", external_link: "", image_url: "" });
  const [imageFile, setImageFile] = useState(null);
  const [imagePreview, setImagePreview] = useState("");
  const [saving, setSaving] = useState(false);
  const set = (k, v) => setForm((f) => ({ ...f, [k]: v }));
  const input = "w-full border border-border bg-transparent px-4 py-3 text-base outline-none focus:border-foreground";

  const onPickImage = (file) => {
    setImageFile(file);
    setImagePreview(file ? URL.createObjectURL(file) : "");
    if (!file) set("image_url", "");
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setSaving(true);
    let image_url = form.image_url;
    if (imageFile) {
      const r = await base44.integrations.Core.UploadFile({ file: imageFile });
      image_url = r.file_url;
    }
    await base44.entities.OpenCall.create({ ...form, image_url, posted_by_id: user?.id, posted_by_name: user?.full_name || "Member" });
    setSaving(false);
    onCreated();
  };

  return (
    <div className="fixed inset-0 z-50 bg-background/90 backdrop-blur-sm flex items-center justify-center p-6" onClick={onClose}>
      <div className="bg-card border border-border w-full max-w-xl max-h-[90vh] overflow-y-auto" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between px-6 py-5 border-b border-border">
          <p className="font-mono-caps text-[11px]">Post an Opportunity</p>
          <button onClick={onClose}><X className="h-4 w-4 text-muted-foreground" /></button>
        </div>
        <form onSubmit={handleSubmit} className="p-6 space-y-5">
          <div>
            <label className="font-mono-caps text-[11px] text-muted-foreground">Title *</label>
            <input className={`${input} mt-2`} value={form.title} onChange={(e) => set("title", e.target.value)} required />
          </div>
          <div>
            <label className="font-mono-caps text-[11px] text-muted-foreground">Image</label>
            <input type="file" accept="image/*" onChange={(e) => onPickImage(e.target.files?.[0])} className={`${input} mt-2 file:mr-4 file:border-0 file:bg-muted file:px-3 file:py-1 file:font-mono-caps file:text-[11px]`} />
            {imagePreview && <img src={imagePreview} alt="" className="mt-3 aspect-video w-full object-cover" />}
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="font-mono-caps text-[11px] text-muted-foreground">Type</label>
              <select className="w-full border border-border bg-background px-4 py-3 text-base outline-none mt-2" value={form.type} onChange={(e) => set("type", e.target.value)}>
                {["Open Call", "Residency", "Grant", "Fellowship", "Competition", "Exhibition", "Other"].map((t) => <option key={t}>{t}</option>)}
              </select>
            </div>
            <div>
              <label className="font-mono-caps text-[11px] text-muted-foreground">Organizer *</label>
              <input className={`${input} mt-2`} value={form.organizer} onChange={(e) => set("organizer", e.target.value)} required />
            </div>
          </div>
          <div>
            <label className="font-mono-caps text-[11px] text-muted-foreground">Description</label>
            <textarea className={`${input} mt-2 resize-none`} rows={4} value={form.description} onChange={(e) => set("description", e.target.value)} />
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="font-mono-caps text-[11px] text-muted-foreground">Location</label>
              <input className={`${input} mt-2`} value={form.location} onChange={(e) => set("location", e.target.value)} placeholder="City or Online" />
            </div>
            <div>
              <label className="font-mono-caps text-[11px] text-muted-foreground">Deadline</label>
              <input type="date" className={`${input} mt-2`} value={form.deadline} onChange={(e) => set("deadline", e.target.value)} />
            </div>
          </div>
          <div>
            <label className="font-mono-caps text-[11px] text-muted-foreground">Prize / Stipend</label>
            <input className={`${input} mt-2`} value={form.prize} onChange={(e) => set("prize", e.target.value)} placeholder="e.g. £2,000 + accommodation" />
          </div>
          <div>
            <label className="font-mono-caps text-[11px] text-muted-foreground">External Link</label>
            <input type="url" className={`${input} mt-2`} value={form.external_link} onChange={(e) => set("external_link", e.target.value)} placeholder="https://…" />
          </div>
          <label className="flex items-center gap-2 cursor-pointer">
            <input type="checkbox" checked={form.is_free} onChange={(e) => set("is_free", e.target.checked)} className="h-4 w-4 accent-primary" />
            <span className="font-mono-caps text-[11px] text-muted-foreground">Free to apply</span>
          </label>
          {!form.is_free && (
            <div>
              <label className="font-mono-caps text-[11px] text-muted-foreground">Application Fee</label>
              <input className={`${input} mt-2`} value={form.fee} onChange={(e) => set("fee", e.target.value)} placeholder="e.g. £25" />
            </div>
          )}
          <div className="flex flex-wrap items-center gap-4 pt-2">
            <button type="submit" disabled={saving} className="flex items-center gap-2 bg-primary px-8 py-4 font-mono-caps text-[11px] text-primary-foreground hover:opacity-80 disabled:opacity-50">
              {saving && <Loader2 className="h-3 w-3 animate-spin" />} Post Opportunity
            </button>
            <button type="button" onClick={onClose} className="font-mono-caps text-[11px] text-muted-foreground">Cancel</button>
          </div>
        </form>
      </div>
    </div>
  );
}