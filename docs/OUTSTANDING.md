# Outstanding

Running list of open items for the v12 gallery import and the claim path.
Tick things off here as they land. Last updated 2026-09-18.

## Gallery import — `gallery-import-2026-09`

363 rows in the manifest. Import one city at a time:
`node scripts/import-galleries.mjs --commit --city <city>`

| City | Rows | Status |
| --- | --- | --- |
| Bangkok | 25 | **Done** 2026-09-18 — 25 imported, 0 failed |
| Boston | 50 | In progress |
| Los Angeles | 113 | Not started |
| Maine | 50 | Not started |
| Toronto | 64 | Not started |
| Zurich | 57 | Not started |

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

      Later cities may add more of these — the importer writes `claim_email`
      only where the manifest has an email. Re-check after each city.

- [ ] **A listing cannot be self-claimed if the owner already has a profile.**
      The `not exists` guards in `claim_my_profile()` skip the claim for anyone
      who already owns an artist/collector profile. Those need an admin to
      merge by hand. No tooling for this yet.

## Repo / database drift

- [x] **Migration 013** recovered from the live database and committed as
      `supabase/migrations/013_claim_profile.sql` (2026-09-18).
- [ ] **Migration 012 is still missing.** Applied by hand in the SQL editor,
      never committed, contents unknown — absent from v11 and v12 alike. Dump
      it from the Supabase dashboard and commit it so the repo matches the
      database. Do not write a guessed body: applying a guess would overwrite
      whatever is really there.

`.env` holds only `VITE_SUPABASE_URL`, the anon key and the admin login — no
service-role key or database password — so dumps have to come from the
dashboard, not from this machine.
