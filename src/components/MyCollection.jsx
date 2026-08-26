import React, { useState, useEffect } from "react";
import { Link } from "react-router-dom";
import { base44 } from "@/api/base44Client";
import { Image } from "@/components/ui/image";
import { Bookmark, Loader2, Trash2 } from "lucide-react";

/**
 * Works this member has collected from other people.
 *
 * Collecting already worked, but the results were only visible on the
 * collector profile — an artist or gallery who collected something had no way
 * to see it. This shows the same list on any profile.
 *
 * `isOwner` decides whether the remove control appears: a visitor may see what
 * someone has collected, but only the owner may un-collect it.
 */
export default function MyCollection({ userId, isOwner = false }) {
  const [works, setWorks] = useState([]);
  const [loading, setLoading] = useState(true);
  const [busyId, setBusyId] = useState(null);

  useEffect(() => {
    if (!userId) {
      setLoading(false);
      return;
    }
    let alive = true;
    base44.entities.CollectedWork
      .filter({ user_id: userId }, "-created_date", 60)
      .then((rows) => alive && setWorks(rows))
      .catch(() => alive && setWorks([]))
      .finally(() => alive && setLoading(false));
    return () => { alive = false; };
  }, [userId]);

  const remove = async (id) => {
    setBusyId(id);
    try {
      await base44.entities.CollectedWork.delete(id);
      setWorks((prev) => prev.filter((w) => w.id !== id));
    } catch {
      // Non-fatal: the work simply stays in the list.
    } finally {
      setBusyId(null);
    }
  };

  // Nothing collected and not your own profile: show nothing rather than an
  // empty heading on someone else's page.
  if (!loading && works.length === 0 && !isOwner) return null;

  return (
    <section className="border-t border-border px-6 py-16 md:px-10">
      <p className="font-mono-caps text-[11px] text-muted-foreground">Collection</p>
      <h2 className="mt-3 font-heading text-3xl tracking-[-0.02em] md:text-4xl">
        {isOwner ? "My Collection" : "Collected Works"}
      </h2>

      {loading ? (
        <div className="flex justify-center py-10">
          <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
        </div>
      ) : works.length === 0 ? (
        <p className="mt-6 text-sm text-muted-foreground">
          Nothing collected yet. Use the Collect button on any artwork to save
          it here.
        </p>
      ) : (
        <div className="mt-8 grid grid-cols-2 gap-6 md:grid-cols-4">
          {works.map((w) => (
            <div key={w.id} className="group relative">
              <Link to={`/artists/${w.artist_id}`} className="block">
                <div className="aspect-square overflow-hidden bg-muted">
                  {w.work_image_url && (
                    <Image
                      src={w.work_image_url}
                      alt={w.work_title || "Collected work"}
                      fittingType="fill"
                      className="h-full w-full object-cover transition-transform duration-500 group-hover:scale-[1.03]"
                    />
                  )}
                </div>
                <p className="mt-3 truncate font-heading text-lg tracking-[-0.01em]">
                  {w.work_title || "Untitled"}
                </p>
                <p className="truncate font-mono-caps text-[10px] text-muted-foreground">
                  {w.artist_name}
                  {w.work_medium ? ` · ${w.work_medium}` : ""}
                </p>
              </Link>

              {isOwner && (
                <button
                  type="button"
                  onClick={() => remove(w.id)}
                  disabled={busyId === w.id}
                  aria-label={`Remove ${w.work_title || "work"} from your collection`}
                  className="absolute right-2 top-2 bg-background/80 p-1.5 opacity-0 transition-opacity hover:text-destructive group-hover:opacity-100 disabled:opacity-50"
                >
                  {busyId === w.id
                    ? <Loader2 className="h-3 w-3 animate-spin" />
                    : <Trash2 className="h-3 w-3" />}
                </button>
              )}
            </div>
          ))}
        </div>
      )}

      {works.length > 0 && (
        <p className="mt-6 flex items-center gap-1.5 font-mono-caps text-[10px] text-muted-foreground">
          <Bookmark className="h-3 w-3" />
          {works.length} work{works.length === 1 ? "" : "s"}
        </p>
      )}
    </section>
  );
}
