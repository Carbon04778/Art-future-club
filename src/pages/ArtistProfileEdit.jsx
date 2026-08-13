import React, { useState, useEffect } from "react";
import { Link, useNavigate } from "react-router-dom";
import { base44 } from "@/api/base44Client";
import { Image } from "@/components/ui/image";
import { Plus, Trash2, Loader2, LogOut, X } from "lucide-react";
import SlimFooter from "@/components/SlimFooter";
import CVSection from "@/components/CVSection";
import ProfileCompletenessScore from "@/components/ProfileCompletenessScore";
import PortfolioPDFExport from "@/components/PortfolioPDFExport";
import ImageCropBox from "@/components/ImageCropBox";
import { CHAPTER_OPTIONS } from "@/lib/chaptersData";

const DISCIPLINES = ["Painting", "Sculpture", "Photography", "Installation", "Video Art", "Performance", "Drawing", "Printmaking", "Ceramics", "Sound Art", "Digital Art", "Mixed Media", "Other"];
const CHAPTERS = CHAPTER_OPTIONS;
const SEEKING_OPTIONS = ["Exhibition Opportunities", "Collectors", "Collaborators", "Residencies", "Representation", "Press"];

function Field({ label, children }) {
  return (
    <div>
      <label className="font-mono-caps text-[11px] text-muted-foreground">{label}</label>
      <div className="mt-2">{children}</div>
    </div>
  );
}

export default function ArtistProfileEdit() {
  const navigate = useNavigate();
  const [user, setUser] = useState(null);
  const [profileId, setProfileId] = useState(null);
  const [form, setForm] = useState({
    display_name: "", discipline: "", based_in: "", chapter: "", bio: "",
    website: "", instagram: "", twitter: "", tiktok: "", linkedin: "",
    avatar_url: "", portfolio_works: [], seeking: [], open_to_commissions: false, cv: { statement: "", exhibitions: [], education: [], awards: [] },
  });
  const [saving, setSaving] = useState(false);
  const [avatarFile, setAvatarFile] = useState(null);
  const [workFiles, setWorkFiles] = useState({});
  const [workRawFiles, setWorkRawFiles] = useState({});
  const [saved, setSaved] = useState(false);
  const [uploadingIdx, setUploadingIdx] = useState(null);
  const [upgradePrompt, setUpgradePrompt] = useState(false);

  const avatarPreview = avatarFile ? URL.createObjectURL(avatarFile) : null;

  useEffect(() => {
    base44.auth.me().then((u) => {
      setUser(u);
      setForm((f) => ({ ...f, display_name: u.full_name || "" }));
      base44.entities.ArtistProfile.filter({ user_id: u.id }).then((res) => {
        if (res.length > 0) {
          const p = res[0];
          setProfileId(p.id);
          setForm({
            display_name: p.display_name || "",
            discipline: p.discipline || "",
            based_in: p.based_in || "",
            chapter: p.chapter || "",
            bio: p.bio || "",
            website: p.website || "",
            instagram: p.instagram || "",
            twitter: p.twitter || "",
            tiktok: p.tiktok || "",
            linkedin: p.linkedin || "",
            avatar_url: p.avatar_url || "",
            portfolio_works: p.portfolio_works || [],
            seeking: p.seeking || [],
            open_to_commissions: p.open_to_commissions || false,
            cv: p.cv || { statement: "", exhibitions: [], education: [], awards: [] },
          });
        }
      });
    });
  }, []);

  const set = (key, value) => setForm((f) => ({ ...f, [key]: value }));

  const toggleSeeking = (item) => {
    set("seeking", form.seeking.includes(item)
      ? form.seeking.filter((s) => s !== item)
      : [...form.seeking, item]);
  };

  const addWork = () => {
    if (form.portfolio_works.length >= 4) { setUpgradePrompt(true); return; }
    set("portfolio_works", [...form.portfolio_works, { title: "", year: "", medium: "", dimensions: "", description: "", image_url: "", additional_images: [] }]);
  };
  const updateWork = (i, key, val) => {
    const works = [...form.portfolio_works];
    works[i] = { ...works[i], [key]: val };
    set("portfolio_works", works);
  };
  const removeWork = (i) => set("portfolio_works", form.portfolio_works.filter((_, idx) => idx !== i));
  const addWorkImages = async (i, files) => {
    const arr = Array.from(files || []).filter(Boolean);
    if (!arr.length) return;
    setUploadingIdx(i);
    try {
      const urls = [];
      for (const f of arr) {
        const res = await base44.integrations.Core.UploadFile({ file: f });
        urls.push(res.file_url);
      }
      const works = [...form.portfolio_works];
      works[i] = { ...works[i], additional_images: [...(works[i].additional_images || []), ...urls] };
      set("portfolio_works", works);
    } finally {
      setUploadingIdx(null);
    }
  };
  const removeWorkImage = (i, idx) => {
    const works = [...form.portfolio_works];
    const imgs = [...(works[i].additional_images || [])];
    imgs.splice(idx, 1);
    works[i] = { ...works[i], additional_images: imgs };
    set("portfolio_works", works);
  };

  const handleSave = async (e) => {
    e.preventDefault();
    setSaving(true);
    try {
      let avatar_url = form.avatar_url;
      if (avatarFile) {
        const res = await base44.integrations.Core.UploadFile({ file: avatarFile });
        avatar_url = res.file_url;
      }

      // upload any new work images
      const portfolio_works = [...form.portfolio_works];
      for (let i = 0; i < portfolio_works.length; i++) {
        if (workFiles[i]) {
          const res = await base44.integrations.Core.UploadFile({ file: workFiles[i] });
          portfolio_works[i] = { ...portfolio_works[i], image_url: res.file_url };
        }
      }

      const data = { ...form, avatar_url, portfolio_works, user_id: user?.id };

      if (profileId) {
        await base44.entities.ArtistProfile.update(profileId, data);
      } else {
        const created = await base44.entities.ArtistProfile.create(data);
        setProfileId(created.id);
      }
      setSaved(true);
      setTimeout(() => setSaved(false), 2500);
    } finally {
      setSaving(false);
    }
  };

  const input = "w-full border border-border bg-transparent px-4 py-3 text-base outline-none focus:border-foreground";
  const select = "w-full border border-border bg-background px-4 py-3 text-base outline-none focus:border-foreground";

  return (
    <>
      <div className="flex items-center justify-between px-6 py-3 md:px-10 border-b border-border">
        <span className="font-mono-caps text-[11px] text-foreground">Artist Profile</span>
        <div className="flex flex-wrap items-center gap-4">
          <Link to="/upgrade" className="font-mono-caps text-[11px] text-primary border border-primary/50 px-3 py-1 hover:bg-primary hover:text-primary-foreground transition-colors">Upgrade ↑</Link>
          {profileId && <PortfolioPDFExport profile={{ ...form, id: profileId }} />}
          {profileId && <Link to={`/artists/${profileId}`} className="font-mono-caps text-[11px] text-primary">View Profile →</Link>}
          <button
            type="button"
            onClick={() => base44.auth.logout("/")}
            className="flex items-center gap-1.5 font-mono-caps text-[11px] text-muted-foreground hover:text-destructive transition-colors"
          >
            <LogOut className="h-3 w-3" /> Log Out
          </button>
        </div>
      </div>

      <form onSubmit={handleSave} className="mx-auto max-w-3xl px-6 py-16 md:px-10 space-y-14">
        <div>
          <ProfileCompletenessScore profile={form} />
        <p className="font-mono-caps text-[11px] text-muted-foreground">Your Profile</p>
          <h1 className="mt-3 font-heading text-5xl font-medium tracking-[-0.02em]">
            {profileId ? "Edit Profile" : "Create Profile"}
          </h1>
        </div>

        {/* avatar */}
        <div className="flex items-start gap-8">
          <div className="h-24 w-24 shrink-0 overflow-hidden rounded-full bg-muted flex items-center justify-center">
            {avatarPreview
              ? <img src={avatarPreview} alt="Avatar preview" className="h-full w-full object-cover" />
              : form.avatar_url
                ? <Image src={form.avatar_url} alt="Avatar" fittingType="fill" className="h-full w-full object-cover" />
                : <span className="font-mono-caps text-2xl text-muted-foreground">{form.display_name?.[0]}</span>
            }
          </div>
          <div className="flex-1">
            <Field label="Profile Photo">
              <input
                type="file"
                accept="image/*"
                className={`${input} file:mr-4 file:border-0 file:bg-muted file:px-3 file:py-1 file:font-mono-caps file:text-[11px]`}
                onChange={(e) => setAvatarFile(e.target.files?.[0] || null)}
              />
            </Field>
          </div>
        </div>

        {/* basics */}
        <div className="space-y-6">
          <p className="font-mono-caps text-[11px] text-muted-foreground border-b border-border pb-3">01 — Identity</p>
          <Field label="Display Name *">
            <input className={input} value={form.display_name} onChange={(e) => set("display_name", e.target.value)} required placeholder="Your name or studio name" />
          </Field>
          <div className="grid grid-cols-1 gap-6 md:grid-cols-2">
            <Field label="Discipline *">
              <select className={select} value={form.discipline} onChange={(e) => set("discipline", e.target.value)} required>
                <option value="">Select…</option>
                {DISCIPLINES.map((d) => <option key={d}>{d}</option>)}
              </select>
            </Field>
            <Field label="Based In">
              <input className={input} value={form.based_in} onChange={(e) => set("based_in", e.target.value)} placeholder="City, Country" />
            </Field>
          </div>
          <Field label="AFC Chapter">
            <select className={select} value={form.chapter} onChange={(e) => set("chapter", e.target.value)}>
              <option value="">None / Not yet</option>
              {CHAPTERS.map((c) => <option key={c}>{c}</option>)}
            </select>
            {form.chapter === "Other" && (
              <>
                {/* The typed city goes in `based_in`, not `chapter`. Chapter
                    filtering matches exact values, so free text there would
                    fill the filters with one-off entries and group nothing. */}
                <input
                  className={`${input} mt-3`}
                  value={form.based_in}
                  onChange={(e) => set("based_in", e.target.value)}
                  placeholder="Which city are you based in?"
                />
                <p className="mt-2 text-xs text-muted-foreground">
                  We don&rsquo;t have a chapter there yet — tell us your city and
                  it will show on your profile.
                </p>
              </>
            )}
          </Field>
          <Field label="Bio">
            <textarea className={`${input} resize-none`} rows={5} value={form.bio} onChange={(e) => set("bio", e.target.value)} placeholder="Describe your practice, influences, and current focus…" />
          </Field>
        </div>

        {/* links */}
        <div className="space-y-6">
          <p className="font-mono-caps text-[11px] text-muted-foreground border-b border-border pb-3">02 — Links</p>
          <Field label="Website">
            <input className={input} value={form.website} onChange={(e) => set("website", e.target.value)} placeholder="https://yourstudio.com" type="url" />
          </Field>
          <Field label="Instagram Handle">
            <input className={input} value={form.instagram} onChange={(e) => set("instagram", e.target.value)} placeholder="@handle" />
          </Field>
          <Field label="X / Twitter Handle">
            <input className={input} value={form.twitter} onChange={(e) => set("twitter", e.target.value)} placeholder="@handle" />
          </Field>
          <Field label="TikTok Handle">
            <input className={input} value={form.tiktok} onChange={(e) => set("tiktok", e.target.value)} placeholder="@handle" />
          </Field>
          <Field label="LinkedIn URL">
            <input className={input} value={form.linkedin} onChange={(e) => set("linkedin", e.target.value)} placeholder="https://linkedin.com/in/…" type="url" />
          </Field>
        </div>

        {/* portfolio */}
        <div className="space-y-6">
          <div className="flex items-center justify-between border-b border-border pb-3">
            <p className="font-mono-caps text-[11px] text-muted-foreground">03 — Portfolio Works</p>
            <button type="button" onClick={addWork} className="flex items-center gap-1.5 font-mono-caps text-[11px] text-primary hover:opacity-70">
              <Plus className="h-3 w-3" /> Add Work
            </button>
          </div>
          {form.portfolio_works.length === 0 && (
            <p className="text-sm text-muted-foreground">No works added yet. Click "Add Work" to begin your portfolio.</p>
          )}
          {form.portfolio_works.map((work, i) => (
            <div key={i} className="border border-border p-6 space-y-4">
              <div className="flex items-center justify-between mb-2">
                <p className="font-mono-caps text-[11px] text-muted-foreground">Work {String(i + 1).padStart(2, "0")}</p>
                <button type="button" onClick={() => removeWork(i)}><Trash2 className="h-4 w-4 text-muted-foreground hover:text-destructive" /></button>
              </div>
              <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
                <Field label="Title">
                  <input className={input} value={work.title} onChange={(e) => updateWork(i, "title", e.target.value)} placeholder="Work title" />
                </Field>
                <Field label="Year">
                  <input className={input} value={work.year} onChange={(e) => updateWork(i, "year", e.target.value)} placeholder="2024" />
                </Field>
                <Field label="Medium">
                  <input className={input} value={work.medium} onChange={(e) => updateWork(i, "medium", e.target.value)} placeholder="Oil on canvas" />
                </Field>
                <Field label="Dimensions">
                  <input className={input} value={work.dimensions} onChange={(e) => updateWork(i, "dimensions", e.target.value)} placeholder="120 × 90 cm" />
                </Field>
              </div>
              <div className="flex flex-wrap items-center gap-4 pt-1">
                <label className="flex items-center gap-2 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={work.available_for_sale || false}
                    onChange={(e) => updateWork(i, "available_for_sale", e.target.checked)}
                    className="h-4 w-4 accent-primary"
                  />
                  <span className="font-mono-caps text-[11px] text-muted-foreground">Available for sale</span>
                </label>
                {work.available_for_sale && (
                  <div className="flex items-center gap-2 flex-1">
                    <select
                      className="border border-border bg-background px-3 py-2 text-sm outline-none focus:border-foreground"
                      value={work.currency || "USD"}
                      onChange={(e) => updateWork(i, "currency", e.target.value)}
                    >
                      {["USD", "EUR", "GBP", "JPY", "KRW", "MXN"].map((c) => <option key={c}>{c}</option>)}
                    </select>
                    <input
                      className={input}
                      value={work.price || ""}
                      onChange={(e) => updateWork(i, "price", e.target.value)}
                      placeholder="Price (e.g. 3,500)"
                    />
                  </div>
                )}
              </div>
              <Field label="Description">
                <textarea className={`${input} resize-none`} rows={3} value={work.description} onChange={(e) => updateWork(i, "description", e.target.value)} placeholder="About this work…" />
              </Field>
              <Field label="Work Image">
                {workRawFiles[i] ? (
                  <ImageCropBox
                    file={workRawFiles[i]}
                    onChange={(cropped) => setWorkFiles((wf) => ({ ...wf, [i]: cropped }))}
                    alt={work.title}
                  />
                ) : (
                  <>
                    {work.image_url && (
                      <div className="mb-3 aspect-square w-full overflow-hidden bg-white" data-artwork>
                        <img src={work.image_url} alt={work.title} className="h-full w-full object-contain" />
                      </div>
                    )}
                    <input
                      type="file"
                      accept="image/*"
                      className={`${input} file:mr-4 file:border-0 file:bg-muted file:px-3 file:py-1 file:font-mono-caps file:text-[11px]`}
                      onChange={(e) => setWorkRawFiles((wf) => ({ ...wf, [i]: e.target.files?.[0] }))}
                    />
                  </>
                )}
              </Field>
              <Field label="Additional Views">
                <div className="flex flex-wrap gap-2 mb-3">
                  {(work.additional_images || []).map((url, idx) => (
                    <div key={idx} className="relative h-20 w-20 overflow-hidden bg-white">
                      <img src={url} alt="" className="h-full w-full object-cover" />
                      <button type="button" onClick={() => removeWorkImage(i, idx)} className="absolute top-0.5 right-0.5 bg-background/80 p-0.5 hover:text-destructive">
                        <X className="h-3 w-3" />
                      </button>
                    </div>
                  ))}
                </div>
                <input
                  type="file"
                  accept="image/*"
                  multiple
                  disabled={uploadingIdx === i}
                  className={`${input} file:mr-4 file:border-0 file:bg-muted file:px-3 file:py-1 file:font-mono-caps file:text-[11px]`}
                  onChange={(e) => addWorkImages(i, e.target.files)}
                />
                {uploadingIdx === i && <p className="mt-2 font-mono-caps text-[10px] text-muted-foreground">Uploading…</p>}
                <p className="mt-2 font-mono-caps text-[10px] text-muted-foreground/60">Add multiple views (details, angles, installation shots). Visitors can scroll through them.</p>
              </Field>
            </div>
          ))}
        </div>

        {/* CV */}
        <CVSection cv={form.cv} onChange={(val) => set("cv", val)} />

        {/* seeking + commissions */}
        <div className="space-y-6">
          <p className="font-mono-caps text-[11px] text-muted-foreground border-b border-border pb-3">04 — Opportunities</p>
          <Field label="Currently Seeking">
            <div className="flex flex-wrap gap-2">
              {SEEKING_OPTIONS.map((item) => (
                <button
                  type="button"
                  key={item}
                  onClick={() => toggleSeeking(item)}
                  className={`font-mono-caps text-[11px] px-3 py-1.5 border transition-colors ${form.seeking.includes(item) ? "border-foreground bg-foreground text-background" : "border-border text-muted-foreground"}`}
                >
                  {item}
                </button>
              ))}
            </div>
          </Field>
          <Field label="Open to Commissions">
            <label className="flex items-center gap-3 cursor-pointer">
              <input
                type="checkbox"
                checked={form.open_to_commissions}
                onChange={(e) => set("open_to_commissions", e.target.checked)}
                className="h-4 w-4 accent-primary"
              />
              <span className="text-sm">Yes, I am currently open to commission enquiries</span>
            </label>
          </Field>
        </div>

        {/* save */}
        <div className="flex flex-wrap items-center gap-4 pt-4 border-t border-border">
          <button
            type="submit"
            disabled={saving}
            className="flex items-center gap-2 bg-primary px-8 py-4 font-mono-caps text-[11px] text-primary-foreground hover:opacity-80 disabled:opacity-50"
          >
            {saving ? <Loader2 className="h-3 w-3 animate-spin" /> : null}
            {profileId ? "Save Changes" : "Publish Profile"}
          </button>
          {saved && <span className="font-mono-caps text-[11px] text-primary">Saved ✓</span>}
        </div>
      </form>

      {upgradePrompt && (
        <div className="fixed inset-0 z-[70] bg-background/90 backdrop-blur-sm flex items-center justify-center p-6" onClick={() => setUpgradePrompt(false)}>
          <div className="bg-card border border-border w-full max-w-md p-8" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between mb-4">
              <span className="font-mono-caps text-[11px] text-primary">Membership Required</span>
              <button type="button" onClick={() => setUpgradePrompt(false)}><X className="h-4 w-4 text-muted-foreground" /></button>
            </div>
            <h3 className="font-heading text-3xl tracking-[-0.02em]">You’ve reached the free limit</h3>
            <p className="mt-3 text-sm text-muted-foreground leading-relaxed">
              Free artist profiles can showcase up to <span className="text-foreground">4 artworks</span>. To add more works and unlock premium features, upgrade your membership — a small annual fee applies.
            </p>
            <div className="mt-6 flex items-center gap-3">
              <Link to="/upgrade" className="flex items-center gap-2 bg-primary px-6 py-3 font-mono-caps text-[11px] text-primary-foreground hover:opacity-80">
                Upgrade Membership ↑
              </Link>
              <button type="button" onClick={() => setUpgradePrompt(false)} className="font-mono-caps text-[11px] text-muted-foreground hover:text-foreground">Maybe later</button>
            </div>
          </div>
        </div>
      )}

      <SlimFooter />
    </>
  );
}