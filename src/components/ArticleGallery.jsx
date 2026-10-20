import React, { useCallback, useEffect, useState } from "react";
import ArticleImage from "@/components/ArticleImage";
import { Carousel, CarouselContent, CarouselItem, CarouselPrevious, CarouselNext } from "@/components/ui/carousel";

/**
 * An article's photo gallery, one image at a time (B5 in
 * docs/CLIENT-REQUESTS.md).
 *
 * The gallery used to be a two-column grid of cropped tiles, which Julie
 * found "very unprofessional". Now: one image, shown whole, with arrows on
 * the image, swipe on a phone, the keyboard's arrow keys, and below it the
 * caption, "2 / 6" and dots. Built on the Embla carousel the project already
 * ships (components/ui/carousel.jsx).
 *
 * Only for two or more images — ArticleBody keeps a single image as it was.
 */
export default function ArticleGallery({ images, title = "" }) {
  const [api, setApi] = useState(null);
  const [index, setIndex] = useState(0);
  const count = images.length;

  useEffect(() => {
    if (!api) return undefined;
    const sync = () => setIndex(api.selectedScrollSnap());
    sync();
    api.on("select", sync);
    api.on("reInit", sync);
    return () => { api.off("select", sync); api.off("reInit", sync); };
  }, [api]);

  const goTo = useCallback((i) => api?.scrollTo(i), [api]);
  const current = images[index] || images[0];

  return (
    <figure className="my-10">
      {/* The carousel marks itself (role="region", "carousel") and each item
          ("slide") — adding those again made screen readers say it twice. */}
      {/* tabIndex: the gallery itself takes keyboard focus, so ← and → work
          after tabbing to it — not only once a button inside has focus. */}
      <Carousel setApi={setApi} opts={{ loop: true }} tabIndex={0}
        className="w-full outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2 focus-visible:ring-offset-background"
        aria-label={`Image gallery, ${count} images`}>
        <CarouselContent>
          {images.map((im, i) => (
            <CarouselItem key={i} aria-label={`${i + 1} of ${count}`}>
              <ArticleImage src={im.url} alt={im.alt || `${title} — image ${i + 1}`} className="w-full aspect-[4/3]" />
            </CarouselItem>
          ))}
        </CarouselContent>
        {/* On the image, not outside it — outside, a phone pushes them off-screen. */}
        <CarouselPrevious className="left-3 border-0 bg-background/80 text-foreground hover:bg-background" />
        <CarouselNext className="right-3 border-0 bg-background/80 text-foreground hover:bg-background" />
      </Carousel>

      <figcaption className="mt-3 flex flex-col items-center gap-2">
        {current?.caption && (
          <span className="text-center font-mono-caps text-[10px] text-muted-foreground">{current.caption}</span>
        )}
        <span className="font-mono-caps text-[10px] text-muted-foreground" aria-live="polite">
          {index + 1} / {count}
        </span>
        <span className="flex gap-1.5">
          {images.map((_, i) => (
            <button
              key={i}
              type="button"
              onClick={() => goTo(i)}
              aria-label={`Show image ${i + 1}`}
              aria-current={i === index}
              className={`h-1.5 rounded-full transition-all ${i === index ? "w-5 bg-foreground" : "w-1.5 bg-muted-foreground/40 hover:bg-muted-foreground"}`}
            />
          ))}
        </span>
      </figcaption>
    </figure>
  );
}
