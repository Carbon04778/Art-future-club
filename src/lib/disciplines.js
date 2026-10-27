/**
 * Artist disciplines (A3 in docs/CLIENT-REQUESTS.md).
 *
 * Julie: artists may tick as many disciplines as they like, with one as
 * their MAIN discipline, shown first. The list itself is unchanged.
 *
 * Storage (migration 025): `discipline` is the main one — exactly the column
 * every page already showed and filtered on, so nothing that reads it
 * changed. `disciplines` is the full list, main first. Profiles saved before
 * the list existed have only `discipline`; disciplinesOf() covers both.
 */

export const DISCIPLINES = [
  "Painting", "Sculpture", "Photography", "Installation", "Video Art",
  "Performance", "Drawing", "Printmaking", "Ceramics", "Sound Art",
  "Digital Art", "Mixed Media", "Other",
];

/** All of an artist's disciplines, main first, no blanks or repeats. */
export function disciplinesOf(profile) {
  const main = typeof profile?.discipline === "string" ? profile.discipline.trim() : "";
  const list = Array.isArray(profile?.disciplines) ? profile.disciplines : [];
  const out = [];
  for (const d of [main, ...list]) {
    const t = typeof d === "string" ? d.trim() : "";
    if (t && !out.includes(t)) out.push(t);
  }
  return out;
}

/** True when the artist practises `d` at all — main or not. */
export function hasDiscipline(profile, d) {
  return disciplinesOf(profile).includes(d);
}

/** "Painting · Sculpture · Drawing" — every discipline, main first. */
export function disciplineLabel(profile, sep = " · ") {
  return disciplinesOf(profile).join(sep);
}

/**
 * The two columns to save, from the picker's list (main first). An empty
 * list saves "" and [] — the same as a profile that never chose one.
 */
export function disciplineFields(list) {
  const clean = disciplinesOf({ disciplines: list });
  return { discipline: clean[0] || "", disciplines: clean };
}
