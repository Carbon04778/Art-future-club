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
const SITE_URL = (process.env.VITE_SITE_URL || "https://www.artfutureclub.com").replace(/\/+$/, "");

export const OG_W = 1200;
export const OG_H = 630;

/*
 * Allowed: an object in this project's public storage, or one of the site's
 * own /images/ files (chapter photos are WebP, which WhatsApp does not reliably
 * show). Nothing else, so this is still not an open proxy.
 */
const SITE_IMAGES = /^https:\/\/(www\.)?artfutureclub\.com\/images\/[^?#]+$/i;
export function isAllowedSource(src) {
  // A path step "/../" is refused; a ".." inside a file name is fine — one
  // gallery's upload is literally "…Courtesy_HART_HAUS..webp".
  if (typeof src !== "string" || /\/\.\.(\/|$)|%2e%2e/i.test(src)) return false;
  if (SUPABASE_URL && src.startsWith(`${SUPABASE_URL}/storage/v1/object/public/`)) return true;
  return SITE_IMAGES.test(src) || (src.startsWith(`${SITE_URL}/images/`) && !/[?#]/.test(src));
}

/*
 * The club's own card for a page with no picture: the logo centred on the
 * site's background colour (hsl 240 18% 4%). Made from the logo file, so it
 * needs no fonts on the server.
 */
const BACKGROUND = { r: 8, g: 8, b: 12, alpha: 1 };
export async function brandCard(logoBuffer) {
  const logo = await sharp(logoBuffer).resize({ height: 440, fit: "inside" }).png().toBuffer();
  return sharp({ create: { width: OG_W, height: OG_H, channels: 4, background: BACKGROUND } })
    .composite([{ input: logo, gravity: "center" }])
    .flatten({ background: BACKGROUND })
    .jpeg({ quality: 82, mozjpeg: true })
    .toBuffer();
}

/** The conversion, separated from the request handling so it can be tested. */
export async function toCard(buffer) {
  return sharp(buffer)
    .rotate()
    .resize(OG_W, OG_H, { fit: "cover", position: sharp.strategy.attention })
    .jpeg({ quality: 78, mozjpeg: true })
    .toBuffer();
}

const send = (res, out) => {
  res.setHeader("Content-Type", "image/jpeg");
  res.setHeader("Content-Length", String(out.length));
  // A day in the browser, a year at the edge, and serve stale while
  // revalidating: the picture is fetched by every platform a link lands on.
  res.setHeader("Cache-Control", "public, max-age=86400, s-maxage=31536000, stale-while-revalidate=604800");
  res.status(200).send(out);
};

export default async function handler(req, res) {
  if (req.query && req.query.card === "brand") {
    try {
      const logo = await fetch(`${SITE_URL}/images/artfuture.webp`);
      if (!logo.ok) throw new Error(String(logo.status));
      send(res, await brandCard(Buffer.from(await logo.arrayBuffer())));
    } catch {
      res.status(502).send("could not make the card");
    }
    return;
  }

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
    // The site answers a missing /images/ file with its HTML page, not a 404.
    if (!/^image\//i.test(upstream.headers.get("content-type") || "")) throw new Error("not an image");
    send(res, await toCard(Buffer.from(await upstream.arrayBuffer())));
  } catch {
    // Not an image, or a format sharp cannot read. Nothing sensible to send.
    res.status(415).send("source is not a convertible image");
  }
}
