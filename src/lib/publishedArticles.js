/**
 * Articles the public may read: published, and not scheduled for later.
 *
 * The same rule the Editorial index applies to visitors, shared by the
 * writer page and the artist page's "Writing" section (B3), so neither can
 * show a draft or a piece that is not out yet.
 */
import { base44 } from "@/api/base44Client";

// Enough for every article the site has (115 published in October 2026);
// the Editorial index uses the same ceiling.
const LIMIT = 500;

export async function loadPublishedArticles() {
  const arts = await base44.entities.Article.filter({ published: true }, "-created_date", LIMIT);
  const now = new Date();
  return (arts || []).filter((a) => !a.publish_date || new Date(a.publish_date) <= now);
}

export const articleHref = (a) => `/editorial/${a.slug || a.id}`;
