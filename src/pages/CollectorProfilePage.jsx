import React, { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { base44 } from "@/api/base44Client";
import ImageCropBox from "@/components/ImageCropBox";
import { Loader2 } from "lucide-react";
import { Image } from "@/components/ui/image";
import SlimFooter from "@/components/SlimFooter";

const TYPES = ["Collector", "Curator", "Institution", "Foundation"];
const INTERESTS = ["Painting", "Sculpture", "Photography", "Installation", "Video Art", "Performance", "Drawing", "Ceramics", "Digital Art", "Mixed Media"];
const SEEKING = ["Emerging Artists", "Established Artists", "Commissions", "Editions", "Gallery Partnerships"];
const BUDGETS = ["Under $1k", "$1k–$5k", "$5k–$20k", "$20k–$100k", "$100k+"];

function Field({ label, children }) {
  return (
    <div>
      <label className="font-mono-caps text-[11px] text-muted-foreground">{label}</label>
      <div className="mt-2">{children}</div>
    </div>
  );
}

export default function CollectorProfilePage() {
  const navigate = useNavigate();
  const [user, setUser] = useState(null);
  const [profileId, setProfileId] = useState(null);
  const [form, setForm] = useState({ display_name: "", type: "Collector", based_in: "", bio: "", website: "", instagram: "", avatar_url: "", interests: [], seeking: [], budget_range: "" });
  const [avatarFile, setAvatarFile] = useState(null);
  // The raw file the user picked, before cropping. ImageCropBox turns it into
  // the square file we actually upload.
  const [avatarRaw, setAvatarRaw] = useState(null);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    base44.auth.me().then((u) => {
      setUser(u);
      setForm((f) => ({ ...f, display_name: u.full_name || "" }));
      base44.entities.CollectorProfile.filter({ user_id: u.id }).then((res) => {
        if (res.length > 0) {
          // Galleries maintain their own dedicated profile page — send them there
          // if any of the user's profiles is a Gallery (even if a Collector one exists too).
          const gallery = res.find((p) => p.type === "Gallery");
          if (gallery) { navigate(`/gallery/${gallery.id}`, { replace: true }); return; }
          const venue = res.find((p) => p.type === "Institution");
          if (venue) { navigate(`/venues/${venue.id}`, { replace: true }); return; }
          // Use the most recently created collector profile.
          const p = res.sort((a, b) => new Date(b.created_date) - new Date(a.created_date))[0];
          setProfileId(p.id);
          setForm({ display_name: p.display_name || "", type: p.type || "Collector", based_in: p.based_in || "", bio: p.bio || "", website: p.website || "", instagram: p.instagram || "", avatar_url: p.avatar_url || "", interests: p.interests || [], seeking: p.seeking || [], budget_range: p.budget_range || "" });
        }
      });
    });
  }, []);

  const set = (k, v) => setForm((f) => ({ ...f, [k]: v }));
  const toggle = (key, val) => set(key, form[key].includes(val) ? form[key].filter((x) => x !== val) : [...form[key], val]);
  const input = "w-full border border-border bg-transparent px-4 py-3 text-base outline-none focus:border-foreground";
  const select = "w-full border border-border bg-background px-4 py-3 text-base outline-none focus:border-foreground";

  const handleSave = async (e) => {
    e.preventDefault();
    setSaving(true);
    let avatar_url = form.avatar_url;
    if (avatarFile) { const r = await base44.integrations.Core.UploadFile({ file: avatarFile }); avatar_url = r.file_url; }
    const data = { ...form, avatar_url, user_id: user.id };
    if (profileId) await base44.entities.CollectorProfile.update(profileId, data);
    else { const c = await base44.entities.CollectorProfile.create(data); setProfileId(c.id); }
    setSaving(false); setSaved(true); setTimeout(() => setSaved(false), 2500);
  };

  return (
    <>

      <form onSubmit={handleSave} className="mx-auto max-w-3xl px-6 py-16 md:px-10 space-y-14">
        <div>
          <p className="font-mono-caps text-[11px] text-muted-foreground">Collector Profile</p>
          <h1 className="mt-3 font-heading text-5xl font-medium tracking-[-0.02em]">{profileId ? "Edit Profile" : "Create Collector Profile"}</h1>
          <p className="mt-4 text-muted-foreground">Signal your intent to the AFC artist community — let artists and galleries know who you are and what you collect.</p>
        </div>

        <div className="flex items-start gap-8">
          <div className="h-24 w-24 shrink-0 overflow-hidden rounded-full bg-muted flex items-center justify-center">
            {form.avatar_url ? <Image src={form.avatar_url} alt="Avatar" fittingType="fill" className="h-full w-full object-cover" /> : <span className="font-mono-caps text-2xl text-muted-foreground">{form.display_name?.[0]}</span>}
          </div>
          <div className="flex-1">
            <Field label="Profile Photo">
              {avatarRaw ? (
                <ImageCropBox
                  file={avatarRaw}
                  alt={form.display_name || "Profile photo"}
                  onChange={(cropped) => setAvatarFile(cropped)}
                />
              ) : (
                form.avatar_url && (
                  <div className="mb-3 aspect-square w-40 overflow-hidden bg-white">
                    <img src={form.avatar_url} alt="" className="h-full w-full object-cover" />
                  </div>
                )
              )}
              <input type="file" accept="image/*" className={`${input} file:mr-4 file:border-0 file:bg-muted file:px-3 file:py-1 file:font-mono-caps file:text-[11px]`} onChange={(e) => { const f = e.target.files?.[0] || null; setAvatarRaw(f); setAvatarFile(f); }} />
            </Field>
          </div>
        </div>

        <div className="space-y-6">
          <p className="font-mono-caps text-[11px] text-muted-foreground border-b border-border pb-3">01 — Identity</p>
          <Field label="Display Name *"><input className={input} value={form.display_name} onChange={(e) => set("display_name", e.target.value)} required /></Field>
          <div className="grid grid-cols-1 gap-6 md:grid-cols-2">
            <Field label="Profile Type *">
              <select className={select} value={form.type} onChange={(e) => set("type", e.target.value)}>
                {TYPES.map((t) => <option key={t}>{t}</option>)}
              </select>
            </Field>
            <Field label="Based In"><input className={input} value={form.based_in} onChange={(e) => set("based_in", e.target.value)} placeholder="City, Country" /></Field>
          </div>
          <Field label="Bio / About"><textarea className={`${input} resize-none`} rows={4} value={form.bio} onChange={(e) => set("bio", e.target.value)} placeholder="Tell artists about your collection focus, gallery programme, or curatorial vision…" /></Field>
        </div>

        <div className="space-y-6">
          <p className="font-mono-caps text-[11px] text-muted-foreground border-b border-border pb-3">02 — Collection Focus</p>
          <Field label="Disciplines of Interest">
            <div className="flex flex-wrap gap-2">
              {INTERESTS.map((i) => (
                <button type="button" key={i} onClick={() => toggle("interests", i)}
                  className={`font-mono-caps text-[11px] px-3 py-1.5 border transition-colors ${form.interests.includes(i) ? "border-foreground bg-foreground text-background" : "border-border text-muted-foreground"}`}>{i}</button>
              ))}
            </div>
          </Field>
          <Field label="Seeking">
            <div className="flex flex-wrap gap-2">
              {SEEKING.map((s) => (
                <button type="button" key={s} onClick={() => toggle("seeking", s)}
                  className={`font-mono-caps text-[11px] px-3 py-1.5 border transition-colors ${form.seeking.includes(s) ? "border-foreground bg-foreground text-background" : "border-border text-muted-foreground"}`}>{s}</button>
              ))}
            </div>
          </Field>
          <Field label="Budget Range">
            <select className={select} value={form.budget_range} onChange={(e) => set("budget_range", e.target.value)}>
              <option value="">Prefer not to say</option>
              {BUDGETS.map((b) => <option key={b}>{b}</option>)}
            </select>
          </Field>
        </div>

        <div className="space-y-6">
          <p className="font-mono-caps text-[11px] text-muted-foreground border-b border-border pb-3">03 — Links</p>
          <Field label="Website"><input className={input} value={form.website} onChange={(e) => set("website", e.target.value)} placeholder="https://yourgallery.com" type="url" /></Field>
          <Field label="Instagram"><input className={input} value={form.instagram} onChange={(e) => set("instagram", e.target.value)} placeholder="@handle" /></Field>
        </div>

        <div className="flex flex-wrap items-center gap-4 pt-4 border-t border-border">
          <button type="submit" disabled={saving} className="flex items-center gap-2 bg-primary px-8 py-4 font-mono-caps text-[11px] text-primary-foreground hover:opacity-80 disabled:opacity-50">
            {saving && <Loader2 className="h-3 w-3 animate-spin" />}
            {profileId ? "Save Changes" : "Create Profile"}
          </button>
          {saved && <span className="font-mono-caps text-[11px] text-primary">Saved ✓</span>}
        </div>
      </form>
      <SlimFooter />
    </>
  );
}