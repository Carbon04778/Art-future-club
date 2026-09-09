import { useCallback, useEffect, useRef, useState } from "react";

/**
 * Render a long list a screenful at a time instead of all at once.
 *
 * WHY
 *
 * The galleries page renders 120 cards and 110 images on first paint; venues
 * renders 136. The image bytes are already deferred (ui/image.jsx lazy-loads),
 * but the browser still builds every card, every wrapper and every animated
 * element before it can show anything — and the staggered entrance animation
 * meant the last card did not appear for three and a half seconds.
 *
 * This renders the first batch immediately and appends the next one when an
 * invisible marker near the bottom scrolls into view, so the work is spread
 * across the scroll rather than paid up front.
 *
 * IMPORTANT — pass the list you have ALREADY filtered and sorted. Batching has
 * to happen last, or searching would only ever look at the first batch and a
 * gallery near the end would be unfindable.
 *
 *   const filtered = all.filter(...).sort(...)
 *   const { visible, sentinelRef, hasMore, shown, total } =
 *     useProgressiveList(filtered);
 *
 *   {visible.map(...)}
 *   {hasMore && <div ref={sentinelRef} />}
 */

/** 6 rows of 3 on desktop, 9 rows of 2 on tablet — more than one screenful. */
export const BATCH_SIZE = 18;

export function useProgressiveList(items, batchSize = BATCH_SIZE) {
  const list = Array.isArray(items) ? items : [];
  const [count, setCount] = useState(batchSize);
  const sentinelRef = useRef(null);

  /*
   * Start again from the top when the list changes size — a filter or a search
   * has produced a different set, and continuing from a scroll position in the
   * previous one would show an arbitrary slice of it.
   *
   * Keyed on length rather than the array itself: `filtered` is a new array on
   * every render, so depending on it directly would reset the count forever
   * and the list could never grow.
   */
  useEffect(() => {
    setCount(batchSize);
  }, [list.length, batchSize]);

  const showMore = useCallback(
    () => setCount((c) => Math.min(c + batchSize, list.length)),
    [batchSize, list.length]
  );

  useEffect(() => {
    /*
     * No IntersectionObserver — jsdom in the verify suite, or a very old
     * browser. Render everything rather than batching, so nothing is ever
     * unreachable. Degrading to the previous behaviour is the safe direction.
     */
    if (typeof IntersectionObserver === "undefined") {
      setCount(list.length);
      return;
    }
    const node = sentinelRef.current;
    if (!node) return;

    const observer = new IntersectionObserver(
      (entries) => {
        if (entries.some((e) => e.isIntersecting)) showMore();
      },
      // Start fetching the next batch before the marker is actually on screen,
      // so the list is already longer by the time they reach the bottom.
      { rootMargin: "600px 0px" }
    );
    observer.observe(node);
    return () => observer.disconnect();
  }, [showMore, list.length]);

  const shown = Math.min(count, list.length);

  return {
    visible: list.slice(0, shown),
    sentinelRef,
    hasMore: shown < list.length,
    shown,
    total: list.length,
    showMore,
  };
}

/**
 * Entrance delay for a card, capped so a long list never animates for seconds.
 *
 * `delay: i * 0.03` across 120 cards meant the last one appeared 3.6 seconds
 * after load; venues, at 0.04, took 5.4. The stagger restarts each batch and
 * stops growing after the ninth card, so it stays a flourish rather than a
 * wait.
 */
export const staggerDelay = (index, batchSize = BATCH_SIZE, step = 0.03) =>
  Math.min(index % batchSize, 8) * step;
