/**
 * Who wrote an article, and where their name should link (B3 in
 * docs/CLIENT-REQUESTS.md).
 *
 * An article's `author_id` is the account that POSTED it, not the writer: one
 * admin account posted 95 articles for eight writers. The writer is the typed
 * `author_name` — and it is typed inconsistently: "Benedetta Barzaghi",
 * "Benedetta Barzaghi " and "Barzaghi Benedetta" are one person.
 *
 * So writers are matched on a KEY: lower-cased, curly quotes straightened,
 * extra spaces dropped, and the words put in order. All three spellings above
 * share one key, and nothing in the database has to change.
 *
 * Where a byline goes: the writer's artist page if they have one (matched the
 * same way against artist display names), otherwise their writer page at
 * /editorial/writer/<slug>, which lists everything they have written.
 */
import { slugify } from "@/lib/slugs";
import { artistPath } from "@/lib/slugs";

/** "Barzaghi  Benedetta " and "benedetta barzaghi" -> "barzaghi benedetta". */
export function writerKey(name) {
  return String(name || "")
    .toLowerCase()
    .replace(/[‘’`´]/g, "'")
    .replace(/[^\p{L}\p{N}' -]+/gu, " ")
    .split(/[\s-]+/)
    .filter(Boolean)
    .sort()
    .join(" ");
}

/** The address of a writer page. Its words are compared by key, so order does not matter. */
export const writerPath = (name) => `/editorial/writer/${slugify(String(name || "").trim())}`;

/** Does a writer-page slug ("benedetta-barzaghi") belong to this name? */
export const slugMatchesWriter = (slug, name) =>
  Boolean(slug) && writerKey(String(slug).replace(/-/g, " ")) === writerKey(slugify(String(name || "")).replace(/-/g, " "));

/**
 * The spelling to show for a writer: the one used most often across their
 * articles, trimmed. "Benedetta Barzaghi" (42) beats "Barzaghi Benedetta" (1).
 */
export function displayNameFor(articles) {
  const counts = new Map();
  for (const a of articles) {
    const n = String(a.author_name || "").trim().replace(/\s+/g, " ");
    if (n) counts.set(n, (counts.get(n) || 0) + 1);
  }
  return [...counts.entries()].sort((a, b) => b[1] - a[1])[0]?.[0] || "";
}

/** Articles written by `name`, newest first. */
export function articlesBy(articles, name) {
  const key = writerKey(name);
  if (!key) return [];
  const when = (a) => new Date(a.publish_date || a.created_date || 0).getTime();
  return articles.filter((a) => writerKey(a.author_name) === key).sort((a, b) => when(b) - when(a));
}

/** The artist whose name matches the writer, if any. */
export const artistForWriter = (artists, name) => {
  const key = writerKey(name);
  return key ? artists.find((a) => writerKey(a.display_name) === key) || null : null;
};

/** Where a byline should link: the writer's artist page, else their writer page. */
export const bylineHref = (name, artist) => (artist ? artistPath(artist) : writerPath(name));
