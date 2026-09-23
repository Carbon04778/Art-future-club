/**
 * Contract test for the data provider.
 *
 * Replays the exact query shapes the pages use and asserts the response
 * contract the components depend on. Run: npm run verify
 */

// Minimal browser shims so the provider can run under Node.
const store = new Map();
globalThis.window = {
  localStorage: {
    getItem: (k) => (store.has(k) ? store.get(k) : null),
    setItem: (k, v) => store.set(k, v),
    removeItem: (k) => store.delete(k),
  },
  location: { href: "/" },
};
globalThis.localStorage = globalThis.window.localStorage;

const { entities, auth, integrations, functions } = await import(
  "../src/api/providers/mock.js"
);

let pass = 0;
const failures = [];

function check(name, condition, detail = "") {
  if (condition) {
    pass++;
  } else {
    failures.push(`${name}${detail ? ` — ${detail}` : ""}`);
  }
}

/* ------------------------------------------------ contract: return shapes */

const arts = await entities.Article.filter({ published: true }, "-created_date", 50);
check("filter returns a bare array", Array.isArray(arts));
check("filter respects where clause", arts.every((a) => a.published === true));
check("filter returns seeded rows", arts.length >= 3, `got ${arts.length}`);

const unpublished = await entities.Article.filter({ published: false });
check("filter isolates unpublished", unpublished.length === 1, `got ${unpublished.length}`);

const sorted = await entities.Article.list("-created_date", 10);
const descOk = sorted.every(
  (a, i) => i === 0 || new Date(sorted[i - 1].created_date) >= new Date(a.created_date)
);
check("descending sort works", descOk);

const asc = await entities.Event.filter({ chapter: "Hong Kong" }, "start_date", 200);
const ascOk = asc.every(
  (e, i) => i === 0 || new Date(asc[i - 1].start_date) <= new Date(e.start_date)
);
check("ascending sort works", ascOk);

const limited = await entities.ArtistProfile.list("-created_date", 2);
check("limit is applied", limited.length === 2, `got ${limited.length}`);

/* ------------------------------------------------------- the $in operator */

const venues = await entities.CollectorProfile.filter(
  { type: { $in: ["Gallery", "Institution"] } },
  "-updated_date",
  300
);
check("$in operator works", venues.length === 3, `got ${venues.length}`);
check(
  "$in excludes non-matching",
  venues.every((v) => ["Gallery", "Institution"].includes(v.type))
);

/* ------------------------------------------------------ multi-key filters */

const comments = await entities.Comment.filter(
  { target_id: "artist_lin", target_type: "artist_profile" },
  "created_date",
  50
);
check("two-key filter works", comments.length === 1, `got ${comments.length}`);

/* ----------------------------------------------------------- get contract */

const one = await entities.Article.get("art_julie");
check("get returns the row", one?.id === "art_julie");

let threw = false;
try {
  await entities.Article.get("does-not-exist");
} catch {
  threw = true;
}
check("get REJECTS on missing row (ArticleReader depends on this)", threw);

/* --------------------------------------------------------- write contract */

const created = await entities.ForumPost.create({
  title: "Test post",
  body: "Body",
  category: "General",
});
check("create returns generated id", !!created?.id);
check("create stamps created_date", !!created?.created_date);
check("create echoes payload", created.title === "Test post");

const updated = await entities.ForumPost.update(created.id, { title: "Renamed" });
check("update returns updated row", updated.title === "Renamed");
check("update bumps updated_date", !!updated.updated_date);

const beforeDelete = (await entities.ForumPost.list()).length;
await entities.ForumPost.delete(created.id);
const afterDelete = (await entities.ForumPost.list()).length;
check("delete removes the row", afterDelete === beforeDelete - 1);

/* ------------------------------------------------------------------- auth */

let meThrew = false;
try {
  await auth.me();
} catch {
  meThrew = true;
}
check("me() rejects when signed out", meThrew);

await auth.loginViaEmailPassword("sara@example.com", "password");
const me = await auth.me();
check("login then me() returns user", me?.email === "sara@example.com");
check("user has id", !!me.id);
check("user has full_name", !!me.full_name, JSON.stringify(me));
check("user role defaults to 'user'", me.role === "user");

await auth.loginViaEmailPassword("admin@artfuture.club", "password");
const admin = await auth.me();
check("admin@ address gets admin role", admin.role === "admin", admin.role);

const otp = await auth.verifyOtp({ email: "new@example.com", otpCode: "123456" });
check("verifyOtp returns access_token", !!otp?.access_token);

/* ----------------------------------------------------------- integrations */

const geo = await functions.invoke("geocodeAddress", { address: "Central, Hong Kong" });
check("geocode returns lat", typeof geo.lat === "number");
check("geocode returns lng", typeof geo.lng === "number");

let checkoutThrew = false;
try {
  await functions.invoke("createCheckout", { plan: "premium_portfolio" });
} catch {
  checkoutThrew = true;
}
check("createCheckout fails cleanly in demo", checkoutThrew);

check(
  "UploadFile is wired",
  typeof integrations.Core.UploadFile === "function"
);
const llm = await integrations.Core.InvokeLLM({ prompt: "x" });
check("InvokeLLM returns text", typeof llm.text === "string");

/* --------------------------------------------- referential sanity of seed */

const allArtists = await entities.ArtistProfile.list();
const allLikes = await entities.Like.list();
const artistIds = new Set(allArtists.map((a) => a.id));
const orphanLikes = allLikes.filter(
  (l) => l.target_type === "artist_profile" && !artistIds.has(l.target_id)
);
check("no orphaned artist likes in seed", orphanLikes.length === 0, `${orphanLikes.length} orphans`);

const replies = await entities.ForumReply.list();
const postIds = new Set((await entities.ForumPost.list()).map((p) => p.id));
check(
  "no orphaned forum replies in seed",
  replies.every((r) => postIds.has(r.post_id))
);

const featured = await entities.ArtistProfile.filter({ is_featured: true }, "-updated_date", 5);
check("homepage featured query returns rows", featured.length >= 2, `got ${featured.length}`);

const gwt = await entities.GalleryWork.list("-created_date", 100);
check("gallery works seeded", gwt.length >= 4, `got ${gwt.length}`);

/* ------------------------------------------- contract: page() and counting */

/*
 * page() exists so a long admin list can be paged server-side with an exact
 * total. The total is the point: a capped list that silently drops its oldest
 * rows is the fault it was added to prevent, so the count must describe every
 * matching row and not only the page that came back.
 */

const allSpaces = await entities.CollectorProfile.list();
const firstPage = await entities.CollectorProfile.page({ sort: "-created_date", limit: 2 });
check("page returns { rows, count }", Array.isArray(firstPage.rows) && typeof firstPage.count === "number");
check("page honours limit", firstPage.rows.length <= 2, `got ${firstPage.rows.length}`);
check(
  "page count is the total, not the page size",
  firstPage.count === allSpaces.length,
  `count ${firstPage.count} vs ${allSpaces.length} rows`
);

const secondPage = await entities.CollectorProfile.page({ sort: "-created_date", limit: 2, offset: 2 });
check(
  "page offset moves the window",
  secondPage.rows.every((r) => !firstPage.rows.some((f) => f.id === r.id)),
  "page 2 overlaps page 1"
);
check("page count is stable across pages", secondPage.count === firstPage.count);

const beyond = await entities.CollectorProfile.page({ limit: 5, offset: 10000 });
check(
  "page past the end returns no rows but keeps the count",
  beyond.rows.length === 0 && beyond.count === firstPage.count
);

/* search: an OR of case-insensitive contains across the named columns */
const named = allSpaces.find((r) => (r.display_name || "").length > 3);
const fragment = named.display_name.slice(1, 4);
const searched = await entities.CollectorProfile.page({
  search: { q: fragment, columns: ["display_name", "based_in"] },
  limit: 500,
});
check(
  "page search matches a substring",
  searched.rows.some((r) => r.id === named.id),
  `"${fragment}" did not find ${named.display_name}`
);
check("page search narrows the count", searched.count <= firstPage.count && searched.count >= 1, `got ${searched.count}`);

const upper = await entities.CollectorProfile.page({
  search: { q: fragment.toUpperCase(), columns: ["display_name"] },
  limit: 500,
});
const lower = await entities.CollectorProfile.page({
  search: { q: fragment.toLowerCase(), columns: ["display_name"] },
  limit: 500,
});
check("page search ignores case", upper.count === lower.count, `${upper.count} vs ${lower.count}`);

const unsearched = await entities.CollectorProfile.page({
  search: { q: "   ", columns: ["display_name"] },
  limit: 1,
});
check("page with a blank search applies no filter", unsearched.count === firstPage.count);

const projected = await entities.CollectorProfile.page({ limit: 1, columns: "id,display_name" });
check(
  "page projects the named columns only",
  Object.keys(projected.rows[0] || {}).every((k) => k === "id" || k === "display_name"),
  Object.keys(projected.rows[0] || {}).join(",")
);

/* ------------------------------------- contract: the admin_listings union */

const listings = await entities.AdminListing.page({ sort: "-created_date", limit: 500 });
const artistCount = (await entities.ArtistProfile.list()).length;
check(
  "AdminListing unions both tables",
  listings.count === artistCount + allSpaces.length,
  `${listings.count} vs ${artistCount} + ${allSpaces.length}`
);
check(
  "AdminListing tags every row with a kind",
  listings.rows.every((r) => r.kind === "artist" || r.kind === "collector")
);
check(
  "AdminListing carries both kinds",
  listings.rows.some((r) => r.kind === "artist") && listings.rows.some((r) => r.kind === "collector")
);
check(
  "AdminListing nulls a column the source lacks",
  listings.rows.filter((r) => r.kind === "artist").every((r) => r.type === null) &&
    listings.rows.filter((r) => r.kind === "collector").every((r) => r.discipline === null)
);

const unclaimed = await entities.AdminListing.page({ where: { user_id: null }, limit: 500 });
check(
  "AdminListing filters on a null column",
  unclaimed.rows.every((r) => r.user_id === null || r.user_id === undefined),
  "a claimed row came back as unclaimed"
);

let viewWriteRejected = false;
try {
  await entities.AdminListing.update("whatever", { status: "approved" });
} catch {
  viewWriteRejected = true;
}
check("AdminListing rejects writes — it is a read-only view", viewWriteRejected);

/* ------------------------------- a capped list must not lose rows it wants */

/*
 * THE BUG THIS EXISTS TO CATCH.
 *
 * Venues.jsx fetched the 400 most recently updated collector_profile rows and
 * then picked out the venue types IN THE BROWSER. That works only while the
 * table is smaller than the cap. On 2026-09-22 the gallery import wrote 350
 * rows in four days, pushing every venue — last edited a week earlier — out of
 * the 400 most recent. Seventeen of nineteen venues disappeared from the
 * Venues page, and because the filtering happened after the fetch, the page
 * could not tell it was showing two of nineteen.
 *
 * The rule: when you want rows of a kind, ASK for that kind. Never fetch a
 * capped page of everything and sieve it afterwards.
 */

const VENUE_KINDS = ["Institution", "Museum", "Foundation", "Event Space", "Restaurant"];

const everySpace = await entities.CollectorProfile.list("-updated_date");
const everyVenue = everySpace.filter((r) => VENUE_KINDS.includes(r.type));
check("the demo data has at least one venue to lose", everyVenue.length >= 1, `${everyVenue.length}`);

/* Make the venues the OLDEST rows, exactly as the import did to the real ones. */
for (const r of everySpace) {
  if (!VENUE_KINDS.includes(r.type)) {
    await entities.CollectorProfile.update(r.id, { updated_date: new Date().toISOString() });
  }
}
const nonVenueCount = everySpace.length - everyVenue.length;

/* The old approach: cap first, filter second. */
const cappedPage = await entities.CollectorProfile.list("-updated_date", nonVenueCount);
const survivors = cappedPage.filter((r) => VENUE_KINDS.includes(r.type));
check(
  "filtering a capped list in the browser DOES lose rows (the bug, reproduced)",
  survivors.length < everyVenue.length,
  `${survivors.length} of ${everyVenue.length} survived — the cap no longer hides anything, so this check is not proving what it claims`
);

/* The fix: ask the database for the kind you want. */
const askedFor = await entities.CollectorProfile.filter(
  { type: { $in: VENUE_KINDS } },
  "-updated_date",
  nonVenueCount
);
check(
  "asking for the kind returns every one of them, whatever else was edited",
  askedFor.length === everyVenue.length,
  `got ${askedFor.length}, expected ${everyVenue.length}`
);
check(
  "and returns nothing else",
  askedFor.every((r) => VENUE_KINDS.includes(r.type)),
  askedFor.map((r) => r.type).join(", ")
);

/* ----------------------------------------------------------------- report */

console.log(`\n  passed: ${pass}`);
if (failures.length) {
  console.log(`  FAILED: ${failures.length}\n`);
  failures.forEach((f) => console.log(`   ✗ ${f}`));
  process.exit(1);
}
console.log("  all provider contract checks passed\n");
