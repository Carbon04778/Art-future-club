/**
 * Page titles shared by the browser and the crawler prerender
 * (api/prerender.js), so a shared link and the open page say the same thing.
 * No imports: the prerender is a plain serverless function.
 */
export const SITE_NAME = "Art Future Club";

/** "Open Call 01 — GLITCH | Open Calls | Art Future Club" */
export const openCallTitle = (call) => `${call?.title || "Open Call"} | Open Calls | ${SITE_NAME}`;

/** "Hong Kong Chapter | Art Future Club" */
export const chapterTitle = (chapter) => `${chapter?.city || ""} Chapter | ${SITE_NAME}`.trim();
