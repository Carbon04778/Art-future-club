import React, { useEffect, useState } from "react";
import { useParams, Link } from "react-router-dom";
import { base44 } from "@/api/base44Client";
import { ArrowLeft, Loader2 } from "lucide-react";
import { format } from "date-fns";
import ArticleImage from "@/components/ArticleImage";
import ArticleBody from "@/components/ArticleBody";
import NewsletterSubscribe from "@/components/NewsletterSubscribe";
import { useSeoMeta } from "@/hooks/useSeoMeta";
import SlimFooter from "@/components/SlimFooter";

/**
 * Dedicated, crawl-friendly article page (serves proper <head> meta for SEO
 * + GEO, shareable URL by slug or id). Replaces the in-page modal reader.
 */
export default function ArticleReader() {
  const { slug } = useParams();
  const [article, setArticle] = useState(null);
  const [loading, setLoading] = useState(true);
  const [notFound, setNotFound] = useState(false);

  useEffect(() => {
    let alive = true;
    (async () => {
      try {
        const a = await base44.entities.Article.get(slug);
        if (alive) { setArticle(a); setLoading(false); return; }
      } catch { /* not an id — try slug below */ }
      try {
        const list = await base44.entities.Article.filter({ slug, published: true }, "-created_date", 1);
        if (alive) {
          if (list[0]) { setArticle(list[0]); } else { setNotFound(true); }
          setLoading(false);
        }
      } catch {
        if (alive) { setNotFound(true); setLoading(false); }
      }
    })();
    return () => { alive = false; };
  }, [slug]);

  useSeoMeta(article);

  if (loading) {
    return (
      <div className="flex items-center justify-center py-40">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    );
  }
  if (notFound || !article) {
    return (
      <div className="max-w-3xl mx-auto px-6 py-32 text-center">
        <p className="font-mono-caps text-[11px] text-muted-foreground">Article not found.</p>
        <Link to="/editorial" className="mt-4 inline-block font-mono-caps text-[11px] text-primary">← Back to Editorial</Link>
      </div>
    );
  }

  const chips = [...(article.categories || []), ...(article.tags || [])];

  return (
    <>
      <div className="max-w-3xl mx-auto px-6 py-16 md:px-10">
        <Link to="/editorial" className="inline-flex items-center gap-2 font-mono-caps text-[11px] text-muted-foreground hover:text-foreground mb-12">
          <ArrowLeft className="h-3 w-3" /> Back to Editorial
        </Link>
        {article.cover_image_url && (
          <ArticleImage src={article.cover_image_url} alt={article.cover_image_alt || article.title} caption={article.cover_image_caption} className="aspect-[16/7] w-full mb-8" />
        )}
        <span className="font-mono-caps text-[10px] border border-primary px-2 py-0.5 text-primary">{article.category}</span>
        <h1 className="mt-4 font-heading text-5xl font-medium tracking-[-0.02em]">{article.title}</h1>
        {article.subtitle && <p className="mt-3 text-xl text-muted-foreground">{article.subtitle}</p>}
        <div className="mt-4 flex flex-wrap items-center gap-x-4 gap-y-1">
          <p className="font-mono-caps text-[11px] text-muted-foreground">By {article.author_name || "—"}</p>
          {article.reading_time_mins && <p className="font-mono-caps text-[11px] text-muted-foreground">· {article.reading_time_mins} min read</p>}
          {(article.publish_date || article.created_date) && <p className="font-mono-caps text-[11px] text-muted-foreground">· {format(new Date(article.publish_date || article.created_date), "d MMM yyyy")}</p>}
        </div>
        {chips.length > 0 && (
          <div className="mt-3 flex flex-wrap gap-1.5">
            {chips.map((t) => (
              <span key={t} className="font-mono-caps text-[9px] border border-border px-1.5 py-0.5 text-muted-foreground">{t}</span>
            ))}
          </div>
        )}
        <ArticleBody article={article} />
        <div className="mt-16">
          <NewsletterSubscribe />
        </div>
      </div>
      <SlimFooter />
    </>
  );
}