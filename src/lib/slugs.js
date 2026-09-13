/**
 * Readable URLs.
 *
 * Every public page except editorial was addressed by a UUID:
 *
 *   /artists/d9ab6f21-5cc1-4d93-8c3a-9a3365bb8e10
 *
 * Search engines are explicit that URLs should use descriptive words rather
 * than generated ids, and a UUID tells a human nothing either. Migration 019
 * adds a `slug` to artist_profile, collector_profile and event; `article`
 * already had one.
 *
 * NOTHING BREAKS. Around 322 UUID URLs may already be shared or indexed, so
 * every page still accepts one — it looks the record up by slug first, falls
 * back to the id, and then rewrites the address bar to the clean URL so search
 * engines settle on a single address.
 */

/** Matches a v4-shaped UUID, which is what the old URLs are. */
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export const isUuid = (value) => UUID.test(String(value || ""));

/**
 * Mirror of public.slugify + public.slug_trim in migration 019.
 *
 * Used when the app needs a slug before the database has supplied one. The
 * accent fold matters: without it "Málaga" becomes "m-laga".
 */
export function slugify(input) {
  const folded = String(input || "")
    .normalize("NFKD")
    // Strip the combining marks NFKD just separated out. Escaped rather than
    // written literally — a bare combining range is invisible in an editor and
    // trivially corrupted by a copy-paste.
    .replace(/[̀-ͯ]/g, "");
  const slug = folded
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 70)
    .replace(/-+$/g, "");
  return slug || "";
}

/**
 * The URL segment for a record: its slug, or its id when it has none.
 *
 * Falling back to the id keeps links working on a record created before 019
 * ran, or one whose name yields no slug at all — one event is titled entirely
 * in Chinese and legitimately has no Latin slug.
 */
export const pathId = (record) => record?.slug || record?.id || "";

/** `/artists/naishi-jogani` */
export const artistPath = (record) => `/artists/${pathId(record)}`;

/** Galleries and venues share a page but not a path. */
export const spacePath = (record, isVenue = false) =>
  `${isVenue ? "/venues" : "/gallery"}/${pathId(record)}`;

export const eventPath = (record) => `/events/${pathId(record)}`;

/** `/editorial/...` — article slugs predate this module. */
export const articlePath = (record) => `/editorial/${record?.slug || record?.id || ""}`;

/**
 * Find a record from a URL segment that may be either a slug or an id.
 *
 * Slug first: that is the canonical address, and it is what almost every
 * request will carry. The id lookup is the compatibility path for links shared
 * before 019.
 *
 * @param entity  a provider entity, e.g. base44.entities.ArtistProfile
 * @param segment the :id / :slug route param
 * @param columns optional column list, passed through to the provider
 * @returns the record, or null
 */
export async function findBySlugOrId(entity, segment, columns) {
  if (!segment) return null;

  if (!isUuid(segment)) {
    const bySlug = await entity.filter({ slug: segment }, undefined, 1, columns).catch(() => []);
    if (bySlug[0]) return bySlug[0];
  }

  /*
   * `get` REJECTS when the row is missing — that is the documented provider
   * contract, and ArticleReader depends on it. Caught here so a missing record
   * is a null rather than an exception, because the caller's job is to show
   * "not available", not to crash.
   */
  const byId = await entity.get(segment).catch(() => null);
  if (byId) return byId;

  // Last resort: a slug that looks like a UUID, which happens when a record
  // had no usable name and fell back to its id as its slug.
  const bySlugAnyway = await entity.filter({ slug: segment }, undefined, 1, columns).catch(() => []);
  return bySlugAnyway[0] || null;
}

/**
 * Should the address bar be rewritten to the canonical slug URL?
 *
 * True only when the visitor arrived on something other than the record's own
 * slug — so an old UUID link tidies itself up, and a correct URL never causes
 * a redirect loop.
 */
export const shouldRedirectToSlug = (record, segment) =>
  !!record?.slug && !!segment && record.slug !== segment;
