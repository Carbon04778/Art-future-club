import { bumpDataRevision } from "@/lib/dataRevision";

/**
 * A short-lived read cache for entity lists.
 *
 * WHY
 *
 * Thirty-eight pages and components load data with `useEffect` + `setState`.
 * None of them remember anything, so leaving a page and coming straight back
 * re-downloads the whole list and shows the spinner again — which is exactly
 * how the site felt: "even when navigated to again, where we just left, it
 * somehow takes seconds to pull the data."
 *
 * @tanstack/react-query is installed and its provider already wraps the app,
 * but no data page uses it. Moving twenty-four pages onto it is the textbook
 * answer and also the riskiest change available on a live site — each of those
 * pages carries moderation filtering and the dataRevision behaviour that must
 * not shift. So this sits in the ONE place every page already goes through:
 * the facade in src/api/base44Client.js.
 *
 * HOW IT BEHAVES
 *
 *   - A cached list is handed back IMMEDIATELY, at any age. Never make someone
 *     watch a spinner for data already in memory.
 *   - If that data is older than FRESH_MS it is refreshed in the background,
 *     and dataRevision is bumped only if the result actually differs — so a
 *     page re-renders when something changed and stays still when nothing did.
 *   - Two components asking for the same thing at the same time share one
 *     request instead of firing two.
 *   - Any write clears everything. Writes are rare next to reads, and a
 *     blanket clear removes a whole category of "I saved it but it did not
 *     appear" bug that per-entity invalidation would leave open, because one
 *     write routinely changes what another entity's list should show.
 *   - Signing in or out clears everything. This one is not optional: row
 *     visibility depends on who is asking (an unapproved profile is visible to
 *     its owner and to an admin), so a list cached for one account must never
 *     be served to the next.
 */

/** Younger than this and the entry is served without any refresh. */
const FRESH_MS = 30_000;

/**
 * Older than this and the entry is discarded rather than shown.
 *
 * Stale-while-revalidate is right for seconds and minutes. For a tab left open
 * overnight it is not: flashing yesterday's list before correcting it is worse
 * than a brief spinner.
 */
const MAX_AGE_MS = 15 * 60_000;

/** Bounded so a long session cannot grow this without limit. */
const MAX_ENTRIES = 120;

const entries = new Map(); // key -> { rows, at, sig }
const inFlight = new Map(); // key -> Promise

let enabled = true;

/**
 * Cheap change detection.
 *
 * `id` + `updated_date` is precisely what a write changes, so comparing those
 * catches inserts, deletes and edits without serialising the whole payload —
 * which matters because one of these lists is half a megabyte. Falls back to
 * full serialisation when a projected column list leaves out the stamps.
 */
function signature(rows) {
  if (!Array.isArray(rows)) return JSON.stringify(rows ?? null);
  const parts = [];
  for (const row of rows) {
    if (!row || row.id === undefined || row.updated_date === undefined) {
      return `${rows.length}|${JSON.stringify(rows)}`;
    }
    parts.push(`${row.id}:${row.updated_date}`);
  }
  return `${rows.length}|${parts.join(",")}`;
}

/**
 * Hand back a copy of the array, never the cached one.
 *
 * Editorial, Messages and CollectorProfilePage all call `.sort()` directly on
 * what the provider returned, which sorts in place. Without this copy that
 * would reorder the shared cached array under whichever other page is reading
 * it. A shallow copy is enough and stays cheap: the row objects are shared, and
 * nothing in the app mutates a row — edits build a new object and save it.
 */
const handOut = (rows) => (Array.isArray(rows) ? rows.slice() : rows);

function remember(key, rows) {
  // Evict oldest-first once full. Insertion order is Map's iteration order, and
  // re-reads re-insert, so this approximates least-recently-used.
  if (entries.size >= MAX_ENTRIES) {
    const oldest = entries.keys().next().value;
    if (oldest !== undefined) entries.delete(oldest);
  }
  entries.set(key, { rows, at: Date.now(), sig: signature(rows) });
}

/** Refresh an entry behind the scenes; announce only a real change. */
function revalidate(key, fetcher) {
  if (inFlight.has(key)) return;
  const task = Promise.resolve()
    .then(fetcher)
    .then((rows) => {
      const previous = entries.get(key);
      remember(key, rows);
      if (previous && entries.get(key).sig !== previous.sig) bumpDataRevision();
    })
    .catch(() => {
      /*
       * A failed background refresh must not surface. The caller already has
       * usable data, and the entry keeps its old timestamp-free state — the
       * next read simply tries again.
       */
    })
    .finally(() => inFlight.delete(key));
  inFlight.set(key, task);
}

/**
 * Read through the cache.
 *
 * @param {string}   key     identifies the exact query
 * @param {Function} fetcher runs the real request; must resolve to rows
 */
export function cachedRead(key, fetcher) {
  if (!enabled) return Promise.resolve().then(fetcher);

  const hit = entries.get(key);
  if (hit) {
    const age = Date.now() - hit.at;
    if (age <= MAX_AGE_MS) {
      if (age > FRESH_MS) revalidate(key, fetcher);
      return Promise.resolve(handOut(hit.rows));
    }
    entries.delete(key);
  }

  // Share one request between simultaneous callers.
  const pending = inFlight.get(key);
  if (pending) return pending.then(() => handOut(entries.get(key)?.rows ?? []));

  const task = Promise.resolve()
    .then(fetcher)
    .then((rows) => {
      remember(key, rows);
      return rows;
    })
    .finally(() => inFlight.delete(key));

  inFlight.set(key, task);
  return task.then(handOut);
}

/** Build a stable key. Argument order is fixed, so positional is fine. */
export const cacheKey = (entity, method, args) =>
  `${entity}.${method}(${JSON.stringify(args ?? [])})`;

/** Drop everything. Called after any write, and on any change of identity. */
export function invalidateEntityCache() {
  entries.clear();
  // In-flight requests are deliberately NOT cancelled — their results are
  // simply no longer remembered, so the next read fetches again.
  inFlight.clear();
}

/** Off during the verify suite, so 700-odd existing checks stay deterministic. */
export function setEntityCacheEnabled(next) {
  enabled = !!next;
  if (!enabled) invalidateEntityCache();
}

export const isEntityCacheEnabled = () => enabled;

/** Test seam. */
export function __entityCacheStats() {
  return { size: entries.size, inFlight: inFlight.size, enabled };
}
