/**
 * The picture behind og:image — a 1200x630 JPEG made from a stored upload.
 *
 * WHY THIS EXISTS
 *
 * A link preview's picture is only as good as the file behind it, and
 * WhatsApp, Telegram, Signal and iMessage silently drop an og:image much over
 * ~300 KB: the card shows title and text, no picture. Artist portraits are
 * uploaded originals — measured 2026-09-22: 21 of 39 over the limit, median
 * 800 KB, some near 4 MB — so for over half of artists a shared link had no
 * image, and it looked random because it depended on the file.
 *
 * Supabase Storage can resize on the fly, but keeps the source format, and
 * `quality` only bites on lossy formats: a 3.8 MB PNG portrait came back as a
 * 1.2 MB PNG at 1200x630, still far over the limit. The only way to guarantee
 * a small file for every upload is to convert it ourselves. Hence this.
 *
 * WHAT IT DOES
 *
 *   GET /api/og-image?src=<url of an object in this project's public storage>
 *
 * Fetches the object, auto-orients it (phone photos carry EXIF rotation),
 * crops to 1200x630 around the most detailed region so a portrait keeps its
 * face, and returns a JPEG at quality 78 — a few tens of KB. Cached hard at
 * the edge: the same picture is asked for by every platform a link is shared
 * on, and the source rarely changes.
 *
 * NOT AN OPEN PROXY. Only URLs under this project's own public storage are
 * accepted. Anything else is a 400, so this cannot be pointed at arbitrary
 * hosts to fetch on someone's behalf.
 *
 * Only crawlers ever request this: browsers get the real page and its own
 * images. The prerender (api/prerender.js) is the one caller.
 */
import sharp from "sharp";

const SUPABASE_URL = (process.env.VITE_SUPABASE_URL || process.env.SUPABASE_URL || "").replace(/\/+$/, "");

export const OG_W = 1200;
export const OG_H = 630;

/** True only for an object in this project's own public storage. */
export function isAllowedSource(src) {
  if (!SUPABASE_URL) return false;
  return typeof src === "string" && src.startsWith(`${SUPABASE_URL}/storage/v1/object/public/`);
}

/** The conversion, separated from the request handling so it can be tested. */
export async function toCard(buffer) {
  return sharp(buffer)
    .rotate()
    .resize(OG_W, OG_H, { fit: "cover", position: sharp.strategy.attention })
    .jpeg({ quality: 78, mozjpeg: true })
    .toBuffer();
}

export default async function handler(req, res) {
  const src = String((req.query && req.query.src) || "");
  if (!isAllowedSource(src)) {
    res.status(400).send("src must be an object in this site's public storage");
    return;
  }

  let upstream;
  try {
    upstream = await fetch(src);
  } catch {
    res.status(502).send("could not fetch the source image");
    return;
  }
  if (!upstream.ok) {
    res.status(upstream.status === 404 ? 404 : 502).send("source image unavailable");
    return;
  }

  try {
    const out = await toCard(Buffer.from(await upstream.arrayBuffer()));
    res.setHeader("Content-Type", "image/jpeg");
    res.setHeader("Content-Length", String(out.length));
    // A day in the browser, a year at the edge, and serve stale while
    // revalidating: the picture is fetched by every platform a link lands on.
    res.setHeader("Cache-Control", "public, max-age=86400, s-maxage=31536000, stale-while-revalidate=604800");
    res.status(200).send(out);
  } catch {
    // Not an image, or a format sharp cannot read. Nothing sensible to send.
    res.status(415).send("source is not a convertible image");
  }
}
