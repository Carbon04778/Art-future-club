import { CHAPTER_NAMES } from "./chaptersData.js";

/**
 * Plain-language event search (C8): "painting workshops near me this weekend".
 *
 * Understood here, in the browser: instant, free, and it cannot make anything
 * up, because it only ever filters the events on the page.
 */

const TYPES = [
  ["Exhibition", /\b(exhibitions?|exhibits?|shows?)\b/], ["Opening", /\b(openings?|vernissages?|private views?)\b/],
  ["Talk", /\b(talks?|lectures?|panels?|conversations?)\b/], ["Workshop", /\b(workshops?|class(?:es)?|courses?)\b/],
  ["Screening", /\b(screenings?|films?|movies?)\b/], ["Performance", /\b(performances?|concerts?)\b/],
  ["Fair", /\b(fairs?)\b/], ["Auction", /\b(auctions?)\b/], ["Social", /\b(socials?|meet-?ups?|gatherings?|parties|party)\b/],
];
const CITY = [...CHAPTER_NAMES.map((c) => [c, new RegExp(`\\b${c.toLowerCase()}\\b`)]), ["Hong Kong", /\bhk\b/], ["Milano", /\bmilan\b/], ["New York", /\bnyc\b/], ["Los Angeles", /\bla\b/]];
const STOP = new Set("a an the in at on for of and or to is are any some find show me my i want events event art happening what's whats what things please near nearby around this that with by from there".split(" "));
const MONTHS = ["january", "february", "march", "april", "may", "june", "july", "august", "september", "october", "november", "december"];

const day = (d, add = 0) => new Date(d.getFullYear(), d.getMonth(), d.getDate() + add);

export function parseEventQuery(q, now = new Date()) {
  let t = ` ${String(q || "").toLowerCase().replace(/[^\p{L}\p{N}\s'-]/gu, " ")} `;
  const out = { empty: !t.trim(), type: null, city: null, from: null, to: null, when: null, near: false, free: false, words: [] };
  if (out.empty) return out;
  const take = (re) => { const m = re.exec(t); if (m) t = t.replace(m[0], " "); return m; };
  const range = (label, a, b) => { out.when = label; out.from = a; out.to = b; };
  const dow = now.getDay();

  if (take(/\bnear(?:by)? me\b|\bnearby\b|\baround me\b|\bclose to me\b/)) out.near = true;
  if (take(/\bnext weekend\b/)) { const s = day(now, (dow === 0 ? 6 : 6 - dow) + 7); range("next weekend", s, day(s, 2)); if (dow === 0) { out.from = day(now, 6); out.to = day(now, 8); } }
  else if (take(/\b(?:this |the )?weekend\b/)) { const s = dow === 0 ? day(now) : day(now, 6 - dow); range("this weekend", s, day(s, dow === 0 ? 1 : 2)); }
  else if (take(/\btomorrow\b/)) range("tomorrow", day(now, 1), day(now, 2));
  else if (take(/\btoday\b|\btonight\b/)) range("today", day(now), day(now, 1));
  else if (take(/\bnext week\b/)) { const s = day(now, ((8 - dow) % 7) || 7); range("next week", s, day(s, 7)); }
  else if (take(/\bthis week\b/)) range("this week", day(now), day(now, ((8 - dow) % 7) || 7));
  else if (take(/\bnext month\b/)) range("next month", new Date(now.getFullYear(), now.getMonth() + 1, 1), new Date(now.getFullYear(), now.getMonth() + 2, 1));
  else if (take(/\bthis month\b/)) range("this month", day(now), new Date(now.getFullYear(), now.getMonth() + 1, 1));
  else {
    const i = MONTHS.findIndex((m) => new RegExp(`\\b(?:in|during) ${m}\\b`).test(t) || (m !== "may" && new RegExp(`\\b${m}\\b`).test(t)));
    if (i >= 0) {
      const y = now.getFullYear() + (i < now.getMonth() ? 1 : 0);
      take(new RegExp(`\\b(?:(?:in|during) )?${MONTHS[i]}\\b`));
      range(MONTHS[i][0].toUpperCase() + MONTHS[i].slice(1), new Date(y, i, 1), new Date(y, i + 1, 1));
    }
  }
  if (take(/\bfree\b/)) out.free = true;
  for (const [c, re] of CITY) if (take(re)) { out.city = c; break; }
  for (const [ty, re] of TYPES) if (take(re)) { out.type = ty; break; }
  out.words = t.split(/\s+/).map((w) => w.replace(/^['-]+|['-]+$/g, "")).filter((w) => w.length > 1 && !STOP.has(w));
  return out;
}

const km = (a, b) => {
  const r = Math.PI / 180, x = Math.sin(((b.lat - a.lat) * r) / 2) ** 2 + Math.cos(a.lat * r) * Math.cos(b.lat * r) * Math.sin(((b.lng - a.lng) * r) / 2) ** 2;
  return 12742 * Math.asin(Math.sqrt(x));
};

/** Is the event happening at any moment of [from, to)? A long exhibition counts. */
export function during(ev, from, to) {
  const s = new Date(ev.start_date);
  const last = ev.end_date ? new Date(ev.end_date) : s;
  return s < to && last >= from;
}
/** Still to come, or on now. */
export const isOpen = (ev, now = new Date()) => {
  const last = new Date(ev.end_date || ev.start_date);
  // A date-only event lasts until the end of its last day.
  return (ev.date_only ? last.getTime() + 43_200_000 : last.getTime()) >= now.getTime();
};

/** A filter for Array.filter. `near`: { chapter } or { lat, lng }. */
export function matchEvents(p, near = null, now = new Date()) {
  if (p.empty) return () => true;
  return (ev) => {
    if (p.from ? !during(ev, p.from, p.to) : !isOpen(ev, now)) return false;
    if (p.city && ev.chapter !== p.city && !`${ev.address || ""} ${ev.venue || ""}`.toLowerCase().includes(p.city.toLowerCase())) return false;
    if (p.type && ev.event_type !== p.type) return false;
    if (p.free && !ev.is_free) return false;
    if (p.near && near) {
      if (near.lat != null) {
        if (ev.geo_lat == null || ev.geo_lng == null || km(near, { lat: Number(ev.geo_lat), lng: Number(ev.geo_lng) }) > 50) return false;
      } else if (near.chapter && ev.chapter !== near.chapter) return false;
    }
    const hay = `${ev.title} ${ev.description || ""} ${ev.venue || ""} ${ev.organizer_name || ""} ${ev.event_type || ""}`.toLowerCase();
    return p.words.every((w) => hay.includes(w) || (w.length > 4 && w.endsWith("s") && hay.includes(w.slice(0, -1))));
  };
}

/** What was understood, in words, so a wrong reading is visible. */
export function describeQuery(p) {
  return [p.type, p.words.length ? `“${p.words.join(" ")}”` : null, p.city, p.near ? "near you" : null, p.when, p.free ? "free" : null].filter(Boolean).join(" · ");
}

/**
 * Events for one member, each with the reason shown to them.
 * followedIds: account ids they follow. followedNames: names they follow.
 */
export function recommendEvents(events, { followedIds = [], followedNames = [], chapter = null, interests = [] }, now = new Date(), limit = 6) {
  const ids = new Set(followedIds), names = new Set(followedNames.map((n) => String(n || "").trim().toLowerCase()).filter((n) => n.length > 2));
  const hasName = (hay, n) => new RegExp(`(^|[^\\p{L}\\p{N}])${n.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}([^\\p{L}\\p{N}]|$)`, "u").test(hay);
  return events.filter((e) => isOpen(e, now)).map((e) => {
    let score = 0;
    const why = [];
    const org = String(e.organizer_name || "").toLowerCase(), venue = String(e.venue || "").toLowerCase();
    const hay = `${e.title} ${e.description || ""}`.toLowerCase();
    const artist = [...names].find((n) => n.length > 4 && hasName(hay, n));
    if ((e.organizer_id && ids.has(e.organizer_id)) || names.has(org) || names.has(venue)) { score += 5; why.push(`You follow ${e.organizer_name || e.venue}`); }
    else if (artist) { score += 5; why.push("Features an artist you follow"); }
    const hit = interests.find((i) => i && hasName(hay, String(i).toLowerCase()));
    if (hit) { score += 2; why.push(hit); }
    if (chapter && e.chapter === chapter) { score += 1; why.push(`In ${chapter}`); }
    return { event: e, score, why };
  }).filter((x) => x.score > 0)
    .sort((a, b) => b.score - a.score || new Date(a.event.end_date || a.event.start_date) - new Date(b.event.end_date || b.event.start_date))
    .slice(0, limit);
}
