/**
 * Address of a small copy of an uploaded picture (api/img.js, D4). Anything
 * that is not an upload, and every picture on a development server (which has
 * no /api), is returned as it is.
 */
export const THUMB_WIDTHS = [160, 320, 640, 1280];
export function thumb(src, width, on = import.meta.env.PROD) {
  if (!on || typeof src !== "string" || !/^https:\/\/[a-z0-9]+\.supabase\.co\/storage\/v1\/object\/public\//i.test(src)) return src;
  if (/\.(svg|gif)([?#]|$)/i.test(src)) return src;
  const w = THUMB_WIDTHS.find((x) => x >= width) || THUMB_WIDTHS.at(-1);
  return `/api/img?w=${w}&src=${encodeURIComponent(src)}`;
}
