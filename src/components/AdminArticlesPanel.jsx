import React, { useState, useEffect } from "react";
import { base44 } from "@/api/base44Client";
import { Loader2, Search, Trash2, Pencil, Eye, EyeOff, Check } from "lucide-react";
import ArticleForm from "@/components/ArticleForm";

/**
 * Editorial management for admins.
 *
 * Articles could previously be created but never edited or deleted from
 * anywhere in the interface — ArticleForm supported an `article` prop for
 * editing, but nothing ever passed one.
 *
 * Unpublishing is offered alongside deleting because it is almost always the
 * better choice: a deleted article takes its comments and any links to it with
 * it, and cannot be recovered. Unpublishing simply hides it.
 */
export default function AdminArticlesPanel({ user }) {
  const [articles, setArticles] = useState([]);
  const [loading, setLoading] = useState(true);
  const [query, setQuery] = useState("");
  const [busyId, setBusyId] = useState(null);
  const [editing, setEditing] = useState(null);
  const [error, setError] = useState("");
  const [done, setDone] = useState("");
  const [confirmId, setConfirmId] = useState(null);

  const load = () => {
    setLoading(true);
    base44.entities.Article.list("-created_date", 200)
      .then(setArticles)
      .catch((e) => setError(String(e?.message || e)))
      .finally(() => setLoading(false));
  };

  useEffect(load, []);

  const flash = (msg) => {
    setDone(msg);
    setTimeout(() => setDone(""), 2500);
  };

  const togglePublished = async (a) => {
    setError("");
    setBusyId(a.id);
    try {
      const updated = await base44.entities.Article.update(a.id, { published: !a.published });
      setArticles((prev) => prev.map((x) => (x.id === a.id ? { ...x, ...updated } : x)));
      flash(`"${a.title}" is now ${updated.published ? "published" : "hidden"}.`);
    } catch (e) {
      setError(String(e?.message || e));
    } finally {
      setBusyId(null);
    }
  };

  const remove = async (a) => {
    setError("");
    setBusyId(a.id);
    try {
      await base44.entities.Article.delete(a.id);
      setArticles((prev) => prev.filter((x) => x.id !== a.id));
      flash(`"${a.title}" deleted.`);
    } catch (e) {
      setError(String(e?.message || e));
    } finally {
      setBusyId(null);
      setConfirmId(null);
    }
  };

  const filtered = articles.filter((a) =>
    `${a.title || ""} ${a.author_name || ""} ${a.category || ""}`
      .toLowerCase()
      .includes(query.trim().toLowerCase())
  );

  return (
    <div className="border border-border bg-card p-6">
      <h3 className="font-heading text-2xl tracking-[-0.01em]">Editorial</h3>
      <p className="mt-2 text-sm text-muted-foreground">
        Edit, hide or delete articles. Hiding is usually better than deleting —
        a deleted article cannot be recovered.
      </p>

      <div className="relative mt-6">
        <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
        <input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Search by title, author or category"
          className="w-full border border-border bg-background py-3 pl-10 pr-4 text-base outline-none focus:border-primary"
        />
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
      ) : filtered.length === 0 ? (
        <p className="py-10 text-center text-sm text-muted-foreground">
          {articles.length === 0 ? "No articles yet." : "Nothing matches that search."}
        </p>
      ) : (
        <ul className="mt-6 divide-y divide-border border-t border-border">
          {filtered.map((a) => (
            <li key={a.id} className="flex flex-wrap items-center gap-3 py-4">
              <div className="min-w-0 flex-1">
                <p className="truncate font-body text-sm">{a.title || "Untitled"}</p>
                <p className="truncate font-mono-caps text-[10px] text-muted-foreground">
                  {a.author_name || "Unknown"}
                  {a.category ? ` · ${a.category}` : ""}
                  {a.published ? "" : " · HIDDEN"}
                </p>
              </div>

              <div className="flex flex-wrap items-center gap-2">
                {busyId === a.id && (
                  <Loader2 className="h-3 w-3 animate-spin text-muted-foreground" />
                )}

                <button
                  type="button"
                  onClick={() => togglePublished(a)}
                  disabled={busyId === a.id}
                  title={a.published ? "Hide from the site" : "Publish"}
                  className="flex items-center gap-1.5 border border-border px-3 py-1.5 font-mono-caps text-[10px] text-muted-foreground transition-colors hover:border-primary hover:text-primary disabled:opacity-50"
                >
                  {a.published ? <EyeOff className="h-3 w-3" /> : <Eye className="h-3 w-3" />}
                  {a.published ? "Hide" : "Publish"}
                </button>

                <button
                  type="button"
                  onClick={() => setEditing(a)}
                  disabled={busyId === a.id}
                  className="flex items-center gap-1.5 border border-border px-3 py-1.5 font-mono-caps text-[10px] text-muted-foreground transition-colors hover:border-primary hover:text-primary disabled:opacity-50"
                >
                  <Pencil className="h-3 w-3" /> Edit
                </button>

                {confirmId === a.id ? (
                  <>
                    <button
                      type="button"
                      onClick={() => remove(a)}
                      disabled={busyId === a.id}
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
                    onClick={() => setConfirmId(a.id)}
                    disabled={busyId === a.id}
                    title="Delete permanently"
                    className="flex items-center gap-1.5 border border-border px-3 py-1.5 font-mono-caps text-[10px] text-muted-foreground transition-colors hover:border-destructive hover:text-destructive disabled:opacity-50"
                  >
                    <Trash2 className="h-3 w-3" /> Delete
                  </button>
                )}
              </div>
            </li>
          ))}
        </ul>
      )}

      {editing && (
        <ArticleForm
          user={user}
          article={editing}
          onClose={() => setEditing(null)}
          onCreated={() => {
            setEditing(null);
            load();
            flash("Article saved.");
          }}
        />
      )}
    </div>
  );
}