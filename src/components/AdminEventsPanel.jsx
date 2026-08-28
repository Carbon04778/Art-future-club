import React, { useState, useEffect } from "react";
import { toLocalInput, fromLocalInput } from "@/lib/datetime";
import FocalPointPicker from "@/components/FocalPointPicker";
import { base44 } from "@/api/base44Client";
import { Loader2, Search, Trash2, Pencil, Check, X, AlertTriangle } from "lucide-react";
import { CHAPTER_OPTIONS } from "@/lib/chaptersData";

// Must match the filter list on the events page. Offering a narrower set here
// would mean an admin editing an event silently changed its type to something
// the events page cannot filter by.
const EVENT_TYPES = [
  "Exhibition", "Opening", "Talk", "Workshop",
  "Screening", "Performance", "Fair", "Auction", "Social", "Other",
];

/**
 * Edit every event, from anywhere.
 *
 * Exhibitions posted from a gallery profile were saved with the chapter
 * hardcoded to "Other", so none of them appeared on the chapter pages. Once
 * that was fixed, the existing ones still said "Other" and there was no way
 * to correct them — a gallery owner can only edit their own, and many were
 * created by an admin against unclaimed profiles.
 *
 * Row-level security already lets an admin update and delete any event. Only
 * the interface was missing, so no migration is required.
 */
export default function AdminEventsPanel() {
  const [events, setEvents] = useState([]);
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
    base44.entities.Event.list("-start_date", 500)
      .then(setEvents)
      .catch((e) => setError(String(e?.message || e)))
      .finally(() => setLoading(false));
  };

  useEffect(load, []);

  const flash = (msg) => {
    setDone(msg);
    setTimeout(() => setDone(""), 2500);
  };

  const save = async (ev, patch) => {
    setError("");
    setBusyId(ev.id);
    try {
      const updated = await base44.entities.Event.update(ev.id, patch);
      setEvents((prev) => prev.map((x) => (x.id === ev.id ? { ...x, ...updated } : x)));
      setEditing(null);
      flash(`${patch.title || ev.title} saved.`);
    } catch (e) {
      setError(String(e?.message || e));
    } finally {
      setBusyId(null);
    }
  };

  const remove = async (ev) => {
    setError("");
    setBusyId(ev.id);
    try {
      await base44.entities.Event.delete(ev.id);
      setEvents((prev) => prev.filter((x) => x.id !== ev.id));
      flash(`${ev.title} deleted.`);
    } catch (e) {
      setError(String(e?.message || e));
    } finally {
      setBusyId(null);
      setConfirmId(null);
    }
  };

  // Anything still on "Other" is invisible on the chapter pages, so surface
  // how many need attention rather than leaving them to be found by chance.
  const needsChapter = events.filter((e) => !e.chapter || e.chapter === "Other").length;

  const rows = events
    .filter((e) => {
      if (filter === "Needs a chapter") return !e.chapter || e.chapter === "Other";
      if (filter === "Upcoming") return new Date(e.start_date) >= new Date();
      if (filter === "Past") return new Date(e.start_date) < new Date();
      return true;
    })
    .filter((e) =>
      `${e.title || ""} ${e.venue || ""} ${e.organizer_name || ""}`
        .toLowerCase()
        .includes(query.trim().toLowerCase())
    );

  return (
    <div className="border border-border bg-card p-6">
      <h3 className="font-heading text-2xl tracking-[-0.01em]">Events</h3>
      <p className="mt-2 text-sm text-muted-foreground">
        Edit or remove any event or exhibition, including ones posted from a
        gallery profile.
      </p>

      {needsChapter > 0 && (
        <div className="mt-4 flex items-start gap-2 border border-yellow-600/50 bg-yellow-500/10 p-4">
          <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-yellow-600" />
          <p className="text-sm text-yellow-600">
            {needsChapter} event{needsChapter === 1 ? "" : "s"} still have no
            chapter, so they do not appear on any chapter page. Filter by
            &ldquo;Needs a chapter&rdquo; to fix them.
          </p>
        </div>
      )}

      <div className="relative mt-6">
        <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
        <input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Search by title, venue or organiser"
          className="w-full border border-border bg-background py-3 pl-10 pr-4 text-base outline-none focus:border-primary"
        />
      </div>

      <div className="mt-3 flex flex-wrap gap-2">
        {["All", "Needs a chapter", "Upcoming", "Past"].map((f) => (
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
          {events.length === 0 ? "No events yet." : "Nothing matches that search."}
        </p>
      ) : (
        <ul className="mt-6 divide-y divide-border border-t border-border">
          {rows.map((ev) => (
            <li key={ev.id} className="py-4">
              <div className="flex flex-wrap items-center gap-3">
                <div className="min-w-0 flex-1">
                  <p className="truncate font-body text-sm">{ev.title || "Untitled"}</p>
                  <p className="truncate font-mono-caps text-[10px] text-muted-foreground">
                    {ev.start_date
                      ? new Date(ev.start_date).toLocaleDateString("en-GB", {
                          day: "numeric", month: "short", year: "numeric",
                        })
                      : "No date"}
                    {ev.venue ? ` · ${ev.venue}` : ""}
                    {" · "}
                    <span className={!ev.chapter || ev.chapter === "Other" ? "text-yellow-600" : ""}>
                      {ev.chapter || "No chapter"}
                    </span>
                  </p>
                </div>

                <div className="flex flex-wrap items-center gap-2">
                  {busyId === ev.id && (
                    <Loader2 className="h-3 w-3 animate-spin text-muted-foreground" />
                  )}
                  <button
                    type="button"
                    onClick={() => setEditing(editing?.id === ev.id ? null : ev)}
                    disabled={busyId === ev.id}
                    className="flex items-center gap-1.5 border border-border px-3 py-1.5 font-mono-caps text-[10px] text-muted-foreground transition-colors hover:border-primary hover:text-primary disabled:opacity-50"
                  >
                    {editing?.id === ev.id ? <X className="h-3 w-3" /> : <Pencil className="h-3 w-3" />}
                    {editing?.id === ev.id ? "Close" : "Edit"}
                  </button>

                  {confirmId === ev.id ? (
                    <>
                      <button
                        type="button"
                        onClick={() => remove(ev)}
                        disabled={busyId === ev.id}
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
                      onClick={() => setConfirmId(ev.id)}
                      disabled={busyId === ev.id}
                      className="flex items-center gap-1.5 border border-border px-3 py-1.5 font-mono-caps text-[10px] text-muted-foreground transition-colors hover:border-destructive hover:text-destructive disabled:opacity-50"
                    >
                      <Trash2 className="h-3 w-3" /> Delete
                    </button>
                  )}
                </div>
              </div>

              {editing?.id === ev.id && (
                <EditEventForm ev={ev} busy={busyId === ev.id} onCancel={() => setEditing(null)} onSave={save} />
              )}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

/** Inline editor for one event. */
function EditEventForm({ ev, busy, onCancel, onSave }) {
  // datetime-local needs "YYYY-MM-DDTHH:mm", so trim the stored ISO string.

  const [form, setForm] = useState({
    title: ev.title || "",
    chapter: ev.chapter || "Other",
    event_type: ev.event_type || "Exhibition",
    venue: ev.venue || "",
    address: ev.address || "",
    start_date: toLocalInput(ev.start_date),
    end_date: toLocalInput(ev.end_date),
    external_link: ev.external_link || "",
    description: ev.description || "",
    image_url: ev.image_url || "",
    image_focal_x: ev.image_focal_x ?? 50,
    image_focal_y: ev.image_focal_y ?? 50,
  });

  /*
   * These were used in the markup but never declared — the whole Events tab
   * therefore crashed to a blank page as soon as it rendered an edit form.
   * Replacing the image is optional; the focal point can be adjusted without
   * choosing a new file.
   */
  const [imageFile, setImageFile] = useState(null);
  const imagePreview = React.useMemo(
    () => (imageFile ? URL.createObjectURL(imageFile) : ""),
    [imageFile]
  );

  const set = (k, v) => setForm((f) => ({ ...f, [k]: v }));
  const field =
    "w-full border border-border bg-background px-3 py-2 text-sm outline-none focus:border-primary";

  const submit = async (e) => {
    e.preventDefault();
    let image_url = form.image_url;
    if (imageFile) {
      try {
        const r = await base44.integrations.Core.UploadFile({ file: imageFile });
        image_url = r.file_url;
      } catch {
        // Fall through with the existing image rather than losing the rest of
        // the edit because one upload failed.
      }
    }
    onSave(ev, {
      ...form,
      // AFTER the spread, not before: `form` carries the OLD image_url, so
      // spreading it last overwrote the file that had just been uploaded.
      image_url,
      title: form.title.trim(),
      // Converted from the viewer's own timezone. Slicing the ISO string put
      // a UTC time into a local input, so a 6pm event reopened as 10am and
      // moved again on every save.
      start_date: fromLocalInput(form.start_date) || ev.start_date,
      end_date: fromLocalInput(form.end_date),
    });
  };

  return (
    <form onSubmit={submit} className="mt-4 border border-border bg-background/40 p-4">
      <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
        <div className="md:col-span-2">
          <label className="font-mono-caps text-[10px] text-muted-foreground">Title</label>
          <input className={`${field} mt-1`} value={form.title} onChange={(e) => set("title", e.target.value)} required />
        </div>

        <div>
          <label className="font-mono-caps text-[10px] text-muted-foreground">AFC Chapter</label>
          <select className={`${field} mt-1`} value={form.chapter} onChange={(e) => set("chapter", e.target.value)}>
            {CHAPTER_OPTIONS.map((c) => <option key={c} value={c}>{c}</option>)}
          </select>
          <p className="mt-1 text-xs text-muted-foreground">
            Sets which chapter page this appears on.
          </p>
        </div>

        <div>
          <label className="font-mono-caps text-[10px] text-muted-foreground">Type</label>
          <select className={`${field} mt-1`} value={form.event_type} onChange={(e) => set("event_type", e.target.value)}>
            {EVENT_TYPES.map((t) => <option key={t} value={t}>{t}</option>)}
          </select>
        </div>

        <div>
          <label className="font-mono-caps text-[10px] text-muted-foreground">Starts</label>
          <input type="datetime-local" className={`${field} mt-1`} value={form.start_date} onChange={(e) => set("start_date", e.target.value)} required />
        </div>

        <div>
          <label className="font-mono-caps text-[10px] text-muted-foreground">Ends</label>
          <input type="datetime-local" className={`${field} mt-1`} value={form.end_date} onChange={(e) => set("end_date", e.target.value)} />
        </div>

        <div>
          <label className="font-mono-caps text-[10px] text-muted-foreground">Venue</label>
          <input className={`${field} mt-1`} value={form.venue} onChange={(e) => set("venue", e.target.value)} />
        </div>

        <div>
          <label className="font-mono-caps text-[10px] text-muted-foreground">Address</label>
          <input className={`${field} mt-1`} value={form.address} onChange={(e) => set("address", e.target.value)} />
        </div>

        <div className="md:col-span-2">
          <label className="font-mono-caps text-[10px] text-muted-foreground">Link</label>
          <input className={`${field} mt-1`} value={form.external_link} onChange={(e) => set("external_link", e.target.value)} placeholder="https://" />
        </div>

        <div className="md:col-span-2">
          <label className="font-mono-caps text-[10px] text-muted-foreground">Header image</label>
          <input
            type="file"
            accept="image/*"
            className={`${field} mt-1 file:mr-3 file:border-0 file:bg-muted file:px-2 file:py-1 file:font-mono-caps file:text-[10px]`}
            onChange={(e) => setImageFile(e.target.files?.[0] || null)}
          />
          {/* Shown in a wide banner on the event page, so a tall photograph is
              cropped. Drag to choose which part stays in frame rather than
              always taking the centre. */}
          {(imagePreview || form.image_url) && (
            <FocalPointPicker
              src={imagePreview || form.image_url}
              aspect={16 / 9}
              x={form.image_focal_x}
              y={form.image_focal_y}
              onChange={(x, y) => setForm((f) => ({ ...f, image_focal_x: x, image_focal_y: y }))}
            />
          )}
        </div>

        <div className="md:col-span-2">
          <label className="font-mono-caps text-[10px] text-muted-foreground">Description</label>
          <textarea rows={4} className={`${field} mt-1`} value={form.description} onChange={(e) => set("description", e.target.value)} />
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
