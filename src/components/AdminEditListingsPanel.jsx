import React, { useCallback, useEffect, useRef, useState } from "react";
import FocalPointPicker from "@/components/FocalPointPicker";
import ImageCropBox from "@/components/ImageCropBox";
import { base44 } from "@/api/base44Client";
import { Loader2, Search, Trash2, Pencil, Check, X, Mail, UserCheck, Plus } from "lucide-react";
import { CHAPTER_OPTIONS } from "@/lib/chaptersData";
import { COLLECTOR_TYPES } from "@/lib/venueTypes";
import { useDataRevision } from "@/lib/dataRevision";

const DISCIPLINES = [
  "Painting", "Sculpture", "Photography", "Installation", "Video Art",
  "Performance", "Drawing", "Printmaking", "Ceramics", "Sound Art",
  "Digital Art", "Mixed Media", "Other",
];

/*
 * Must match the discipline filter on the Galleries page, which reads
 * profile.interests — and must match the list in AdminCreatePanel, which is
 * where these get set when a listing is created.
 *
 * A listing with none of these appears under "All" and under "Uncategorised",
 * but under no discipline. The September 2026 gallery import left all 302 rows
 * empty because the manifest carried no category data, and until this editor
 * offered the field there was no way to correct one without SQL.
 */
const INTERESTS = [
  "Painting", "Sculpture", "Photography", "Installation", "Video Art",
  "Performance", "Drawing", "Ceramics", "Digital Art", "Mixed Media",
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
/** Rows per request. The list is paged server-side — see migration 021. */
const PAGE_SIZE = 50;

/**
 * What each filter chip means as a query. A null value reaches applyWhere's
 * null branch in the provider, which becomes "is null" and not "eq null".
 */
const FILTERS = {
  All: {},
  Artists: { kind: "artist" },
  "Galleries & venues": { kind: "collector" },
  Unclaimed: { user_id: null },
};

/** The columns the search box looks in — the same three it always searched. */
const SEARCH_COLUMNS = ["display_name", "claim_email", "based_in"];

/**
 * Only what the list renders. The editor also needs cover images, focal
 * points, socials and bio, so it fetches the full row when it opens: no point
 * pulling all of that for fifty rows an admin is only scanning.
 */
const LIST_COLUMNS =
  "kind,id,display_name,type,discipline,based_in,claim_email,user_id,status,created_date";

export default function AdminEditListingsPanel() {
  const [rows, setRows] = useState([]);
  const [count, setCount] = useState(0);
  const [page, setPage] = useState(0);
  const [loading, setLoading] = useState(true);
  const [query, setQuery] = useState("");
  const [search, setSearch] = useState("");
  const [filter, setFilter] = useState("All");
  const [capped, setCapped] = useState(false);
  const [editing, setEditing] = useState(null);
  const [busyId, setBusyId] = useState(null);
  const [confirmId, setConfirmId] = useState(null);
  const [error, setError] = useState("");
  const [done, setDone] = useState("");

  /*
   * Whether admin_listings is actually in the database. A ref and not state
   * because load() reads it on the way through: as state it would have to be a
   * dependency, and setting it would run the whole query a second time.
   */
  const hasView = useRef(true);

  /* One query 300ms after the last keystroke, rather than one per keystroke. */
  useEffect(() => {
    const t = setTimeout(() => {
      setSearch(query.trim());
      setPage(0);
    }, 300);
    return () => clearTimeout(t);
  }, [query]);

  const rev = useDataRevision();

  /*
   * One paged query against admin_listings (migration 021), so the filters,
   * the search and the total all cover every listing instead of the first 500.
   *
   * The total is the important part. This panel used to read both tables
   * capped at 500 rows each and filter the merge in the browser, which meant
   * that past the cap the oldest listings were simply absent, the search could
   * not find them, and nothing on the page said so.
   *
   * FALLBACK: when the view is not in the database yet, do what the panel used
   * to do — but say on screen that the list is capped instead of quietly
   * showing a short one.
   */
  const load = useCallback(async () => {
    setLoading(true);
    const where = FILTERS[filter] || {};
    const from = page * PAGE_SIZE;

    if (hasView.current) {
      try {
        const res = await base44.entities.AdminListing.page({
          where,
          search: { q: search, columns: SEARCH_COLUMNS },
          sort: "-created_date",
          limit: PAGE_SIZE,
          offset: from,
          columns: LIST_COLUMNS,
        });
        setRows(res.rows.map((r) => ({ ...r, _kind: r.kind })));
        setCount(res.count);
        setCapped(false);
        setLoading(false);
        return;
      } catch (e) {
        // Anything wrong with the view — absent, or not granted — falls back
        // rather than leaving an admin looking at an empty page.
        hasView.current = false;
        if (typeof console !== "undefined") {
          console.warn(
            "[afc] admin_listings is unavailable, falling back to a capped " +
              "client-side list. Run migration 021. " + (e?.message || "")
          );
        }
      }
    }

    const [a, c] = await Promise.allSettled([
      base44.entities.ArtistProfile.list("-created_date", 500),
      base44.entities.CollectorProfile.list("-created_date", 500),
    ]);
    const merged = [
      ...(a.status === "fulfilled" ? a.value : []).map((r) => ({
        ...r, kind: "artist", _kind: "artist",
      })),
      ...(c.status === "fulfilled" ? c.value : []).map((r) => ({
        ...r, kind: "collector", _kind: "collector",
      })),
    ]
      .filter((r) => {
        if (filter === "Artists") return r._kind === "artist";
        if (filter === "Galleries & venues") return r._kind === "collector";
        if (filter === "Unclaimed") return !r.user_id;
        return true;
      })
      .filter((r) =>
        SEARCH_COLUMNS.map((k) => r[k] || "")
          .join(" ")
          .toLowerCase()
          .includes(search.toLowerCase())
      );

    setRows(merged.slice(from, from + PAGE_SIZE));
    setCount(merged.length);
    setCapped(true);
    setLoading(false);
  }, [filter, search, page, rev]);

  useEffect(() => {
    load();
  }, [load]);

  /* Deleting the last row of the last page must not leave it stranded. */
  useEffect(() => {
    const lastPage = Math.max(0, Math.ceil(count / PAGE_SIZE) - 1);
    if (page > lastPage) setPage(lastPage);
  }, [count, page]);

  const flash = (msg) => {
    setDone(msg);
    setTimeout(() => setDone(""), 2500);
  };

  /**
   * The list rows carry only LIST_COLUMNS, so the editor opens on the full row
   * from the underlying table rather than on the summary the list showed.
   */
  const openEditor = async (r) => {
    if (editing?.id === r.id) {
      setEditing(null);
      return;
    }
    setError("");
    setBusyId(r.id);
    try {
      const entity = r._kind === "artist" ? "ArtistProfile" : "CollectorProfile";
      const full = await base44.entities[entity].get(r.id);
      setEditing({ ...full, _kind: r._kind });
    } catch (e) {
      setError(String(e?.message || e));
    } finally {
      setBusyId(null);
    }
  };

  const save = async (row, patch) => {
    setError("");
    setBusyId(row.id);
    try {
      const entity = row._kind === "artist" ? "ArtistProfile" : "CollectorProfile";
      await base44.entities[entity].update(row.id, patch);
      setEditing(null);
      flash(`${patch.display_name || row.display_name} saved.`);
      // Re-read rather than patching the row in place: a rename can move it
      // out of the current search or page, and the list should show where it
      // actually is now.
      await load();
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
      flash(`${row.display_name} deleted.`);
      // The total has changed, so re-read: the count in the header has to stay
      // true, and the page may now be short or empty.
      await load();
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
            onClick={() => {
              setFilter(f);
              setPage(0);
            }}
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

      {capped && (
        <p className="mt-3 font-mono-caps text-[10px] text-amber-600">
          Showing the most recent 500 of each kind only — admin_listings is not
          in the database yet. Run migration 021 for the full list.
        </p>
      )}

      {!loading && count > 0 && (
        <div className="mt-4 flex flex-wrap items-center justify-between gap-3 border-t border-border pt-3">
          <p className="font-mono-caps text-[10px] text-muted-foreground">
            Showing {page * PAGE_SIZE + 1}&ndash;{Math.min((page + 1) * PAGE_SIZE, count)} of {count}
          </p>
          {count > PAGE_SIZE && (
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => setPage((n) => Math.max(0, n - 1))}
                disabled={page === 0}
                className="border border-border px-3 py-1.5 font-mono-caps text-[10px] text-muted-foreground transition-colors hover:border-primary hover:text-primary disabled:opacity-40"
              >
                Previous
              </button>
              <span className="font-mono-caps text-[10px] text-muted-foreground">
                {page + 1} / {Math.ceil(count / PAGE_SIZE)}
              </span>
              <button
                type="button"
                onClick={() => setPage((n) => n + 1)}
                disabled={(page + 1) * PAGE_SIZE >= count}
                className="border border-border px-3 py-1.5 font-mono-caps text-[10px] text-muted-foreground transition-colors hover:border-primary hover:text-primary disabled:opacity-40"
              >
                Next
              </button>
            </div>
          )}
        </div>
      )}

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
                    onClick={() => openEditor(r)}
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

              {/*
                * row={editing}, NOT row={r}. `r` is the list row from
                * admin_listings and carries only the ten columns the list
                * renders. `editing` is the full row openEditor() fetched from
                * the table, with the bio, works, chapter and socials the form
                * needs. Rendering from `r` opened every editor on a blank
                * template that ignored what the listing already had.
                */}
              {editing?.id === r.id && (
                <EditForm row={editing} onCancel={() => setEditing(null)} onSave={save} busy={busyId === r.id} />
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
      : {
          type: row.type || "Gallery",
          address: row.address || "",
          partnership_type: row.partnership_type || "",
          // Collector-branch only: interests is a collector_profile column, and
          // `common` below spreads the whole form into the patch, so putting it
          // here keeps it out of an artist update entirely.
          interests: row.interests || [],
        }),
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

        {row._kind === "collector" && (
          <div className="md:col-span-2">
            <label className="font-mono-caps text-[10px] text-muted-foreground">
              Disciplines — what the Galleries page filters by
            </label>
            <div className="mt-2 flex flex-wrap gap-2">
              {INTERESTS.map((d) => {
                const on = (form.interests || []).includes(d);
                return (
                  <button
                    key={d}
                    type="button"
                    onClick={() =>
                      set(
                        "interests",
                        on
                          ? form.interests.filter((x) => x !== d)
                          : [...(form.interests || []), d]
                      )
                    }
                    className={`border px-3 py-1.5 font-mono-caps text-[10px] transition-colors ${
                      on
                        ? "border-foreground bg-foreground text-background"
                        : "border-border text-muted-foreground hover:border-foreground"
                    }`}
                  >
                    {d}
                  </button>
                );
              })}
            </div>
            {!(form.interests || []).length && (
              <p className="mt-2 text-xs text-muted-foreground">
                None chosen — this listing appears under &ldquo;All&rdquo; and
                under &ldquo;Uncategorised&rdquo;, but not under any discipline.
              </p>
            )}
          </div>
        )}
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
