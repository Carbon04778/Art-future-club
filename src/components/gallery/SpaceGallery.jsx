import React, { useState } from "react";
import { base44 } from "@/api/base44Client";
import { Image } from "@/components/ui/image";
import { Plus, X, Loader2 } from "lucide-react";
import { motion } from "framer-motion";

/**
 * A gallery of the physical space images stored on a gallery/CollectorProfile.
 * Owners can add new space photos (uploaded + caption) and remove existing ones.
 */
export default function SpaceGallery({ profile, isOwner, onUpdated }) {
  const images = profile.space_images || [];
  const [showAdd, setShowAdd] = useState(false);

  const remove = async (index) => {
    const next = images.filter((_, i) => i !== index);
    const updated = await base44.entities.CollectorProfile.update(profile.id, { space_images: next });
    onUpdated(updated);
  };

  return (
    <div>
      <div className="mt-16 flex items-end justify-between border-b border-border pb-4">
        <div>
          <p className="font-mono-caps text-[11px] text-muted-foreground">The Space</p>
          <h2 className="font-heading text-3xl tracking-[-0.01em]">Inside the Gallery</h2>
        </div>
        {isOwner && (
          <button onClick={() => setShowAdd(true)} className="flex items-center gap-2 bg-primary px-4 py-2 font-mono-caps text-[11px] text-primary-foreground hover:opacity-80">
            <Plus className="h-3 w-3" /> Add Space Photo
          </button>
        )}
      </div>

      {images.length === 0 ? (
        <div className="mt-12 border border-border py-16 text-center">
          <p className="font-mono-caps text-[11px] text-muted-foreground">No space photos yet.</p>
          {isOwner && <button onClick={() => setShowAdd(true)} className="mt-4 font-mono-caps text-[11px] text-primary hover:underline">Upload a photo of your space →</button>}
        </div>
      ) : (
        <div className="mt-10 columns-1 gap-6 sm:columns-2 lg:columns-3">
          {images.map((img, i) => (
            <motion.div
              key={i}
              initial={{ opacity: 0, y: 12 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.4, delay: i * 0.05 }}
              className="mb-6 break-inside-avoid group relative"
              data-artwork
            >
              <div className="overflow-hidden bg-muted">
                <Image src={img.url} alt={img.caption || profile.display_name} fittingType="fit" className="w-full group-hover:scale-[1.02] transition-transform duration-500" />
              </div>
              {img.caption && <p className="mt-3 font-mono-caps text-[10px] text-muted-foreground">{img.caption}</p>}
              {isOwner && (
                <button
                  onClick={() => remove(i)}
                  className="absolute top-2 right-2 bg-background/80 p-1.5 opacity-0 group-hover:opacity-100 transition-opacity hover:text-destructive"
                  title="Remove"
                >
                  <X className="h-3.5 w-3.5" />
                </button>
              )}
            </motion.div>
          ))}
        </div>
      )}

      {showAdd && isOwner && (
        <AddSpacePhotoModal
          profile={profile}
          onClose={() => setShowAdd(false)}
          onCreated={() => setShowAdd(false)}
          onUpdated={onUpdated}
        />
      )}
    </div>
  );
}

function AddSpacePhotoModal({ profile, onClose, onCreated, onUpdated }) {
  // Several photos at once. Adding one at a time meant reopening this dialog
  // for every image, which is why it felt as though only one was allowed.
  const [files, setFiles] = useState([]);
  const [captions, setCaptions] = useState({});
  const [saving, setSaving] = useState(false);
  const [progress, setProgress] = useState(0);
  const [error, setError] = useState("");
  const input = "w-full border border-border bg-transparent px-4 py-3 text-base outline-none focus:border-foreground";

  const submit = async (e) => {
    e.preventDefault();
    if (!files.length) return;
    setError("");
    setSaving(true);
    setProgress(0);

    try {
      // Upload one after another rather than in parallel: a gallery uploading
      // six photos at once would otherwise fire six concurrent requests, and
      // a partial failure would be hard to reason about.
      const added = [];
      for (let i = 0; i < files.length; i++) {
        const res = await base44.integrations.Core.UploadFile({ file: files[i] });
        added.push({ url: res.file_url, caption: captions[i] || "" });
        setProgress(i + 1);
      }

      // One write at the end, so the profile is saved once rather than once
      // per photo.
      const next = [...(profile.space_images || []), ...added];
      const updated = await base44.entities.CollectorProfile.update(profile.id, {
        space_images: next,
      });
      onUpdated(updated);
      onCreated();
    } catch (err) {
      setError(String(err?.message || err) || "Could not upload.");
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 bg-background/90 backdrop-blur-sm flex items-center justify-center p-6" onClick={onClose}>
      <div className="bg-card border border-border w-full max-w-md" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between px-6 py-5 border-b border-border">
          <p className="font-mono-caps text-[11px]">Add Space Photos</p>
          <button onClick={onClose}><X className="h-4 w-4 text-muted-foreground" /></button>
        </div>
        <form onSubmit={submit} className="p-6 space-y-5">
          <div>
            <label className="font-mono-caps text-[11px] text-muted-foreground">
              Photos * — select as many as you like
            </label>
            <input
              type="file"
              accept="image/*"
              multiple
              required
              className={`${input} mt-2 file:mr-4 file:border-0 file:bg-muted file:px-3 file:py-1 file:font-mono-caps file:text-[11px]`}
              onChange={(e) => {
                setFiles(Array.from(e.target.files || []));
                setCaptions({});
              }}
            />
            <p className="mt-1 text-xs text-muted-foreground">
              Hold Ctrl (or Cmd) to pick several at once.
            </p>
          </div>

          {/* A caption per photo, with a thumbnail so it is obvious which is
              which when several are selected. */}
          {files.length > 0 && (
            <div className="space-y-3">
              {files.map((f, i) => (
                <div key={`${f.name}-${i}`} className="flex items-start gap-3 border border-border p-3">
                  <div className="h-16 w-16 shrink-0 overflow-hidden bg-muted">
                    <img
                      src={URL.createObjectURL(f)}
                      alt=""
                      className="h-full w-full object-cover"
                    />
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="truncate font-mono-caps text-[10px] text-muted-foreground">
                      {f.name}
                    </p>
                    <input
                      className={`${input} mt-2`}
                      value={captions[i] || ""}
                      onChange={(e) =>
                        setCaptions((c) => ({ ...c, [i]: e.target.value }))
                      }
                      placeholder="Caption — e.g. Main exhibition hall, 2024"
                    />
                  </div>
                  <button
                    type="button"
                    onClick={() => {
                      setFiles((prev) => prev.filter((_, x) => x !== i));
                      setCaptions((c) => {
                        const next = { ...c };
                        delete next[i];
                        return next;
                      });
                    }}
                    className="shrink-0 text-muted-foreground hover:text-destructive"
                    aria-label={`Remove ${f.name}`}
                  >
                    <X className="h-4 w-4" />
                  </button>
                </div>
              ))}
            </div>
          )}

          {error && <p className="text-sm text-destructive">{error}</p>}
          <div className="flex flex-wrap items-center gap-4 pt-2">
            <button type="submit" disabled={saving} className="flex items-center gap-2 bg-primary px-8 py-4 font-mono-caps text-[11px] text-primary-foreground hover:opacity-80 disabled:opacity-50">
              {saving && <Loader2 className="h-3 w-3 animate-spin" />}
              {saving && files.length > 1
                ? `Uploading ${progress} of ${files.length}`
                : files.length > 1
                ? `Upload ${files.length} photos`
                : "Upload"}
            </button>
            <button type="button" onClick={onClose} className="font-mono-caps text-[11px] text-muted-foreground hover:text-foreground">Cancel</button>
          </div>
        </form>
      </div>
    </div>
  );
}