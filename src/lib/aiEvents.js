/**
 * The rules of the AI events check (C8) — pure functions, no network.
 *
 * Used by the server job (api/ai-events.js) and its tests. The AI only
 * PROPOSES. Everything it returns goes through checkEvent() here, which drops
 * any detail the page's own text does not support, so an invented date, place
 * or link cannot reach a draft.
 */

import { CHAPTER_NAMES } from "./chaptersData.js";

export const EVENT_TYPES = ["Exhibition", "Opening", "Talk", "Workshop", "Screening", "Performance", "Fair", "Auction", "Social", "Other"];

export const CHAPTER_ZONES = {
  "Hong Kong": "Asia/Hong_Kong", London: "Europe/London", "New York": "America/New_York",
  "Los Angeles": "America/Los_Angeles", Bangkok: "Asia/Bangkok", Milano: "Europe/Rome",
  Toronto: "America/Toronto", Zurich: "Europe/Zurich", Seattle: "America/Los_Angeles", Taipei: "Asia/Taipei",
};

/** The one chapter a place name means, or null when none or several match. */
export function chapterFor(place) {
  const p = String(place || "").toLowerCase();
  const hits = CHAPTER_NAMES.filter((c) => p.includes(c.toLowerCase()));
  if (/\bmilan\b/.test(p) && !hits.includes("Milano")) hits.push("Milano");
  if (/zürich/.test(p) && !hits.includes("Zurich")) hits.push("Zurich");
  if (/香港/.test(p) && !hits.includes("Hong Kong")) hits.push("Hong Kong");
  if (/[台臺]北/.test(p) && !hits.includes("Taipei")) hits.push("Taipei");
  return hits.length === 1 ? hits[0] : null;
}

/** True when a listing names one place only ("Hong Kong"), not "Hong Kong, Belgium". */
export const singlePlace = (s) => !!String(s || "").trim() && !/[,/&;|]| and /i.test(String(s));

/* ------------------------------------------------------------ page reading */

const NAMED = { nbsp: " ", amp: "&", ndash: "–", mdash: "—", rsquo: "’", lsquo: "‘", ldquo: "“", rdquo: "”", quot: '"', apos: "'", eacute: "é", uuml: "ü", ouml: "ö", auml: "ä", lt: "<", gt: ">" };
const cp = (n, all) => { try { return String.fromCodePoint(n); } catch { return all; } };
export const decode = (s) => String(s || "")
  .replace(/&#x([0-9a-f]+);/gi, (a, n) => cp(parseInt(n, 16), a))
  .replace(/&#(\d+);/g, (a, n) => cp(+n, a))
  .replace(/&([a-z]+);/gi, (_, n) => NAMED[n.toLowerCase()] ?? " ")
  .replace(/ /g, " ");

const A_TAG = /<a\b[^>]*?href\s*=\s*["']([^"']+)["'][^>]*>([\s\S]*?)<\/a>/gi;

/** Visible text of a page, each link followed by its [full address]. */
export function pageText(html, base) {
  return decode(
    String(html || "")
      .replace(/<!--[\s\S]*?-->/g, " ")
      .replace(/<(script|style|noscript|svg|template)\b[\s\S]*?<\/\1>/gi, " ")
      .replace(A_TAG, (_, u, t) => {
        let a = "";
        try { const x = new URL(decode(u), base); if (/^https?:$/.test(x.protocol)) a = x.href; } catch { /* not a link */ }
        return ` ${t} ${a ? `[${a}]` : ""} `;
      })
      .replace(/<(br|\/p|\/div|\/li|\/h\d|\/section|\/article|\/tr|\/td)[^>]*>/gi, "\n")
      .replace(/<[^>]+>/g, " ")
  ).replace(/[ \t\r\f\v]+/g, " ").replace(/ ?\n[\s]*/g, "\n").trim();
}

/** Text without link addresses: what a person would see. */
export const plain = (t) => String(t || "").replace(/\[https?:[^\]]*\]/g, "").replace(/[ \t]+/g, " ");

const sameSite = (a, b) => new URL(a).host.replace(/^www\./, "") === new URL(b).host.replace(/^www\./, "");

/** Likely "what's on" pages of a site, best first. */
export function eventPageLinks(html, base) {
  const out = new Map();
  for (const m of String(html || "").matchAll(A_TAG)) {
    try {
      const u = new URL(decode(m[1]), base);
      u.hash = "";
      if (!/^https?:$/.test(u.protocol) || !sameSite(u.href, base) || /\.(pdf|jpe?g|png|webp|zip)$/i.test(u.pathname)) continue;
      const t = decode(m[2].replace(/<[^>]+>/g, " ")).replace(/\s+/g, " ").trim();
      let s = 0;
      if (/exhibition|whats-?on|what-s-on|events?(\/|$|-)|programme|calendar|mostre|ausstellung/i.test(u.pathname)) s += 5;
      if (/exhibition|what.?s on|events?|展覽|展览|活動|mostre|ausstellung/i.test(t) && t.length < 30) s += 4;
      if (/current|upcoming|forthcoming/i.test(u.pathname + u.search + t)) s += 3;
      if (/past|archive(?!=current)|previous/i.test(u.pathname + t)) s -= 8;
      s -= Math.max(0, u.pathname.split("/").filter(Boolean).length - 1) * 1.5;
      if (s > 2 && s > (out.get(u.href) ?? -1)) out.set(u.href, s);
    } catch { /* not a link */ }
  }
  return [...out].sort((a, b) => b[1] - a[1]).map((x) => x[0]);
}

/** Share image of a page, if it is a proper web address. */
export function shareImage(html, base) {
  const m = /<meta[^>]+property=["']og:image["'][^>]*content=["']([^"']+)["']/i.exec(html || "")
    || /<meta[^>]+content=["']([^"']+)["'][^>]*property=["']og:image["']/i.exec(html || "");
  try { const u = new URL(decode(m[1]), base); return u.protocol === "https:" ? u.href : null; } catch { return null; }
}

/** robots.txt: may `agent` read this address? Longest rule wins; ties allow. */
export function robotsAllows(robots, url, agent = "artfutureclub") {
  const groups = [];
  let g = null, open = false;
  for (const raw of String(robots || "").split(/\r?\n/)) {
    const m = /^\s*([a-z-]+)\s*:\s*(.*)$/i.exec(raw.replace(/#.*/, ""));
    if (!m) continue;
    const k = m[1].toLowerCase(), v = m[2].trim();
    if (k === "user-agent") {
      if (!open) { g = { agents: [], rules: [] }; groups.push(g); }
      g.agents.push(v.toLowerCase()); open = true;
    } else if (k === "allow" || k === "disallow") {
      open = false;
      if (g && v) g.rules.push([k, v]);
    }
  }
  const named = groups.filter((x) => x.agents.some((a) => a !== "*" && a && agent.includes(a)));
  const rules = (named.length ? named : groups.filter((x) => x.agents.includes("*"))).flatMap((x) => x.rules);
  const u = new URL(url), path = u.pathname + u.search;
  let best = null;
  for (const [k, v] of rules) {
    const end = v.endsWith("$");
    const src = "^" + (end ? v.slice(0, -1) : v).split("*").map((x) => x.replace(/[.+?^{}()|[\]\\$]/g, "\\$&")).join(".*") + (end ? "$" : "");
    if (!new RegExp(src).test(path)) continue;
    if (!best || v.length > best[1].length || (v.length === best[1].length && k === "allow")) best = [k, v];
  }
  return !best || best[0] === "allow";
}

/** Private and reserved addresses the reader must never be pointed at. */
export function isPrivateIp(ip) {
  const s = String(ip || "").toLowerCase();
  const v4 = /^(?:::ffff:)?(\d+)\.(\d+)\.(\d+)\.(\d+)$/.exec(s);
  if (v4) {
    const [a, b] = [+v4[1], +v4[2]];
    return a === 0 || a === 10 || a === 127 || a >= 224 || (a === 169 && b === 254) || (a === 172 && b >= 16 && b <= 31) || (a === 192 && b === 168) || (a === 100 && b >= 64 && b <= 127) || (a === 198 && (b === 18 || b === 19));
  }
  // Only ordinary public IPv6 (2000::/3) is allowed.
  return !/^[23][0-9a-f]{3}:/.test(s);
}

/* ------------------------------------------------------- checking the AI */

export const norm = (s) => plain(s).toLowerCase()
  .replace(/[‘’`]/g, "'").replace(/[–—]/g, "-").replace(/[“”]/g, '"')
  .replace(/\s+/g, " ").trim();

const isDate = (d) => /^\d{4}-\d\d-\d\d$/.test(d || "") && !Number.isNaN(Date.parse(d + "T00:00:00Z")) && new Date(d + "T00:00:00Z").toISOString().slice(0, 10) === d;
const isTime = (t) => /^([01]\d|2[0-3]):[0-5]\d$/.test(t || "");
const MONTHS = [["jan", "gen"], ["feb", "fév"], ["mar", "mär"], ["apr", "avr"], ["may", "mai", "mag"], ["jun", "giu", "juin"], ["jul", "lug", "juil"], ["aug", "ago", "aoû"], ["sep", "set"], ["oct", "ott", "okt"], ["nov"], ["dec", "dic", "déc", "dez"]];

/** Is this date's day, month AND year written in the quoted text? */
export function dateInText(date, text, other = null) {
  if (!isDate(date)) return false;
  const [y, m, d] = date.split("-").map(Number);
  const t = String(text || "").toLowerCase();
  const num = (n) => new RegExp(`(^|\\D)0?${n}(\\D|$)`).test(t);
  // "22 Oct - 16 Nov 2026": the year is written once, for both.
  const years = [...t.matchAll(/(?:19|20)\d\d/g)].map((x) => +x[0]);
  const yearOk = years.includes(y) && (!other || !isDate(other) || years.includes(+other.slice(0, 4)));
  const monthOk = MONTHS[m - 1].some((n) => new RegExp(`(^|[^a-zà-ÿ])${n}`).test(t)) || num(m);
  return yearOk && num(d) && monthOk;
}

const MON = "jan(?:uary|uar)?|gen(?:naio)?|feb(?:ruary|ruar|braio)?|mar(?:ch|zo)?|märz|apr(?:il|ile)?|may|mai|mag(?:gio)?|june?|juni|giu(?:gno)?|july?|juli|lug(?:lio)?|aug(?:ust)?|ago(?:sto)?|sept?(?:ember)?|set(?:tembre)?|oct(?:ober)?|okt(?:ober)?|ott(?:obre)?|nov(?:ember|embre)?|dec(?:ember)?|dez(?:ember)?|dic(?:embre)?";
const monthNo = (n) => MONTHS.findIndex((list) => list.some((x) => n.startsWith(x))) + 1;
const iso = (y, m, d) => { const x = String(y) + "-" + String(m).padStart(2, "0") + "-" + String(d).padStart(2, "0"); return isDate(x) ? x : null; };

/**
 * The first date or date range written in a short piece of text, read by
 * code rather than by the AI: { start, end, quote }, or null when there is
 * none or it could be read two ways. Numeric dates are day first; 05/06/2026
 * style is refused where US month-first order is possible (usOrder).
 */
export function readDates(text, { usOrder = false } = {}) {
  const t = String(text || "");
  const re = new RegExp([
    "(?<cy>\\d{4})\\s*年\\s*(?<cm>\\d{1,2})\\s*月\\s*(?<cd>\\d{1,2})\\s*日",
    "(?<![\\d./])(?<nd>\\d{1,2})(?<sep>[./])(?<nm>\\d{1,2})(?:\\k<sep>(?<ny>\\d{4}))?(?![\\d./]\\d|\\d)",
    "(?<![\\d:])(?<d>\\d{1,2})(?:st|nd|rd|th)?\\s+(?:of\\s+)?(?<m>" + MON + ")\\b\\.?,?(?:\\s*(?<y>\\d{4}))?",
    "\\b(?<m2>" + MON + ")\\b\\.?\\s+(?<d2>\\d{1,2})(?:st|nd|rd|th)?\\b(?!:)(?:,?\\s*(?<y2>\\d{4}))?",
  ].join("|"), "giu");
  const hits = [];
  for (const x of t.matchAll(re)) {
    const g = x.groups;
    const h = g.cy ? { y: +g.cy, m: +g.cm, d: +g.cd }
      : g.nd ? { y: g.ny ? +g.ny : null, m: +g.nm, d: +g.nd, num: g.sep === "/" }
        : g.d ? { y: g.y ? +g.y : null, m: monthNo(g.m.toLowerCase()), d: +g.d }
          : { y: g.y2 ? +g.y2 : null, m: monthNo(g.m2.toLowerCase()), d: +g.d2 };
    hits.push({ ...h, at: x.index, end: x.index + x[0].length });
    if (hits.length === 2) break;
  }
  if (!hits.length) return null;
  const [a] = hits;
  let b = hits[1] || null;
  // Two dates are a range only when nothing but a joiner stands between them.
  if (b && !/^[\s,]*(?:-|–|—|→|\||to|until|till|through|al|bis|至|到|~)\s*(?:to\s*)?$/i.test(t.slice(a.end, b.at))) b = null;
  if (!b && /^\s*(?:-|–|—|→|until|till|through)\s*\S/i.test(t.slice(a.end, a.end + 12))) return null; // a range we cannot read
  // "16 - 22 Nov 2026": the first day has no month of its own.
  if (!b && /\d\s*(?:-|–|—|to)\s*$/i.test(t.slice(Math.max(0, a.at - 6), a.at))) return null;
  if (/(?:until|till|through|up to|bis|fino al)\s*$/i.test(t.slice(Math.max(0, a.at - 10), a.at))) return null; // an end, not a start
  if (usOrder && [a, b].some((h) => h?.num && h.d <= 12 && h.m <= 12)) return null;
  if (a.y == null && b?.y != null) a.y = b.m < a.m || (b.m === a.m && b.d < a.d) ? b.y - 1 : b.y;
  if (a.y == null || (b && b.y == null)) return null;
  const start = iso(a.y, a.m, a.d), end = b ? iso(b.y, b.m, b.d) : null;
  if (!start || (b && (!end || end < start))) return null;
  return { start, end, quote: t.slice(a.at, (b || a).end).trim() };
}

/** Page words only, so "A - B" and "A" + line break + "B" compare equal. */
const words = (s) => norm(s).replace(/[^\p{L}\p{N}]+/gu, " ").trim();

/** The text right after a title on the page, up to the next event's title. */
export function afterTitle(text, title, others = [], reach = 160) {
  const lines = plain(text).replace(/[‘’]/g, "'");
  const find = (s, from = 0) => {
    const w = words(s).split(" ").filter(Boolean).map((x) => x.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"));
    if (!w.length) return null;
    const re = new RegExp("(?<![\\p{L}\\p{N}])" + w.join("[^\\p{L}\\p{N}]+") + "(?![\\p{L}\\p{N}])", "giu");
    re.lastIndex = from;
    const m = re.exec(lines);
    return m ? { at: m.index, end: m.index + m[0].length } : null;
  };
  const out = [];
  for (let p = find(title); p && out.length < 8; p = find(title, p.end)) {
    let stop = p.end + reach;
    for (const o of [...others, title]) { const q = find(o, p.end); if (q && q.at < stop) stop = q.at; }
    out.push(lines.slice(p.end, stop));
  }
  return out;
}

/** "18:30", "6.30pm" or "6-8pm" in the quoted text supports the time. */
export function timeInText(time, text) {
  if (!isTime(time)) return false;
  const [h, mi] = time.split(":").map(Number);
  const t = String(text || "").toLowerCase();
  const h12 = h % 12 || 12, mm = String(mi).padStart(2, "0");
  if (new RegExp(`(^|\\D)0?${h}[:.h]${mm}(?!\\d)(?!\\s*pm)`).test(t) && !(h < 12 && new RegExp(`${h}[:.]${mm}\\s*(-|to|–)[^a]*pm`).test(t))) return true;
  const ap = h >= 12 ? "p\\.?m" : "a\\.?m";
  const clock = mi ? `${h12}[:.]${mm}` : `${h12}(?:[:.]00)?`;
  return new RegExp(`(^|[^\\d:.])${clock}\\s*(?:(?:-|–|—|to|until)\\s*\\d{1,2}(?:[:.]\\d\\d)?\\s*)?${ap}`).test(t);
}

/**
 * One AI event against the page it came from. Returns null when it must not
 * become a draft (title not on the page, or already over), otherwise the
 * draft fields, with every unsupported detail removed and flagged.
 */
export function checkEvent(e, text, { today, source = {}, pageUrl, others = [] }) {
  const page = norm(text);
  const flags = [];
  const flag = (field, message) => flags.push({ field, message });
  const has = (q) => !!q && norm(q).length > 1 && page.includes(norm(q));
  const title = String(e.title || "").replace(/\s+/g, " ").trim().slice(0, 200);
  const pageWords = ` ${words(page)} `;
  if (!words(title) || !pageWords.includes(` ${words(title)} `)) return null;

  // "Current and Upcoming" is on the page but is not a date.
  // Words elsewhere on the page may belong to a neighbouring event.
  const near = (q) => has(q) && !!words(q) && closeTo(pageWords, words(title), words(q));
  const dt = near(e.date_text) && /\d/.test(e.date_text) ? e.date_text : null;
  let start = e.start_date && dt && dateInText(e.start_date, dt, e.end_date) ? e.start_date : null;
  let end = e.end_date && dt && dateInText(e.end_date, dt, start) ? e.end_date : null;
  // What stands right beside the title, read by code, beats the AI's reading.
  const usOrder = ["New York", "Los Angeles", "Seattle"].includes(chapterFor(source.city)) || !source.city;
  const beside = afterTitle(text, title, others.filter((o) => words(o) !== words(title))).map((x) => readDates(x, { usOrder })).filter(Boolean);
  const agreed = beside.length && beside.every((x) => x.start === beside[0].start && x.end === beside[0].end) ? beside[0] : null;
  let quoted = dt;
  if (agreed) {
    if (start && (start !== agreed.start || (end || null) !== agreed.end)) flag("start_date", `The AI read ${start}${end ? ` to ${end}` : ""}, but beside the title the page says ${agreed.quote}.`);
    start = agreed.start; end = agreed.end; quoted = agreed.quote;
  }
  if (!agreed && e.start_date && !start) flag("start_date", "The AI read a start date the page does not clearly show.");
  else if (!start) flag("start_date", "No clear start date on the page.");
  if (!agreed && e.end_date && !end) flag("end_date", "The AI read an end date the page does not clearly show.");
  if (start && end && end < start) { flag("end_date", "End date was before the start date."); end = null; }
  const last = end || start;
  if (last && last < today) return null;
  // A start in the past with no end date: probably over, cannot tell.
  if (start && !end && start > today.replace(/^\d{4}/, (y) => +y + 2)) { flag("start_date", "Date is more than two years away."); }

  // A show that runs for days has opening hours, not a start time.
  const runs = !!(start && end && end !== start);
  const tt = !runs && near(e.time_text) ? e.time_text : null;
  const startTime = e.start_time && tt && timeInText(e.start_time, tt) ? e.start_time : null;
  const endTime = startTime && e.end_time && timeInText(e.end_time, tt) ? e.end_time : null;
  if (e.start_time && !startTime && !runs) flag("start_time", "The AI read a time the page does not clearly show.");

  const address = has(e.address) ? String(e.address).trim().slice(0, 300) : null;
  const city = has(e.city) ? e.city : null;
  let venue = near(e.venue) ? String(e.venue).trim().slice(0, 200) : null;
  // A bare city is not a venue.
  // ...nor is another event's title.
  if (venue && (others.some((o) => words(o) === words(venue)) || norm(venue) === norm(city) || CHAPTER_NAMES.some((c) => norm(c) === norm(venue)))) venue = null;
  let chapter = chapterFor(city) || chapterFor(address) || chapterFor(venue);
  if (!chapter && city) { chapter = "Other"; flag("chapter", `City on the page: ${city}. No matching chapter.`); }
  if (!chapter && source.city && singlePlace(source.city)) {
    chapter = chapterFor(source.city);
    if (chapter) flag("chapter", `City taken from the gallery's listing (${source.city}), not the page.`);
  }
  if (!chapter) flag("chapter", "City not clear. This gallery may have more than one location.");
  if (!venue && source.name) { venue = source.name; flag("venue", "Venue taken from the gallery's listing, not the page."); }

  const links = new Set([...String(text).matchAll(/\[(https?:[^\]]+)\]/g)].map((m) => m[1]));
  const booking = links.has(e.booking_url) ? e.booking_url : null;
  const detail = links.has(e.detail_url) && sameSiteSafe(e.detail_url, pageUrl) ? e.detail_url : null;
  const description = supportedText(e.description_text, page, title);
  for (const u of e.uncertain || []) if (["title", "start_date", "end_date", "city", "venue"].includes(u) && !flags.some((f) => f.field === u)) flag(u, "The AI was not sure about this.");

  return {
    title, description, start_date: start, end_date: end, start_time: startTime, end_time: endTime,
    timezone: CHAPTER_ZONES[chapter] || null,
    event_type: EVENT_TYPES.includes(e.event_type) ? e.event_type : "Exhibition",
    venue, address, chapter, organiser: has(e.organiser) ? String(e.organiser).trim().slice(0, 200) : source.name || null,
    booking_url: booking, source_url: detail || pageUrl, flags,
    evidence: { date_text: quoted, time_text: tt, city },
  };
}
/** Does `quote` appear within `reach` characters of some mention of `title`? */
export function closeTo(page, title, quote, reach = 500) {
  const at = (q) => { const o = []; for (let i = page.indexOf(q); i >= 0 && o.length < 60; i = page.indexOf(q, i + 1)) o.push(i); return o; };
  const ts = at(title), qs = at(quote);
  return ts.some((x) => qs.some((y) => (y >= x ? y - (x + title.length) : x - (y + quote.length)) <= reach));
}

/** The opening part of the AI's passage that really is on the page, by sentence. */
export function supportedText(text, page, title = "") {
  const s = String(text || "").replace(/\s+/g, " ").trim().slice(0, 1500);
  if (!s) return null;
  const parts = s.match(/[^.!?。]+[.!?。]*[”"')]*\s*/g) || [s];
  let kept = "";
  for (const p of parts) { if (!page.includes(norm(p))) break; kept += p; }
  kept = kept.trim();
  return kept.length >= 40 && norm(kept) !== norm(title) ? kept : null;
}
function sameSiteSafe(a, b) { try { return sameSite(a, b); } catch { return false; } }

/** Details from the event's own page fill gaps; the list page's facts stay. */
export function mergeDetail(base, more) {
  if (!more) return base;
  const out = { ...base, evidence: { ...base.evidence } };
  const runs = !!(base.start_date && base.end_date && base.end_date !== base.start_date);
  for (const k of ["description", "address", "booking_url", ...(runs ? [] : ["start_time", "end_time"])]) if (!out[k] && more[k]) out[k] = more[k];
  if (!out.start_date && more.start_date) { out.start_date = more.start_date; out.end_date = out.end_date || more.end_date; out.evidence.date_text = more.evidence.date_text; }
  if (!out.end_date && more.end_date && more.start_date === out.start_date) out.end_date = more.end_date;
  if (more.start_date && out.start_date && more.start_date !== out.start_date) {
    out.flags = [...out.flags, { field: "start_date", message: `The event's own page says ${more.start_date}.` }];
  }
  const guessed = out.flags.some((f) => f.field === "chapter");
  const moreSure = more.chapter && !more.flags.some((f) => f.field === "chapter");
  if (guessed && moreSure) { out.chapter = more.chapter; out.timezone = more.timezone; out.flags = out.flags.filter((f) => f.field !== "chapter"); }
  if (more.venue && !more.flags.some((f) => f.field === "venue") && out.flags.some((f) => f.field === "venue")) { out.venue = more.venue; out.flags = out.flags.filter((f) => f.field !== "venue"); }
  if (!runs && more.start_time && !out.evidence.time_text) out.evidence.time_text = more.evidence.time_text;
  // Flags about details the event's own page has now supplied.
  out.flags = out.flags.filter((f) => !(["start_date", "end_date", "start_time"].includes(f.field) && out[f.field] && !base[f.field]));
  return out;
}

export const matchKey = (title) => norm(title).replace(/[^\p{L}\p{N}]+/gu, " ").trim();

/**
 * What to do with a checked event: { action: "skip" | "draft" | "update", ... }.
 * `drafts`: earlier drafts of the same source. `events`: live events.
 */
export function classify(c, drafts, events, sourceName = "") {
  const key = matchKey(c.title);
  const mine = drafts.filter((d) => d.match_key === key);
  const sameDates = (d) => (d.start_date || null) === (c.start_date || null) && (d.end_date || null) === (c.end_date || null);
  if (mine.some(sameDates)) return { action: "skip", key };
  // Still open with other dates: admin is already looking at it; refresh only flags later.
  if (mine.some((d) => ["new", "checked", "changes", "awaiting_organiser"].includes(d.state))) return { action: "skip", key };
  const pub = mine.find((d) => d.state === "published" && d.event_id);
  // Only a real new date is an update; a date the page no longer shows is not.
  if (pub) return c.start_date ? { action: "update", key, update_of: pub.event_id } : { action: "skip", key };

  const day = (x) => (x ? String(x).slice(0, 10) : null);
  const dup = events.find((e) => {
    const k = matchKey(e.title);
    const alike = k === key || (Math.min(k.length, key.length) >= 8 && (k.includes(key) || key.includes(k)));
    if (!alike) return false;
    const place = [e.venue, e.organizer_name].map(norm).filter(Boolean);
    const near = place.some((p) => p === norm(c.venue) || p === norm(sourceName) || (p.length > 5 && norm(sourceName).includes(p)));
    const es = day(e.start_date), ee = day(e.end_date) || es;
    const overlap = !c.start_date || (es <= (c.end_date || c.start_date) && ee >= c.start_date);
    return overlap && (near || (k === key && day(e.start_date) === c.start_date));
  });
  return { action: "draft", key, duplicate_of: dup?.id || null };
}

/** Which Admin section a draft belongs in. */
export function draftSection(d, now = Date.now()) {
  if (d.state === "new" || d.state === "changes") {
    if (d.duplicate_of) return "duplicates";
    if (d.state === "changes" || d.update_of || (d.flags || []).length) return "checking";
    return "ready";
  }
  if (d.state === "awaiting_organiser") return "organiser";
  void now;
  return "history";
}

/** Days an organiser has had a draft without replying. */
export const daysWaiting = (d, now = Date.now()) => (d.admin_at ? Math.floor((now - new Date(d.admin_at).getTime()) / 86400000) : 0);

/* --------------------------------------------------------------- the email */

const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
const nice = (d) => (d ? new Date(d + "T12:00:00Z").toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric", timeZone: "UTC" }) : "date missing");
export const dateRange = (d) => (d.end_date && d.end_date !== d.start_date ? `${nice(d.start_date)} – ${nice(d.end_date)}` : nice(d.start_date));

/** Subject and HTML of the weekly report. Every page-supplied value is escaped. */
export function reportEmail({ run, drafts, siteUrl, trial, totalSources }) {
  const open = drafts.filter((d) => ["new", "changes"].includes(d.state));
  const by = (s) => open.filter((d) => draftSection(d) === s);
  const ready = by("ready"), check = by("checking"), dups = by("duplicates");
  const results = run.results || [];
  const problems = results.filter((r) => !["ok", "unchanged"].includes(r.status));
  const n = open.length;
  const subject = run.status === "failed" ? "The weekly event check did not finish · Art Future Club"
    : `${n} new event${n === 1 ? "" : "s"} to review · Art Future Club`;
  const link = (u, t) => (/^https?:\/\//i.test(u || "") ? `<a href="${esc(u)}" style="color:#0b63ce">${t}</a>` : "");
  const list = (rows, extra) => rows.slice(0, 10).map((d) => `<li style="margin:0 0 8px"><b>${esc(d.title)}</b>, ${esc(d.venue || "venue missing")}${d.chapter ? `, ${esc(d.chapter)}` : ""} · ${esc(dateRange(d))}${extra ? ` · <span style="color:#a35200">${esc(extra(d))}</span>` : ""} · ${link(d.source_url, "View source")}</li>`).join("") + (rows.length > 10 ? `<li>and ${rows.length - 10} more</li>` : "");
  const block = (h, inner) => (inner ? `<h3 style="margin:22px 0 8px;font-size:16px">${h}</h3><ul style="margin:0;padding-left:20px">${inner}</ul>` : "");
  const html = `<div style="font-family:Arial,sans-serif;font-size:15px;line-height:1.5;color:#1b1b1f;max-width:620px;margin:0 auto;padding:20px">
<p style="font-size:20px;font-weight:bold;margin:0 0 12px">Art Future Club</p>
${trial ? '<p style="background:#fff4d6;padding:10px 12px;margin:0 0 14px">Trial: nothing here is public.</p>' : ""}
<p>${run.status === "failed" ? "This week's event check stopped before it finished. What it found so far is below." : "This week's event check is finished."}</p>
<p><b>${results.length}</b>${totalSources && totalSources !== results.length ? ` of ${totalSources}` : ""} websites checked · <b>${n}</b> new · <b>${check.length}</b> need checking · <b>${dups.length}</b> possible duplicates</p>
${block("Ready to review", list(ready))}
${block("Needs checking", list(check, (d) => (d.note ? "change requested" : d.update_of ? "details changed on the website" : (d.flags || []).map((f) => f.field.replace(/_/g, " ")).filter((x, i, a) => a.indexOf(x) === i).join(", "))))}
${block("Possible duplicates", list(dups))}
${block("Couldn't check", problems.slice(0, 15).map((r) => `<li>${esc(r.name)} · ${esc(r.detail || r.status)}</li>`).join("") + (problems.length > 15 ? `<li>and ${problems.length - 15} more</li>` : ""))}
<p style="margin:26px 0"><a href="${esc(siteUrl)}/admin?tab=AI%20Events" style="background:#1b1b1f;color:#fff;padding:12px 22px;text-decoration:none">Review events</a></p>
<p style="color:#666;font-size:13px">AI cost: $${Number(run.cost_usd || 0).toFixed(3)}. Nothing is published until you approve it.</p></div>`;
  return { subject, html };
}
