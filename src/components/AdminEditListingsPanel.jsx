import React, { useState, useEffect } from "react";
import { base44 } from "@/api/base44Client";
import { Loader2, Search, Trash2, Pencil, Check, X, Mail, UserCheck } from "lucide-react";
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
  const [form, setForm] = useState({
    display_name: row.display_name || "",
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

  const submit = (e) => {
    e.preventDefault();
    onSave(row, {
      ...form,
      display_name: form.display_name.trim(),
      // Normalised so it matches what claiming looks for. An empty field must
      // be null rather than "", or every blank listing would match each other.
      claim_email: form.claim_email.trim().toLowerCase() || null,
    });
  };

  return (
    <form onSubmit={submit} className="mt-4 border border-border bg-background/40 p-4">
      <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
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

      <div className="mt-4 flex flex-wrap items-center gap-3">
        <button
          type="submit"
          disabled={busy}
          className="inline-flex items-center gap-2 border border-primary px-5 py-2 font-mono-caps text-[10px] text-primary transition-colors hover:bg-primary hover:text-background disabled:opacity-50"
        >
          {busy ? <Loader2 className="h-3 w-3 animate-spin" /> : <Check className="h-3 w-3" />}
          Save changes
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
