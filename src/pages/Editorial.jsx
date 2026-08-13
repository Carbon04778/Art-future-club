import React, { useState, useEffect, useMemo } from "react";
import { Link } from "react-router-dom";
import { base44 } from "@/api/base44Client";
import { Plus, Search } from "lucide-react";
import { Image } from "@/components/ui/image";
import SlimFooter from "@/components/SlimFooter";
import ArticleForm from "@/components/ArticleForm";
import { motion } from "framer-motion";
import { format } from "date-fns";

const CATEGORIES = ["All", "Interview", "Essay", "Review", "Open Call", "News", "Feature"];

export default function Editorial() {
  // Editors and admins may write editorial articles. This mirrors the database
  // policy from migration 010 (public.is_editor): the permission was granted
  // there, but the UI was still admin-only so editors never saw the button.
  const [articles, setArticles] = useState([]);
  const [filter, setFilter] = useState("All");
  const [query, setQuery] = useState("");
  const [showForm, setShowForm] = useState(false);
  const [user, setUser] = useState(null);
  const canPublish = user?.role === "admin" || user?.role === "editor";

  // Editors and admins see everything they are allowed to see, including
  // drafts and scheduled pieces. Visitors see only what is live.
  //
  // Previously this always queried { published: true } and dropped anything
  // with a future publish_date, so an editor saving an article was told it
  // had saved and then could not find it — the row existed, the page simply
  // filtered it out before row-level security was ever consulted.
  const load = (allowUnpublished) =>
    (allowUnpublished
      ? base44.entities.Article.list("-created_date", 50)
      : base44.entities.Article.filter({ published: true }, "-created_date", 50)
    ).then((arts) => {
      const now = new Date();
      const when = (a) => new Date(a.publish_date || a.created_date || 0);
        // Sort by the date the article is presented as having (publish_date),
        // falling back to created_date. The query can only sort on one column,
        // so ordering is finished here: an article given an earlier or later
        // publish date was otherwise ranked by when its row happened to be
        // written, which is not the date shown to readers.
      const list = allowUnpublished
        ? arts
        : arts.filter((a) => !a.publish_date || new Date(a.publish_date) <= now);
      setArticles(list.sort((a, b) => when(b) - when(a)));
    });

  useEffect(() => {
    // Load the public view immediately so the page is never blank while the
    // session is still being resolved, then widen it if they may publish.
    load(false);
    base44.auth
      .me()
      .then((u) => {
        setUser(u);
        if (u?.role === "admin" || u?.role === "editor") load(true);
      })
      .catch(() => {});
  }, []);

  const refresh = () => load(canPublish);

  const filtered = useMemo(() => {
    let list = filter === "All" ? articles : articles.filter((a) => a.category === filter);
    const q = query.trim().toLowerCase();
    if (q) {
      list = list.filter((a) =>
        [a.title, a.subtitle, a.author_name, ...(a.tags || []), ...(a.categories || [])]
          .filter(Boolean)
          .some((s) => String(s).toLowerCase().includes(q))
      );
    }
    return list;
  }, [articles, filter, query]);

  const featured = filtered.filter((a) => a.featured);
  const rest = filtered.filter((a) => !a.featured);

  const href = (a) => `/editorial/${a.slug || a.id}`;
  const chips = (a) => [...(a.categories || []), ...(a.tags || [])];

  return (
    <>
      {canPublish && (
        <div className="flex justify-end px-6 py-3 md:px-10 border-b border-border">
          <button onClick={() => setShowForm(true)} className="flex items-center gap-1.5 bg-primary px-4 py-2 font-mono-caps text-[11px] text-primary-foreground hover:opacity-80">
            <Plus className="h-3 w-3" /> New Article
          </button>
        </div>
      )}

      <div className="px-6 py-16 md:px-10 max-w-6xl mx-auto">
        <p className="font-mono-caps text-[11px] text-muted-foreground">AFC — The Editorial Archive</p>
        <h1 className="mt-3 font-heading text-5xl font-medium tracking-[-0.02em] md:text-7xl">Editorial</h1>

        <div className="mt-10 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex flex-wrap gap-2">
            {CATEGORIES.map((c) => (
              <button key={c} onClick={() => setFilter(c)}
                className={`font-mono-caps text-[11px] px-3 py-1.5 border transition-colors ${filter === c ? "border-foreground bg-foreground text-background" : "border-border text-muted-foreground hover:border-foreground"}`}>
                {c}
              </button>
            ))}
          </div>
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
            <input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Search articles, tags, chapters…"
              className="w-full sm:w-72 border border-border bg-transparent pl-9 pr-3 py-2 text-sm outline-none focus:border-foreground" />
          </div>
        </div>

        {/* Featured */}
        {featured.map((article) => (
          <motion.div key={article.id} initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }}
            className="mt-16 group">
            <Link to={href(article)}>
              {article.cover_image_url && (
                <Image src={article.cover_image_url} alt={article.cover_image_alt || article.title} fittingType="fill" className="aspect-[16/7] w-full" />
              )}
              <div className="mt-5 grid grid-cols-1 md:grid-cols-[1fr_auto] gap-4 items-end">
                <div>
                  <span className="font-mono-caps text-[10px] border border-primary px-2 py-0.5 text-primary">{article.category}</span>
                  <h2 className="mt-3 font-heading text-4xl font-medium tracking-[-0.02em] md:text-5xl group-hover:text-primary transition-colors">{article.title}</h2>
                  {canPublish && !article.published && (
                    <span className="mt-2 inline-block border border-muted-foreground px-2 py-0.5 font-mono-caps text-[10px] text-muted-foreground">
                      Draft — only visible to you
                    </span>
                  )}
                  {article.subtitle && <p className="mt-2 text-lg text-muted-foreground">{article.subtitle}</p>}
                  {chips(article).length > 0 && (
                    <div className="mt-2 flex flex-wrap gap-1.5">
                      {chips(article).slice(0, 6).map((t) => (
                        <span key={t} className="font-mono-caps text-[9px] border border-border px-1.5 py-0.5 text-muted-foreground">{t}</span>
                      ))}
                    </div>
                  )}
                </div>
                <div className="text-right">
                  <p className="font-mono-caps text-[11px] text-muted-foreground">{article.author_name}</p>
                  {article.reading_time_mins && <p className="font-mono-caps text-[11px] text-muted-foreground">{article.reading_time_mins} min read</p>}
                </div>
              </div>
            </Link>
          </motion.div>
        ))}

        {/* Grid */}
        <div className="mt-16 grid grid-cols-1 gap-10 md:grid-cols-2 lg:grid-cols-3">
          {rest.map((article, i) => (
            <motion.div key={article.id} initial={{ opacity: 0, y: 16 }} whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true }} transition={{ delay: i * 0.05 }}>
              <Link to={href(article)} className="block group">
                {article.cover_image_url && (
                  <Image src={article.cover_image_url} alt={article.cover_image_alt || article.title} fittingType="fill" className="aspect-[4/3] w-full mb-4" />
                )}
                <span className="font-mono-caps text-[10px] border border-border px-2 py-0.5 text-muted-foreground">{article.category}</span>
                <h3 className="mt-3 font-heading text-2xl tracking-[-0.01em] group-hover:text-primary transition-colors">{article.title}</h3>
                {canPublish && !article.published && (
                  <span className="mt-2 inline-block border border-muted-foreground px-2 py-0.5 font-mono-caps text-[10px] text-muted-foreground">
                    Draft
                  </span>
                )}
                {article.subtitle && <p className="mt-1 text-sm text-muted-foreground line-clamp-2">{article.subtitle}</p>}
                {chips(article).length > 0 && (
                  <div className="mt-2 flex flex-wrap gap-1">
                    {chips(article).slice(0, 4).map((t) => (
                      <span key={t} className="font-mono-caps text-[9px] border border-border px-1.5 py-0.5 text-muted-foreground">{t}</span>
                    ))}
                  </div>
                )}
                <p className="mt-2 font-mono-caps text-[10px] text-muted-foreground">{article.author_name}{article.publish_date || article.created_date ? ` · ${format(new Date(article.publish_date || article.created_date), "d MMM yyyy")}` : ""}</p>
              </Link>
            </motion.div>
          ))}
        </div>

        {filtered.length === 0 && (
          <div className="mt-16 py-16 text-center border border-border">
            <p className="font-mono-caps text-[11px] text-muted-foreground">No articles match your search.</p>
          </div>
        )}
      </div>

      <SlimFooter />

      {showForm && canPublish && (
        <ArticleForm user={user} onClose={() => setShowForm(false)} onCreated={() => { setShowForm(false); refresh(); }} />
      )}
    </>
  );
}