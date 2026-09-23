# Art Future Club — full test

Everything that has been tested on this site, everything found wanting, and
everything identified but not yet tested. When the owner says "run the full
test", this file is the definition of what that means. Work top to bottom.

Written 2026-09-22 from the work of 18–22 September. Keep it current: a test
added anywhere else should be listed here too.

---

## 0. Rules of engagement — read before touching anything

These were all learned the hard way during the week this file covers.

1. **Never write to a column that gates access on a real account.**
   `profiles.role`, a profile's `status`, `user_id`, the paywall columns. A
   probe changed the owner's own role to test a trigger and could not change
   it back; the account was locked out of admin until the owner ran SQL. For
   anything privilege-related: read-only checks, or a throwaway row you
   created for the purpose. Prove the revert path *before* the forward write.
2. **`signOut({ scope: "local" })` in every script, always.** The default is
   `global`, which revokes the account's refresh tokens on every device. Bare
   `signOut()` in the import script logged the owner out of the live site
   three times in one morning, up to an hour after each run.
3. **Dry-run first.** `node scripts/import-galleries.mjs` without `--commit`
   reports and writes nothing. Run it before every import and after, to
   verify.
4. **Read the last line, not the progress counter.** The importer's counter
   only advances on success; failures are held until `Imported N. Failed M.`
   at the end. "0 failures so far" mid-run means nothing.
5. **`npm run lint` does not catch a JSX parse error.** A misplaced closing
   tag passed lint and failed the build. `vite build` is the real syntax
   gate; `verify:all` runs it last.
6. **The shell heredoc here strips backslashes.** A regex written into a test
   through a heredoc lost its escapes, matched garbage, and still passed.
   Write test assertions as plain string checks; if a regex is unavoidable,
   read the file back and confirm the backslashes survived.
7. **A passing test that never exercised the real path is a false pass.**
   `verify-admin-forms` passed while the editor was opening blank, because
   its mock had no `AdminListing` and the panel silently fell back to full
   rows. When a code path has a fallback, mock the *real* path.
8. **Ask for the rows you want; never sieve a capped page.** Fetching the N
   most recent of everything and filtering in the browser works only while
   the table is smaller than N. The September import added 350 rows and
   pushed 17 of 19 venues out of the Venues page's 400-row window — and
   because the filtering happened after the fetch, the page could not tell it
   was showing 2 of 19. Constrain the query.
9. **A 200 is not proof the response is right.** CARTO served every map tile
   at HTTP 200 with "API KEY REQUIRED" painted across the image. A status
   check passed, the build passed, every test passed, and the map was
   unusable. When what matters is the *content* — a tile, a preview image, a
   PDF — open it and look. `Read` renders images.
10. **Quote real output.** Never describe a result that was not seen.

---

## 1. The automated suite

```
npm run lint          # fast; catches most breakage — but NOT JSX parse errors
npm run verify:all    # 23 scripts, then vite build. THE gate.
npm run build         # syntax and bundling alone, when the suite is too slow
```

Expected on 2026-09-22: every script green, build clean in ~20–40 s. Counts
as of that date (a lower number means something was removed — look):

| Script | Checks | What it proves |
| --- | --- | --- |
| `verify:imports` | files: 103 | every component used in JSX is imported |
| `verify` (provider) | 55 | mock provider contract: list/filter/get/create, `page()` returning `{rows, count}`, the `AdminListing` union view, read-only view rejects writes |
| `verify:backend` | 7 | backend auto-selection |
| `verify:supabase` | 49 | real provider emits correct PostgREST queries; exact entity set incl. `AdminListing` |
| `verify:images` | 14 | image handling |
| `verify:layout` | 28 | layout |
| `verify:adminpanel` | 62 | admin panel fields match the public pages; Galleries page reads `interests` with a default and matches the chosen chip; "Uncategorised" chip exists and selects empty-discipline rows; sentinel chips excluded from the discipline cross-check |
| `verify:moderation` | 76 | moderation gate |
| `verify:notifications` | 21 | notifications |
| `verify:gallery-works` | 18 | gallery works |
| `verify:freshness` | 81 | pages subscribe to the data revision; admin listings/events accept `heldRev` and let it catch up when the editor closes; pages that must NOT be wired are not |
| `verify:pdf` | 30 | PDF |
| `verify:datetime` | 17 | date handling |
| `verify:categories` | 24 | categories |
| `verify:admintabs` | 36 | admin tabs |
| `verify:adminforms` | 25 | **see §2** — every admin edit form opens on the record's real data; survives a list refresh; Add work appends |
| `verify:lightbox` | 11 | lightbox |
| `verify:modals` | 18 | modals |
| `verify:cache` | 42 | read cache |
| `verify:seo` | 173 | **see §5** — SEO meta, prerender routing, crawler UA matching, preview image conversion |
| `verify:slug-routes` | 46 | slug and id routes resolve |
| `verify:render` | — | pages render |

---

## 2. Admin panel — every edit surface

`npm run verify:adminforms` covers the automated half. The manual half is
below. The panel is at `/admin`, admin role required.

### 2a. Opens on real data (automated, `verify:adminforms`)

Each form must show a field that exists **only on the full row**, so a blank
template cannot pass:

| Panel | Proven by | Why that field |
| --- | --- | --- |
| Edit Listings | a portfolio work title ("Spilt Coffee") | not in the `admin_listings` view; only on the fetched row |
| Events | the description ("A show.") | a textarea, not the title the list shows |
| Articles | the body ("Body text.") | not the title |

The Listings mock serves the view's exact ten narrow columns. This is what
caught `row={r}` (form rendered from the list row, opened blank). Never
loosen it.

### 2b. Survives a list refresh (automated, `verify:adminforms`)

Open the editor, type an unsaved value, add a work, fire
`bumpDataRevision()` — what regaining window focus does — and expect both to
still be there. Against the bug: "2 expected, 1 present". Choosing an image
opens the OS file dialog, which is a focus change, which was refetching the
list and unmounting the editor. Fixed by keeping the list mounted after the
first load and holding the revision while an editor is open. Listings and
Events had it; Articles renders its form outside the swapped region.

### 2c. Add work appends (automated, `verify:adminforms`)

Existing work still first, new one last and blank, headed `Work N+1`. Was
prepending, which renumbered every existing work. The artist's own editor
(`ArtistProfileEdit`) was changed the same way — its comment claimed display
followed array order, but `ArtistProfileView` reverses the array, so a
prepended work was actually shown LAST publicly.

### 2d. Not blocked by RLS (live, run as admin — see §7 for the probe pattern)

| Action | Table | Verified 2026-09-21 |
| --- | --- | --- |
| Edit Listings save | `collector_profile` update | works — 1 row affected |
| Subscriber delete | `newsletter_subscriber` delete | works — 012 is live; throwaway row inserted then deleted |
| Members: change another member's role | `profiles` update | works — live 023 adds `or is_admin()` |
| Approvals | status change | allowed for admin by 017's trigger (not re-probed; owner uses it daily) |
| Events save/delete | `event` | policies include `is_admin()` (static check, not probed) |
| Articles save | `article` | `for all` to admin/editor (static, not probed) |

### 2e. Manual click-through — NOT YET DONE

Rule 2 of CLAUDE.md says run the real app when it matters. Nobody has clicked
through the admin panel in a browser since the rewrite; every check above is
jsdom or the database. To do, in `npm run dev` signed in as admin:

- [ ] Edit Listings: count reads the true total; Previous/Next page through;
      search narrows server-side (type a name from page 3); each filter chip;
      open an artist — bio, works, socials all present; add a work at the end;
      choose an image for it (the file dialog!) — it must still be there;
      save; reopen; the work is there with its image
- [ ] Edit Listings: open a gallery — disciplines picker shows; choose two;
      save; the gallery now appears under those chips on `/gallery`
- [ ] Events: edit, choose a cover image, everything typed survives, save
- [ ] Articles: edit, save
- [ ] Approvals: approve one held profile; it goes live; the member's
      "profile is live" notification appears (needs `reviewed_at` set)
- [ ] Members: change a role — of a **test account, never your own**
- [ ] Subscribers: delete a throwaway subscriber
- [ ] Add Listing: create a gallery with disciplines and a logo

---

## 3. Gallery import — `scripts/import-galleries.mjs`

Complete as of 2026-09-20: 350 of 363 manifest rows live across Bangkok 25,
Boston 50, Los Angeles 113, Maine 50, Toronto 64, Zurich 48. Thirteen never
import, correctly: NEST (no image), three already on the site, nine Zurich
galleries added by hand before the run.

### 3a. Verified after the batch (live)

- [x] 350 rows present, every one `approved`, `type = Gallery`
- [x] 350 logos — every `avatar_url` HEAD-checked, 350 serving, 0 broken
- [x] 350 real slugs, 0 fell back to a raw id, 0 duplicates table-wide
- [x] coordinates on 349; **Caviar20 (Toronto) has none** — manifest geo was empty
- [x] claim address on 331; **19 have none** (Bangkok 6, Boston 6, Maine 4,
      Toronto 3), listed in OUTSTANDING.md; no address shared between two
      unclaimed listings, so `claim_my_profile()`'s `limit 1` cannot bite
- [x] imported rows match manually created ones on every field that makes a
      listing work; differences are `interests` (empty — see §4),
      `cover_image_url` (empty), `geo_region` (unused by any page),
      `reviewed_at` (null, but manual creation leaves it null too)

### 3b. To re-verify after any future import

```
node scripts/import-galleries.mjs              # all cities, dry run
node scripts/import-galleries.mjs --city X     # one city
```
Expect "already imported" to equal what was imported and "to import 0". Then
the probe in §7 for logos serving and claim coverage.

### 3c. Known behaviour

- Upload and Drive download both retry (5 and 6 attempts). Before the retry,
  27 of LA's 113 and 12 of Boston's 50 failed on dropped connections; after,
  Maine + Toronto + Zurich imported 162 rows with zero failures.
- The revert file lists **all 363 ids, every city**. Use
  `--revert --city X` to undo one city.
- Boston and Maine are not in `CHAPTERS`; their 100 galleries show under
  "All" but under no chapter filter. Deferred by the owner.

---

## 4. Public pages

### 4a. Galleries page (`/gallery`)

- [x] "Uncategorised" chip selects galleries with no disciplines. Without it
      the 350 imported galleries vanished the moment any discipline chip was
      pressed. Automated in `verify:adminpanel`.
- [ ] NOT DONE: in a browser, confirm the 350 appear under Uncategorised and
      under All, and that a gallery given disciplines in the admin moves to
      those chips.

### 4b. Artist profile (`/artists/<slug>`)

- [ ] NOT DONE: after the append change, add a work as an artist and confirm
      it appears FIRST on the public profile (the view reverses the array).

### 4b-ii. Venues page (`/venues`) — all 19 must appear

- [x] Automated two ways. `verify` (provider) reproduces the failure mode:
      a capped list filtered in the browser loses rows, the same query
      constrained by type does not. `verify:adminpanel` asserts Venues.jsx
      constrains `type` in the query and never calls an unconstrained
      `CollectorProfile.list(`.
- [x] Verified live 2026-09-23 as an anonymous visitor: 19 venues returned
      (9 Museum, 7 Institution, 3 Event Space), including M+, Tai Kwun,
      HKMoA and the Hong Kong Palace Museum.
- [ ] NOT DONE: open `/venues` in a browser and count 19.

### 4c. Row caps — a listing beyond the cap is silently absent

| Page | Cap | State 2026-09-20 |
| --- | --- | --- |
| Edit Listings | — | fixed: server-side paging with an exact count |
| Approvals panel | 500 per table | **crossed** — 503 collector rows, 3 outside. The 3 are all approved and both held rows are inside, so nothing hidden today. An old draft would be. |
| Venues | 400, but now **type-constrained** | **Broke 2026-09-22, fixed 2026-09-23.** The import pushed 17 of 19 venues out of the window. Now asks the database for venue types, so the cap cannot decide which rows arrive. |
| Events admin | 500 | not crossed |
| Articles admin | 200 | 106 articles |
| GalleryShowcase | none | unbounded `select *` |

---

### 4d. Map tiles — look at one, do not trust the status code

The map is Esri World Light Gray Canvas in two layers: the pale base, then a
transparent overlay with street and place names. No API key, and it matches
the reference apps.

- [x] Automated: `verify:adminpanel` refuses the tile hosts that require a
      key (CARTO, Mapbox, Stadia, MapTiler), refuses the rate-limited OSM
      endpoint, and requires both a base and a labels layer plus attribution.
- [ ] After any tile change, **fetch one tile and open it**:

      ```
      curl -s "https://server.arcgisonline.com/ArcGIS/rest/services/Canvas/World_Light_Gray_Base/MapServer/tile/14/5448/8187" -o tile.png
      ```

      Then look at it. On 2026-09-23 CARTO returned HTTP 200, `image/png`,
      13 KB — and the image said API KEY REQUIRED. Nothing but the image
      itself could have caught that.

## 5. SEO and link previews

`npm run verify:seo` (173). Also, live, as a crawler:

```
curl -sL -A "WhatsApp/2.23.20.0" https://www.artfutureclub.com/artists/<slug> \
  | grep -oE '<meta (property|name)="(og:title|og:image|og:image:width|twitter:image)" content="[^"]*"'
```

Expect a specific title, and `og:image` pointing at
`https://www.artfutureclub.com/api/og-image?src=...` for any stored image,
with `og:image:width` 1200 and `og:image:height` 630.

- [x] Bots are rewritten to `api/prerender.js` by `vercel.json` (the site is
      on **Vercel**, not Netlify as DEPLOY.md says). The UA pattern matches
      Googlebot, GPTBot, ClaudeBot, facebookexternalhit, Twitterbot,
      LinkedInBot, Slackbot, WhatsApp, bingbot, Applebot, Baiduspider —
      automated.
- [x] Preview image is the portrait (artist), first work if none; cover or
      logo (gallery); site image if nothing. Automated.
- [x] **Preview file size.** WhatsApp, Telegram, Signal and iMessage drop an
      og:image much over ~300 KB. Measured: 21 of 39 artist portraits over,
      median 800 KB, some near 4 MB. Fixed 2026-09-22 by `api/og-image.js`:
      1200x630 JPEG q78 from any stored image; a 3.8 MB PNG becomes 86 KB.
      Automated offline on a synthetic PNG.
- [ ] NOT DONE: **after deploying**, share an artist link in WhatsApp and
      confirm the picture appears. Then the same for a gallery (a square
      logo, cropped to 1.91:1) and for an article. Also fetch
      `/api/og-image?src=<a stored url>` directly: expect `image/jpeg`, a
      few tens of KB, `Cache-Control` with `s-maxage=31536000`.
- [ ] NOT DONE: `/api/og-image?src=https://evil.example/x.png` must be 400.

---

## 6. Database ↔ repo

Migrations 001–023 are the complete record of the live database as of
2026-09-22. Every migration is live; nothing needs running.

- [x] 012 (subscriber delete policy) — reconstructed from the panel's own
      comment; its policy proven live by deleting a throwaway row
- [x] 013 (`claim_my_profile`) — recovered verbatim
- [x] 021 (`admin_listings` view) — written here; `security_invoker = true`
      proven live: admin sees 357, anon sees 350, the 7 held rows withheld
- [x] 022 (`claim_email` columns) — reconstructed, then verified: `text`,
      nullable, no default, both tables
- [x] 023 (admin may change roles) — recovered verbatim

To re-check drift, in the SQL editor:
```
select pg_get_functiondef('public.protect_role_column'::regproc);
select policyname, cmd, qual, with_check from pg_policies where tablename = 'profiles';
select tablename, policyname, cmd from pg_policies order by 1, 2;
```
and compare with the migrations. If anything differs, the database wins;
dump it and commit it, never guess a body.

---

## 7. Live probes — the pattern

Every live check runs as a Node script in `.tmp/`, reads `.env`, signs in as
the admin, and ends with `signOut({ scope: "local" })`. Skeleton:

```js
import { createClient } from "@supabase/supabase-js";
import { readFileSync } from "node:fs";
for (const l of readFileSync(".env","utf8").split(/\r?\n/)) {
  const m = /^\s*([\w.]+)\s*=\s*(.*)\s*$/.exec(l);
  if (m && !(m[1] in process.env)) process.env[m[1]] = m[2].replace(/^["']|["']$/g, "");
}
const sb = createClient(process.env.VITE_SUPABASE_URL, process.env.VITE_SUPABASE_ANON_KEY, { auth: { persistSession: false } });
await sb.auth.signInWithPassword({ email: process.env.AFC_ADMIN_EMAIL.trim(), password: process.env.AFC_ADMIN_PASSWORD });
// ... reads; writes ONLY to rows you created ...
await sb.auth.signOut({ scope: "local" });
```

Probes that exist in the history and are worth re-running:

- **Batch verification** (§3a): per-city counts, approved, logo present, slug,
  claim, coordinates; HEAD every logo with retries.
- **Caps** (§4c): fetch 500 most recent, compare with all non-approved.
- **RLS as admin** (§2d): no-op update on one of the *imported* galleries;
  insert-then-delete a `rls-check-<ts>@example.invalid` subscriber.
- **View security** (§6): count as admin vs count with the bare anon key.
- **Preview images** (§5): HEAD each artist's chosen image; count over 300 KB.

The connection to Supabase drops often from this machine — `fetch failed`,
`ECONNRESET`, once a TLS bad-record. Every probe retries; a single failure is
noise, not a finding.

---

## 8. Deploy

Only `main` on `https://github.com/Carbon04778/Art-future-club.git` deploys.
That remote is on the **v11** folder; v12 has none. Work is cherry-picked from
v12 to v11 and pushed **with approval every time**, per CLAUDE.md rule 1.

After a push, confirm the bundle actually changed:
```
curl -sL https://www.artfutureclub.com/ | grep -oE '/assets/index-[A-Za-z0-9_-]+\.js'
curl -sL https://www.artfutureclub.com<that path> | grep -c '<a string only the new code contains>'
```

---

## 9. Not yet tested at all

Beyond the NOT DONE items above:

- [ ] **The claim flow end to end.** Register a throwaway account with an
      address that is the `claim_email` on a throwaway listing; confirm the
      email; land on `/onboarding`; the listing should attach. Never with a
      real gallery's address.
- [ ] **Members panel self-demotion.** An admin can set their own role to
      something else and instantly lose the right to undo it. The panel should
      refuse to change the signed-in admin's own role. Not built; do not test
      it on a real admin.
- [ ] **Approvals panel paging.** Same fix as Edit Listings, filtered to
      `status is distinct from 'approved'`. Not built.
- [ ] **Chapter admin** (a role scoped to one chapter) — designed, not built;
      needs a `chapter` column on `collector_profile` first.
- [ ] **Events and Articles caps** in the admin (500 / 200).
- [ ] **Netlify vs Vercel.** DEPLOY.md describes Netlify; the live site is
      on Vercel. Which one is actually connected to the GitHub repo?
