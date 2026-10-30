import React, { useState, useEffect, useMemo } from "react";
import { Link } from "react-router-dom";
import { base44 } from "@/api/base44Client";
import { Image } from "@/components/ui/image";
import { Bookmark, Loader2, Trash2, Plus, Pencil, Check, X } from "lucide-react";
import { useDataRevision } from "@/lib/dataRevision";

const UNSORTED = "unsorted";

/**
 * Works a member has collected, arranged in their own collections (B10 —
 * Julie: "If they can create different collections, that would be ideal.
 * Like in pinterest.").
 *
 * Shown on artist, gallery and collector pages. Who may see it is decided by
 * the database (migration 029): an artist's or gallery's collection is
 * public as before; a collector's is seen only by collectors, premium
 * members and admins, and by nobody else when the collector is private. If
 * the database returns nothing, nothing is shown.
 *
 * `isOwner` adds the controls: new collection, rename, delete (its works go
 * back to "Unsorted"), move a work, remove a work.
 */
export default function MyCollection({ userId, isOwner = false }) {
  const [works, setWorks] = useState([]);
  const [collections, setCollections] = useState([]);
  const [loading, setLoading] = useState(true);
  const [tab, setTab] = useState("all");
  const [busy, setBusy] = useState(null);
  const [error, setError] = useState("");
  const [newName, setNewName] = useState("");
  const [renaming, setRenaming] = useState(null);
  const [renameTo, setRenameTo] = useState("");
  const rev = useDataRevision();

  useEffect(() => {
    if (!userId) { setLoading(false); return undefined; }
    let alive = true;
    Promise.all([
      base44.entities.CollectedWork.filter({ user_id: userId }, "-created_date", 500).catch(() => []),
      base44.entities.Collection.filter({ user_id: userId }, "name", 200).catch(() => []),
    ]).then(([w, k]) => {
      if (!alive) return;
      setWorks(w);
      setCollections(k);
    }).finally(() => alive && setLoading(false));
    return () => { alive = false; };
  }, [userId, rev]);

  const counts = useMemo(() => {
    const c = { [UNSORTED]: 0 };
    for (const w of works) c[w.collection_id || UNSORTED] = (c[w.collection_id || UNSORTED] || 0) + 1;
    return c;
  }, [works]);
  // "All" shows each work once, however many collections it is in.
  const unique = useMemo(() => {
    const seen = new Set();
    return works.filter((w) => (seen.has(w.work_ref) ? false : seen.add(w.work_ref)));
  }, [works]);
  const shown = tab === "all" ? unique : works.filter((w) => (w.collection_id || UNSORTED) === tab);

  const run = async (key, fn) => {
    setBusy(key); setError("");
    try { await fn(); } catch (e) { setError(String(e?.message || e) || "Could not save. Please try again."); }
    finally { setBusy(null); }
  };
  const create = () => run("new", async () => {
    const name = newName.trim();
    if (!name) return;
    const k = await base44.entities.Collection.create({ user_id: userId, name });
    setCollections((prev) => [...prev, k].sort((a, b) => a.name.localeCompare(b.name)));
    setNewName("");
    setTab(k.id);
  });
  const rename = (k) => run(`rename-${k.id}`, async () => {
    const name = renameTo.trim();
    if (!name) return;
    await base44.entities.Collection.update(k.id, { name });
    setCollections((prev) => prev.map((x) => (x.id === k.id ? { ...x, name } : x)));
    setRenaming(null);
  });
  const removeCollection = (k) => {
    if (!window.confirm(`Delete the collection "${k.name}"? Its works are kept and move to Unsorted.`)) return;
    run(`del-${k.id}`, async () => {
      await base44.entities.Collection.delete(k.id);
      setCollections((prev) => prev.filter((x) => x.id !== k.id));
      setWorks((prev) => prev.map((w) => (w.collection_id === k.id ? { ...w, collection_id: null } : w)));
      setTab("all");
    });
  };
  // From "All": out of every collection it is in. From a collection: out of
  // that one only.
  const removeWork = (w) => run(w.id, async () => {
    const rows = tab === "all" ? works.filter((x) => x.work_ref === w.work_ref) : [w];
    for (const r of rows) await base44.entities.CollectedWork.delete(r.id);
    const gone = new Set(rows.map((r) => r.id));
    setWorks((prev) => prev.filter((x) => !gone.has(x.id)));
  });
  const moveWork = (w, to) => run(w.id, async () => {
    const collection_id = to === UNSORTED ? null : to;
    await base44.entities.CollectedWork.update(w.id, { collection_id });
    setWorks((prev) => prev.map((x) => (x.id === w.id ? { ...x, collection_id } : x)));
  });

  // Nothing collected and not your own page: show nothing.
  if (!loading && works.length === 0 && collections.length === 0 && !isOwner) return null;

  const tabs = [
    { id: "all", label: "All", n: unique.length },
    ...collections.map((k) => ({ id: k.id, label: k.name, n: counts[k.id] || 0, k })),
    ...(counts[UNSORTED] ? [{ id: UNSORTED, label: "Unsorted", n: counts[UNSORTED] }] : []),
  ];
  const current = collections.find((k) => k.id === tab);

  return (
    <section className="border-t border-border px-6 py-16 md:px-10" data-testid="collections">
      <p className="font-mono-caps text-[11px] text-muted-foreground">Collection</p>
      <h2 className="mt-3 font-heading text-3xl tracking-[-0.02em] md:text-4xl">
        {isOwner ? "My Collections" : "Collections"}
      </h2>

      {loading ? (
        <div className="flex justify-center py-10"><Loader2 className="h-5 w-5 animate-spin text-muted-foreground" /></div>
      ) : (
        <>
          <div className="mt-6 flex flex-wrap items-center gap-2" role="tablist" aria-label="Collections">
            {tabs.map((t) => (
              <button key={t.id} type="button" role="tab" aria-selected={tab === t.id} onClick={() => setTab(t.id)}
                className={`font-mono-caps text-[11px] px-3 py-1.5 border transition-colors ${tab === t.id ? "border-foreground bg-foreground text-background" : "border-border text-muted-foreground hover:border-foreground"}`}>
                {t.label} <span className="opacity-60">{t.n}</span>
              </button>
            ))}
            {isOwner && (
              <span className="flex flex-wrap items-center gap-2">
                <input value={newName} onChange={(e) => setNewName(e.target.value)} maxLength={80} placeholder="New collection…"
                  onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); create(); } }}
                  className="w-40 border border-border bg-transparent px-2 py-1 text-xs outline-none focus:border-foreground" aria-label="New collection name" />
                <button type="button" onClick={create} disabled={!newName.trim() || busy === "new"}
                  className="flex items-center gap-1 font-mono-caps text-[10px] text-primary disabled:opacity-40">
                  <Plus className="h-3 w-3" /> Create
                </button>
              </span>
            )}
          </div>

          {isOwner && current && (
            <div className="mt-3 flex flex-wrap items-center gap-3 font-mono-caps text-[10px] text-muted-foreground">
              {renaming === current.id ? (
                <>
                  <input value={renameTo} onChange={(e) => setRenameTo(e.target.value)} maxLength={80} aria-label="Collection name"
                    className="w-48 border border-border bg-transparent px-2 py-1 text-xs outline-none focus:border-foreground" />
                  <button type="button" onClick={() => rename(current)} aria-label="Save name"><Check className="h-3.5 w-3.5 text-primary" /></button>
                  <button type="button" onClick={() => setRenaming(null)} aria-label="Cancel"><X className="h-3.5 w-3.5" /></button>
                </>
              ) : (
                <>
                  <button type="button" onClick={() => { setRenaming(current.id); setRenameTo(current.name); }} className="flex items-center gap-1 hover:text-foreground"><Pencil className="h-3 w-3" /> Rename</button>
                  <button type="button" onClick={() => removeCollection(current)} className="flex items-center gap-1 hover:text-destructive"><Trash2 className="h-3 w-3" /> Delete collection</button>
                </>
              )}
            </div>
          )}

          {error && <p className="mt-4 text-sm text-destructive" role="alert">{error}</p>}

          {shown.length === 0 ? (
            <p className="mt-6 text-sm text-muted-foreground">
              {works.length === 0
                ? "Nothing collected yet. Use the Collect button on any artwork to save it into a collection."
                : "No works in this collection yet."}
            </p>
          ) : (
            <div className="mt-8 grid grid-cols-2 gap-6 md:grid-cols-4">
              {shown.map((w) => (
                <div key={w.id} className="group relative" data-testid="collected-work">
                  <Link to={`/artists/${w.artist_id}`} className="block">
                    <div className="aspect-square overflow-hidden bg-muted">
                      {w.work_image_url && (
                        <Image src={w.work_image_url} alt={w.work_title || "Collected work"} fittingType="fill"
                          className="h-full w-full object-cover transition-transform duration-500 group-hover:scale-[1.03]" />
                      )}
                    </div>
                    <p className="mt-3 truncate font-heading text-lg tracking-[-0.01em]">{w.work_title || "Untitled"}</p>
                    <p className="truncate font-mono-caps text-[10px] text-muted-foreground">
                      {w.artist_name}{w.work_medium ? ` · ${w.work_medium}` : ""}
                    </p>
                  </Link>
                  {isOwner && tab !== "all" && (
                    <div className="mt-2 flex flex-wrap items-center gap-2">
                      <select value={w.collection_id || UNSORTED} onChange={(e) => moveWork(w, e.target.value)} disabled={busy === w.id}
                        aria-label={`Move ${w.work_title || "work"} to another collection`}
                        className="max-w-[9rem] border border-border bg-background px-1 py-0.5 text-[11px]">
                        <option value={UNSORTED}>Unsorted</option>
                        {collections.map((k) => <option key={k.id} value={k.id}>{k.name}</option>)}
                      </select>
                    </div>
                  )}
                  {isOwner && (
                    <button type="button" onClick={() => removeWork(w)} disabled={busy === w.id}
                      aria-label={`Remove ${w.work_title || "work"} from ${tab === "all" ? "your collections" : "this collection"}`}
                      className="absolute right-2 top-2 bg-background/80 p-1.5 opacity-0 transition-opacity hover:text-destructive group-hover:opacity-100 focus:opacity-100 disabled:opacity-50">
                      {busy === w.id ? <Loader2 className="h-3 w-3 animate-spin" /> : <Trash2 className="h-3 w-3" />}
                    </button>
                  )}
                </div>
              ))}
            </div>
          )}

          {unique.length > 0 && (
            <p className="mt-6 flex items-center gap-1.5 font-mono-caps text-[10px] text-muted-foreground">
              <Bookmark className="h-3 w-3" /> {unique.length} work{unique.length === 1 ? "" : "s"}
              {collections.length > 0 && ` · ${collections.length} collection${collections.length === 1 ? "" : "s"}`}
            </p>
          )}
        </>
      )}
    </section>
  );
}
