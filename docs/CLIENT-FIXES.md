# Client feedback — what was fixed and what you must run

Twelve issues were reported. This is what changed, what you need to do, and
what still needs a decision from you.

---

## ⚠️ Do this first — two SQL migrations

Several reported faults were caused by the **database rejecting valid saves**.
Until these run, publishing articles, posting in the community, creating open
calls and adding galleries will keep failing.

In **Supabase → SQL Editor → New query**, run these two files in order:

| Order | File | Fixes |
|---|---|---|
| 1 | `supabase/migrations/007_relax_taxonomy_constraints.sql` | items 9, 11, 12 |
| 2 | `supabase/migrations/008_admin_can_create_profiles.sql` | items 4, 10 |

Both print a small result table when they succeed. Both are safe to re-run.

Then re-run `003_rls_tests.sql` and confirm it still reports
**ALL RLS TESTS PASSED (38 checks)**.

---

## What was wrong, item by item

### 9, 11, 12 — publishing, open calls, community posting ✅

One root cause, and it was ours. The database had `CHECK` constraints listing
fewer options than the interface offers, so valid saves were rejected outright.
The interface gave no useful error, which is why it looked like the features
simply "didn't work".

Specifically rejected before the fix:

| Where | Options the database refused |
|---|---|
| Community post | Open Call, Exhibition News, Opportunities |
| Open calls | Fellowship |
| Editorial publish | Artist Feature, Art Fair, Studio Visit, Chapter: … (19 in total) |
| Article layout | gallery_middle, intro_middle |
| Events | Screening, Performance, and chapters Tokyo/Berlin/Seoul/Mexico City |
| Collector profile | Foundation |

Migration 007 removes these editorial constraints while keeping the ones that
matter for security and billing — `role`, `subscription.plan`, `status`.

### 6 — chapters missing from lists ✅

Six pages each hardcoded their own chapter list and they had drifted apart. The
events page offered Tokyo, Berlin, Seoul and Mexico City while omitting seven
real chapters.

All six now read from one list in `src/lib/chaptersData.js`. Adding a chapter
there updates every dropdown and filter in the app at once.

### 3 — "Where We Gather" venues not clickable ✅

Venue cards only became links if a profile of type **Institution** existed with
an exactly matching name, so partner galleries never linked, and any venue
without a profile was a dead card.

Now every card is clickable: to the venue's profile where one exists, otherwise
to the venues directory.

### 5 — Voices of the Chapter limited ✅

Was capped at 3. Now shows the latest 10, with a **See all N artists** button
when there are more, linking to the artists page filtered to that chapter.

### 7 — Upcoming Gatherings limited ✅

Now shows up to 10 with a **See all N gatherings** button through to the events
page, filtered to that chapter.

Two related fixes: events are now kept until their **end date** passes, not
their start date, so multi-day exhibitions no longer disappear on day one. And
the artists and events pages now honour the `?chapter=` filter those buttons
pass — previously they would have landed on an unfiltered list.

### 8 — Locate address not working ✅

The code was correct; the geocoding Edge Function had never been deployed to
Supabase, so the call failed.

Rather than requiring the Supabase CLI, address lookup now falls back to
calling OpenStreetMap directly from the browser. It works immediately, with no
deployment. If the Edge Function is deployed later, that is used in preference.

### 10 — admins adding galleries and venues ✅

Profiles could previously only be created by the person they belong to, so an
admin could not add a partner gallery or venue at all.

There is now an **Add Listing** tab in the Admin Dashboard for creating
galleries, venues and artist profiles. These are "unclaimed" — live and visible
straight away, and can be attached to a real login later.

Requires migration 008.

### 2 — images stretching ✅

Images hosted on the old platform were cropped by its image service. Once they
became local files that service was gone, and nothing replaced the cropping —
so the browser stretched them to fit.

Fixed centrally in `src/components/ui/image.jsx`, so it applies everywhere at
once rather than page by page. Images now crop to fill, and support a focal
point and zoom where a subject needs repositioning.

Gallery and venue profile photos now use the same crop-and-zoom control that
artist profiles already had.

Note the deliberate distinction: **artwork is never cropped**. Anything marked
`fittingType="fit"` is shown whole, letterboxed, because cropping a painting
would misrepresent it.

### 1 — wordmark on the landing page ⚠️ needs a better file

The heading now uses the supplied wordmark image rather than styled text.

**The supplied file is 293 × 160 pixels, and is actually a WebP renamed to
`.png`.** On a large screen the hero renders around 1500 pixels wide, so this
file will look noticeably blurry.

Please supply either:
- an **SVG** (ideal — sharp at any size), or
- a **PNG at least 1800 pixels wide**, with a transparent background

Drop it in as `public/images/afc-wordmark.webp`, or use a different filename
and update the `src` in `src/components/GlobalNexus.jsx`.

### 4 — admins setting up accounts for other people ⚠️ partly done

**Done:** admins can create artist, gallery and venue *listings* for other
people, which is what is needed to populate and test the site.

**Not done, and it should not be:** creating actual *login accounts* requires
a privileged key that must never be present in a browser. Putting it there
would let any visitor create accounts, change roles and read every record.

The safe way is Supabase's own invite flow:

**Authentication → Users → Invite user.** The person receives an email, sets
their own password, and can then claim a listing you have already created.

To make someone an admin afterwards:

```sql
update public.profiles set role = 'admin' where email = 'them@example.com';
```

They must sign out and back in for it to take effect.

---

## After running the migrations

Test in this order — each one exercises a different fix:

1. Publish an article, using a category such as "Artist Feature"
2. Post in the community, choosing "Exhibition News"
3. Create an open call of type "Fellowship"
4. Admin Dashboard → **Add Listing** → create a gallery and a venue
5. Open a chapter page and click a venue under "Where We Gather"
6. Use **Locate address** on a gallery profile
7. Check the events page lists all eight chapters
8. Upload a non-square profile photo and confirm it crops rather than stretches

---

## Still outstanding

- A higher-resolution wordmark (item 1)
- Email confirmation is **off** — anyone can register with an address they do
  not own. This needs turning on before the site is public, which needs a
  domain and an email provider first.
- Database backups are not yet running — the workflow exists but the
  `SUPABASE_DB_URL` secret has not been added.
- Stripe is written but not deployed, pending your pricing decisions.
