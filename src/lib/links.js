/**
 * Website and social links, however people typed them (B13 in
 * docs/CLIENT-REQUESTS.md).
 *
 * What is saved varies: artists mostly typed Instagram handles ("anna",
 * "@anna"), galleries were imported with full URLs
 * ("https://www.instagram.com/anna/"), and websites arrive as
 * "www.anna.com" or "anna.com" as often as "https://anna.com". The pages
 * used to glue "https://instagram.com/" in front of whatever was saved, and
 * link a website exactly as typed — so a full URL became
 * "instagram.com/https://…" and "www.anna.com" became a link back into this
 * site. Every page now reads links through here, so all of those work
 * without rewriting anyone's data.
 *
 * Each reader returns null when there is nothing that can be linked
 * ("n/a", a gallery's name typed into the website box, an email address);
 * the page then shows no link rather than a broken one.
 */

const PLATFORMS = {
  instagram: { base: "https://www.instagram.com/", host: /(^|\.)instagram\.com$/i, handle: /^[a-z0-9._]{1,30}$/i },
  twitter: { base: "https://x.com/", host: /(^|\.)(twitter|x)\.com$/i, handle: /^[a-z0-9_]{1,15}$/i },
  tiktok: { base: "https://www.tiktok.com/@", host: /(^|\.)tiktok\.com$/i, handle: /^[a-z0-9._]{2,24}$/i },
  linkedin: { base: "https://www.linkedin.com/in/", host: /(^|\.)linkedin\.com$/i, handle: /^[a-z0-9-]{3,100}$/i },
  facebook: { base: "https://www.facebook.com/", host: /(^|\.)facebook\.com$/i, handle: /^[a-z0-9.]{3,50}$/i },
};

// What people type when they have nothing to put.
const EMPTY = /^(n\/?a|none|nil|null|no|-+|\.+)$/i;

const text = (v) => (typeof v === "string" ? v.trim() : "");

/** "https:/x", "http//x", "www.x.com", "x.com/a" → a URL object, or null. */
function parseUrl(v) {
  let s = text(v);
  if (!s || EMPTY.test(s) || /\s/.test(s) || s.includes("@") && !/^https?:/i.test(s)) return null;
  // At least one ":" or "/" — "httpcats.com" is a site, not "http://cats.com".
  s = s.replace(/^(https?)[:/]+/i, (_, p) => `${p.toLowerCase()}://`);
  if (!/^https?:\/\//i.test(s)) {
    // No scheme: only treat it as an address if it looks like one.
    if (!/^[a-z0-9-]+(\.[a-z0-9-]+)*\.[a-z]{2,}(?=$|[/:?#])/i.test(s)) return null;
    s = `https://${s}`;
  }
  try {
    const u = new URL(s);
    return /\./.test(u.hostname) ? u : null;
  } catch {
    return null;
  }
}

/** A website, ready for href — or null. */
export function websiteUrl(v) {
  return parseUrl(v)?.href ?? null;
}

/** A website as people read it: "anna.com/shop", no scheme or trailing slash. */
export function websiteLabel(v) {
  const u = parseUrl(v);
  if (!u) return text(v);
  return `${u.host.replace(/^www\./i, "")}${u.pathname === "/" ? "" : u.pathname.replace(/\/$/, "")}`;
}

/**
 * The handle on a platform: "@anna", "anna", "instagram.com/anna",
 * "https://www.instagram.com/anna/?hl=en" all give "anna". Null when the
 * value is a link somewhere else or not a handle at all.
 */
export function socialHandle(platform, v) {
  const p = PLATFORMS[platform];
  const s = text(v);
  if (!p || !s || EMPTY.test(s)) return null;
  const looksLikeUrl = /^https?:/i.test(s) || /^(www\.)?[a-z0-9-]+\.[a-z]{2,}\//i.test(s);
  if (looksLikeUrl) {
    const u = parseUrl(s);
    if (!u || !p.host.test(u.hostname)) return null;
    const first = decodeURIComponent(u.pathname.split("/").filter(Boolean)[platform === "linkedin" ? 1 : 0] || "").replace(/^@/, "");
    if (platform === "linkedin") return first || null;
    return p.handle.test(first) ? first : null;
  }
  const h = s.replace(/^@+/, "");
  return p.handle && p.handle.test(h) ? h : null;
}

/** A social link, ready for href — or null. */
export function socialUrl(platform, v) {
  const p = PLATFORMS[platform];
  const s = text(v);
  if (!p || !s || EMPTY.test(s)) return null;
  // A full address is used as given — even one for another site, which
  // still opens (some artists put their Instagram in the TikTok box).
  const u = /^https?:/i.test(s) || /^(www\.)?[a-z0-9-]+\.[a-z]{2,}\//i.test(s) ? parseUrl(s) : null;
  if (u) return u.href;
  const h = socialHandle(platform, s);
  return h && p.handle ? `${p.base}${h}` : null;
}

/** What to show beside the icon: "@anna", or the address when it is not a handle. */
export function socialLabel(platform, v) {
  const h = socialHandle(platform, v);
  if (h) return platform === "linkedin" || platform === "facebook" ? h : `@${h}`;
  return websiteLabel(v);
}

/**
 * Tidy what someone typed, before it is saved — as little as possible:
 *   "www.anna.com" / "anna.com" → "https://www.anna.com" / "https://anna.com"
 *   "https:/anna.com"           → "https://anna.com"
 *   "@anna"                     → "anna"
 * and trims. A value that is already right is returned exactly as it was
 * (admin forms save every field, so a listing's untouched links must not
 * change), and one it cannot make sense of is kept as typed — nobody loses
 * what they entered.
 */
export function cleanWebsite(v) {
  const s = text(v);
  if (!s || !websiteUrl(s)) return s;
  const fixed = s.replace(/^(https?)[:/]+/i, (_, p) => `${p.toLowerCase()}://`);
  return /^https?:\/\//i.test(fixed) ? fixed : `https://${fixed}`;
}

export function cleanSocial(platform, v) {
  const s = text(v);
  if (!s) return s;
  if (/^https?:/i.test(s) || /^(www\.)?[a-z0-9-]+\.[a-z]{2,}\//i.test(s)) return cleanWebsite(s);
  const h = s.replace(/^@+/, "");
  return PLATFORMS[platform]?.handle?.test(h) ? h : s;
}

const LINK_FIELDS = ["website", "instagram", "twitter", "tiktok", "linkedin", "facebook"];

/**
 * A form's values with its link fields tidied. Only fields already in the
 * object are touched — artist_profile has no facebook column, and adding
 * one would make the whole save fail.
 */
export function cleanLinks(values) {
  const out = { ...values };
  for (const k of LINK_FIELDS) {
    if (typeof out[k] === "string") out[k] = k === "website" ? cleanWebsite(out[k]) : cleanSocial(k, out[k]);
  }
  return out;
}
