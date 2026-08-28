import React, { useState, useEffect } from "react";
import FocalPointPicker from "@/components/FocalPointPicker";
import ImageCropBox from "@/components/ImageCropBox";
import { base44 } from "@/api/base44Client";
import { Loader2, Search, Trash2, Pencil, Check, X, Mail, UserCheck, Plus } from "lucide-react";
import { CHAPTER_OPTIONS } from "@/lib/chaptersData";
import { COLLECTOR_TYPES } from "@/lib/venueTypes";

const DISCIPLINES = [
  "Painting", "Sculpture", "Photography", "Installation", "Video Art",
  "Performance", "Drawing", "Printmaking", "Ceramics", "Sound Art",
  "Digital Art", "Mixed Media", "Other",
];

const PARTNERSHIP_TYPES = ["", "Paid Member", "Partner"];

/**
 * Edit and remove listings after they have been created.
 *
 * The Add Listing panel could only ever create. A typo in a name, the wrong
 * chapter, or — now that profiles can be claimed by email — a mistyped
 * address meant the wrong person could claim the listing, or nobody could.
 * There was no way to correct any of it.
 *
 * Row-level security already allowed an admin to update and delete these
 * rows; only the interface was missing. No migration is required.
 */
export default function AdminEditListingsPanel() {
  const [artists, setArtists] = useState([]);
  const [collectors, setCollectors] = useState([]);
  const [loading, setLoading] = useState(true);
  const [query, setQuery] = useState("");
  const [filter, setFilter] = useState("All");
  const [editing, setEditing] = useState(null);
  const [busyId, setBusyId] = useState(null);
  const [confirmId, setConfirmId] = useState(null);
  const [error, setError] = useState("");
  const [done, setDone] = useState("");

  const load = () => {
    setLoading(true);
    Promise.allSettled([
      base44.entities.ArtistProfile.list("-created_date", 500),
      base44.entities.CollectorProfile.list("-created_date", 500),
    ])
      .then(([a, c]) => {
        setArtists(a.status === "fulfilled" ? a.value : []);
        setCollectors(c.status === "fulfilled" ? c.value : []);
      })
      .finally(() => setLoading(false));
  };

  useEffect(load, []);

  const flash = (msg) => {
    setDone(msg);
    setTimeout(() => setDone(""), 2500);
  };

  const rows = [
    ...artists.map((a) => ({ ...a, _kind: "artist" })),
    ...collectors.map((c) => ({ ...c, _kind: "collector" })),
  ]
    .filter((r) => {
      if (filter === "Artists") return r._kind === "artist";
      if (filter === "Galleries & venues") return r._kind === "collector";
      if (filter === "Unclaimed") return !r.user_id;
      return true;
    })
    .filter((r) =>
      `${r.display_name || ""} ${r.claim_email || ""} ${r.based_in || ""}`
        .toLowerCase()
        .includes(query.trim().toLowerCase())
    );

  const save = async (row, patch) => {
    setError("");
    setBusyId(row.id);
    try {
      const entity = row._kind === "artist" ? "ArtistProfile" : "CollectorProfile";
      const updated = await base44.entities[entity].update(row.id, patch);
      const apply = (list) =>
        list.map((x) => (x.id === row.id ? { ...x, ...updated } : x));
      if (row._kind === "artist") setArtists(apply);
      else setCollectors(apply);
      setEditing(null);
      flash(`${patch.display_name || row.display_name} saved.`);
    } catch (e) {
      setError(String(e?.message || e));
    } finally {
      setBusyId(null);
    }
  };

  const remove = async (row) => {
    setError("");
    setBusyId(row.id);
    try {
      const entity = row._kind === "artist" ? "ArtistProfile" : "CollectorProfile";
      await base44.entities[entity].delete(row.id);
      if (row._kind === "artist") setArtists((p) => p.filter((x) => x.id !== row.id));
      else setCollectors((p) => p.filter((x) => x.id !== row.id));
      flash(`${row.display_name} deleted.`);
    } catch (e) {
      setError(String(e?.message || e));
    } finally {
      setBusyId(null);
      setConfirmId(null);
    }
  };

  return (
    <div className="border border-border bg-card p-6">
      <h3 className="font-heading text-2xl tracking-[-0.01em]">Edit listings</h3>
      <p className="mt-2 text-sm text-muted-foreground">
        Correct or remove any artist, gallery or venue. Claimed profiles belong
        to a member — editing one changes what they see.
      </p>

      <div className="relative mt-6">
        <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
        <input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Search by name, email or city"
          className="w-full border border-border bg-background py-3 pl-10 pr-4 text-base outline-none focus:border-primary"
        />
      </div>

      <div className="mt-3 flex flex-wrap gap-2">
        {["All", "Artists", "Galleries & venues", "Unclaimed"].map((f) => (
          <button
            key={f}
            type="button"
            onClick={() => setFilter(f)}
            className={`border px-3 py-1.5 font-mono-caps text-[10px] transition-colors ${
              filter === f
                ? "border-primary text-primary"
                : "border-border text-muted-foreground hover:text-foreground"
            }`}
          >
            {f}
          </button>
        ))}
      </div>

      {error && <p className="mt-4 text-sm text-destructive">{error}</p>}
      {done && (
        <p className="mt-4 flex items-center gap-2 text-sm text-primary">
          <Check className="h-4 w-4" /> {done}
        </p>
      )}

      {loading ? (
        <div className="flex justify-center py-10">
          <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
        </div>
      ) : rows.length === 0 ? (
        <p className="py-10 text-center text-sm text-muted-foreground">
          Nothing matches that search.
        </p>
      ) : (
        <ul className="mt-6 divide-y divide-border border-t border-border">
          {rows.map((r) => (
            <li key={`${r._kind}-${r.id}`} className="py-4">
              <div className="flex flex-wrap items-center gap-3">
                <div className="min-w-0 flex-1">
                  <p className="truncate font-body text-sm">
                    {r.display_name || "Untitled"}
                  </p>
                  <p className="truncate font-mono-caps text-[10px] text-muted-foreground">
                    {r._kind === "artist" ? r.discipline || "Artist" : r.type || "Venue"}
                    {r.based_in ? ` · ${r.based_in}` : ""}
                    {r.user_id ? "" : " · UNCLAIMED"}
                  </p>
                  {r.claim_email && (
                    <p className="mt-1 flex items-center gap-1 truncate font-mono-caps text-[10px] text-muted-foreground">
                      {r.user_id ? (
                        <UserCheck className="h-3 w-3 text-primary" />
                      ) : (
                        <Mail className="h-3 w-3" />
                      )}
                      {r.claim_email}
                    </p>
                  )}
                </div>

                <div className="flex flex-wrap items-center gap-2">
                  {busyId === r.id && (
                    <Loader2 className="h-3 w-3 animate-spin text-muted-foreground" />
                  )}
                  <button
                    type="button"
                    onClick={() => setEditing(editing?.id === r.id ? null : r)}
                    disabled={busyId === r.id}
                    className="flex items-center gap-1.5 border border-border px-3 py-1.5 font-mono-caps text-[10px] text-muted-foreground transition-colors hover:border-primary hover:text-primary disabled:opacity-50"
                  >
                    {editing?.id === r.id ? <X className="h-3 w-3" /> : <Pencil className="h-3 w-3" />}
                    {editing?.id === r.id ? "Close" : "Edit"}
                  </button>

                  {confirmId === r.id ? (
                    <>
                      <button
                        type="button"
                        onClick={() => remove(r)}
                        disabled={busyId === r.id}
                        className="border border-destructive px-3 py-1.5 font-mono-caps text-[10px] text-destructive transition-colors hover:bg-destructive hover:text-background disabled:opacity-50"
                      >
                        Delete permanently
                      </button>
                      <button
                        type="button"
                        onClick={() => setConfirmId(null)}
                        className="px-2 font-mono-caps text-[10px] text-muted-foreground hover:text-foreground"
                      >
                        Cancel
                      </button>
                    </>
                  ) : (
                    <button
                      type="button"
                      onClick={() => setConfirmId(r.id)}
                      disabled={busyId === r.id}
                      className="flex items-center gap-1.5 border border-border px-3 py-1.5 font-mono-caps text-[10px] text-muted-foreground transition-colors hover:border-destructive hover:text-destructive disabled:opacity-50"
                    >
                      <Trash2 className="h-3 w-3" /> Delete
                    </button>
                  )}
                </div>
              </div>

              {editing?.id === r.id && (
                <EditForm row={r} onCancel={() => setEditing(null)} onSave={save} busy={busyId === r.id} />
              )}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

/** Inline editor for one listing. */
function EditForm({ row, onCancel, onSave, busy }) {
  // Existing images are shown, and can be replaced. Editing was text-only, so
  // a wrong logo or cover could not be corrected without deleting the whole
  // listing and creating it again.
  const [avatarRaw, setAvatarRaw] = useState(null);
  const [avatarFile, setAvatarFile] = useState(null);
  const [coverRaw, setCoverRaw] = useState(null);
  const [coverFile, setCoverFile] = useState(null);
  const [uploading, setUploading] = useState(false);
  const [uploadError, setUploadError] = useState("");

  /*
   * An artist's portfolio was not editable here at all — only their name and
   * photo. A wrong title, a missing price or the wrong picture meant deleting
   * the whole listing and building it again.
   *
   * Existing works keep their image_url; `file` is set only when a new
   * picture is chosen, so nothing is re-uploaded needlessly.
   */
  const [works, setWorks] = useState(() =>
    (row.portfolio_works || []).map((w) => ({
      title: w.title || "",
      year: w.year || "",
      medium: w.medium || "",
      dimensions: w.dimensions || "",
      description: w.description || "",
      available_for_sale: !!w.available_for_sale,
      price: w.price || "",
      currency: w.currency || "USD",
      image_url: w.image_url || "",
      additional_images: w.additional_images || [],
      file: null,
    }))
  );

  const updateWork = (i, k, v) =>
    setWorks((prev) => prev.map((w, x) => (x === i ? { ...w, [k]: v } : w)));

  const coverPreview = React.useMemo(
    () => (coverRaw ? URL.createObjectURL(coverRaw) : ""),
    [coverRaw]
  );

  const [form, setForm] = useState({
    display_name: row.display_name || "",
    avatar_url: row.avatar_url || "",
    cover_image_url: row.cover_image_url || "",
    cover_focal_x: row.cover_focal_x ?? 50,
    cover_focal_y: row.cover_focal_y ?? 50,
    claim_email: row.claim_email || "",
    based_in: row.based_in || CHAPTER_OPTIONS[0],
    website: row.website || "",
    bio: row.bio || "",
    instagram: row.instagram || "",
    ...(row._kind === "artist"
      ? { discipline: row.discipline || DISCIPLINES[0], chapter: row.chapter || CHAPTER_OPTIONS[0] }
      : { type: row.type || "Gallery", address: row.address || "", partnership_type: row.partnership_type || "" }),
  });

  const set = (k, v) => setForm((f) => ({ ...f, [k]: v }));
  const field =
    "w-full border border-border bg-background px-3 py-2 text-sm outline-none focus:border-primary";

  const submit = async (e) => {
    e.preventDefault();
    setUploading(true);
    try {
      // Only upload what actually changed. Re-uploading an unchanged image on
      // every save would fill storage with duplicates.
      let avatar_url = form.avatar_url;
      if (avatarFile) {
        const r = await base44.integrations.Core.UploadFile({ file: avatarFile });
        avatar_url = r.file_url;
      }
      let cover_image_url = form.cover_image_url;
      if (coverFile) {
        const r = await base44.integrations.Core.UploadFile({ file: coverFile });
        cover_image_url = r.file_url;
      }

      /*
       * artist_profile has no cover columns — only collector_profile does.
       * Sending them for an artist made Postgres reject the whole update,
       * which (with no catch) left the button spinning.
       */
      const { cover_image_url: _c, cover_focal_x: _x, cover_focal_y: _y, ...common } = form;
      // Upload any newly chosen artwork images, keeping the rest as they are.
      let portfolio_works;
      if (row._kind === "artist") {
        portfolio_works = [];
        for (const w of works) {
          if (!w.title.trim() && !w.file && !w.image_url) continue;
          let image_url = w.image_url;
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
            additional_images: w.additional_images || [],
            available_for_sale: w.available_for_sale,
            price: w.available_for_sale ? String(w.price).trim() : "",
            currency: w.currency,
          });
        }
      }

      const coverFields =
        row._kind === "collector"
          ? { cover_image_url, cover_focal_x: form.cover_focal_x, cover_focal_y: form.cover_focal_y }
          : {};

      onSave(row, {
        ...common,
        ...coverFields,
        ...(portfolio_works ? { portfolio_works } : {}),
        avatar_url,
        display_name: form.display_name.trim(),
        // Normalised so it matches what claiming looks for. An empty field
        // must be null rather than "", or every blank listing would match
        // each other.
        claim_email: form.claim_email.trim().toLowerCase() || null,
      });
    } catch (err) {
      /*
       * There was no catch here at all.
       *
       * If an upload threw — an unsupported image, a file too large, a
       * dropped connection — the error escaped, the parent's busy flag was
       * never cleared, and the button span forever with nothing said. That is
       * the "gets stuck when saving" report: not a slow save, a failed one
       * with no way to know.
       */
      setUploadError(
        String(err?.message || err) || "Could not save. Please try again."
      );
    } finally {
      setUploading(false);
    }
  };

  return (
    <form onSubmit={submit} className="mt-4 border border-border bg-background/40 p-4">
      {/* Images first, matching the order on the Add Listing form so the two
          read the same way. */}
      <div className="grid grid-cols-1 gap-6 md:grid-cols-[200px_1fr]">
        <div>
          <label className="font-mono-caps text-[10px] text-muted-foreground">
            {row._kind === "artist" ? "Profile photo" : "Logo"}
          </label>
          {form.avatar_url && !avatarRaw && (
            <img
              src={form.avatar_url}
              alt=""
              className="mt-2 aspect-square w-full object-cover"
            />
          )}
          <input
            type="file"
            accept="image/*"
            className={`${field} mt-2 file:mr-3 file:border-0 file:bg-muted file:px-2 file:py-1 file:font-mono-caps file:text-[10px]`}
            onChange={(e) => setAvatarRaw(e.target.files?.[0] || null)}
          />
          {avatarRaw && (
            <ImageCropBox
              file={avatarRaw}
              alt={form.display_name}
              onChange={setAvatarFile}
            />
          )}
        </div>

        {/* Artists have no cover image — only galleries and venues do. Showing
            the control anyway offered something that could never be saved. */}
        <div className={row._kind === "collector" ? "" : "hidden"}>
          <label className="font-mono-caps text-[10px] text-muted-foreground">Cover photo</label>
          {form.cover_image_url && !coverRaw && (
            <img
              src={form.cover_image_url}
              alt=""
              className="mt-2 aspect-[21/9] w-full object-cover"
              style={{ objectPosition: `${form.cover_focal_x}% ${form.cover_focal_y}%` }}
            />
          )}
          <input
            type="file"
            accept="image/*"
            className={`${field} mt-2 file:mr-3 file:border-0 file:bg-muted file:px-2 file:py-1 file:font-mono-caps file:text-[10px]`}
            onChange={(e) => setCoverRaw(e.target.files?.[0] || null)}
          />
          {(coverPreview || form.cover_image_url) && (
            <FocalPointPicker
              src={coverPreview || form.cover_image_url}
              aspect={21 / 9}
              x={form.cover_focal_x}
              y={form.cover_focal_y}
              onChange={(x, y) => setForm((f) => ({ ...f, cover_focal_x: x, cover_focal_y: y }))}
            />
          )}
        </div>
      </div>

      <div className="mt-6 grid grid-cols-1 gap-3 md:grid-cols-2">
        <div>
          <label className="font-mono-caps text-[10px] text-muted-foreground">Name</label>
          <input className={`${field} mt-1`} value={form.display_name} onChange={(e) => set("display_name", e.target.value)} required />
        </div>

        <div>
          <label className="font-mono-caps text-[10px] text-muted-foreground">
            Their email {row.user_id ? "(already claimed)" : "— for claiming"}
          </label>
          <input
            type="email"
            className={`${field} mt-1`}
            value={form.claim_email}
            onChange={(e) => set("claim_email", e.target.value)}
            placeholder="artist@example.com"
            disabled={!!row.user_id}
          />
          {row.user_id && (
            <p className="mt-1 text-xs text-muted-foreground">
              This profile already belongs to a member, so the claim email no
              longer does anything.
            </p>
          )}
        </div>

        {row._kind === "artist" ? (
          <>
            <div>
              <label className="font-mono-caps text-[10px] text-muted-foreground">Discipline</label>
              <select className={`${field} mt-1`} value={form.discipline} onChange={(e) => set("discipline", e.target.value)}>
                {DISCIPLINES.map((d) => <option key={d} value={d}>{d}</option>)}
              </select>
            </div>
            <div>
              <label className="font-mono-caps text-[10px] text-muted-foreground">Chapter</label>
              <select className={`${field} mt-1`} value={form.chapter} onChange={(e) => set("chapter", e.target.value)}>
                {CHAPTER_OPTIONS.map((c) => <option key={c} value={c}>{c}</option>)}
              </select>
            </div>
          </>
        ) : (
          <>
            <div>
              <label className="font-mono-caps text-[10px] text-muted-foreground">Type</label>
              <select className={`${field} mt-1`} value={form.type} onChange={(e) => set("type", e.target.value)}>
                {COLLECTOR_TYPES.map((t) => <option key={t} value={t}>{t}</option>)}
              </select>
            </div>
            <div>
              <label className="font-mono-caps text-[10px] text-muted-foreground">Address</label>
              <input className={`${field} mt-1`} value={form.address} onChange={(e) => set("address", e.target.value)} />
            </div>
            <div>
              <label className="font-mono-caps text-[10px] text-muted-foreground">Partnership</label>
              <select className={`${field} mt-1`} value={form.partnership_type} onChange={(e) => set("partnership_type", e.target.value)}>
                {PARTNERSHIP_TYPES.map((t) => <option key={t || "none"} value={t}>{t || "None"}</option>)}
              </select>
            </div>
          </>
        )}

        <div>
          <label className="font-mono-caps text-[10px] text-muted-foreground">Based in</label>
          <select className={`${field} mt-1`} value={form.based_in} onChange={(e) => set("based_in", e.target.value)}>
            {CHAPTER_OPTIONS.map((c) => <option key={c} value={c}>{c}</option>)}
          </select>
        </div>

        <div>
          <label className="font-mono-caps text-[10px] text-muted-foreground">Website</label>
          <input className={`${field} mt-1`} value={form.website} onChange={(e) => set("website", e.target.value)} placeholder="https://" />
        </div>

        <div>
          <label className="font-mono-caps text-[10px] text-muted-foreground">Instagram</label>
          <input className={`${field} mt-1`} value={form.instagram} onChange={(e) => set("instagram", e.target.value)} placeholder="@handle" />
        </div>

        <div className="md:col-span-2">
          <label className="font-mono-caps text-[10px] text-muted-foreground">Short bio</label>
          <textarea rows={3} className={`${field} mt-1`} value={form.bio} onChange={(e) => set("bio", e.target.value)} />
        </div>
      </div>

      {/* Artwork — artists only. Galleries manage their works from their own
          profile page, where the gallery-specific fields live. */}
      {row._kind === "artist" && (
        <div className="mt-6 border-t border-border pt-6">
          <label className="font-mono-caps text-[10px] text-muted-foreground">
            Artwork
          </label>
          <p className="mt-1 text-xs text-muted-foreground">
            Existing pieces keep their image unless you choose a new one.
          </p>

          {works.map((w, i) => (
            <div key={i} className="mt-4 border border-border p-3">
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

              <div className="mt-3 flex flex-wrap items-start gap-3">
                {(w.file || w.image_url) && (
                  <img
                    src={w.file ? URL.createObjectURL(w.file) : w.image_url}
                    alt=""
                    className="h-24 w-24 shrink-0 object-cover"
                  />
                )}
                <input
                  type="file"
                  accept="image/*"
                  className={`${field} flex-1 file:mr-3 file:border-0 file:bg-muted file:px-2 file:py-1 file:font-mono-caps file:text-[10px]`}
                  onChange={(e) => updateWork(i, "file", e.target.files?.[0] || null)}
                />
              </div>

              <div className="mt-3 grid grid-cols-1 gap-3 md:grid-cols-2">
                <input className={field} placeholder="Title" value={w.title}
                  onChange={(e) => updateWork(i, "title", e.target.value)} />
                <input className={field} placeholder="Year" value={w.year}
                  onChange={(e) => updateWork(i, "year", e.target.value)} />
                <input className={field} placeholder="Medium" value={w.medium}
                  onChange={(e) => updateWork(i, "medium", e.target.value)} />
                <input className={field} placeholder="Dimensions, e.g. 180 x 140 cm"
                  maxLength={60} value={w.dimensions}
                  onChange={(e) => updateWork(i, "dimensions", e.target.value)} />
              </div>

              <textarea rows={2} className={`${field} mt-3`} placeholder="Description"
                value={w.description}
                onChange={(e) => updateWork(i, "description", e.target.value)} />

              <label className="mt-3 flex items-center gap-2 text-sm">
                <input type="checkbox" checked={w.available_for_sale}
                  onChange={(e) => updateWork(i, "available_for_sale", e.target.checked)} />
                Available for sale
              </label>

              {w.available_for_sale && (
                <div className="mt-3 grid grid-cols-1 gap-3 md:grid-cols-2">
                  <input className={field} placeholder="Price" value={w.price}
                    onChange={(e) => updateWork(i, "price", e.target.value)} />
                  <select className={field} value={w.currency}
                    onChange={(e) => updateWork(i, "currency", e.target.value)}>
                    {["USD","HKD","GBP","EUR","SGD","AUD","CAD"].map((c) => (
                      <option key={c} value={c}>{c}</option>
                    ))}
                  </select>
                </div>
              )}
            </div>
          ))}

          <button
            type="button"
            onClick={() =>
              setWorks((prev) => [
                // Newest first, matching the artist's own editor.
                {
                  title: "", year: "", medium: "", dimensions: "", description: "",
                  available_for_sale: false, price: "", currency: "USD",
                  image_url: "", additional_images: [], file: null,
                },
                ...prev,
              ])
            }
            className="mt-4 inline-flex items-center gap-2 border border-border px-4 py-2 font-mono-caps text-[10px] text-muted-foreground transition-colors hover:border-primary hover:text-primary"
          >
            <Plus className="h-3 w-3" /> Add work
          </button>
        </div>
      )}

      {uploadError && (
        <div className="mt-4 border border-destructive bg-destructive/10 p-3">
          <p className="font-mono-caps text-[10px] text-destructive">Could not save</p>
          <p className="mt-1 text-sm text-destructive">{uploadError}</p>
        </div>
      )}

      <div className="mt-4 flex flex-wrap items-center gap-3">
        <button
          type="submit"
          disabled={busy || uploading}
          className="inline-flex items-center gap-2 border border-primary px-5 py-2 font-mono-caps text-[10px] text-primary transition-colors hover:bg-primary hover:text-background disabled:opacity-50"
        >
          {busy || uploading ? <Loader2 className="h-3 w-3 animate-spin" /> : <Check className="h-3 w-3" />}
          {uploading ? "Uploading…" : "Save changes"}
        </button>
        <button
          type="button"
          onClick={onCancel}
          className="font-mono-caps text-[10px] text-muted-foreground hover:text-foreground"
        >
          Cancel
        </button>
      </div>
    </form>
  );
}
