import React, { useState } from "react";
import { Link } from "react-router-dom";
import { base44 } from "@/api/base44Client";
import { X, Loader2, Lock } from "lucide-react";
import { PAYMENTS_ENABLED } from "@/lib/featureLimits";
import { parseISO, endOfDay, isPast, differenceInCalendarDays, format } from "date-fns";

/**
 * Shared by the Open Calls list, the single open call page and the admin
 * Open Calls tab, so posting and editing behave the same everywhere.
 */

export const CALL_TYPES = ["Open Call", "Residency", "Grant", "Fellowship", "Competition", "Exhibition", "Other"];

/**
 * `/open-calls/open-call-01-glitch-the-broken-screen` — the readable slug
 * (migration 032), or the id for a call that has none yet. Old id links keep
 * working: the page accepts either and tidies the address to the slug.
 */
export const openCallPath = (call) => `/open-calls/${call?.slug || call?.id || ""}`;

/** The poster can edit their own call; an admin can edit any. The database enforces the same (002, opencall_update_own). */
export const canEditCall = (user, call) => !!user && !!call && (user.role === "admin" || (!!call.posted_by_id && call.posted_by_id === user.id));

/**
 * deadline is a plain date ("2026-12-01"). new Date() reads that as midnight
 * UTC, which is the day before in the Americas, and isPast() on it closed a
 * call at the START of its deadline day. Read it as a local date and keep it
 * open until the end of that day.
 */
export function deadlineInfo(deadline) {
  if (!deadline) return null;
  const day = parseISO(String(deadline).slice(0, 10));
  if (Number.isNaN(day.getTime())) return null;
  const closed = isPast(endOfDay(day));
  const daysLeft = differenceInCalendarDays(day, new Date());
  return { day, closed, daysLeft, label: format(day, "d MMM yyyy"), long: format(day, "EEEE d MMMM yyyy") };
}

/**
 * What a visitor without access sees instead of open calls (B9).
 * Julie: "it will just say 'Upgrade to view' and maybe a prompt button to
 * click on to upgrade." Signed-out visitors are offered sign-in as well, in
 * case they are already members.
 */
export function UpgradeToView({ signedIn }) {
  return (
    <div className="mt-12 border border-border px-6 py-16 text-center" data-testid="open-calls-locked">
      <Lock className="mx-auto h-5 w-5 text-primary" />
      <h2 className="mt-4 font-heading text-3xl tracking-[-0.02em] md:text-4xl">Upgrade to view</h2>
      <p className="mx-auto mt-3 max-w-md text-sm text-muted-foreground leading-relaxed">
        Open calls — residencies, grants, fellowships and calls for submissions — are for premium members.
      </p>
      <div className="mt-8 flex flex-wrap items-center justify-center gap-4">
        {PAYMENTS_ENABLED && <Link to="/upgrade" className="bg-primary px-6 py-3 font-mono-caps text-[11px] text-primary-foreground hover:opacity-80">Upgrade Membership ↑</Link>}
        {!signedIn && (
          <Link to="/login" className="font-mono-caps text-[11px] text-muted-foreground underline hover:text-foreground">Already a member? Sign in</Link>
        )}
      </div>
    </div>
  );
}

export function TryAgain({ onRetry, what = "open calls" }) {
  return (
    <div className="mt-12 border border-border px-6 py-12 text-center" data-testid="open-calls-failed" role="alert">
      <p className="font-mono-caps text-[11px] text-muted-foreground">Couldn't load {what}. Check your connection.</p>
      <button type="button" onClick={onRetry} className="mt-4 font-mono-caps text-[11px] text-primary underline hover:opacity-80">Try again</button>
    </div>
  );
}

const EMPTY = { title: "", type: "Open Call", organizer: "", description: "", location: "", deadline: "", prize: "", is_free: true, fee: "", external_link: "", image_url: "" };
const FIELDS = Object.keys(EMPTY);

/**
 * Post a new open call, or edit one when `call` is given.
 * onSaved receives the saved row.
 */
export function OpenCallForm({ user, call, onClose, onSaved }) {
  const editing = !!call;
  const [form, setForm] = useState(() => {
    if (!call) return EMPTY;
    const f = {};
    for (const k of FIELDS) f[k] = call[k] ?? EMPTY[k];
    f.deadline = call.deadline ? String(call.deadline).slice(0, 10) : "";
    f.is_free = call.is_free !== false;
    return f;
  });
  const [imageFile, setImageFile] = useState(null);
  const [imagePreview, setImagePreview] = useState(call?.image_url || "");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const set = (k, v) => setForm((f) => ({ ...f, [k]: v }));
  const input = "w-full border border-border bg-transparent px-4 py-3 text-base outline-none focus:border-foreground";

  const onPickImage = (file) => {
    setImageFile(file || null);
    setImagePreview(file ? URL.createObjectURL(file) : form.image_url || "");
  };
  const removeImage = () => {
    setImageFile(null);
    setImagePreview("");
    set("image_url", "");
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setSaving(true);
    setError("");
    // A refused save used to leave the button spinning with nothing said.
    try {
      let image_url = form.image_url;
      if (imageFile) {
        const r = await base44.integrations.Core.UploadFile({ file: imageFile });
        image_url = r.file_url;
      }
      // deadline is a date column: an empty box must be null. "" was refused by
      // the database, so a call with no deadline could never be posted.
      const payload = {
        ...form,
        title: form.title.trim(),
        organizer: form.organizer.trim(),
        deadline: form.deadline || null,
        fee: form.is_free ? "" : form.fee,
        image_url,
      };
      const saved = editing
        ? await base44.entities.OpenCall.update(call.id, payload)
        : await base44.entities.OpenCall.create({ ...payload, posted_by_id: user?.id, posted_by_name: user?.full_name || "Member" });
      onSaved(saved || { ...call, ...payload });
    } catch (err) {
      const msg = String(err?.message || err);
      setError(/row-level security|permission|policy|coerce|0 rows/i.test(msg)
        ? (editing
            ? "Only the person who posted this open call, or an admin, can edit it."
            : "Only admins and paid or partner galleries and venues can post open calls.")
        : msg || "Could not save. Please try again.");
    } finally {
      setSaving(false);
    }
  };

  const label = editing ? "Save changes" : "Post Opportunity";

  return (
    <div className="fixed inset-0 z-50 bg-background/90 backdrop-blur-sm flex items-center justify-center p-4 sm:p-6" onClick={onClose}>
      <div role="dialog" aria-modal="true" aria-label={editing ? "Edit open call" : "Post an opportunity"} data-testid="open-call-form"
        className="bg-card border border-border w-full max-w-xl max-h-[90vh] overflow-y-auto" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between px-6 py-5 border-b border-border">
          <p className="font-mono-caps text-[11px]">{editing ? "Edit Open Call" : "Post an Opportunity"}</p>
          <button type="button" onClick={onClose} aria-label="Close"><X className="h-4 w-4 text-muted-foreground" /></button>
        </div>
        <form onSubmit={handleSubmit} className="p-6 space-y-5">
          <div>
            <label className="font-mono-caps text-[11px] text-muted-foreground">Title *</label>
            <input name="title" className={`${input} mt-2`} value={form.title} onChange={(e) => set("title", e.target.value)} required />
          </div>
          <div>
            <label className="font-mono-caps text-[11px] text-muted-foreground">Image</label>
            <input type="file" accept="image/*" onChange={(e) => onPickImage(e.target.files?.[0])} className={`${input} mt-2 file:mr-4 file:border-0 file:bg-muted file:px-3 file:py-1 file:font-mono-caps file:text-[11px]`} />
            {imagePreview && (
              <div className="mt-3">
                <img src={imagePreview} alt="" className="aspect-video w-full object-cover" />
                <button type="button" onClick={removeImage} className="mt-2 font-mono-caps text-[10px] text-muted-foreground underline hover:text-destructive">Remove image</button>
              </div>
            )}
          </div>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <div>
              <label className="font-mono-caps text-[11px] text-muted-foreground">Type</label>
              <select name="type" className="w-full border border-border bg-background px-4 py-3 text-base outline-none mt-2" value={form.type} onChange={(e) => set("type", e.target.value)}>
                {(CALL_TYPES.includes(form.type) ? CALL_TYPES : [...CALL_TYPES, form.type]).map((t) => <option key={t}>{t}</option>)}
              </select>
            </div>
            <div>
              <label className="font-mono-caps text-[11px] text-muted-foreground">Organizer *</label>
              <input name="organizer" className={`${input} mt-2`} value={form.organizer} onChange={(e) => set("organizer", e.target.value)} required />
            </div>
          </div>
          <div>
            <label className="font-mono-caps text-[11px] text-muted-foreground">Description</label>
            <textarea name="description" className={`${input} mt-2 resize-y`} rows={8} value={form.description} onChange={(e) => set("description", e.target.value)} />
            <p className="mt-1 text-xs text-muted-foreground">The full text shows on the open call's own page. Line breaks are kept.</p>
          </div>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <div>
              <label className="font-mono-caps text-[11px] text-muted-foreground">Location</label>
              <input name="location" className={`${input} mt-2`} value={form.location} onChange={(e) => set("location", e.target.value)} placeholder="City or Online" />
            </div>
            <div>
              <label className="font-mono-caps text-[11px] text-muted-foreground">Deadline</label>
              <input name="deadline" type="date" className={`${input} mt-2`} value={form.deadline} onChange={(e) => set("deadline", e.target.value)} />
            </div>
          </div>
          <div>
            <label className="font-mono-caps text-[11px] text-muted-foreground">Prize / Stipend</label>
            <input name="prize" className={`${input} mt-2`} value={form.prize} onChange={(e) => set("prize", e.target.value)} placeholder="e.g. £2,000 + accommodation" />
          </div>
          <div>
            <label className="font-mono-caps text-[11px] text-muted-foreground">External Link</label>
            <input name="external_link" type="url" className={`${input} mt-2`} value={form.external_link} onChange={(e) => set("external_link", e.target.value)} placeholder="https://…" />
          </div>
          <label className="flex items-center gap-2 cursor-pointer">
            <input type="checkbox" checked={form.is_free} onChange={(e) => set("is_free", e.target.checked)} className="h-4 w-4 accent-primary" />
            <span className="font-mono-caps text-[11px] text-muted-foreground">Free to apply</span>
          </label>
          {!form.is_free && (
            <div>
              <label className="font-mono-caps text-[11px] text-muted-foreground">Application Fee</label>
              <input name="fee" className={`${input} mt-2`} value={form.fee} onChange={(e) => set("fee", e.target.value)} placeholder="e.g. £25" />
            </div>
          )}
          {error && <p className="text-sm text-destructive" role="alert">{error}</p>}
          <div className="flex flex-wrap items-center gap-4 pt-2">
            <button type="submit" disabled={saving} data-testid="open-call-save" className="flex items-center gap-2 bg-primary px-8 py-4 font-mono-caps text-[11px] text-primary-foreground hover:opacity-80 disabled:opacity-50">
              {saving && <Loader2 className="h-3 w-3 animate-spin" />} {label}
            </button>
            <button type="button" onClick={onClose} className="font-mono-caps text-[11px] text-muted-foreground">Cancel</button>
          </div>
        </form>
      </div>
    </div>
  );
}
