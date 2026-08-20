import React, { useState } from "react";
import { base44 } from "@/api/base44Client";
import { Plus, Loader2, Check, X } from "lucide-react";
import { CHAPTER_OPTIONS } from "@/lib/chaptersData";
import ImageCropBox from "@/components/ImageCropBox";

const DISCIPLINES = [
  "Painting", "Sculpture", "Photography", "Installation", "Video Art",
  "Performance", "Drawing", "Printmaking", "Ceramics", "Sound Art",
  "Digital Art", "Mixed Media", "Other",
];

// Must match the discipline filter on the Galleries page, which reads
// profile.interests. A gallery created without these appears only under
// "All" and disappears the moment a visitor filters by discipline.
const INTERESTS = [
  "Painting", "Sculpture", "Photography", "Installation", "Video Art",
  "Performance", "Drawing", "Ceramics", "Digital Art", "Mixed Media",
];

/** Mirrors the options on the artist profile editor. */
const SEEKING_OPTIONS = [
  "Gallery Representation", "Exhibition Opportunities", "Commissions",
  "Residencies", "Collaborations", "Collectors", "Press & Features",
];

const PARTNERSHIP_TYPES = ["", "Paid Member", "Partner"];

/** Strip links, markup and contact details from a dimensions value. */
const cleanDimensions = (v) =>
  v
    .replace(/https?:\/\/\S+/gi, "")
    .replace(/www\.\S+/gi, "")
    .replace(/<[^>]*>/g, "")
    .replace(/[\w.+-]+@[\w-]+\.\w+/g, "")
    .replace(/\s{2,}/g, " ")
    .slice(0, 60);

const CURRENCIES = ["USD", "HKD", "GBP", "EUR", "SGD", "AUD", "CAD"];

/** One portfolio work, matching the shape ArtistProfileView reads. */
const emptyWork = () => ({
  title: "",
  year: "",
  medium: "",
  dimensions: "",
  description: "",
  available_for_sale: false,
  price: "",
  currency: "USD",
  file: null,          // local only — replaced by image_url before saving
});

const COLLECTOR_TYPES = ["Gallery", "Institution", "Collector", "Curator", "Advisor", "Foundation"];

/**
 * Lets an admin create listings on behalf of others.
 *
 * Profiles created here have no user_id — they are "unclaimed". They appear in
 * the directories immediately, and can be attached to a real login later by
 * setting user_id on the row. This is what makes it possible to populate and
 * test the gallery, venue and artist features before those members have
 * registered.
 *
 * Requires migration 008. Without it the insert is refused by row-level
 * security, and the error below will say so.
 */
export default function AdminCreatePanel({ onCreated }) {
  const [kind, setKind] = useState("Gallery");
  const [form, setForm] = useState({
    display_name: "",
    type: "Gallery",
    discipline: "Painting",
    chapter: CHAPTER_OPTIONS[0],
    based_in: CHAPTER_OPTIONS[0],
    claim_email: "",
    instagram: "",
    twitter: "",
    linkedin: "",
    tiktok: "",
    partnership_type: "",
    address: "",
    website: "",
    bio: "",
  });
  const [interests, setInterests] = useState([]);
  const [seeking, setSeeking] = useState([]);
  const [openToCommissions, setOpenToCommissions] = useState(false);
  // avatarRaw is the file the admin picked; ImageCropBox turns it into the
  // square avatarFile we actually upload.
  const [avatarRaw, setAvatarRaw] = useState(null);
  const [avatarFile, setAvatarFile] = useState(null);
  const [coverFile, setCoverFile] = useState(null);
  const [works, setWorks] = useState([]);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [done, setDone] = useState("");

  const set = (k, v) => setForm((f) => ({ ...f, [k]: v }));

  const updateWork = (i, k, v) =>
    setWorks((prev) => prev.map((w, x) => (x === i ? { ...w, [k]: v } : w)));

  const submit = async () => {
    setError("");
    setDone("");
    if (!form.display_name.trim()) {
      setError("A name is required.");
      return;
    }
    setSaving(true);
    try {
      // Upload first: if an upload fails we stop before creating a profile
      // that points at nothing.
      let avatar_url = "";
      let cover_image_url = "";
      if (avatarFile) {
        const r = await base44.integrations.Core.UploadFile({ file: avatarFile });
        avatar_url = r.file_url;
      }
      if (coverFile) {
        const r = await base44.integrations.Core.UploadFile({ file: coverFile });
        cover_image_url = r.file_url;
      }

      // Each work's image is uploaded separately. A work without an image is
      // still saved — the profile page falls back gracefully.
      const portfolio_works = [];
      for (const w of works) {
        if (!w.title.trim() && !w.file) continue;
        let image_url = "";
        if (w.file) {
          const r = await base44.integrations.Core.UploadFile({ file: w.file });
          image_url = r.file_url;
        }
        portfolio_works.push({
          title: w.title.trim(),
          year: w.year.trim(),
          medium: w.medium.trim(),
          dimensions: w.dimensions.trim(),
          description: w.description.trim(),
          image_url,
          additional_images: [],
          available_for_sale: w.available_for_sale,
          price: w.available_for_sale ? w.price.trim() : "",
          currency: w.currency,
        });
      }

      if (kind === "Artist") {
        await base44.entities.ArtistProfile.create({
          display_name: form.display_name.trim(),
          avatar_url,
          // Recorded so the real artist can claim this listing when they
          // register with the same address. Creates no account by itself.
          claim_email: form.claim_email.trim().toLowerCase() || null,
          instagram: form.instagram.trim(),
          twitter: form.twitter.trim(),
          linkedin: form.linkedin.trim(),
          tiktok: form.tiktok.trim(),
          open_to_commissions: openToCommissions,
          discipline: form.discipline,
          chapter: form.chapter,
          based_in: form.based_in.trim(),
          website: form.website.trim(),
          bio: form.bio.trim(),
          portfolio_works,
          cv: {},
          seeking,
        });
      } else {
        await base44.entities.CollectorProfile.create({
          display_name: form.display_name.trim(),
          avatar_url,
          cover_image_url,
          claim_email: form.claim_email.trim().toLowerCase() || null,
          instagram: form.instagram.trim(),
          twitter: form.twitter.trim(),
          linkedin: form.linkedin.trim(),
          type: form.type,
          based_in: form.based_in.trim(),
          address: form.address.trim(),
          website: form.website.trim(),
          bio: form.bio.trim(),
          space_images: [],
          interests,
          partnership_type: form.partnership_type || null,
          seeking: [],
        });
      }
      setDone(`${form.display_name.trim()} created.`);
      setForm((f) => ({ ...f, display_name: "", based_in: "", address: "", website: "", bio: "", claim_email: "", instagram: "", twitter: "", linkedin: "", tiktok: "" }));
      setInterests([]);
      setSeeking([]);
      setOpenToCommissions(false);
      setWorks([]);
      setAvatarRaw(null);
      setAvatarFile(null);
      setCoverFile(null);
      onCreated?.();
    } catch (e) {
      const msg = String(e?.message || e);
      setError(
        /row-level security|policy/i.test(msg)
          ? "Permission denied. Run migration 008_admin_can_create_profiles.sql in Supabase, then try again."
          : msg
      );
    } finally {
      setSaving(false);
    }
  };

  const field =
    "w-full border border-border bg-background px-4 py-3 text-base outline-none focus:border-primary";

  return (
    <div className="border border-border bg-card p-6">
      <h3 className="font-heading text-2xl tracking-[-0.01em]">Add a listing</h3>
      <p className="mt-2 text-sm text-muted-foreground">
        Creates a profile that is live immediately and not tied to a login.
        The gallery, venue or artist can claim it later.
      </p>

      <div className="mt-6 flex flex-wrap gap-2">
        {["Gallery", "Venue", "Artist"].map((k) => (
          <button
            key={k}
            onClick={() => {
              setKind(k);
              setDone("");
              setError("");
              if (k === "Gallery") set("type", "Gallery");
              if (k === "Venue") set("type", "Institution");
            }}
            className={`px-4 py-2 font-mono-caps text-[11px] border transition-colors ${
              kind === k
                ? "border-primary text-primary"
                : "border-border text-muted-foreground hover:text-foreground"
            }`}
          >
            {k}
          </button>
        ))}
      </div>

      <div className="mt-6 grid grid-cols-1 gap-4 md:grid-cols-2">
        <div className="md:col-span-2">
          <label className="font-mono-caps text-[11px] text-muted-foreground">Name *</label>
          <input
            className={`${field} mt-2`}
            value={form.display_name}
            onChange={(e) => set("display_name", e.target.value)}
           placeholder={
              kind === "Artist"
                ? "Artist name"
                : kind === "Venue"
                ? "Venue name"
                : "Gallery name"
            }
          />
        </div>

        {kind === "Artist" ? (
          <>
            <div>
              <label className="font-mono-caps text-[11px] text-muted-foreground">Discipline</label>
              <select className={`${field} mt-2`} value={form.discipline} onChange={(e) => set("discipline", e.target.value)}>
                {DISCIPLINES.map((d) => <option key={d} value={d}>{d}</option>)}
              </select>
            </div>
            <div>
              <label className="font-mono-caps text-[11px] text-muted-foreground">Chapter</label>
              <select className={`${field} mt-2`} value={form.chapter} onChange={(e) => set("chapter", e.target.value)}>
                {CHAPTER_OPTIONS.map((c) => <option key={c} value={c}>{c}</option>)}
              </select>
            </div>
          </>
        ) : (
          <>
            <div>
              <label className="font-mono-caps text-[11px] text-muted-foreground">Type</label>
              <select className={`${field} mt-2`} value={form.type} onChange={(e) => set("type", e.target.value)}>
                {COLLECTOR_TYPES.map((t) => <option key={t} value={t}>{t}</option>)}
              </select>
            </div>
            <div>
              <label className="font-mono-caps text-[11px] text-muted-foreground">Address</label>
              <input className={`${field} mt-2`} value={form.address} onChange={(e) => set("address", e.target.value)} placeholder="Street, city" />
            </div>
          </>
        )}

        <div>
          <label className="font-mono-caps text-[11px] text-muted-foreground">Based in</label>
          {/* A dropdown, not free text: the Galleries and Venues pages filter
              with based_in.includes(chapter), so "HK" or "Hong Kong SAR" would
              drop the listing out of chapter filtering entirely. */}
          <select className={`${field} mt-2`} value={form.based_in} onChange={(e) => set("based_in", e.target.value)}>
            {CHAPTER_OPTIONS.map((c) => <option key={c} value={c}>{c}</option>)}
          </select>
        </div>
        <div>
          <label className="font-mono-caps text-[11px] text-muted-foreground">Website</label>
          <input className={`${field} mt-2`} value={form.website} onChange={(e) => set("website", e.target.value)} placeholder="https://" />
        </div>
        {kind === "Gallery" && (
          <div className="md:col-span-2">
              <label className="font-mono-caps text-[11px] text-muted-foreground">
                Disciplines shown / represented
              </label>
              <p className="mt-1 text-xs text-muted-foreground">
                These drive the discipline filter on the galleries page. Pick at
                least one or the listing only appears under &ldquo;All&rdquo;.
              </p>
              <div className="mt-3 flex flex-wrap gap-2">
                {INTERESTS.map((d) => {
                  const on = interests.includes(d);
                  return (
                    <button
                      key={d}
                      type="button"
                      onClick={() =>
                        setInterests((prev) =>
                          on ? prev.filter((x) => x !== d) : [...prev, d]
                        )
                      }
                      className={`border px-3 py-1.5 font-mono-caps text-[10px] transition-colors ${
                        on
                          ? "border-primary text-primary"
                          : "border-border text-muted-foreground hover:text-foreground"
                      }`}
                    >
                      {d}
                    </button>
                  );
                })}
              </div>
          </div>
        )}

        {kind !== "Artist" && (
            <div>
              <label className="font-mono-caps text-[11px] text-muted-foreground">
                Partnership status
              </label>
              <select
                className={`${field} mt-2`}
                value={form.partnership_type}
                onChange={(e) => set("partnership_type", e.target.value)}
              >
                {PARTNERSHIP_TYPES.map((t) => (
                  <option key={t || "none"} value={t}>{t || "None"}</option>
                ))}
              </select>
            </div>
        )}

        <div className="md:col-span-2 grid grid-cols-1 gap-4 md:grid-cols-2">
          <div>
            <label className="font-mono-caps text-[11px] text-muted-foreground">
              {kind === "Artist" ? "Profile photo" : "Logo / profile photo"}
            </label>
            {avatarRaw && (
              <div className="mt-2">
                <ImageCropBox
                  file={avatarRaw}
                  alt={form.display_name || "Profile photo"}
                  onChange={(cropped) => setAvatarFile(cropped)}
                />
                <p className="mt-2 text-xs text-muted-foreground">
                  Drag to reposition, use the controls to zoom.
                </p>
              </div>
            )}
            <input
              type="file"
              accept="image/*"
              onChange={(e) => {
                const f = e.target.files?.[0] || null;
                setAvatarRaw(f);
                // Fallback: if cropping never emits (unusual file type) we
                // still upload exactly what was chosen.
                setAvatarFile(f);
              }}
              className={`${field} mt-2 file:mr-4 file:border-0 file:bg-muted file:px-3 file:py-1 file:font-mono-caps file:text-[11px]`}
            />
          </div>

          {kind !== "Artist" && (
            <div>
              <label className="font-mono-caps text-[11px] text-muted-foreground">
                Cover image
              </label>
              {coverFile && (
                <div className="mt-2 aspect-video w-full overflow-hidden border border-border bg-background">
                  <img src={URL.createObjectURL(coverFile)} alt="" className="h-full w-full object-cover" />
                </div>
              )}
              <input
                type="file"
                accept="image/*"
                onChange={(e) => setCoverFile(e.target.files?.[0] || null)}
                className={`${field} mt-2 file:mr-4 file:border-0 file:bg-muted file:px-3 file:py-1 file:font-mono-caps file:text-[11px]`}
              />
              <p className="mt-2 text-xs text-muted-foreground">
                Wide banner shown across the top of the gallery or venue page.
              </p>
            </div>
          )}
        </div>

        {kind === "Artist" && (
          <div className="md:col-span-2 border-t border-border pt-6">
            <label className="font-mono-caps text-[11px] text-muted-foreground">
              Artwork
            </label>
            <p className="mt-1 text-xs text-muted-foreground">
              Works shown on the artist&rsquo;s profile. Add at least one, or the
              profile appears empty.
            </p>

            {works.map((w, i) => (
              <div key={i} className="mt-4 border border-border p-4">
                <div className="flex items-center justify-between">
                  <span className="font-mono-caps text-[10px] text-muted-foreground">
                    Work {i + 1}
                  </span>
                  <button
                    type="button"
                    onClick={() => setWorks((prev) => prev.filter((_, x) => x !== i))}
                    className="text-muted-foreground transition-colors hover:text-destructive"
                    aria-label={`Remove work ${i + 1}`}
                  >
                    <X className="h-4 w-4" />
                  </button>
                </div>

                <div className="mt-3 grid grid-cols-1 gap-3 md:grid-cols-2">
                  <input
                    className={field}
                    placeholder="Title"
                    value={w.title}
                    onChange={(e) => updateWork(i, "title", e.target.value)}
                  />
                  <input
                    className={field}
                    placeholder="Year"
                    value={w.year}
                    onChange={(e) => updateWork(i, "year", e.target.value)}
                  />
                  <input
                    className={field}
                    placeholder="Medium, e.g. Oil on linen"
                    value={w.medium}
                    onChange={(e) => updateWork(i, "medium", e.target.value)}
                  />
                  <input
                    className={field}
                    placeholder="Dimensions, e.g. 180 x 140 cm"
                    value={w.dimensions}
                    maxLength={60}
                    // Same spam stripping as the artist profile editor.
                    onChange={(e) => updateWork(i, "dimensions", cleanDimensions(e.target.value))}
                  />
                </div>

                <textarea
                  rows={2}
                  className={`${field} mt-3`}
                  placeholder="Description (optional)"
                  value={w.description}
                  onChange={(e) => updateWork(i, "description", e.target.value)}
                />

                {w.file && (
                  <div className="mt-3 aspect-[4/3] w-full max-w-xs overflow-hidden border border-border">
                    <img
                      src={URL.createObjectURL(w.file)}
                      alt=""
                      className="h-full w-full object-cover"
                    />
                  </div>
                )}
                <input
                  type="file"
                  accept="image/*"
                  onChange={(e) => updateWork(i, "file", e.target.files?.[0] || null)}
                  className={`${field} mt-3 file:mr-4 file:border-0 file:bg-muted file:px-3 file:py-1 file:font-mono-caps file:text-[11px]`}
                />

                <label className="mt-3 flex items-center gap-2 text-sm">
                  <input
                    type="checkbox"
                    checked={w.available_for_sale}
                    onChange={(e) => updateWork(i, "available_for_sale", e.target.checked)}
                  />
                  Available for sale
                </label>

                {w.available_for_sale && (
                  <div className="mt-3 grid grid-cols-1 gap-3 md:grid-cols-2">
                    <input
                      className={field}
                      placeholder="Price, e.g. 48,000"
                      value={w.price}
                      onChange={(e) => updateWork(i, "price", e.target.value)}
                    />
                    <select
                      className={field}
                      value={w.currency}
                      onChange={(e) => updateWork(i, "currency", e.target.value)}
                    >
                      {CURRENCIES.map((c) => <option key={c} value={c}>{c}</option>)}
                    </select>
                  </div>
                )}
              </div>
            ))}

            <button
              type="button"
              onClick={() => setWorks((prev) => [...prev, emptyWork()])}
              className="mt-4 inline-flex items-center gap-2 border border-border px-4 py-2 font-mono-caps text-[11px] text-muted-foreground transition-colors hover:border-primary hover:text-primary"
            >
              <Plus className="h-3 w-3" /> Add work
            </button>
          </div>
        )}

        {/*
          The email this listing is FOR. When that person registers with the
          same address, the profile attaches to their new account and they
          arrive at something already filled in.

          ⚠️ This does not create an account and sends nothing — invite them
          from Supabase → Authentication → Users, or ask them to register.
        */}
        <div className="md:col-span-2">
          <label className="font-mono-caps text-[11px] text-muted-foreground">
            Their email — so they can claim this listing
          </label>
          <input
            type="email"
            className={`${field} mt-2`}
            value={form.claim_email}
            onChange={(e) => set("claim_email", e.target.value)}
            placeholder="artist@example.com"
          />
          <p className="mt-2 text-xs text-muted-foreground">
            Optional. No account is created and no email is sent — when they
            register with this address, this profile becomes theirs.
          </p>
        </div>

        <div className="md:col-span-2 grid grid-cols-1 gap-4 md:grid-cols-2">
          <div>
            <label className="font-mono-caps text-[11px] text-muted-foreground">Instagram</label>
            <input className={`${field} mt-2`} value={form.instagram} onChange={(e) => set("instagram", e.target.value)} placeholder="@handle" />
          </div>
          <div>
            <label className="font-mono-caps text-[11px] text-muted-foreground">X / Twitter</label>
            <input className={`${field} mt-2`} value={form.twitter} onChange={(e) => set("twitter", e.target.value)} placeholder="@handle" />
          </div>
          <div>
            <label className="font-mono-caps text-[11px] text-muted-foreground">LinkedIn</label>
            <input className={`${field} mt-2`} value={form.linkedin} onChange={(e) => set("linkedin", e.target.value)} placeholder="Profile URL" />
          </div>
          {kind === "Artist" && (
            <div>
              <label className="font-mono-caps text-[11px] text-muted-foreground">TikTok</label>
              <input className={`${field} mt-2`} value={form.tiktok} onChange={(e) => set("tiktok", e.target.value)} placeholder="@handle" />
            </div>
          )}
        </div>

        {kind === "Artist" && (
          <>
            <div className="md:col-span-2">
              <label className="font-mono-caps text-[11px] text-muted-foreground">
                Looking for
              </label>
              <div className="mt-3 flex flex-wrap gap-2">
                {SEEKING_OPTIONS.map((o) => {
                  const on = seeking.includes(o);
                  return (
                    <button
                      key={o}
                      type="button"
                      onClick={() =>
                        setSeeking((prev) => (on ? prev.filter((x) => x !== o) : [...prev, o]))
                      }
                      className={`border px-3 py-1.5 font-mono-caps text-[10px] transition-colors ${
                        on ? "border-primary text-primary" : "border-border text-muted-foreground hover:text-foreground"
                      }`}
                    >
                      {o}
                    </button>
                  );
                })}
              </div>
            </div>
            <div className="md:col-span-2">
              <label className="flex items-center gap-2 text-sm">
                <input
                  type="checkbox"
                  checked={openToCommissions}
                  onChange={(e) => setOpenToCommissions(e.target.checked)}
                />
                Open to commissions
              </label>
            </div>
          </>
        )}

        <div className="md:col-span-2">
          <label className="font-mono-caps text-[11px] text-muted-foreground">Short bio</label>
          <textarea rows={3} className={`${field} mt-2`} value={form.bio} onChange={(e) => set("bio", e.target.value)} />
        </div>
      </div>

      {error && <p className="mt-4 text-sm text-destructive">{error}</p>}
      {done && (
        <p className="mt-4 flex items-center gap-2 text-sm text-primary">
          <Check className="h-4 w-4" /> {done}
        </p>
      )}

      <button
        onClick={submit}
        disabled={saving}
        className="mt-6 inline-flex items-center gap-2 border border-primary px-6 py-3 font-mono-caps text-[11px] text-primary transition-colors hover:bg-primary hover:text-background disabled:opacity-50"
      >
        {saving ? <Loader2 className="h-3 w-3 animate-spin" /> : <Plus className="h-3 w-3" />}
        {saving ? "Saving" : `Create ${kind.toLowerCase()}`}
      </button>
    </div>
  );
}