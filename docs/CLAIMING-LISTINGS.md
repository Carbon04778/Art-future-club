# Claiming admin-created listings

How an unclaimed listing becomes a member's own profile, what stops it, and
what is still outstanding. Written 2026-09-18 after the Bangkok gallery import.

## The mechanism

An admin-created listing has `user_id = null` — it is **unclaimed**. It is a
real, public, approved profile that nobody owns yet. Two places create them:

- the **Add Listing** tab, `src/components/AdminCreatePanel.jsx`
- the bulk importer, `scripts/import-galleries.mjs`

Both write **`claim_email`**: the address the listing is filed under. When
someone registers with that same address, the listing is attached to their new
account.

The handover happens in one function, `public.claim_my_profile()`, now
committed as `supabase/migrations/013_claim_profile.sql`. The path is:

1. Member registers — `register()` in `src/api/providers/supabase.js`.
2. They confirm their address (6-digit OTP, `verifyOtp`) if "Confirm email" is
   on in the Supabase dashboard.
3. They land on `/onboarding`, which calls `claimMyProfile()` on mount —
   `src/pages/Onboarding.jsx:31`.
4. The function matches `lower(claim_email)` against their confirmed address
   and sets `user_id`.
5. Onboarding sees they now have a profile and redirects them straight to it,
   already filled in, instead of showing an empty form.

## What stops a claim

| Condition | Result |
| --- | --- |
| `claim_email` is null on the listing | Never claimable by registering |
| Registered address differs from `claim_email` | No match — the most likely real failure |
| Address not confirmed (`email_confirmed_at` null) | Function returns early, claims nothing |
| Member already owns a profile of that kind | `not exists` guard skips the claim entirely |
| Two unclaimed listings share one `claim_email` | Only the oldest by `created_date` is claimed |
| Member never reaches `/onboarding` | Nothing fires — it is the only call site |

Matching is case-insensitive on both sides (`lower()` in SQL, and the writers
lowercase before storing). `type` is **not** checked: a Gallery, Venue or
Collector row all match the same way and all report `'collector'`.

`claimMyProfile()` swallows every error and returns `[]`, so a failed or
missing claim is silent by design — the member simply sees normal onboarding.

## Claim is one-way

`AdminEditListingsPanel.jsx` shows `· UNCLAIMED` while `user_id` is null, and
once claimed the claim-email input is disabled: *"This profile already belongs
to a member, so the claim email no longer does anything."*

`"Unclaimed"` in the filter row is a **view filter, not an action**. There is
no unclaim anywhere in `src/`. Reversing a claim means clearing `user_id` by
hand in the SQL editor.

## Outstanding

- [ ] **Six Bangkok galleries have no claim address** and cannot be claimed by
      registering. The manifest had no email for them — only Instagram/phone:
      VS Gallery (+66 89 013 9966), Play Art House (@playarthouse,
      +66 91 048 7187), Ming Art Space (@ming.artspace), Cartel Artspace
      (@cartel_art_space, +66 89 508 3859), Adult Material
      (@adultmaterialgallery), 10 10 Art Space (@1010artspace).
      Add the address in the Edit Listings panel once known. Do not guess one:
      `claim_email` decides who can take over the page.
- [ ] **Migration 012 is still missing** from the repo. Like 013 it was applied
      by hand and never committed; unlike 013 it has not been recovered. Dump
      it from the dashboard and commit it so the repo matches the database.
- [ ] Only Bangkok has been imported so far (25 of 363 manifest rows). Note
      that `gallery-import-2026-09.revert.sql` covers **all 363 ids**, every
      city, not just the ones imported — to undo one city use
      `node scripts/import-galleries.mjs --revert --city <city>` instead.

## Checking the state

19 of the 25 Bangkok rows carry a claim address; none is shared with another
unclaimed listing. To re-check across the whole site, look for unclaimed rows
whose `claim_email` collides:

```sql
select lower(claim_email) as addr, count(*), array_agg(display_name)
from public.collector_profile
where user_id is null and claim_email is not null
group by 1 having count(*) > 1;
```

Swap in `artist_profile` for the other table. Both were clean on 2026-09-18.
