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

/* ----------------------------------------------------------------- report */

console.log(`\n  passed: ${pass}`);
if (failures.length) {
  console.log(`  FAILED: ${failures.length}\n`);
  failures.forEach((f) => console.log(`   ✗ ${f}`));
  process.exit(1);
}
console.log("  all provider contract checks passed\n");
