/**
 * Every row of a table, fetched a page at a time.
 *
 * list(sort, 200) returns the first 200 rows and stops without a word. The
 * Events page asked for the 200 oldest events; once the galleries passed 200,
 * everything from late September on — every current and upcoming event —
 * was missing, and nothing said so. Supabase also returns at most 1000 rows
 * per request whatever limit is asked for, so a bigger number is no fix.
 *
 * This keeps asking for the next page until it has the total the database
 * reports. Pass the same sort and columns you would give list().
 */
export async function loadAll(entity, { sort, columns, where, pageSize = 1000 } = {}) {
  const rows = [];
  const seen = new Set();
  for (let offset = 0; ; offset += pageSize) {
    const { rows: page, count } = await entity.page({ where, sort, columns, limit: pageSize, offset });
    // A row can shift between pages if events are added mid-load; never show it twice.
    for (const r of page) if (!seen.has(r.id)) { seen.add(r.id); rows.push(r); }
    if (page.length < pageSize || offset + pageSize >= count) return rows;
  }
}
