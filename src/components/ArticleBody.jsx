import React from "react";
import ArticleImage from "@/components/ArticleImage";
import { parseArticleText } from "@/lib/articleText";

/**
 * Renders an article body split into paragraphs, inserting the gallery and
 * (optionally) a closing image at positions defined by the layout.
 * Images may be stored as objects ({url,alt,caption}) or legacy string URLs.
 */
const toImg = (e) =>
  typeof e === "string"
    ? { url: e, alt: "", caption: "" }
    : { url: e?.url || e?.image_url || "", alt: e?.alt || "", caption: e?.caption || "" };

/** A heading (B4) or a paragraph. */
function TextBlock({ block }) {
  if (block.kind === "heading") {
    return (
      <h2 className="mb-4 mt-10 font-heading text-2xl font-semibold leading-snug tracking-[-0.01em] text-foreground md:text-3xl">
        {block.text}
      </h2>
    );
  }
  return <p className="mb-6 text-lg leading-relaxed text-foreground">{block.text}</p>;
}

export default function ArticleBody({ article }) {
  // Paragraphs and headings ("## " at the start of a paragraph), in order.
  const textBlocks = parseArticleText(article.body);
  const rawImages = article.images || [];
  const layout = article.layout || "cover_top";

  // Legacy layout: closing lived as the last item of the images array.
  if (layout === "image_before_close" && !article.closing_image_url) {
    // The last paragraph goes after the images — with its heading, if it has one.
    let cut = textBlocks.length - 1;
    if (cut > 0 && textBlocks[cut - 1].kind === "heading") cut -= 1;
    const head = textBlocks.slice(0, Math.max(cut, 0));
    const tail = textBlocks.slice(Math.max(cut, 0));
    const closing = rawImages.length ? toImg(rawImages[rawImages.length - 1]) : null;
    const galleryImages = rawImages.length > 1 ? rawImages.slice(0, -1).map(toImg) : [];
    return (
      <>
        <div className="mt-12 prose prose-lg max-w-none text-foreground leading-relaxed">
          {head.map((block, i) => <TextBlock key={i} block={block} />)}
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
          {tail.map((block, i) => <TextBlock key={i} block={block} />)}
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
  // Images are placed by PARAGRAPH count — headings do not count — and only
  // ever after a paragraph, so no image lands between a heading and its text.
  const proseCount = textBlocks.filter((b) => b.kind === "para").length;
  const midIndex = Math.max(0, Math.floor(proseCount / 2) - 1);

  const blocks = [];
  let i = -1; // index among paragraphs
  textBlocks.forEach((tb) => {
    blocks.push(tb);
    if (tb.kind !== "para") return;
    i += 1;
    if (hasIntro && i === 0 && intro) blocks.push({ kind: "full", image: intro });
    if (middleGallery && i === midIndex && gallery.length) {
      // Same rule for a mid-article gallery.
      let run = [];
      gallery.forEach((img) => {
        if (img.full) {
          if (run.length) { blocks.push({ kind: "gallery", images: run }); run = []; }
          blocks.push({ kind: "full", image: img });
        } else {
          run.push(img);
        }
      });
      if (run.length) blocks.push({ kind: "gallery", images: run });
    }
  });
  if ((layout === "cover_top" || layout === "image_after_intro") && gallery.length) {
    /*
     * Any image marked `full` is shown on its own, at full width, rather than
     * squeezed into the two-column grid.
     *
     * Previously every gallery image was gridded with no way to enlarge one —
     * so an editor could tick and save and see no difference, because nothing
     * they touched controlled size.
     *
     * Consecutive gridded images stay together, so ticking one image in the
     * middle does not break the rest into separate rows.
     */
    let run = [];
    gallery.forEach((img) => {
      if (img.full) {
        if (run.length) { blocks.push({ kind: "gallery", images: run }); run = []; }
        blocks.push({ kind: "full", image: img });
      } else {
        run.push(img);
      }
    });
    if (run.length) blocks.push({ kind: "gallery", images: run });
  }
  if (closing && blocks.length) {
    // The closing image sits before the final paragraph — but only when that
    // paragraph is actual prose.
    //
    // Articles often end with a short sign-off block: a venue address on one
    // line and the dates on the next. Inserting the image before "the last
    // paragraph" split those apart, putting the picture between an address
    // and its date. Anything short, or containing a date or address-like
    // detail, is treated as part of that sign-off and kept together with what
    // precedes it — the image goes above the whole block instead.
    const SIGN_OFF_MAX = 180;
    const looksLikeSignOff = (t) =>
      t.length < SIGN_OFF_MAX &&
      /\d{1,2}[\s\-–—/]|\b(19|20)\d{2}\b|,\s*[A-Z]/.test(t);

    const paraIdx = [];
    blocks.forEach((b, i) => { if (b.kind === "para") paraIdx.push(i); });

    let target = paraIdx[paraIdx.length - 1];
    // Walk back past any trailing sign-off lines so the image lands above
    // the whole closing block rather than inside it.
    for (let n = paraIdx.length - 1; n >= 1; n--) {
      if (looksLikeSignOff(blocks[paraIdx[n]].text)) target = paraIdx[n - 1] + 1;
      else break;
    }
    // Never between a heading and the paragraph it introduces: go above the heading.
    while (target > 0 && blocks[target - 1]?.kind === "heading") target -= 1;
    if (target >= 0) blocks.splice(target, 0, { kind: "full", image: closing });
  }

  return (
    <div className="mt-12">
      {blocks.map((b, i) => {
        if (b.kind === "para" || b.kind === "heading") return <TextBlock key={i} block={b} />;
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