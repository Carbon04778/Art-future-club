import React, { useState, useEffect } from "react";
import { spacePath } from "@/lib/slugs";
// isVenueType was used below but never imported, so this page threw a
// ReferenceError for any member who already had a non-gallery collector
// profile — the form silently stayed in "create" mode and saving produced a
// duplicate profile instead of editing the existing one.
import { COLLECTOR_TYPES as TYPES, isVenueType, isDirectoryType, isPeopleType } from "@/lib/venueTypes";
import { isModeratedCollectorType } from "@/lib/profileReadiness";
import SubmitForReview from "@/components/SubmitForReview";
import ProfileSwitchPanel from "@/components/ProfileSwitchPanel";
import { useNavigate } from "react-router-dom";
import { base44 } from "@/api/base44Client";
import ProfilePhotoPicker from "@/components/ProfilePhotoPicker";
import { Loader2 } from "lucide-react";
import SlimFooter from "@/components/SlimFooter";
import { cleanLinks } from "@/lib/links";


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
  const [form, setForm] = useState({ display_name: "", type: "Collector", based_in: "", bio: "", website: "", instagram: "", avatar_url: "", interests: [], seeking: [], budget_range: "", is_private: false });
  const [avatarFile, setAvatarFile] = useState(null);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [moderation, setModeration] = useState({ status: undefined, review_note: "" });

  useEffect(() => {
    base44.auth.me().then((u) => {
      setUser(u);
      setForm((f) => ({ ...f, display_name: u.full_name || "" }));
      base44.entities.CollectorProfile.filter({ user_id: u.id }).then(async (res) => {
        if (res.length === 0) {
          // An artist (e.g. just after an approved change of type, A1) goes
          // to the artist editor rather than a blank collector form.
          const artists = await base44.entities.ArtistProfile.filter({ user_id: u.id }).catch(() => []);
          if (artists[0]) navigate("/profile/edit", { replace: true });
          return;
        }
        if (res.length > 0) {
          // Galleries maintain their own dedicated profile page — send them there
          // if any of the user's profiles is a Gallery (even if a Collector one exists too).
          const gallery = res.find((p) => p.type === "Gallery");
          if (gallery) { navigate(spacePath(gallery, false), { replace: true }); return; }
          const venue = res.find((p) => isVenueType(p.type));
          if (venue) { navigate(spacePath(venue, true), { replace: true }); return; }
          // Directory listings (B11) are edited on their own page too.
          const listing = res.find((p) => isDirectoryType(p.type));
          if (listing) { navigate(spacePath(listing), { replace: true }); return; }
          // Use the most recently created collector profile.
          const p = res.sort((a, b) => new Date(b.created_date) - new Date(a.created_date))[0];
          setProfileId(p.id);
          setModeration({ status: p.status, review_note: p.review_note || "" });
          setForm({ display_name: p.display_name || "", type: p.type || "Collector", based_in: p.based_in || "", bio: p.bio || "", website: p.website || "", instagram: p.instagram || "", avatar_url: p.avatar_url || "", interests: p.interests || [], seeking: p.seeking || [], budget_range: p.budget_range || "", is_private: !!p.is_private });
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
    // Links tidied as typed: "www." gets https://, "@" goes (B13).
    const data = { ...cleanLinks(form), avatar_url, user_id: user.id };
    if (profileId) {
      const updated = await base44.entities.CollectorProfile.update(profileId, data);
      setModeration({ status: updated?.status, review_note: updated?.review_note || "" });
    } else {
      const c = await base44.entities.CollectorProfile.create(data);
      setProfileId(c.id);
      setModeration({ status: c?.status, review_note: "" });
    }
    // Same fix as the artist editor: the uploaded URL was only written into
    // the payload, so the form still showed no photo until the page reloaded,
    // and the file was kept and re-uploaded on every later save.
    setForm((f) => ({ ...f, avatar_url }));
    setAvatarFile(null);
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

        {/*
          Private collectors, curators and advisors are not reviewed — they
          publish no public page and no imagery. This only appears if the type
          is switched to a gallery or venue, which does, so that transition
          does not leave the member with a hidden profile and no way to submit
          it. Galleries that already have a profile use the panel on their own
          page instead.
        */}
        {isModeratedCollectorType(form.type) && (
          <SubmitForReview
            // A chosen-but-not-uploaded logo lives in avatarFile, so the
            // checklist would not tick until after a save and reload.
            profile={{
              ...form,
              avatar_url: form.avatar_url || (avatarFile ? "pending-upload" : ""),
              ...moderation,
            }}
            entity="CollectorProfile"
            profileId={profileId}
            kind="gallery"
            unsavedChanges={!!avatarFile}
            onSubmitted={(row) =>
              setModeration({ status: row?.status, review_note: row?.review_note || "" })
            }
          />
        )}

        {/* The same picker as the artist and gallery forms (B14): the round
            preview now shows the adjusted photo, and a saved one can be
            re-adjusted. */}
        <ProfilePhotoPicker
          key={form.avatar_url || "none"}
          currentUrl={form.avatar_url}
          name={form.display_name}
          inputClassName={input}
          onChange={setAvatarFile}
        />

        <div className="space-y-6">
          <p className="font-mono-caps text-[11px] text-muted-foreground border-b border-border pb-3">01 — Identity</p>
          <Field label="Display Name *"><input className={input} value={form.display_name} onChange={(e) => set("display_name", e.target.value)} required /></Field>
          <div className="grid grid-cols-1 gap-6 md:grid-cols-2">
            <Field label="Profile Type *">
              {/* Chosen once, when the profile is made. Changing it later goes
                  through "Change profile type" below and the approval queue
                  (A1) — it used to publish a "Gallery" with no review. */}
              <select className={select} value={form.type} onChange={(e) => set("type", e.target.value)} disabled={!!profileId}>
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
          {/* B10: Julie — a collector can make their profile private. Only
              people profiles (collectors, curators, advisors) have this. */}
          {isPeopleType(form.type) && (
            <label className="flex items-start gap-3 cursor-pointer" data-testid="private-toggle">
              <input type="checkbox" checked={!!form.is_private} onChange={(e) => set("is_private", e.target.checked)} className="mt-1 h-4 w-4 accent-primary" />
              <span>
                <span className="font-mono-caps text-[11px]">Make my profile private</span>
                <span className="block text-xs text-muted-foreground">Hides your profile and collections from everyone except you and the AFC team. Otherwise only collectors and premium members can see them.</span>
              </span>
            </label>
          )}
        </div>

        <div className="space-y-6">
          <p className="font-mono-caps text-[11px] text-muted-foreground border-b border-border pb-3">03 — Links</p>
          <Field label="Website"><input className={input} value={form.website} onChange={(e) => set("website", e.target.value)} placeholder="yourgallery.com" type="text" inputMode="url" autoCapitalize="none" spellCheck={false} /></Field>
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
      {/* A1: ask to change profile type (goes to the approval queue). */}
      {profileId && user?.id && (
        <div className="px-6 md:px-10 mx-auto max-w-3xl mt-12">
          <ProfileSwitchPanel userId={user.id} currentType={form.type} />
        </div>
      )}
      <SlimFooter />
    </>
  );
}