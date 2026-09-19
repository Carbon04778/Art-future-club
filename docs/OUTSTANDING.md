# Outstanding

Running list of open items for the v12 gallery import and the claim path.
Tick things off here as they land. Last updated 2026-09-18.

## Gallery import — `gallery-import-2026-09`

363 rows in the manifest. Import one city at a time:
`node scripts/import-galleries.mjs --commit --city <city>`

| City | Rows | Status |
| --- | --- | --- |
| Bangkok | 25 | **Done** 2026-09-18 — 25 imported, 0 failed |
| Boston | 50 | **Done** 2026-09-18 — 50 imported (12 needed a retry, see below) |
| Los Angeles | 113 | **Done** 2026-09-19 — took four passes, 27 lost to dropped uploads before the retry fix |
| Maine | 50 | **Done** 2026-09-19 — 50 imported, 0 failed, first pass |
| Toronto | 64 | **Done** 2026-09-19 — 64 imported, 0 failed |
| Zurich | 57 | **Not started** — the only city left. Owner asked to stop after Toronto. |

Four manifest rows will never import, and that is correct:

- **NEST** — no verified image, so the importer skips it by design.
- **Hauser & Wirth**, **David Zwirner**, **Gagosian** — already on the site as
  unclaimed galleries. Skipped as duplicates rather than creating a second copy.

### Careful with the revert file

`supabase/imports/gallery-import-2026-09.revert.sql` is regenerated on every
run and always lists **all 363 ids, every city** — not just the city that ran.
Pasting it into the SQL editor would remove every imported city.

To undo a single city use the script instead:
`node scripts/import-galleries.mjs --revert --city <city>`

### Fixed: the upload had no retry (2026-09-19)

`uploadImage()` retried nothing while `downloadDrive()` retried four times, so
one dropped TLS connection lost a row. That cost 12 of Boston's 50 and 27 of Los
Angeles's 113, and meant repeated full passes over a city.

Both are now wrapped in a shared `withRetry()` — five attempts for the upload,
six for Drive, linear backoff, and failures labelled so a bare "fetch failed" no
longer hides which step dropped. Maine and Toronto then imported 114 rows across
two cities with **zero** failures, on the same connection.

### Running the script signed the owner out of the live site (2026-09-19)

`supabase-js` declares `signOut(options = { scope: 'global' })`, and the script
called `signOut()` bare. Global scope revokes every refresh token the account
holds **on every device**, so each import run logged the owner out of
artfutureclub.com. Not at once — the access token keeps working until it
expires, so it surfaced up to an hour later, three times in one morning.

Now `signOut({ scope: "local" })`. If it ever recurs, check whether "single
session per user" is enabled in Supabase auth settings; the proper fix then is a
separate service account for scripts rather than the owner's own login.

### Still worth knowing: read the last line, not the counter

Bostons first run ended `Imported 38. Failed 12.` Every failure was
`upload: fetch failed` — a dropped TLS connection to Supabase storage, not a
data problem. Re-running the same command imported all 12 with no failures.

`downloadDrive()` retries four times with a backoff, but `uploadImage()` has
**no retry at all**, so one blip loses the row. Worth adding a retry around the
storage upload. Until then treat a re-run as a normal part of importing a city.

Read the final `Imported N. Failed M.` line, not the progress counter — the
counter only advances on success, so failures stay invisible until the end.

A failed upload leaves no bad row: `uploadImage()` runs before the insert, so
the row is simply never created and the retry picks it up.

Verified after the retry: 50/50 Boston rows present and approved, and all 50
logo URLs actually serving (Bangkoks 25 too).

## Row caps that still truncate silently

`AdminEditListingsPanel` was fixed in migration 021 — it pages server-side with
an exact count, so nothing can hide. Two surfaces with the same shape were left
alone deliberately, to keep that change to one page:

| Where | Cap | Risk today |
| --- | --- | --- |
| `AdminApprovalsPanel.jsx:41-42` | 500 per table | Low — only 7 listings are non-approved |
| `Venues.jsx:31` | 400 venue rows | None yet — every imported row is `type: "Gallery"`, which has its own page |

- [ ] **The approvals queue is the one to fix next.** It is the moderation
      review list, it caps at 500 rows per table, and like the old edit panel it
      filters client-side, so past the cap a held profile would be invisible to
      the person meant to review it. `AdminListing.page()` and the
      admin_listings view already exist — it needs the same treatment, filtered
      to `status is distinct from 'approved'`.
- [ ] **Venues** caps at 400 and filters by chapter in the browser. Galleries
      are not affected (they render from `GalleryShowcase`, which has no explicit
      limit), but venue types will cross 400 eventually.

Raising a cap only moves the cliff. The fix in both cases is a count on screen,
so a truncated list cannot look like a complete one.

## Claim path

See `docs/CLAIMING-LISTINGS.md` for how claiming works end to end.

- [ ] **Six Bangkok galleries have no claim address** and so cannot be claimed
      by registering. Need real email addresses — do not guess, `claim_email`
      decides who can take over the page. Add via the Edit Listings panel.

      | Gallery | Instagram | Phone |
      | --- | --- | --- |
      | VS Gallery | — | +66 89 013 9966 |
      | Play Art House | @playarthouse | +66 91 048 7187 |
      | Ming Art Space | @ming.artspace | — |
      | Cartel Artspace | @cartel_art_space | +66 89 508 3859 |
      | Adult Material | @adultmaterialgallery | — |
      | 10 10 Art Space | @1010artspace | — |

      Boston adds six more with no claim address: Arden Gallery, Christopher
      Peter Art, Concord Art, Panopticon Gallery, Jules Place, Galatea Fine
      Art. (44 of Bostons 50 do have one.)

      Later cities may add more of these — the importer writes `claim_email`
      only where the manifest has an email. Re-check after each city.

- [ ] **A listing cannot be self-claimed if the owner already has a profile.**
      The `not exists` guards in `claim_my_profile()` skip the claim for anyone
      who already owns an artist/collector profile. Those need an admin to
      merge by hand. No tooling for this yet.

## Repo / database drift

- [x] **Migration 013** recovered from the live database and committed as
      `supabase/migrations/013_claim_profile.sql` (2026-09-18).
- [ ] **Two reconstructed migrations — verify both against the database.**
      Neither could be dumped the way 013 was, because nothing recovers a
      plain ALTER TABLE or a dropped policy after the fact. Both are written to
      be safe to re-run, and both separate evidence from inference in their
      headers. If the database disagrees with either file, trust the database.

      - `012_admin_delete_subscribers.sql` — the real 012. A DELETE policy on
        newsletter_subscriber so an admin can honour an unsubscribe.
        `AdminSubscribersPanel.jsx` names the file and its error message tells
        the admin to run it, so the intent is certain; only the SQL was lost.
        Check with: `select policyname, cmd from pg_policies where tablename =
        'newsletter_subscriber';` — if a DELETE policy is already there under
        another name, this adds a second one (harmless, policies are ORed).

      - `022_claim_email.sql` — the `claim_email` column on both profile
        tables. Provably missing: nothing in the committed migrations creates
        it, while 013 matches on it and both admin panels write it. It was
        never a numbered migration, so it sits at the end rather than claiming
        a number. **A replay from an empty database must run it before 013.**
        The type (`text`) and the index are inference — the PostgREST OpenAPI
        endpoint that serves column types is disabled on this project, and
        there is no service-role key or database password locally.

`.env` holds only `VITE_SUPABASE_URL`, the anon key and the admin login — no
service-role key or database password — so dumps have to come from the
dashboard, not from this machine.
