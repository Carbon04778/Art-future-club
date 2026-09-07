import { useEffect, useState } from "react";

/**
 * A signal that says "something in the database changed — reload your list".
 *
 * WHY THIS EXISTS
 *
 * @tanstack/react-query is installed and wired up in App.jsx, but only
 * PageNotFound ever used it. Every other page does a one-shot fetch in a
 * useEffect and holds the result in useState, so nothing ever revalidates: a
 * page sitting open in front of you never learns that a profile was approved,
 * an article published, or a listing added. The only way to see new data was
 * to reload the browser, which is why AdminCreatePanel resorted to
 * window.location.reload() after every save.
 *
 * Rewriting twenty-four pages onto React Query would be the textbook fix and
 * also the riskiest possible change to make to a live site. This is the small
 * version: a counter that pages include in their effect dependencies. One line
 * per page, no refactor, and it composes with the existing fetch logic instead
 * of replacing it.
 *
 * HOW IT FIRES
 *
 *   1. Any create/update/delete, from anywhere. The facade in
 *      src/api/base44Client.js bumps this centrally, so no call site has to
 *      remember to.
 *   2. The window regaining focus — the same trick useNotifications already
 *      uses, and the moment stale data is most obvious.
 *
 * WHAT NOT TO DO WITH IT
 *
 * Do NOT wire this into a page that loads a record into editable form state
 * (ArtistProfileEdit, CollectorProfilePage, the gallery edit form). A refetch
 * there would overwrite whatever the member had typed and not yet saved.
 * It is for read-only listings and dashboards.
 */

let revision = 0;
const listeners = new Set();

/* A burst of writes — marking six messages read, saving several works — should
 * cause ONE refetch, not six. Collapse anything within this window. */
const BURST_MS = 150;
let pending = null;

function notify() {
  for (const listener of listeners) listener(revision);
}

/** Signal that data changed. Safe to call as often as you like. */
export function bumpDataRevision() {
  revision += 1;
  if (pending) clearTimeout(pending);
  pending = setTimeout(() => {
    pending = null;
    notify();
  }, BURST_MS);
}

/* Returning to the tab is when a stale list is most noticeable. Throttled, so
 * rapid alt-tabbing does not turn into a refetch storm. */
const FOCUS_MIN_GAP_MS = 10_000;
let lastFocusBump = 0;
let focusWired = false;

function wireFocusOnce() {
  if (focusWired || typeof window === "undefined") return;
  focusWired = true;
  window.addEventListener("focus", () => {
    const now = Date.now();
    if (now - lastFocusBump < FOCUS_MIN_GAP_MS) return;
    lastFocusBump = now;
    bumpDataRevision();
  });
}

/**
 * Include the returned value in a data-loading effect's dependency array:
 *
 *   const rev = useDataRevision();
 *   useEffect(() => { load(); }, [rev]);
 */
export function useDataRevision() {
  const [current, setCurrent] = useState(revision);

  useEffect(() => {
    wireFocusOnce();
    const listener = (next) => setCurrent(next);
    listeners.add(listener);
    return () => listeners.delete(listener);
  }, []);

  return current;
}

/** Test seam — resets module state between assertions. */
export function __resetDataRevision() {
  revision = 0;
  listeners.clear();
  lastFocusBump = 0;
  if (pending) clearTimeout(pending);
  pending = null;
}
