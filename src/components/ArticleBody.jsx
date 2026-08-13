import React from "react";
import ArticleImage from "@/components/ArticleImage";

/**
 * Renders an article body split into paragraphs, inserting the gallery and
 * (optionally) a closing image at positions defined by the layout.
 * Images may be stored as objects ({url,alt,caption}) or legacy string URLs.
 */
const toImg = (e) =>
  typeof e === "string"
    ? { url: e, alt: "", caption: "" }
    : { url: e?.url || e?.image_url || "", alt: e?.alt || "", caption: e?.caption || "" };

export default function ArticleBody({ article }) {
  const paragraphs = (article.body || "").split("\n\n").filter((p) => p.trim() !== "");
  const rawImages = article.images || [];
  const layout = article.layout || "cover_top";

  // Legacy layout: closing lived as the last item of the images array.
  if (layout === "image_before_close" && !article.closing_image_url) {
    const head = paragraphs.slice(0, -1);
    const tail = paragraphs.slice(-1);
    const closing = rawImages.length ? toImg(rawImages[rawImages.length - 1]) : null;
    const galleryImages = rawImages.length > 1 ? rawImages.slice(0, -1).map(toImg) : [];
    return (
      <>
        <div className="mt-12 prose prose-lg max-w-none text-foreground leading-relaxed">
          {head.map((para, i) => (
            <p key={i} className="mb-6 text-lg leading-relaxed">{para}</p>
          ))}
        </div>
        {galleryImages.length > 0 && (
          <div className="mt-8 grid grid-cols-1 gap-6 sm:grid-cols-2">
            {galleryImages.map((im, i) => (
              <ArticleImage key={i} src={im.url} alt={im.alt || `${article.title} — image ${i + 1}`} caption={im.caption} className="w-full aspect-[4/3]" />
            ))}
          </div>
        )}
        {closing && <ArticleImage src={closing.url} alt={closing.alt || article.title} caption={closing.caption} className="w-full aspect-[16/9] mt-8" />}
        <div className="mt-10 prose prose-lg max-w-none text-foreground leading-relaxed">
          {tail.map((para, i) => (
            <p key={i} className="mb-6 text-lg leading-relaxed">{para}</p>
          ))}
        </div>
      </>
    );
  }

  const hasIntro = layout === "image_after_intro" || layout === "intro_middle";
  const intro = hasIntro && rawImages.length ? toImg(rawImages[0]) : null;
  const gallery = hasIntro ? rawImages.slice(1).map(toImg) : rawImages.map(toImg);
  const middleGallery = layout === "gallery_middle" || layout === "intro_middle";
  const closing = article.closing_image_url
    ? { url: article.closing_image_url, alt: article.closing_image_alt || "", caption: article.closing_image_caption || "" }
    : null;
  const midIndex = Math.max(0, Math.floor(paragraphs.length / 2) - 1);

  const blocks = [];
  paragraphs.forEach((para, i) => {
    blocks.push({ kind: "para", text: para });
    if (hasIntro && i === 0 && intro) blocks.push({ kind: "full", image: intro });
    if (middleGallery && i === midIndex && gallery.length) blocks.push({ kind: "gallery", images: gallery });
  });
  if ((layout === "cover_top" || layout === "image_after_intro") && gallery.length) {
    blocks.push({ kind: "gallery", images: gallery });
  }
  if (closing && blocks.length) {
    let lastPara = -1;
    blocks.forEach((b, i) => { if (b.kind === "para") lastPara = i; });
    if (lastPara >= 0) blocks.splice(lastPara, 0, { kind: "full", image: closing });
  }

  return (
    <div className="mt-12">
      {blocks.map((b, i) => {
        if (b.kind === "para") {
          return <p key={i} className="mb-6 text-lg leading-relaxed text-foreground">{b.text}</p>;
        }
        if (b.kind === "full") {
          return <ArticleImage key={i} src={b.image.url} alt={b.image.alt || article.title} caption={b.image.caption} className="w-full aspect-[16/9] my-8" />;
        }
        return (
          <div key={i} className="my-8 grid grid-cols-1 gap-6 sm:grid-cols-2">
            {b.images.map((im, j) => (
              <ArticleImage key={j} src={im.url} alt={im.alt || `${article.title} — image ${j + 1}`} caption={im.caption} className="w-full aspect-[4/3]" />
            ))}
          </div>
        );
      })}
    </div>
  );
}