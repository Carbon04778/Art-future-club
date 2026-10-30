import React, { useState, useEffect, useRef } from "react";
import { useNavigate } from "react-router-dom";
import { base44 } from "@/api/base44Client";
import { Bookmark, Check, Plus, Loader2 } from "lucide-react";

const UNSORTED = "unsorted";

/**
 * Save a work into one or more of your collections (B10 — "Like in
 * pinterest"). Opens a small "Save to…" menu: tick a collection to save the
 * work there, untick to take it out, or make a new collection on the spot.
 * Any artwork, for sale or not.
 *
 * Each collection a work is saved in is one CollectedWork row; "Unsorted"
 * (no collection) is where everything saved before collections existed is.
 */
export default function CollectButton({ userId, artistId, artistName, work, workRef }) {
  const navigate = useNavigate();
  const [rows, setRows] = useState([]);         // this work's saved rows, one per collection
  const [collections, setCollections] = useState([]);
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(null);
  const [error, setError] = useState("");
  const [newName, setNewName] = useState("");
  const box = useRef(null);

  useEffect(() => {
    if (!userId || !workRef) return undefined;
    let alive = true;
    base44.entities.CollectedWork.filter({ user_id: userId, work_ref: workRef })
      .then((r) => alive && setRows(r)).catch(() => {});
    return () => { alive = false; };
  }, [userId, workRef]);

  // Close when clicking elsewhere or pressing Escape.
  useEffect(() => {
    if (!open) return undefined;
    const away = (e) => { if (box.current && !box.current.contains(e.target)) setOpen(false); };
    const esc = (e) => { if (e.key === "Escape") setOpen(false); };
    document.addEventListener("mousedown", away);
    document.addEventListener("keydown", esc);
    return () => { document.removeEventListener("mousedown", away); document.removeEventListener("keydown", esc); };
  }, [open]);

  const openMenu = async (e) => {
    e.stopPropagation();
    if (!userId) { navigate("/login"); return; }
    setOpen((o) => !o);
    if (!open) {
      base44.entities.Collection.filter({ user_id: userId }, "name", 200).then(setCollections).catch(() => setCollections([]));
    }
  };

  const savedIn = (id) => rows.find((r) => (r.collection_id || UNSORTED) === id);

  const toggle = async (id) => {
    setBusy(id); setError("");
    try {
      const existing = savedIn(id);
      if (existing) {
        await base44.entities.CollectedWork.delete(existing.id);
        setRows((prev) => prev.filter((r) => r.id !== existing.id));
      } else {
        const rec = await base44.entities.CollectedWork.create({
          user_id: userId,
          collection_id: id === UNSORTED ? null : id,
          artist_id: artistId,
          artist_name: artistName,
          work_ref: workRef,
          work_title: work?.title,
          work_image_url: work?.image_url,
          work_medium: work?.medium,
          work_dimensions: work?.dimensions,
          work_year: work?.year,
          work_description: work?.description,
          work_price: work?.price,
          work_currency: work?.currency || "USD",
        });
        setRows((prev) => [...prev, rec]);
      }
    } catch (err) {
      setError(String(err?.message || err) || "Could not update your collection.");
    } finally {
      setBusy(null);
    }
  };

  const createAndSave = async () => {
    const name = newName.trim();
    if (!name) return;
    setBusy("new"); setError("");
    try {
      const k = await base44.entities.Collection.create({ user_id: userId, name });
      setCollections((prev) => [...prev, k].sort((a, b) => a.name.localeCompare(b.name)));
      setNewName("");
      setBusy(null);
      await toggle(k.id);
    } catch (err) {
      setError(String(err?.message || err) || "Could not create the collection.");
      setBusy(null);
    }
  };

  const collected = rows.length > 0;
  const choices = [...collections, { id: UNSORTED, name: "Unsorted" }];

  return (
    <span className="relative inline-flex flex-col gap-1" ref={box} onClick={(e) => e.stopPropagation()}>
      <button type="button" onClick={openMenu} aria-haspopup="true" aria-expanded={open} aria-pressed={collected}
        className={`flex items-center gap-1.5 font-mono-caps text-[11px] transition-colors ${collected ? "text-primary" : "text-muted-foreground hover:text-primary"} ${!userId ? "opacity-50" : ""}`}
        title={userId ? "Save to a collection" : "Log in to collect"} data-testid="collect-button">
        <Bookmark className={`h-4 w-4 ${collected ? "fill-primary" : ""}`} />
        <span>{collected ? `Collected${rows.length > 1 ? ` (${rows.length})` : ""}` : "Collect"}</span>
      </button>

      {open && (
        <div className="absolute left-0 top-full z-40 mt-2 w-64 border border-border bg-card p-3 shadow-lg" role="menu" data-testid="collect-menu">
          <p className="font-mono-caps text-[10px] text-muted-foreground">Save to…</p>
          <ul className="mt-2 max-h-56 space-y-1 overflow-y-auto">
            {choices.map((k) => {
              const on = !!savedIn(k.id);
              return (
                <li key={k.id}>
                  <button type="button" role="menuitemcheckbox" aria-checked={on} onClick={() => toggle(k.id)} disabled={busy === k.id}
                    className="flex w-full items-center justify-between gap-2 px-2 py-1.5 text-left text-sm hover:bg-muted disabled:opacity-50">
                    <span className="truncate">{k.name}</span>
                    {busy === k.id ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : on ? <Check className="h-3.5 w-3.5 text-primary" /> : null}
                  </button>
                </li>
              );
            })}
          </ul>
          <div className="mt-2 flex items-center gap-2 border-t border-border pt-2">
            <input value={newName} onChange={(e) => setNewName(e.target.value)} maxLength={80} placeholder="New collection…"
              onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); createAndSave(); } }}
              className="min-w-0 flex-1 border border-border bg-transparent px-2 py-1 text-xs outline-none focus:border-foreground" aria-label="New collection name" />
            <button type="button" onClick={createAndSave} disabled={!newName.trim() || busy === "new"} aria-label="Create collection and save"
              className="text-primary disabled:opacity-40"><Plus className="h-4 w-4" /></button>
          </div>
        </div>
      )}
      {error && <span className="text-xs text-destructive" role="alert">{error}</span>}
    </span>
  );
}
