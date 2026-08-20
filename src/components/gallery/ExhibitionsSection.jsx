import React, { useState } from "react";
import { base44 } from "@/api/base44Client";
import { Image } from "@/components/ui/image";
import { Plus, X, Loader2, MapPin, ExternalLink, Pencil, Trash2 } from "lucide-react";
import { Link } from "react-router-dom";
import { motion } from "framer-motion";

const fmt = (d) => new Date(d).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" });

/**
 * Lists a gallery's exhibitions (Event records organised by this profile's
 * user). Owners can post a new exhibition, which publishes to the Events page.
 */
export default function ExhibitionsSection({ profile, isOwner, events, onReload }) {
  const [showAdd, setShowAdd] = useState(false);
  const [editing, setEditing] = useState(null);
  const [deletingId, setDeletingId] = useState(null);
  const [confirmId, setConfirmId] = useState(null);
  const [error, setError] = useState("");

  /**
   * Remove an exhibition. Row-level security already allowed the organiser to
   * delete their own events; there was simply no way to do it from the page,
   * so a mistaken entry was permanent.
   */
  const remove = async (ev) => {
    if (confirmId !== ev.id) { setConfirmId(ev.id); return; }
    setError("");
    setDeletingId(ev.id);
    try {
      await base44.entities.Event.delete(ev.id);
      onReload();
    } catch (e) {
      setError(String(e?.message || e) || "Could not delete.");
    } finally {
      setDeletingId(null);
      setConfirmId(null);
    }
  };
  const upcoming = events.filter((e) => new Date(e.start_date) >= new Date());
  const past = events.filter((e) => new Date(e.start_date) < new Date());

  return (
    <div>
      <div className="mt-16 flex items-end justify-between border-b border-border pb-4">
        <div>
          <p className="font-mono-caps text-[11px] text-muted-foreground">Programme</p>
          <h2 className="font-heading text-3xl tracking-[-0.01em]">Exhibitions</h2>
        </div>
        {isOwner && (
          <button onClick={() => setShowAdd(true)} className="flex items-center gap-2 bg-primary px-4 py-2 font-mono-caps text-[11px] text-primary-foreground hover:opacity-80">
            <Plus className="h-3 w-3" /> Post Exhibition
          </button>
        )}
      </div>

      {events.length === 0 ? (
        <div className="mt-12 border border-border py-16 text-center">
          <p className="font-mono-caps text-[11px] text-muted-foreground">No exhibitions posted yet.</p>
          {isOwner && <button onClick={() => setShowAdd(true)} className="mt-4 font-mono-caps text-[11px] text-primary hover:underline">Post your first exhibition →</button>}
          <p className="mt-2 font-mono-caps text-[10px] text-muted-foreground/60">Posted exhibitions also appear on the public Events page.</p>
        </div>
      ) : (
        <>
          {upcoming.length > 0 && (
            <ExhibitionGroup title="Upcoming" events={upcoming} isOwner={isOwner}
              onEdit={setEditing} onDelete={remove} deletingId={deletingId} confirmId={confirmId} />
          )}
          {past.length > 0 && (
            <ExhibitionGroup title="Past" events={past} faded isOwner={isOwner}
              onEdit={setEditing} onDelete={remove} deletingId={deletingId} confirmId={confirmId} />
          )}
        </>
      )}

      {error && <p className="mt-4 text-sm text-destructive">{error}</p>}

      {showAdd && isOwner && (
        <AddExhibitionModal
          profile={profile}
          events={events}
          onClose={() => setShowAdd(false)}
          onCreated={() => { setShowAdd(false); onReload(); }}
        />
      )}

      {editing && isOwner && (
        <AddExhibitionModal
          profile={profile}
          events={events}
          exhibition={editing}
          onClose={() => setEditing(null)}
          onCreated={() => { setEditing(null); onReload(); }}
        />
      )}
    </div>
  );
}

function ExhibitionGroup({ title, events, faded, isOwner, onEdit, onDelete, deletingId, confirmId }) {
  return (
    <div className="mt-10">
      <p className="font-mono-caps text-[11px] text-muted-foreground border-b border-border pb-3 mb-6">{title}</p>
      <div className="space-y-0 divide-y divide-border">
        {events.map((ev, i) => (
          <motion.div
            key={ev.id}
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.3, delay: i * 0.03 }}
            className={`py-6 grid grid-cols-1 gap-4 md:grid-cols-[120px_1fr_auto] items-start ${faded ? "opacity-60" : ""}`}
          >
            <div>
              <p className="font-heading text-2xl tracking-[-0.02em]">{new Date(ev.start_date).getDate()}</p>
              <p className="font-mono-caps text-[10px] text-muted-foreground">{new Date(ev.start_date).toLocaleDateString("en-GB", { month: "short", year: "numeric" })}</p>
            </div>
            <Link to={`/events/${ev.id}`} className="group">
              <span className="font-mono-caps text-[10px] text-primary">{ev.event_type}</span>
              <h3 className="mt-1 font-heading text-xl tracking-[-0.01em] group-hover:text-primary transition-colors">{ev.title}</h3>
              {ev.description && <p className="mt-2 text-sm text-muted-foreground leading-relaxed max-w-lg line-clamp-2">{ev.description}</p>}
              {ev.venue && <p className="mt-2 flex items-center gap-1 font-mono-caps text-[10px] text-muted-foreground"><MapPin className="h-3 w-3" /> {ev.venue}{ev.address ? `, ${ev.address}` : ""}</p>}
            </Link>
            <div className="flex flex-col items-end gap-2">
              {ev.image_url && (
                <div className="h-20 w-20 overflow-hidden shrink-0" data-artwork>
                  <Image src={ev.image_url} alt={ev.title} fittingType="fill" className="h-full w-full object-cover" />
                </div>
              )}
              {ev.external_link && (
                <a href={ev.external_link} target="_blank" rel="noreferrer" className="flex items-center gap-1 font-mono-caps text-[10px] border border-border px-3 py-1.5 text-muted-foreground hover:border-primary hover:text-primary transition-colors">
                  <ExternalLink className="h-3 w-3" /> Details
                </a>
              )}
              {isOwner && (
                <div className="flex flex-wrap items-center justify-end gap-2">
                  <button
                    type="button"
                    onClick={() => onEdit(ev)}
                    className="flex items-center gap-1 border border-border px-3 py-1.5 font-mono-caps text-[10px] text-muted-foreground transition-colors hover:border-primary hover:text-primary"
                  >
                    <Pencil className="h-3 w-3" /> Edit
                  </button>
                  <button
                    type="button"
                    onClick={() => onDelete(ev)}
                    disabled={deletingId === ev.id}
                    className={`flex items-center gap-1 border px-3 py-1.5 font-mono-caps text-[10px] transition-colors disabled:opacity-50 ${
                      confirmId === ev.id
                        ? "border-destructive text-destructive"
                        : "border-border text-muted-foreground hover:border-destructive hover:text-destructive"
                    }`}
                  >
                    {deletingId === ev.id
                      ? <Loader2 className="h-3 w-3 animate-spin" />
                      : <Trash2 className="h-3 w-3" />}
                    {/* One click arms it, the second confirms — deleting an
                        exhibition cannot be undone. */}
                    {confirmId === ev.id ? "Confirm delete" : "Delete"}
                  </button>
                </div>
              )}
            </div>
          </motion.div>
        ))}
      </div>
    </div>
  );
}

/**
 * Posts a new exhibition, or edits an existing one when `exhibition` is given.
 *
 * Editing was previously impossible: the modal only ever created, so a typo in
 * a posted exhibition could not be corrected and a mistaken entry could not be
 * removed. Row-level security already permitted both — only the interface was
 * missing.
 */
function AddExhibitionModal({ profile, events, exhibition, onClose, onCreated }) {
  const isEdit = !!exhibition;
  // datetime-local needs "YYYY-MM-DDTHH:mm", so trim the stored ISO string.
  const forInput = (d) => (d ? String(d).slice(0, 16) : "");
  const [form, setForm] = useState({
    title: exhibition?.title || "",
    description: exhibition?.description || "",
    event_type: exhibition?.event_type || "Exhibition",
    start_date: forInput(exhibition?.start_date),
    end_date: forInput(exhibition?.end_date),
    address: exhibition?.address || "",
    external_link: exhibition?.external_link || "",
    image_url: exhibition?.image_url || "",
    is_free: exhibition?.is_free ?? true,
    ticket_price: exhibition?.ticket_price || "",
  });
  const [file, setFile] = useState(null);
  const [saving, setSaving] = useState(false);
  const [blocked, setBlocked] = useState(false);
  const [error, setError] = useState("");
  const set = (k, v) => setForm((f) => ({ ...f, [k]: v }));
  const input = "w-full border border-border bg-transparent px-4 py-3 text-base outline-none focus:border-foreground";

  const submit = async (e) => {
    e.preventDefault();
    const start = new Date(form.start_date);
    if (!isNaN(start) && !isEdit) {
      // The one-per-month limit applies to NEW exhibitions only — editing an
      // existing one would otherwise collide with itself.
      const ym = `${start.getFullYear()}-${start.getMonth()}`;
      const conflict = (events || []).some((ev) => {
        const d = new Date(ev.start_date);
        return `${d.getFullYear()}-${d.getMonth()}` === ym;
      });
      if (conflict) { setBlocked(true); return; }
    }
    setSaving(true);
    let image_url = form.image_url;
    if (file) { const r = await base44.integrations.Core.UploadFile({ file: file }); image_url = r.file_url; }
    const payload = {
      ...form,
      image_url,
      start_date: new Date(form.start_date).toISOString(),
      end_date: form.end_date ? new Date(form.end_date).toISOString() : undefined,
      chapter: "Other",
      venue: profile.display_name,
      address: form.address || profile.address || "",
      organizer_id: profile.user_id,
      organizer_name: profile.display_name,
    };
    try {
      if (isEdit) await base44.entities.Event.update(exhibition.id, payload);
      else await base44.entities.Event.create(payload);
    } catch (err) {
      setSaving(false);
      setError(String(err?.message || err) || "Could not save.");
      return;
    }
    setSaving(false);
    onCreated();
  };

  return (
    <div className="fixed inset-0 z-50 bg-background/90 backdrop-blur-sm flex items-center justify-center p-6" onClick={onClose}>
      <div className="bg-card border border-border w-full max-w-xl max-h-[90vh] overflow-y-auto" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between px-6 py-5 border-b border-border">
          <p className="font-mono-caps text-[11px]">{isEdit ? "Edit Exhibition" : "Post Exhibition"}</p>
          <button onClick={onClose}><X className="h-4 w-4 text-muted-foreground" /></button>
        </div>
        <form onSubmit={submit} className="p-6 space-y-4">
          <div>
            <label className="font-mono-caps text-[11px] text-muted-foreground">Exhibition Title *</label>
            <input className={`${input} mt-2`} value={form.title} onChange={(e) => set("title", e.target.value)} required placeholder="Material Traces" />
          </div>
          <div>
            <label className="font-mono-caps text-[11px] text-muted-foreground">Description</label>
            <textarea className={`${input} mt-2 resize-none`} rows={3} value={form.description} onChange={(e) => set("description", e.target.value)} />
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="font-mono-caps text-[11px] text-muted-foreground">Start Date & Time *</label>
              <input type="datetime-local" className={`${input} mt-2`} value={form.start_date} onChange={(e) => set("start_date", e.target.value)} required />
            </div>
            <div>
              <label className="font-mono-caps text-[11px] text-muted-foreground">End Date & Time</label>
              <input type="datetime-local" className={`${input} mt-2`} value={form.end_date} onChange={(e) => set("end_date", e.target.value)} />
            </div>
          </div>
          <div>
            <label className="font-mono-caps text-[11px] text-muted-foreground">Address</label>
            <input className={`${input} mt-2`} value={form.address} onChange={(e) => set("address", e.target.value)} placeholder="Street, City" />
          </div>
          <div>
            <label className="font-mono-caps text-[11px] text-muted-foreground">External Link / RSVP</label>
            <input type="url" className={`${input} mt-2`} value={form.external_link} onChange={(e) => set("external_link", e.target.value)} placeholder="https://…" />
          </div>
          <div>
            <label className="font-mono-caps text-[11px] text-muted-foreground">Exhibition Image</label>
            <input type="file" accept="image/*" className={`${input} mt-2 file:mr-4 file:border-0 file:bg-muted file:px-3 file:py-1 file:font-mono-caps file:text-[11px]`} onChange={(e) => setFile(e.target.files?.[0])} />
          </div>
          <label className="flex items-center gap-2 cursor-pointer">
            <input type="checkbox" checked={form.is_free} onChange={(e) => set("is_free", e.target.checked)} className="h-4 w-4 accent-primary" />
            <span className="font-mono-caps text-[11px] text-muted-foreground">Free entry</span>
          </label>
          {!form.is_free && (
            <div>
              <label className="font-mono-caps text-[11px] text-muted-foreground">Ticket Price</label>
              <input className={`${input} mt-2`} value={form.ticket_price} onChange={(e) => set("ticket_price", e.target.value)} placeholder="e.g. £10" />
            </div>
          )}
          {error && (
            <p className="text-sm text-destructive">{error}</p>
          )}
          {blocked && (
            <div className="border border-accent p-4">
              <p className="font-mono-caps text-[11px] text-accent mb-1">Monthly limit reached</p>
              <p className="text-sm text-muted-foreground leading-relaxed">
                Free gallery & venue profiles can post one exhibition per month. To post more this month, upgrade your membership.
              </p>
              <Link to="/upgrade" className="mt-3 inline-flex bg-primary px-5 py-2.5 font-mono-caps text-[11px] text-primary-foreground hover:opacity-80">Upgrade Membership ↑</Link>
            </div>
          )}
          {!blocked && <p className="font-mono-caps text-[10px] text-muted-foreground/70">This exhibition will be published to the public Events page. Free plans: 1 exhibition per month.</p>}
          <div className="flex flex-wrap items-center gap-4 pt-2">
            <button type="submit" disabled={saving} className="flex items-center gap-2 bg-primary px-8 py-4 font-mono-caps text-[11px] text-primary-foreground hover:opacity-80 disabled:opacity-50">
              {saving && <Loader2 className="h-3 w-3 animate-spin" />} Publish Exhibition
            </button>
            <button type="button" onClick={onClose} className="font-mono-caps text-[11px] text-muted-foreground hover:text-foreground">Cancel</button>
          </div>
        </form>
      </div>
    </div>
  );
}