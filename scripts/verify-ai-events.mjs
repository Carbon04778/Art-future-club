/**
 * Verifies the AI events check (C8): what the AI returns is checked against
 * the page, the weekly job is safe and restartable, the report email is
 * correct, and search/suggestions behave. No network, no database.
 *
 * Run: npm run verify:ai-events
 */
import { readFileSync } from "node:fs";
import * as A from "../src/lib/aiEvents.js";
import * as S from "../src/lib/eventSearch.js";
import { askAi, readSite, safeFetch, sendReport, startRun, stepRun } from "../api/_lib/aiEventsJob.js";
import handler from "../api/ai-events.js";

let pass = 0;
const fails = [];
const check = (n, c, d = "") => (c ? pass++ : fails.push(`${n}${d ? ` — ${d}` : ""}`));
const today = "2026-11-23";

/* ---- text, links, robots, addresses */
const html = `<html><script>evil()</script><nav><a href="/exhibitions">Exhibitions</a> <a href="/past-exhibitions">Past Exhibitions</a><a href="javascript:x()">j</a></nav>
<h2>Quiet &amp; Light</h2><p>5 December 2026 &#8211; 20 January 2027</p><p>Opening 6-8pm, Central, Hong Kong</p><a href="/e/quiet">More</a></html>`;
const t = A.pageText(html, "https://g.com/");
check("scripts are removed", !t.includes("evil"));
check("entities decoded", t.includes("Quiet & Light") && t.includes("–"));
check("links kept with full address", t.includes("[https://g.com/e/quiet]"));
check("javascript links dropped", !t.includes("javascript:"));
check("bad entity does not crash", A.decode("&#99999999999;").length > 0);
check("picks exhibitions, not past", A.eventPageLinks(html, "https://g.com/")[0] === "https://g.com/exhibitions" && !A.eventPageLinks(html, "https://g.com/").some((x) => /past/.test(x)));
check("never leaves the site", A.eventPageLinks('<a href="https://other.com/exhibitions">Exhibitions</a>', "https://g.com/").length === 0);
check("robots: disallow all", !A.robotsAllows("User-agent: *\nDisallow: /", "https://g.com/x"));
check("robots: allow beats on longer rule", A.robotsAllows("User-agent: *\nDisallow: /\nAllow: /ex", "https://g.com/ex/1"));
check("robots: another bot's rule ignored", A.robotsAllows("User-agent: BadBot\nDisallow: /", "https://g.com/"));
check("robots: wildcard and $", !A.robotsAllows("User-agent: *\nDisallow: /*.php$", "https://g.com/a.php") && A.robotsAllows("User-agent: *\nDisallow: /*.php$", "https://g.com/a.phpx"));
check("robots: our own group wins", !A.robotsAllows("User-agent: *\nAllow: /\n\nUser-agent: ArtFutureClub\nDisallow: /", "https://g.com/"));
check("robots: query rule", !A.robotsAllows("User-agent: *\nDisallow: /?s=", "https://g.com/?s=1"));
for (const ip of ["127.0.0.1", "10.1.1.1", "192.168.0.1", "172.20.0.1", "169.254.169.254", "0.0.0.0", "::1", "::", "fe80::1", "fd00::1", "::ffff:10.0.0.1", "::ffff:7f00:1", "100.64.0.1", "224.0.0.1", "64:ff9b::7f00:1"]) check(`private address refused: ${ip}`, A.isPrivateIp(ip));
for (const ip of ["8.8.8.8", "76.76.21.21", "2606:4700::1"]) check(`public address allowed: ${ip}`, !A.isPrivateIp(ip));

/* ---- dates and times must be on the page */
check("date range, year once", A.dateInText("2026-10-22", "22 Oct - 16 Nov 2026", "2026-11-16"));
check("range across years", A.dateInText("2026-10-22", "22 Oct 2026 - 16 Jan 2027", "2027-01-16") && A.dateInText("2027-01-16", "22 Oct 2026 - 16 Jan 2027", "2026-10-22"));
check("numeric date", A.dateInText("2026-10-16", "16.10.2026 | 30.01.2027"));
check("guessed year refused", !A.dateInText("2026-10-22", "22 Oct - 16 Nov"));
check("wrong day refused", !A.dateInText("2026-10-23", "22 Oct 2026"));
check("wrong month refused", !A.dateInText("2026-09-22", "22 October 2026"));
check("Italian month", A.dateInText("2026-01-15", "15 gennaio 2026"));
check("Chinese date", A.dateInText("2026-12-05", "2026年12月5日"));
check("impossible date refused", !A.dateInText("2026-02-31", "31 February 2026"));
for (const [x, s] of [["18:30", "6.30pm"], ["18:00", "6-8pm"], ["20:00", "6-8pm"], ["18:30", "18:30"], ["11:00", "11am"], ["14:00", "2 p.m."], ["18:00", "6:00 pm – 8:00 pm"]]) check(`time ${x} in "${s}"`, A.timeInText(x, s));
for (const [x, s] of [["06:00", "6pm"], ["18:00", "6am"], ["18:30", "6pm"], ["19:00", "6-8pm"], ["18:00", "open daily"]]) check(`time ${x} NOT in "${s}"`, !A.timeInText(x, s));

const rd = (s, o) => { const x = A.readDates(s, o); return x ? `${x.start}>${x.end}` : null; };
for (const [s, w] of [
  ["08.03.2026-21.02.2027", "2026-03-08>2027-02-21"], ["16.10.2026 | 30.01.2027", "2026-10-16>2027-01-30"],
  ["07/11/2026-30/11/2026", "2026-11-07>2026-11-30"], ["From September 17, 2026\n\u2192 January 30, 2027", "2026-09-17>2027-01-30"],
  ["22 Oct 2026 - 16 Jan 2027", "2026-10-22>2027-01-16"], ["9 October - 7 November 2026", "2026-10-09>2026-11-07"],
  ["19 December - 17 January 2027", "2026-12-19>2027-01-17"], ["5 December 2026", "2026-12-05>null"],
  ["2026\u5e7412\u67085\u65e5 \u81f3 2027\u5e741\u670820\u65e5", "2026-12-05>2027-01-20"], ["15 gennaio 2027", "2027-01-15>null"],
  ["4/06 - 9/07/2026", "2026-06-04>2026-07-09"], ["16 - 22 Nov 2026", null], ["until 30 Nov 2026", null], ["22 Oct - 16 Nov", null],
  ["31.02.2026", null], ["5 December 2026 - ongoing", null], ["Current and Upcoming", null], ["Tel 2522 1234", null], ["30 Nov 2026 - 1 Nov 2026", null], ["May Chen", null],
]) check(`reads "${s.replace(/\n/g, " ")}"`, rd(s) === w, String(rd(s)));
for (const [x, o, w] of [
  ["10.24 - 12.06.2026", {}, "2026-10-24>2026-12-06"], ["11.7 - 12.13. 2026", {}, "2026-11-07>2026-12-13"], ["10.31 - 12.27. 2026", {}, "2026-10-31>2026-12-27"],
  ["2026.12.01 \u2013 2027.04.05", {}, "2026-12-01>2027-04-05"], ["2026-12-01", {}, "2026-12-01>null"],
  ["10.5 - 12.6.2026", { order: "mdy" }, "2026-10-05>2026-12-06"], ["10.5 - 12.6.2026", { order: "dmy" }, "2026-05-10>2026-06-12"], ["10.5 - 12.6.2026", { order: "both" }, null],
]) check(`reads "${x}" ${JSON.stringify(o)}`, rd(x, o) === w, String(rd(x, o)));
check("order seen on the page", A.numericOrder("11.7 - 12.13. 2026") === "mdy" && A.numericOrder("08.03.2026-21.02.2027") === "dmy" && A.numericOrder("1.2") === null && A.numericOrder("21.2 and 2.21") === "both");
{
  const T3 = ["Alpha", "Beta", "Gamma"], D3 = [["2026-12-01", "2026-12-20"], ["2027-01-05", "2027-01-25"], ["2027-02-03", "2027-02-23"]];
  const line = (d) => d.map((x) => x.split("-").reverse().join(".")).join(" - ");
  const above = T3.map((t3, i) => `${line(D3[i])}\n${t3}`).join("\n"), below = T3.map((t3, i) => `${t3}\n${line(D3[i])}`).join("\n");
  const evs = T3.map((t3, i) => ({ ...base0(), title: t3, start_date: D3[i][0], end_date: D3[i][1], date_text: line(D3[i]) }));
  check("layout: dates above titles", A.pageLayout(evs, above, "Hong Kong") === "before");
  check("layout: dates below titles", A.pageLayout(evs, below, "Hong Kong") === "after");
  const run3 = (pg, list) => list.map((e) => A.checkEvent(e, pg, { today, source: { name: "G", city: "Hong Kong" }, pageUrl: "https://g.com/", others: T3, layout: A.pageLayout(list, pg, "Hong Kong") }));
  for (const [n, pg] of [["above", above], ["below", below]]) {
    check(`dates ${n}: each show keeps its own`, run3(pg, evs).every((x, i) => x.start_date === D3[i][0] && x.end_date === D3[i][1] && !x.flags.some((f) => f.field === "start_date")));
    const mixed = evs.map((e, i) => (i === 1 ? { ...e, start_date: D3[2][0], end_date: D3[2][1], date_text: line(D3[2]) } : e));
    const z = run3(pg, mixed);
    check(`dates ${n}: one AI mix-up is put right and flagged`, z[1].start_date === D3[1][0] && z[1].flags.some((f) => f.field === "start_date"));
    const gap = evs.map((e, i) => (i === 1 ? { ...e, start_date: null, end_date: null, date_text: null } : e));
    check(`dates ${n}: one AI gap is filled`, run3(pg, gap)[1].start_date === D3[1][0]);
  }
  const blank = evs.map((e) => ({ ...e, start_date: null, end_date: null, date_text: null }));
  check("layout unknown: a neighbour's date is never taken", run3(above, blank).every((x, i) => x.start_date === null || x.start_date === D3[i][0]));
}
check("order not shown anywhere: kept but marked", A.readDates("10.5.2027 - 12.6.2027").assumed === true && !A.readDates("10.5.2027 - 22.6.2027").assumed);
{
  const ck = (pg, x) => A.checkEvent({ ...base0(), title: "Show", ...x }, pg, { today, source: { name: "G", city: "Hong Kong" }, pageUrl: "https://g.com/" });
  let z = ck("Show\n10.12.2027 - 11.12.2027", { start_date: "2027-12-10", end_date: "2027-12-11", date_text: "10.12.2027 - 11.12.2027" });
  check("a date that reads two ways is flagged", z.flags.some((f) => /two ways/.test(f.message)));
  z = ck("Other\n11.7 - 12.13. 2026\nShow\nOpen\n10.12 - 12.5.2027", { start_date: "2027-12-10", end_date: "2027-05-12", date_text: "10.12 - 12.5.2027" });
  check("AI may not swap day and month against the page", z.start_date !== "2027-12-10", z.start_date);
  z = ck("Show\n08.03.2026-21.02.2027", { start_date: "2026-03-08", end_date: "2027-02-21", date_text: "08.03.2026-21.02.2027" });
  check("a clear range has no date flag", z.start_date === "2026-03-08" && !z.flags.some((f) => f.field === "start_date"));
}
check("05/06/2026 refused where the US order is possible", rd("05/06/2026", { usOrder: true }) === null && rd("25/06/2026", { usOrder: true }) === "2026-06-25>null");
const listPage = "One\n01.12.2026-02.12.2026\nTwo\nThree\n05.12.2026-06.12.2026";
check("a title without a date does not take the next one's", A.readDates(A.afterTitle(listPage, "Two", ["One", "Three"])[0] || "") === null && A.readDates(A.afterTitle(listPage, "Three", ["One", "Two"])[0]).start === "2026-12-05");
const LT = "THOMAS\nCAMERON\nURBAN SOLITUDE\n07/11/2026-30/11/2026";
const lt = A.checkEvent({ ...base0(), title: "THOMAS CAMERON - URBAN SOLITUDE", date_text: "07/11/2026-30/11/2026", start_date: "2026-11-07", end_date: "2026-11-30" }, LT, { today, source: { name: "LT", city: "Milano" }, pageUrl: "https://l.it/" });
check("title joined across lines is found", lt?.start_date === "2026-11-07" && lt.end_date === "2026-11-30");
const wrong = A.checkEvent({ ...base0(), title: "URBAN SOLITUDE", date_text: null, start_date: "2026-12-01", end_date: null }, LT, { today, source: { name: "LT", city: "Milano" }, pageUrl: "https://l.it/" });
check("AI date wrong: the page's own date is used", wrong?.start_date === "2026-11-07");
check("AI missed that it is over: code still drops it", A.checkEvent({ ...base0(), title: "Gone", start_date: null, end_date: null, date_text: null }, "Gone\n01.10.2026-02.11.2026", { today, source: { name: "G", city: "Hong Kong" }, pageUrl: "https://l.it/" }) === null);
function base0() { return { event_type: "Exhibition", start_time: null, end_time: null, time_text: null, venue: null, address: null, city: null, organiser: null, booking_url: null, detail_url: null, description_text: null, uncertain: [] }; }

/* ---- checkEvent */
const base = { title: "Quiet & Light", event_type: "Opening", start_date: "2026-12-05", end_date: "2027-01-20", date_text: "5 December 2026 – 20 January 2027", start_time: "18:00", end_time: "20:00", time_text: "Opening 6-8pm", venue: null, address: null, city: "Hong Kong", organiser: null, booking_url: null, detail_url: "https://g.com/e/quiet", description_text: null, uncertain: [] };
const opt = { today, source: { name: "Gee", city: "Hong Kong" }, pageUrl: "https://g.com/exhibitions" };
const ev = (x = {}, o = {}) => A.checkEvent({ ...base, ...x }, t, { ...opt, ...o });
const oneDay = { title: "Day", end_date: null, date_text: "5 December 2026" };
const dayPage = "Day\n5 December 2026\nOpening 6-8pm, Central, Hong Kong [https://g.com/e/quiet]";
const day = (x = {}, o = {}) => A.checkEvent({ ...base, ...oneDay, ...x }, dayPage, { ...opt, ...o });
let c = day();
check("a show running for weeks gets no time (opening hours)", ev().start_time === null);
check("words that are not a date are not evidence", A.checkEvent({ ...base, date_text: "Opening" }, "Quiet & Light Opening soon", opt).evidence.date_text === null);
check("supported event kept whole", c.start_date === "2026-12-05" && ev().end_date === "2027-01-20" && c.start_time === "18:00" && c.end_time === "20:00" && c.chapter === "Hong Kong" && c.timezone === "Asia/Hong_Kong" && c.source_url === "https://g.com/e/quiet");
check("invented title refused", ev({ title: "Not there" }) === null);
check("ended event refused", A.checkEvent({ ...base, title: "Old", start_date: "2026-10-09", end_date: "2026-11-07", date_text: "9 October - 7 November 2026" }, "Old 9 October - 7 November 2026", opt) === null);
check("ends today is kept", !!A.checkEvent({ ...base, title: "Old", start_date: "2026-10-09", end_date: "2026-11-23", date_text: "9 October - 23 November 2026" }, "Old 9 October - 23 November 2026", opt));
const two = "Show A\n1 December 2026 - 1 January 2027\nNorth Hall\n" + "filler words here. ".repeat(60) + "\nShow B\nongoing";
c = A.checkEvent({ ...base, title: "Show B", start_date: "2026-12-01", end_date: "2027-01-01", date_text: "1 December 2026 - 1 January 2027", venue: "North Hall", city: null }, two, opt);
check("a neighbour's date and venue are not borrowed", c.start_date === null && c.venue === "Gee");
c = A.checkEvent({ ...base, title: "Show A", start_date: "2026-12-01", end_date: "2027-01-01", date_text: "1 December 2026 - 1 January 2027", venue: "North Hall", city: null }, two, opt);
check("its own date and venue are kept", c.start_date === "2026-12-01" && c.venue === "North Hall");
check("a bare city is not a venue", ev({ venue: "Hong Kong" }).venue === "Gee");
c = A.checkEvent({ ...base, date_text: "1 May 2026" }, "Quiet & Light\nSoon", opt);
check("date with invented evidence removed and flagged", c.start_date === null && c.flags.some((f) => f.field === "start_date"));
c = day({ start_time: "17:00" });
check("invented time removed and flagged", c.start_time === null && c.end_time === null && c.flags.some((f) => f.field === "start_time"));
check("invented address removed", ev({ address: "1 Fake Street" }).address === null);
check("invented booking link removed", ev({ booking_url: "https://tickets.com/x" }).booking_url === null);
check("detail link on another site ignored", A.checkEvent({ ...base, detail_url: "https://evil.com/a" }, t + " [https://evil.com/a]", opt).source_url === opt.pageUrl);
c = ev({ city: null }, { source: { name: "AV", city: "Hong Kong, Belgium" } });
check("several cities: never guessed", c.chapter === null && c.flags.some((f) => f.field === "chapter"));
c = ev({ city: null });
check("one city: from listing, and flagged", c.chapter === "Hong Kong" && c.flags.some((f) => /listing/.test(f.message)));
check("invented description removed", ev({ description_text: "Lovely show" }).description === null);
check("London show at a Hong Kong gallery goes to London", A.checkEvent({ ...base, city: "London" }, t + " London", opt).chapter === "London");
const P = A.norm("The show brings together twelve new paintings. It is free.");
check("description from page kept", A.supportedText("The show brings together twelve new paintings. It is free.", P) !== null);
check("description stops where the AI starts inventing", A.supportedText("The show brings together twelve new paintings. A must see!", P) === "The show brings together twelve new paintings.");
check("a title is not a description", A.supportedText("It is free.", P) === null);

/* ---- detail merge */
const gap = { ...day({ start_time: null, end_time: null, city: null }, { source: { name: "AV", city: "Hong Kong, Belgium" } }) };
const merged = A.mergeDetail(gap, day());
check("detail page fills time and city, clears flag", merged.start_time === "18:00" && merged.chapter === "Hong Kong" && !merged.flags.some((f) => f.field === "chapter"));
check("detail page that disagrees is flagged, not obeyed", A.mergeDetail(ev(), { ...ev(), start_date: "2026-12-06" }).start_date === "2026-12-05" && A.mergeDetail(ev(), { ...ev(), start_date: "2026-12-06" }).flags.some((f) => /own page/.test(f.message)));

/* ---- duplicates, updates */
const d0 = ev();
check("new event is a draft", A.classify(d0, [], []).action === "draft");
const key = A.matchKey(d0.title);
const dr = (x) => ({ match_key: key, start_date: d0.start_date, end_date: d0.end_date, state: "new", ...x });
check("same draft not repeated", A.classify(d0, [dr()], []).action === "skip");
check("rejected, same dates: not suggested again", A.classify(d0, [dr({ state: "rejected" })], []).action === "skip");
check("rejected, new dates: suggested again", A.classify(d0, [dr({ state: "rejected", start_date: "2026-01-01" })], []).action === "draft");
check("published, dates changed: update for review", A.classify(d0, [dr({ state: "published", event_id: "e1", start_date: "2026-12-01" })], []).update_of === "e1");
check("open draft is not doubled", A.classify(d0, [dr({ start_date: "2026-12-01" })], []).action === "skip");
const live = { id: "L", title: "Quiet & Light", venue: "Gee", start_date: "2026-12-05T10:00:00Z", end_date: "2027-01-20T10:00:00Z" };
check("already on the site: flagged duplicate", A.classify(d0, [], [live], "Gee").duplicate_of === "L");
check("same title, other place and time: not a duplicate", A.classify(d0, [], [{ ...live, venue: "Zed", start_date: "2026-11-30T10:00:00Z" }], "Gee").duplicate_of === null);
check("same place, long over: not a duplicate", A.classify(d0, [], [{ ...live, start_date: "2025-01-01T10:00:00Z", end_date: "2025-02-01T10:00:00Z" }], "Gee").duplicate_of === null);
check("sections", A.draftSection({ state: "new", flags: [] }) === "ready" && A.draftSection({ state: "new", flags: [1] }) === "checking" && A.draftSection({ state: "new", duplicate_of: "x" }) === "duplicates" && A.draftSection({ state: "published" }) === "history" && A.draftSection({ state: "awaiting_organiser" }) === "organiser");

/* ---- reader safety */
const resp = (status, body = "", headers = {}) => new Response(body, { status, headers: { "content-type": "text/html", ...headers } });
const refuse = async (n, url, o) => { let e = null; try { await safeFetch(url, o); } catch (x) { e = x; } check(n, !!e, "was not refused"); };
const pub = async () => [{ address: "93.184.216.34" }];
await refuse("internal address refused", "http://intranet.local/", { resolve: async () => [{ address: "10.0.0.1" }], fetchImpl: async () => resp(200) });
await refuse("one private answer among public refused", "http://mixed.com/", { resolve: async () => [{ address: "8.8.8.8" }, { address: "127.0.0.1" }], fetchImpl: async () => resp(200) });
await refuse("redirect to internal refused", "http://a.com/", { resolve: async (h) => [{ address: h === "a.com" ? "8.8.8.8" : "169.254.169.254" }], fetchImpl: async () => new Response(null, { status: 302, headers: { location: "http://meta.internal/" } }) });
await refuse("odd port refused", "http://a.com:8080/", { resolve: pub, fetchImpl: async () => resp(200) });
await refuse("file address refused", "file:///etc/passwd", { resolve: pub, fetchImpl: async () => resp(200) });
await refuse("endless redirects stop", "http://a.com/", { resolve: pub, fetchImpl: async () => new Response(null, { status: 302, headers: { location: "http://a.com/" } }) });
check("a PDF is not read as a page", (await safeFetch("http://a.com/x", { resolve: pub, fetchImpl: async () => resp(200, "x", { "content-type": "application/pdf" }) })).status === 415);

/* ---- readSite */
const long = "<p>" + "About the gallery and its programme. ".repeat(20) + "</p>";
const site = { "https://g.com/robots.txt": [404, ""], "https://g.com/": [200, html + long], "https://g.com/exhibitions": [200, html + long], "https://g.com/e/quiet": [200, html + long + '<meta property="og:image" content="/i.jpg">'] };
const getter = (m = {}) => async (u) => { const r = { ...site, ...m }[u]; if (!r) return { status: 404, url: u, body: "" }; if (r instanceof Error) throw r; return { status: r[0], url: u, body: r[1] }; };
const ai = async () => ({ events: [base, { ...base, title: "Invented Show" }], cost: 0.001 });
const src = { id: "s1", name: "Gee", url: "https://g.com/", city: "Hong Kong" };
const rs = (m, x = {}) => readSite({ ...src, ...x }, { key: "k", today, get: getter(m), ai, pause: 0 });
let r = await rs();
check("site read: one real event, invented one dropped", r.status === "ok" && r.events.length === 1 && r.events[0].title === "Quiet & Light", JSON.stringify(r).slice(0, 150));
check("event's own page read, picture found", r.events[0].image_url === "https://g.com/i.jpg" && Math.abs(r.cost - 0.002) < 1e-9);
check("unchanged page costs nothing", (await rs({}, { last_hash: r.hash })).status === "unchanged" && (await rs({}, { last_hash: r.hash })).cost === 0);
check("robots respected", (await rs({ "https://g.com/robots.txt": [200, "User-agent: *\nDisallow: /"] })).status === "robots");
check("blocked site reported", (await rs({ "https://g.com/": [403, ""] })).status === "blocked");
check("page needing a browser reported", (await rs({ "https://g.com/": [200, "<div id=app></div>"], "https://g.com/exhibitions": [200, ""] })).status === "empty");
check("AI failure is reported, not thrown", (await readSite(src, { key: "k", today, get: getter(), ai: async () => { throw new Error("AI service error 401"); }, pause: 0 })).status === "error");
{
  let n = 0;
  const busy = async () => (++n < 3 ? new Response("{}", { status: 429, headers: { "retry-after": "0.01" } }) : new Response(JSON.stringify({ usage: {}, choices: [{ finish_reason: "stop", message: { content: "{\"events\":[]}" } }] })));
  check("AI says too fast: waits and carries on", (await askAi("k", "n", "u", "t", today, busy)).events.length === 0 && n === 3);
  let k = 0;
  let e1 = null; try { await askAi("k", "n", "u", "t", today, async () => { k++; return new Response("{}", { status: 401 }); }); } catch (e) { e1 = e; }
  check("wrong key: stops at once, not retried", k === 1 && /401/.test(e1.message));
}
let asked = 0;
const forgets = async () => (asked++ === 0 ? { events: [], cost: 0.001 } : ai());
check("AI overlooked the page: asked once more", (await readSite(src, { key: "k", today, get: getter(), ai: forgets, pause: 0 })).events.length === 1);
const none = await readSite(src, { key: "k", today, get: getter(), ai: async () => ({ events: [], cost: 0 }), pause: 0 });
check("nothing found: page is read again next week", none.status === "ok" && none.partial === true);
let tries = 0;
const flaky = async (u) => { if (u === "https://g.com/" && tries++ === 0) throw new TypeError("fetch failed"); return getter()(u); };
check("a dropped connection is tried again", (await readSite(src, { key: "k", today, get: flaky, ai, pause: 0 })).status === "ok" && tries === 2);

/* ---- the run, on a small in-memory database */
function memDb() {
  const T = { collector_profile: [], ai_event_run: [], ai_event_source: [], ai_event_draft: [], event: [], ai_event_settings: [{ id: true, trial_mode: true, schedule_on: true, report_emails: ["j@x.com"] }] };
  let n = 0;
  const q = (s) => {
    const [tb, qs = ""] = s.split("?");
    const p = new URLSearchParams(qs);
    let rows = T[tb];
    for (const [k, v] of p) { const m = /^(eq|is)\.(.*)$/.exec(v); if (m) rows = rows.filter((x) => String(x[k]) === m[2]); }
    if (/locked_until/.test(p.get("or") || "")) rows = rows.filter((x) => !x.locked_until || x.locked_until < new Date().toISOString());
    if (Number(p.get("offset")) > 0) rows = [];
    return rows;
  };
  return { T, writes: [], get: async (s) => structuredClone(q(s)), insert: async (tb, row) => { const x = { id: `${tb}${++n}`, ...row }; if (tb === "ai_event_run") Object.assign(x, { status: "running", started_at: new Date().toISOString(), results: [], cost_usd: 0 }); if (tb === "ai_event_draft") x.state = "new"; T[tb].push(x); return structuredClone(x); }, update: async (s, row) => { const rows = q(s); rows.forEach((x) => Object.assign(x, row)); return structuredClone(rows); } };
}
let db = memDb();
for (let i = 0; i < 9; i++) db.T.ai_event_source.push({ id: `s${i}`, name: `G${i}`, url: `https://g${i}.com/`, active: i !== 8, listing_id: null });
const one = ev();
let reads = 0;
const reader = async (s) => { reads++; return s.id === "s3" ? { status: "blocked", detail: "blocked (403)", events: [], cost: 0 } : { status: "ok", detail: "", hash: "h", events: [{ ...one, title: `Show at ${s.id}`, source_url: `${s.url}x` }], cost: 0.001 }; };
const mails = [];
const cfg = { key: "k", reader, today, deadline: Date.now() + 5000, resendKey: "r", from: "AFC <a@b.com>", siteUrl: "https://x.com", mail: async (u, o) => { mails.push(o); return new Response("{}"); } };
await startRun(db, "schedule");
check("a second start does not begin another check", (await startRun(db, "manual")).started === false && db.T.ai_event_run.length === 1);
let p = await stepRun(db, { ...cfg, deadline: 0 });
check("out of time: not done, nothing lost", p.done === false && p.total === 8 && p.checked === 0);
p = await stepRun(db, cfg);
check("continues and finishes; paused site skipped", p.done && p.checked === 8 && reads === 8);
check("one draft per site, none public", db.T.ai_event_draft.length === 7 && db.T.event.length === 0);
check("cost added up", Math.abs(db.T.ai_event_run[0].cost_usd - 0.007) < 1e-9);
check("one email sent, with a once-only key", mails.length === 1 && mails[0].headers["Idempotency-Key"].includes(db.T.ai_event_run[0].id) && !!db.T.ai_event_run[0].report_sent_at);
check("blocked site not marked as read", !db.T.ai_event_source[3].last_hash && db.T.ai_event_source[0].last_hash === "h");
check("finished: another step does nothing", (await stepRun(db, cfg)).done && mails.length === 1);
await startRun(db, "manual"); await stepRun(db, cfg);
check("next week: nothing repeated", db.T.ai_event_draft.length === 7);
db.T.ai_event_run.push({ id: "old", status: "running", started_at: "2020-01-01T00:00:00Z", source_ids: [], results: [] });
check("a dead check does not block the next", (await startRun(db, "schedule")).started === true && db.T.ai_event_run.find((x) => x.id === "old").status === "failed");
check("no email set up: says so, does not crash", (await sendReport(db, db.T.ai_event_run[0], { ...cfg, resendKey: "" })) === false && /not set up/.test(db.T.ai_event_run[0].report_error));

/* ---- email */
const m = A.reportEmail({ run: { status: "done", results: [{ name: "<b>G</b>", status: "blocked", detail: "blocked (403)" }], cost_usd: 0.0075 }, drafts: [{ ...one, state: "new", title: "<img src=x onerror=1>", flags: [], source_url: "javascript:alert(1)" }, ...Array.from({ length: 13 }, (_, i) => ({ ...one, title: `T${i}`, state: "new", flags: [] }))], siteUrl: "https://x.com", trial: true });
check("email: subject counts", m.subject.startsWith("14 new events"));
check("email: page text cannot inject HTML", !m.html.includes("<img") && !m.html.includes("<b>G</b>") && !m.html.includes("javascript:"));
check("email: 10 then 'and 4 more'", m.html.includes("and 4 more"));
check("email: couldn't check, trial note, review link, no approve link", /Couldn't check/.test(m.html) && /Trial/.test(m.html) && m.html.includes("/admin?tab=AI%20Events") && !/approve=/.test(m.html));
check("email: zero events still says so", A.reportEmail({ run: { status: "done", results: [] }, drafts: [], siteUrl: "https://x.com" }).subject.startsWith("0 new events"));
check("email: failed run says so", /did not finish/.test(A.reportEmail({ run: { status: "failed", results: [] }, drafts: [], siteUrl: "https://x.com" }).subject));

/* ---- who may call the endpoint */
const call = async (req) => { const res = { headers: {}, setHeader() {}, end(b) { this.body = b; } }; await handler({ headers: {}, url: "/api/ai-events", ...req }, res); return res.statusCode; };
delete process.env.SUPABASE_SERVICE_ROLE_KEY; delete process.env.MISTRAL_API_KEY; // vite-node loads .env
process.env.CRON_SECRET = "s3cret"; process.env.VITE_SUPABASE_URL = "https://db.test"; process.env.VITE_SUPABASE_ANON_KEY = "a";
const realFetch = globalThis.fetch;
globalThis.fetch = async () => new Response("false");
check("schedule without the secret refused", (await call({ method: "GET" })) === 401);
check("schedule with a wrong secret refused", (await call({ method: "GET", headers: { authorization: "Bearer nope" } })) === 401);
check("not signed in refused", (await call({ method: "POST" })) === 403);
check("signed in but not admin refused", (await call({ method: "POST", headers: { authorization: "Bearer x" } })) === 403);
check("missing keys say what is missing", (await call({ method: "GET", headers: { authorization: "Bearer s3cret" } })) === 503);
delete process.env.CRON_SECRET;
check("no secret configured: closed, not open", (await call({ method: "GET", headers: { authorization: "Bearer " } })) === 401);
globalThis.fetch = realFetch;

/* ---- search */
const now = new Date(2026, 10, 25, 12); // Wednesday
const q = (s) => S.parseEventQuery(s, now);
let x = q("painting workshops near me this weekend");
check("Julie's example understood", x.type === "Workshop" && x.near && x.when === "this weekend" && x.words.join() === "painting" && x.from.getDate() === 28 && x.to.getDate() === 30);
x = S.parseEventQuery("this weekend", new Date(2026, 10, 29, 12));
check("on Sunday, this weekend is today", x.from.getDate() === 29 && x.to.getDate() === 30);
x = S.parseEventQuery("next weekend", new Date(2026, 10, 29, 12));
check("on Sunday, next weekend is the coming one", x.from.getDate() === 5 && x.to.getDate() === 7);
check("city and free", q("free talks in hong kong").city === "Hong Kong" && q("free talks in hong kong").free && q("free talks in hong kong").type === "Talk");
check("month", q("exhibitions in january").from.getFullYear() === 2027);
check("'may' alone is not a month", q("may chen").from === null);
check("symbols do not crash", q("((*[\\ +?").words.length === 0 || true);
const E = [
  { id: 1, title: "Painting for all", event_type: "Workshop", chapter: "Hong Kong", start_date: new Date(2026, 10, 28, 15).toISOString(), geo_lat: 22.28, geo_lng: 114.16, is_free: true },
  { id: 2, title: "Long show", event_type: "Exhibition", chapter: "London", start_date: "2026-10-01T10:00:00Z", end_date: "2027-01-10T10:00:00Z", venue: "MDC", organizer_name: "MDC" },
  { id: 3, title: "Over", event_type: "Exhibition", chapter: "Hong Kong", start_date: "2026-01-01T10:00:00Z", end_date: "2026-02-01T10:00:00Z" },
];
const ids = (s, near) => E.filter(S.matchEvents(q(s), near, now)).map((e) => e.id).join();
check("finds the workshop", ids("painting workshops near me this weekend", { chapter: "Hong Kong" }) === "1");
check("near me elsewhere finds none", ids("painting workshops near me", { lat: 51.5, lng: -0.1 }) === "");
check("near me by position", ids("workshops near me", { lat: 22.3, lng: 114.17 }) === "1");
check("a long exhibition is on this weekend", ids("exhibitions this weekend") === "2");
check("finished events not offered", !ids("exhibitions").includes("3"));
check("empty search shows everything", ids("") === "1,2,3");
const rec = S.recommendEvents(E, { followedNames: ["MDC"], chapter: "Hong Kong", interests: ["Painting"] }, now);
check("suggestions: followed first, with reasons, none finished", rec[0].event.id === 2 && /follow/.test(rec[0].why[0]) && rec[1].event.id === 1 && rec.length === 2);
check("no signals, no suggestions", S.recommendEvents(E, {}, now).length === 0);
check("short names do not match inside words", S.recommendEvents([{ ...E[1], title: "Anna's", organizer_name: "X", venue: "X" }], { followedNames: ["nna's"] }, now).length === 0);

/* ---- wiring */
const s = (f) => readFileSync(new URL(`../${f}`, import.meta.url), "utf8");
check("eight weekly calls scheduled, first starts, last ends", (() => { const c = JSON.parse(s("vercel.json")).crons; return c.length === 8 && /step=start/.test(c[0].path) && /step=last/.test(c[7].path); })());

/* ---- shared websites, other cities, twins, the lock */
check("same website, however written", A.siteKey("https://www.massimodecarlo.com/") === A.siteKey("http://massimodecarlo.com") && A.siteKey("https://a.com/hk") !== A.siteKey("https://a.com/london") && A.siteKey("junk") === "");
check("social pages are not gallery websites", A.isSocial("https://www.instagram.com/x") && A.isSocial("https://linktr.ee/x") && !A.isSocial("https://gagosian.com/"));
check("listing fits its city", A.listingFits("Hong Kong", "Hong Kong") && !A.listingFits("Hong Kong", "London") && A.listingFits("Hong Kong, Belgium", "Hong Kong") && A.listingFits("Hong Kong, Belgium", "Other") && !A.listingFits("", "London"));
const HK = { id: "hk", display_name: "MDC", based_in: "Hong Kong" }, MI = { id: "mi", display_name: "MDC (Milan)", based_in: "Milano" };
const pd = (chapter, src, ls, x = {}) => A.placeDraft({ chapter, venue: src.name, organiser: src.name, evidence: { city: chapter }, flags: [{ field: "venue", message: "Venue taken from the gallery's listing, not the page." }], ...x }, src, ls);
let q1 = pd("Hong Kong", { listing_id: "mi", name: "MDC (Milan)" }, [MI, HK]);
check("Hong Kong show read through Milan goes to Hong Kong", q1.listing_id === "hk" && q1.organiser === "MDC" && q1.venue === "MDC" && q1.flags.every((f) => f.soft));
q1 = pd("London", { listing_id: "mi", name: "MDC (Milan)" }, [MI, HK]);
check("London show: linked to neither, flagged, name without the city", q1.listing_id === null && q1.organiser === "MDC" && q1.venue === "MDC" && q1.flags.some((f) => f.field === "listing"));
q1 = pd("London", { listing_id: "hk", name: "MDC" }, [{ ...HK, user_id: "u" }]);
check("London show of a claimed gallery: its owner still approves", q1.listing_id === "hk" && q1.flags.some((f) => /owner/.test(f.message)));
q1 = pd("Other", { listing_id: "av", name: "AV" }, [{ id: "av", display_name: "AV", based_in: "Hong Kong, Belgium" }]);
check("gallery with two places keeps its listing", q1.listing_id === "av" && !q1.flags.some((f) => f.field === "listing"));
check("no city: stays with its own listing", pd(null, { listing_id: "hk", name: "MDC" }, [HK]).listing_id === "hk");
check("website added by hand has no listing", pd("London", { listing_id: null, name: "X" }, []).listing_id === null);
check("a venue from a fitting listing alone is ready to review", A.draftSection({ state: "new", flags: [{ field: "venue", soft: true }] }) === "ready");
const day2 = (x = {}, o = {}) => A.checkEvent({ ...base, ...oneDay, ...x }, "Day\n5 December 2026\nOpening 6-8pm, Central, Hong Kong", { ...opt, ...o });
check("no city doubt when the page supports it, whatever the AI says", !day2({ uncertain: ["city", "venue"] }).flags.some((f) => f.field === "city"));
check("city far from the event is flagged", A.checkEvent({ ...base, ...oneDay, city: "London" }, "Day\n5 December 2026\n" + "words here. ".repeat(80) + "London", { ...opt, source: { name: "G", city: "Hong Kong" } }).flags.some((f) => f.field === "city"));
check("same show on another website is noted", A.classify(d0, [], [], "Gee", [dr()]).twin && !A.classify(d0, [], [], "Gee", [dr({ start_date: "2026-01-01" })]).twin);
{
  const d2 = memDb();
  d2.T.collector_profile.push({ ...HK, website: "https://www.mdc.com/" }, { ...MI, website: "https://mdc.com" });
  d2.T.ai_event_source.push({ id: "a", name: "MDC", url: "https://www.mdc.com/", active: true, listing_id: "hk" }, { id: "b", name: "MDC (Milan)", url: "https://mdc.com", active: true, listing_id: "mi" });
  let n = 0;
  const rd2 = async () => { n++; return { status: "ok", detail: "", hash: "h", cost: 0.001, events: [{ ...one, title: "Milan show", chapter: "Milano", source_url: "https://mdc.com/m" }, { ...one, title: "London show", chapter: "London", source_url: "https://mdc.com/l" }] }; };
  await startRun(d2, "manual");
  await stepRun(d2, { ...cfg, reader: rd2 });
  const by = (t) => d2.T.ai_event_draft.find((x) => x.title === t);
  check("shared website is read once", n === 1 && d2.T.ai_event_run[0].results.find((x) => x.source_id === "b").status === "shared");
  check("each show once, with the right listing", d2.T.ai_event_draft.length === 2 && by("Milan show").listing_id === "mi" && by("London show").listing_id === null);
  d2.T.ai_event_source[0].active = false;
  await startRun(d2, "manual");
  await stepRun(d2, { ...cfg, reader: rd2 });
  check("read later through the other listing: still no repeats", d2.T.ai_event_draft.length === 2 && n === 2);
  const d3 = memDb();
  for (let i = 0; i < 6; i++) d3.T.ai_event_source.push({ id: `x${i}`, name: `X${i}`, url: `https://x${i}.com`, active: true, listing_id: null });
  let m3 = 0;
  const slow = async (z) => { m3++; await new Promise((r) => setTimeout(r, 30)); return { status: "ok", detail: "", hash: "h", events: [{ ...one, title: `Slow ${z.id}` }], cost: 0 }; };
  await startRun(d3, "manual");
  const both = await Promise.all([stepRun(d3, { ...cfg, reader: slow }), stepRun(d3, { ...cfg, reader: slow })]);
  check("two checks at once: one works, one waits, nothing lost", m3 === 6 && both.filter((x) => x.busy).length === 1 && both.filter((x) => x.done).length === 1 && d3.T.ai_event_run[0].results.length === 6 && d3.T.ai_event_draft.length === 6);
  const d4 = memDb();
  d4.T.ai_event_source.push({ id: "y", name: "Y", url: "https://y.com", active: true });
  await startRun(d4, "manual");
  d4.T.ai_event_run[0].locked_until = "2020-01-01T00:00:00Z";
  check("a dead check's lock frees itself", (await stepRun(d4, { ...cfg, reader: slow })).done === true);
}
check("the AI key is never in browser code", !/MISTRAL|SERVICE_ROLE/.test(s("src/api/providers/supabase.js") + s("src/components/AdminAiEventsPanel.jsx") + s("src/lib/aiEvents.js")));
check("job never writes public events", !/(insert|update)\(\s*[`"']event[?"'`]/.test(s("api/_lib/aiEventsJob.js")));
check("migration starts with trial on and schedule off", /trial_mode\s+boolean not null default true/.test(s("supabase/migrations/034_ai_events.sql")) && /schedule_on\s+boolean not null default false/.test(s("supabase/migrations/034_ai_events.sql")));

console.log(`verify:ai-events — ${pass} passed, ${fails.length} failed`);
if (fails.length) { for (const f of fails) console.log("  ✗", f); process.exit(1); }
process.exit(0);
