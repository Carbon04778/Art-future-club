import React, { useEffect, useMemo, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { ArrowLeft, Loader2 } from "lucide-react";
import { format } from "date-fns";
import { base44 } from "@/api/base44Client";
import { Image } from "@/components/ui/image";
import SlimFooter from "@/components/SlimFooter";
import { useDataRevision } from "@/lib/dataRevision";
import { loadPublishedArticles, articleHref } from "@/lib/publishedArticles";
import { slugMatchesWriter, displayNameFor, artistForWriter } from "@/lib/writers";
import { artistPath } from "@/lib/slugs";

/**
 * A writer's page: everything they have written for AFC Editorial (B3 in
 * docs/CLIENT-REQUESTS.md). Bylines link here when the writer has no artist
 * page; when they do, this page links across to it.
 *
 * The address carries the name ("benedetta-barzaghi"); articles are matched
 * by writer KEY, so a byline typed "Barzaghi Benedetta" lands here too.
 */
export default function EditorialWriter() {
  const { writer } = useParams();
  const rev = useDataRevision();
  const [articles, setArticles] = useState(null);
  const [artists, setArtists] = useState([]);

  useEffect(() => {
    let alive = true;
    loadPublishedArticles().then((a) => alive && setArticles(a)).catch(() => alive && setArticles([]));
    base44.entities.ArtistProfile.filter({ status: "approved" }, "display_name", 1000, "id,display_name,slug")
      .then((a) => alive && setArtists(a || []))
      .catch(() => {});
    return () => { alive = false; };
  }, [rev]);

  // The slug's words against each byline, compared by key: word order,
  // spacing and punctuation do not matter.
  const theirs = useMemo(() => {
    if (!articles) return [];
    const when = (a) => new Date(a.publish_date || a.created_date || 0).getTime();
    return articles.filter((a) => slugMatchesWriter(writer, a.author_name)).sort((a, b) => when(b) - when(a));
  }, [articles, writer]);
  const name = displayNameFor(theirs);
  const artist = name ? artistForWriter(artists, name) : null;

  useEffect(() => {
    if (name) document.title = `${name} — AFC Editorial`;
  }, [name]);

  return (
    <>
      <div className="px-6 py-16 md:px-10">
        <Link to="/editorial" className="mb-12 inline-flex items-center gap-2 font-mono-caps text-[11px] text-muted-foreground hover:text-foreground">
          <ArrowLeft className="h-3 w-3" /> Back to Editorial
        </Link>

        {articles === null ? (
          <div className="flex justify-center py-24"><Loader2 className="h-5 w-5 animate-spin text-muted-foreground" /></div>
        ) : theirs.length === 0 ? (
          <div className="border border-border py-16 text-center">
            <p className="font-mono-caps text-[11px] text-muted-foreground">No published articles by this writer.</p>
          </div>
        ) : (
          <>
            <p className="font-mono-caps text-[11px] text-muted-foreground">AFC Editorial — Writer</p>
            <h1 className="mt-3 font-heading text-5xl font-medium tracking-[-0.02em] md:text-6xl">{name}</h1>
            <p className="mt-3 font-mono-caps text-[11px] text-muted-foreground">
              {theirs.length} article{theirs.length === 1 ? "" : "s"}
            </p>
            {artist && (
              <Link to={artistPath(artist)} className="mt-6 inline-flex items-center gap-2 border border-primary px-4 py-2 font-mono-caps text-[11px] text-primary hover:bg-primary hover:text-primary-foreground">
                View {name}'s artist page →
              </Link>
            )}

            <div className="mt-12 grid grid-cols-1 gap-10 md:grid-cols-2 lg:grid-cols-3">
              {theirs.map((a) => (
                <Link key={a.id} to={articleHref(a)} className="group block">
                  {a.cover_image_url && (
                    <Image src={a.cover_image_url} alt={a.cover_image_alt || a.title} fittingType="fill" className="mb-4 aspect-[4/3] w-full" />
                  )}
                  {a.category && <span className="border border-border px-2 py-0.5 font-mono-caps text-[10px] text-muted-foreground">{a.category}</span>}
                  <h3 className="mt-3 font-heading text-2xl tracking-[-0.01em] transition-colors group-hover:text-primary">{a.title}</h3>
                  {a.subtitle && <p className="mt-1 line-clamp-2 text-sm text-muted-foreground">{a.subtitle}</p>}
                  {(a.publish_date || a.created_date) && (
                    <p className="mt-2 font-mono-caps text-[10px] text-muted-foreground">
                      {format(new Date(a.publish_date || a.created_date), "d MMM yyyy")}
                    </p>
                  )}
                </Link>
              ))}
            </div>
          </>
        )}
      </div>
      <SlimFooter />
    </>
  );
}
