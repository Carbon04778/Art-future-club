/**
 * A small copy of an uploaded picture, for lists and cards (D4).
 *
 *   GET /api/img?src=<object in this project's public storage>&w=320
 *
 * A 96px thumbnail used to download the full upload, up to 834 KB. Made once
 * per size, then kept at the edge and in the browser for a year: an upload
 * never changes under the same address.
 *
 * Not an open proxy: same source rule as og-image, and only a few fixed sizes.
 */
import sharp from "sharp";
import { isAllowedSource } from "./og-image.js";

export const WIDTHS = [160, 320, 640, 1280];
const MAX_BYTES = 25_000_000;

export async function shrink(buffer, w) {
  return sharp(buffer).rotate().resize({ width: w, withoutEnlargement: true }).webp({ quality: 76 }).toBuffer();
}

export default async function handler(req, res) {
  const src = String(req.query?.src || ""), w = Number(req.query?.w);
  const no = (code, why) => { res.setHeader("Cache-Control", "no-store"); res.status(code).send(why); };
  if (!WIDTHS.includes(w)) return no(400, "w must be one of " + WIDTHS.join(", "));
  if (!isAllowedSource(src)) return no(400, "src must be an object in this site's public storage");
  try {
    const up = await fetch(src, { signal: AbortSignal.timeout(15000) });
    if (!up.ok) return no(up.status === 404 ? 404 : 502, "source image unavailable");
    if (!/^image\//i.test(up.headers.get("content-type") || "") || Number(up.headers.get("content-length")) > MAX_BYTES) return no(415, "source is not a convertible image");
    const out = await shrink(Buffer.from(await up.arrayBuffer()), w);
    res.setHeader("Content-Type", "image/webp");
    res.setHeader("Content-Length", String(out.length));
    res.setHeader("Cache-Control", "public, max-age=31536000, s-maxage=31536000, immutable");
    return res.status(200).send(out);
  } catch {
    return no(502, "could not make the picture");
  }
}
