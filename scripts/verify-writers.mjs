/**
 * Verifies writer links (B3 in docs/CLIENT-REQUESTS.md): bylines link to the
 * writer, every spelling of a writer's name reaches the same writer, and
 * artist pages list what that artist wrote.
 *
 * Run: npm run verify:writers
 */

import { readFileSync } from "node:fs";
import {
  writerKey, writerPath, slugMatchesWriter, displayNameFor, articlesBy, artistForWriter, bylineHref,
} from "../src/lib/writers.js";

let pass = 0;
const failures = [];
const check = (name, cond, detail = "") => (cond ? pass++ : failures.push(`${name}${detail ? ` — ${detail}` : ""}`));

// --- every real spelling found in the data (2026-10-19) reaches one writer -----
const same = (a, b) => writerKey(a) === writerKey(b);
check("trailing space ignored", same("Benedetta Barzaghi", "Benedetta Barzaghi "));
check("surname-first matches", same("Benedetta Barzaghi", "Barzaghi Benedetta"));
check("case ignored", same("rachel mitchell", "Rachel Mitchell "));
check("curly and straight apostrophes match", same("Nicola O’Hara", "Nicola O'Hara"));
check("hyphenated names keep working", same("Erynne Byrd-Quigtar", "erynne byrd-quigtar"));
check("different writers stay different", !same("Saskia Key", "Julie Petris"));
check("an empty name has no key", writerKey("   ") === "");

// --- writer page addresses ---------------------------------------------------------
check("writer page address", writerPath("Benedetta Barzaghi ") === "/editorial/writer/benedetta-barzaghi", writerPath("Benedetta Barzaghi "));
check("the page finds the usual spelling", slugMatchesWriter("benedetta-barzaghi", "Benedetta Barzaghi"));
check("the page finds the surname-first spelling", slugMatchesWriter("benedetta-barzaghi", "Barzaghi Benedetta"));
check("a surname-first link still finds them", slugMatchesWriter("barzaghi-benedetta", "Benedetta Barzaghi"));
check("the page finds an apostrophe name", slugMatchesWriter("nicola-o-hara", "Nicola O’Hara"));
check("the page does not pick up someone else", !slugMatchesWriter("saskia-key", "Julie Petris"));
check("no slug matches nothing", !slugMatchesWriter("", "Saskia Key"));

// --- grouping a writer's articles ----------------------------------------------------
const arts = [
  { id: 1, author_name: "Benedetta Barzaghi", publish_date: "2026-08-01" },
  { id: 2, author_name: "Benedetta Barzaghi ", publish_date: "2026-09-01" },
  { id: 3, author_name: "Barzaghi Benedetta", publish_date: "2026-07-01" },
  { id: 4, author_name: "Saskia Key", publish_date: "2026-09-10" },
  { id: 5, author_name: "", publish_date: "2026-09-11" },
];
const bb = articlesBy(arts, "Benedetta Barzaghi");
check("all three spellings grouped together", bb.length === 3, bb.map((a) => a.id).join(","));
check("newest first", bb.map((a) => a.id).join(",") === "2,1,3", bb.map((a) => a.id).join(","));
check("shown name is the most-used spelling, trimmed", displayNameFor(bb) === "Benedetta Barzaghi", JSON.stringify(displayNameFor(bb)));
check("an unnamed article belongs to nobody", articlesBy(arts, "").length === 0);

// --- where a byline goes --------------------------------------------------------------
const artists = [{ id: "a1", display_name: "Saskia Key", slug: "saskia-key" }, { id: "a2", display_name: "Julie Petris", slug: "julie-petris" }];
check("a writer with an artist page is matched to it", artistForWriter(artists, "Saskia Key ")?.slug === "saskia-key");
check("a writer without one is not matched", artistForWriter(artists, "Rachel Mitchell") === null);
check("byline goes to the artist page when there is one", bylineHref("Saskia Key", artistForWriter(artists, "Saskia Key")) === "/artists/saskia-key");
check("byline goes to the writer page otherwise", bylineHref("Rachel Mitchell", null) === "/editorial/writer/rachel-mitchell");

// --- wiring ------------------------------------------------------------------------------
const read = (p) => readFileSync(new URL(p, import.meta.url), "utf8");
const app = read("../src/App.jsx");
const reader = read("../src/pages/ArticleReader.jsx");
const view = read("../src/pages/ArtistProfileView.jsx");
const writing = read("../src/components/ArtistWriting.jsx");
const page = read("../src/pages/EditorialWriter.jsx");
const pub = read("../src/lib/publishedArticles.js");

check("writer pages have a route", /path="\/editorial\/writer\/:writer" element=\{<EditorialWriter \/>\}/.test(app));
check("the byline is a link", /<Link to=\{bylineHref\(article\.author_name, writerArtist\)\}/.test(reader));
check("artists are matched only among published profiles", /ArtistProfile\.filter\(\{ status: "approved" \}/.test(reader + page));
check("artist pages show their Writing", /<ArtistWriting name=\{profile\.display_name\} \/>/.test(view));
check("no Writing section for non-writers", /if \(mine\.length === 0\) return null;/.test(writing));
check("only published, already-out articles are listed",
  /filter\(\{ published: true \}/.test(pub) && /new Date\(a\.publish_date\) <= now/.test(pub));
check("the writer page refetches on data changes", /useDataRevision\(\)/.test(page) && /\[rev\]/.test(page));

console.log(`\nverify-writers: ${pass} passed, ${failures.length} failed`);
if (failures.length) {
  failures.forEach((f) => console.log("  FAIL", f));
  process.exit(1);
}
