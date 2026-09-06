/**
 * Profile moderation guard.
 *
 * New artist, gallery and venue profiles must be approved before the public
 * can see them. The real boundary is the database — the read policies and the
 * status trigger in supabase/migrations/017_profile_moderation.sql — because
 * the browser holds the anon key and a filter in React would hide unapproved
 * profiles from the site while leaving them readable from the API.
 *
 * This checks three things:
 *   1. the demo provider behaves the same way the database does
 *   2. the migration actually contains the policy and the trigger
 *   3. the moderated-type list in SQL still matches the one in JS
 *
 * (3) matters because that list is duplicated across two languages, and a list
 * duplicated across two languages is exactly what has drifted before in this
 * codebase.
 *
 * Run: npm run verify:moderation
 */

import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

// Browser shims, matching verify-provider.mjs — the provider runs under Node.
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

const filePath = (rel) => fileURLToPath(new URL(rel, import.meta.url));

const { entities, auth } = await import("../src/api/providers/mock.js");
const { STATUS, readiness, MODERATED_COLLECTOR_TYPES, effectiveStatus } =
  await import("../src/lib/profileReadiness.js");

let pass = 0;
const failures = [];
const check = (name, cond, detail = "") =>
  cond ? pass++ : failures.push(`${name}${detail ? ` — ${detail}` : ""}`);

const signOut = () => store.delete("afc_mock_session_v1");

/* ============================================================ 1. the demo */

// --- anonymous ------------------------------------------------------------
signOut();
const anonArtists = await entities.ArtistProfile.list("-created_date", 500);
check(
  "a pending profile is hidden from anonymous visitors",
  !anonArtists.some((a) => a.id === "artist_noor"),
  `saw ${anonArtists.filter((a) => a.id === "artist_noor").length}`
);
check(
  "approved profiles are still listed",
  anonArtists.some((a) => a.id === "artist_lin"),
  `${anonArtists.length} returned`
);
check(
  "profiles predating moderation are treated as approved",
  anonArtists.every((a) => effectiveStatus(a) === STATUS.APPROVED)
);

let hiddenGetRejected = false;
try {
  await entities.ArtistProfile.get("artist_noor");
} catch {
  hiddenGetRejected = true;
}
check("fetching a pending profile by id rejects, as RLS returns no row", hiddenGetRejected);

// --- a different signed-in member ----------------------------------------
await auth.loginViaEmailPassword("someone@example.com", "password123");
const memberArtists = await entities.ArtistProfile.list("-created_date", 500);
check(
  "another member cannot see a pending profile either",
  !memberArtists.some((a) => a.id === "artist_noor")
);

// --- an admin -------------------------------------------------------------
await auth.loginViaEmailPassword("admin@artfutureclub.com", "password123");
const adminArtists = await entities.ArtistProfile.list("-created_date", 500);
check(
  "an admin sees pending profiles, so the queue is reviewable",
  adminArtists.some((a) => a.id === "artist_noor")
);

/* -------------------------------------------------- the privilege guard */

signOut();
await auth.loginViaEmailPassword("member@example.com", "password123");
const mine = await entities.ArtistProfile.create({
  display_name: "Self Publisher",
  discipline: "Painting",
  user_id: "user_member",
});
check("a newly created profile starts as a draft", mine.status === STATUS.DRAFT, mine.status);

let selfApproveBlocked = false;
try {
  await entities.ArtistProfile.update(mine.id, { status: STATUS.APPROVED });
} catch {
  selfApproveBlocked = true;
}
check("a member cannot approve their own profile", selfApproveBlocked);

const submitted = await entities.ArtistProfile.update(mine.id, { status: STATUS.PENDING });
check("a member can submit their own profile for review", submitted.status === STATUS.PENDING);

let createApprovedBlocked = false;
try {
  await entities.ArtistProfile.create({
    display_name: "Straight To Live",
    status: STATUS.APPROVED,
    user_id: "user_member",
  });
} catch {
  createApprovedBlocked = true;
}
check("a member cannot create an already-approved profile", createApprovedBlocked);

// An admin can, which is what the Approvals tab does.
await auth.loginViaEmailPassword("admin@artfutureclub.com", "password123");
const approved = await entities.ArtistProfile.update(mine.id, { status: STATUS.APPROVED });
check("an admin can approve a profile", approved.status === STATUS.APPROVED);

signOut();
const afterApproval = await entities.ArtistProfile.list("-created_date", 500);
check(
  "an approved profile becomes publicly visible",
  afterApproval.some((a) => a.id === mine.id)
);

/* --------------------------------------------- unmoderated collectors */

signOut();
const collectors = await entities.CollectorProfile.list("-created_date", 500);
check(
  "private collectors are not held for review",
  collectors.some((c) => c.type === "Collector"),
  "a plain collector profile should stay visible"
);

/* ==================================================== 2. the readiness list */

const empty = readiness({}, "artist");
check("an empty artist profile is not ready to submit", !empty.ready);

const complete = readiness(
  {
    display_name: "A", avatar_url: "u", bio: "b", discipline: "Painting",
    based_in: "London",
    portfolio_works: [{ image_url: "img" }],
  },
  "artist"
);
check("a complete artist profile is ready to submit", complete.ready, complete.missing.map((m) => m.key).join(", "));

const noImage = readiness(
  {
    display_name: "A", avatar_url: "u", bio: "b", discipline: "Painting",
    based_in: "London",
    portfolio_works: [{ title: "Untitled" }],
  },
  "artist"
);
check("an artwork with no image does not satisfy the portfolio requirement", !noImage.ready);

// The gate must NOT require a website or an Instagram handle — plenty of
// legitimate artists have neither, and requiring them would lock them out.
const keys = complete.met.map((r) => r.key);
check("submitting does not require a website", !keys.includes("website"));
check("submitting does not require a social handle", !keys.includes("instagram"));

const gallery = readiness(
  { display_name: "G", avatar_url: "u", bio: "b", type: "Gallery", address: "1 St" },
  "gallery"
);
check("a gallery is ready without any artworks", gallery.ready, gallery.missing.map((m) => m.key).join(", "));

/* ================================================ 3. the migration itself */

const sql = readFileSync(filePath("../supabase/migrations/017_profile_moderation.sql"), "utf8");

check("the migration replaces the artist read policy", /create policy artist_read[\s\S]*?status = 'approved'/.test(sql));
check("the migration replaces the collector read policy", /create policy collector_read[\s\S]*?status = 'approved'/.test(sql));
check("the read policies still admit the owner", (sql.match(/user_id = auth\.uid\(\)/g) || []).length >= 2);
check("the read policies still admit an admin", (sql.match(/public\.is_admin\(\)/g) || []).length >= 2);
check("a status trigger exists on artist_profile", /trg_protect_artist_status[\s\S]*?artist_profile/.test(sql));
check("a status trigger exists on collector_profile", /trg_protect_collector_status[\s\S]*?collector_profile/.test(sql));
check("the trigger blocks members changing status", /Only an administrator can change/.test(sql));
check(
  "existing members are grandfathered as approved",
  /add column if not exists status\s+text not null default 'approved'/.test(sql)
);
check(
  "new profiles default to draft",
  /alter column status set default 'draft'/.test(sql)
);
check(
  "'flagged' is allowed, so automated screening can hook in later",
  /'flagged'/.test(sql)
);

// The moderated-type list is written twice: once in SQL, once in JS.
const sqlTypes = [...(sql.match(/select coalesce\(kind, ''\) in \(([\s\S]*?)\)/) || [])[1]
  .matchAll(/'([^']+)'/g)].map((m) => m[1]);
check(
  "the moderated-space list in SQL matches the one in JS",
  JSON.stringify([...sqlTypes].sort()) === JSON.stringify([...MODERATED_COLLECTOR_TYPES].sort()),
  `sql=[${sqlTypes}] js=[${MODERATED_COLLECTOR_TYPES}]`
);

/* ------------------------------------------- the app actually uses it */

const submitPanel = readFileSync(filePath("../src/components/SubmitForReview.jsx"), "utf8");
check("the submit panel refuses to submit an incomplete profile", /disabled=\{!ready/.test(submitPanel));

/*
 * REGRESSION: a member with no saved profile was told "Live on the site".
 *
 * effectiveStatus() falls back to "approved" so that rows predating
 * moderation stay published. An unsaved profile has no row at all, and
 * passing it through that fallback meant a brand-new member opening the
 * editor saw a green "your profile is public" box, with no checklist and no
 * submit button, before they had created anything.
 */
check(
  "an unsaved profile is treated as a draft, not as approved",
  /profileId \? effectiveStatus\(profile\) : STATUS\.DRAFT/.test(submitPanel)
);

const adminPanel = readFileSync(filePath("../src/components/AdminApprovalsPanel.jsx"), "utf8");
check("rejecting requires a reason", /!reason\.trim\(\)/.test(adminPanel));
check("approving records who decided and when", /reviewed_by/.test(adminPanel) && /reviewed_at/.test(adminPanel));

const dash = readFileSync(filePath("../src/pages/AdminDashboard.jsx"), "utf8");
check("the dashboard exposes an Approvals tab", /"Approvals"/.test(dash));

const view = readFileSync(filePath("../src/pages/ArtistProfileView.jsx"), "utf8");
check(
  "a hidden artist profile shows 'not available' rather than spinning forever",
  /setNotFound\(true\)/.test(view)
);
/*
 * Onboarding and the header's "My Profile" link both land a member on this
 * PUBLIC view rather than the editor, so an unpublished profile looked
 * completely normal to its owner with no way to finish it.
 */
check(
  "the owner is told when their own profile is not published",
  /ownStatus !== STATUS\.APPROVED/.test(view) && /Not published yet/.test(view)
);
check(
  "that notice offers a route back to the editor",
  /Finish and submit/.test(view)
);

/*
 * RLS returns a member their OWN unapproved profile — correct, they must be
 * able to edit it — but the public directories render whatever the API
 * returns. A signed-in member therefore saw their own pending profile in the
 * artists listing and concluded it had gone live. It had not; nobody else
 * could see it. Every public listing must mark it.
 */
for (const [label, file] of [
  ["artists directory", "../src/pages/ArtistsDirectory.jsx"],
  ["galleries listing", "../src/pages/GalleryShowcase.jsx"],
  ["venues listing", "../src/pages/Venues.jsx"],
]) {
  const src = readFileSync(filePath(file), "utf8");
  check(
    `the ${label} marks your own unpublished profile`,
    /UnpublishedBadge/.test(src) && /import UnpublishedBadge/.test(src)
  );
}

const badge = readFileSync(filePath("../src/components/UnpublishedBadge.jsx"), "utf8");
check("the badge renders nothing for an approved profile", /=== STATUS\.APPROVED\) return null/.test(badge));
check("the badge distinguishes not-submitted from in-review", /"In review"/.test(badge) && /"Not published"/.test(badge));
/*
 * The read policy admits exactly two viewers here: the owner, and an admin.
 * The copy therefore has to be true for both. It originally said "only you",
 * which is right for the owner and wrong for an admin looking at somebody
 * else's pending profile.
 */
// Comments stripped first: the file explains WHY it no longer says "only
// you", and matching that prose would fail a correct implementation.
const badgeCode = badge.replace(/\/\*[\s\S]*?\*\//g, "").replace(/\/\/.*$/gm, "");
check(
  "the badge does not claim the viewer is the only one who can see it",
  !/only you/i.test(badgeCode),
  (badgeCode.match(/.{0,40}only you.{0,40}/i) || [""])[0]
);
check("the badge explains it is not public", /not visible to the public/i.test(badge));

/* ------------------------------------------------------------------ report */

console.log("");
if (failures.length) {
  console.log(`  passed: ${pass}`);
  console.log(`  FAILED: ${failures.length}\n`);
  for (const f of failures) console.log(`   ✗ ${f}`);
  console.log("");
  process.exit(1);
}
console.log(`  passed: ${pass}`);
console.log("  unapproved profiles stay private until an admin publishes them\n");
