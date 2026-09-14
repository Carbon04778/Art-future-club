-- ===========================================================================
-- Approving profiles by hand
--
-- NOT a migration. Nothing here runs automatically — these are snippets to
-- paste into the Supabase SQL editor when you need them. Run them one block at
-- a time, not the whole file.
--
-- THE NORMAL WAY IS THE ADMIN DASHBOARD: sign in as an admin and open
-- https://www.artfutureclub.com/admin — the review queue is there, with an
-- Approve button next to each name. Use that when you can. These queries are
-- for the times you cannot: a bulk approval, or being locked out.
--
-- WHY THIS WORKS AT ALL
--
-- Migration 017 installs a trigger, protect_profile_status(), which refuses to
-- let anyone but an admin change `status`. It deliberately allows DIRECT
-- database connections — the SQL editor and psql — because those already have
-- full access. So these run fine here and would be rejected from the browser.
--
-- THE DETAIL PEOPLE MISS
--
-- Always set `reviewed_at`. The member's "your profile is now live"
-- notification is derived from it (src/hooks/useNotifications.js skips any
-- profile where reviewed_at is null). Approve without it and the profile goes
-- public but the member is never told.
-- ===========================================================================


-- ---------------------------------------------------------------------------
-- 1. WHO IS WAITING?  (run this first — it changes nothing)
-- ---------------------------------------------------------------------------
-- 'draft'    = started, never submitted        -> not public
-- 'pending'  = submitted, waiting for you      -> not public
-- 'rejected' = you sent it back with a note    -> not public
-- 'flagged'  = reserved for automated screening -> not public
-- 'approved' = live

select
  'artist'            as kind,
  ap.id,
  ap.display_name,
  ap.status,
  ap.created_date,
  u.email
from public.artist_profile ap
left join auth.users u on u.id = ap.user_id
where ap.status is distinct from 'approved'

union all

select
  'gallery/venue'     as kind,
  cp.id,
  cp.display_name,
  cp.status,
  cp.created_date,
  u.email
from public.collector_profile cp
left join auth.users u on u.id = cp.user_id
where cp.status is distinct from 'approved'

order by created_date desc;


-- ---------------------------------------------------------------------------
-- 2. APPROVE ONE ARTIST, BY EMAIL
-- ---------------------------------------------------------------------------
-- Replace the address. This is the safest single-profile approval: it matches
-- the account rather than a display name, which may not be unique.

update public.artist_profile ap
set    status      = 'approved',
       review_note = null,
       reviewed_at = now()
from   auth.users u
where  u.id = ap.user_id
  and  lower(u.email) = lower('someone@example.com')
returning ap.id, ap.display_name, ap.status;

-- Returned no rows? Either the email is not in auth.users, or that account has
-- no artist profile (it may be a gallery — see block 4), or it was already
-- approved. Run block 1 to see.


-- ---------------------------------------------------------------------------
-- 3. APPROVE ONE ARTIST, BY NAME
-- ---------------------------------------------------------------------------
-- Use when the profile is unclaimed and has no account attached. Check what it
-- matches BEFORE running the update:

--   select id, display_name, status from public.artist_profile
--   where display_name ilike '%partial name%';

update public.artist_profile
set    status      = 'approved',
       review_note = null,
       reviewed_at = now()
where  display_name = 'Exact Display Name'
returning id, display_name, status;


-- ---------------------------------------------------------------------------
-- 4. APPROVE ONE GALLERY OR VENUE
-- ---------------------------------------------------------------------------
-- Galleries, museums and venues live in collector_profile, not artist_profile.

update public.collector_profile
set    status      = 'approved',
       review_note = null,
       reviewed_at = now()
where  display_name = 'Exact Display Name'
returning id, display_name, type, status;


-- ---------------------------------------------------------------------------
-- 5. APPROVE EVERYONE CURRENTLY WAITING
-- ---------------------------------------------------------------------------
-- This publishes every held profile WITHOUT anyone looking at them, which is
-- the exact thing the review step was built to prevent. Run block 1 first and
-- read the list.
--
-- Scoped to 'pending' and 'flagged' on purpose: those were submitted for
-- review. It deliberately leaves 'draft' alone — a draft is an unfinished
-- profile its owner has not submitted, and publishing it puts a half-written
-- page on the public site.

update public.artist_profile
set    status      = 'approved',
       review_note = null,
       reviewed_at = now()
where  status in ('pending', 'flagged')
returning id, display_name;

update public.collector_profile
set    status      = 'approved',
       review_note = null,
       reviewed_at = now()
where  status in ('pending', 'flagged')
returning id, display_name, type;


-- ---------------------------------------------------------------------------
-- 6. UNDO — send a profile back to the queue
-- ---------------------------------------------------------------------------

update public.artist_profile
set    status      = 'pending',
       reviewed_at = null
where  display_name = 'Exact Display Name'
returning id, display_name, status;


-- ---------------------------------------------------------------------------
-- 7. MAKE SOMEONE AN ADMIN INSTEAD
-- ---------------------------------------------------------------------------
-- Usually the better answer to "how do I approve people": give the right person
-- the Admin Dashboard and they never need this file again.

update public.profiles
set    role = 'admin'
where  lower(email) = lower('someone@example.com')
returning id, email, role;


-- ---------------------------------------------------------------------------
-- 8. TURN THE REVIEW STEP OFF ENTIRELY  —  think hard first
-- ---------------------------------------------------------------------------
-- This makes every NEW profile public the moment it is created. It restores
-- exactly the behaviour that caused the problem the moderation gate was built
-- to solve: anyone who signs up can put anything on the public site, and nobody
-- ever looks at it. Existing held profiles are unaffected.
--
-- Commented out deliberately. Uncomment only if you have decided you want no
-- moderation at all.

-- alter table public.artist_profile    alter column status set default 'approved';
-- alter table public.collector_profile alter column status set default 'approved';

-- To put the gate back:
-- alter table public.artist_profile    alter column status set default 'draft';
-- alter table public.collector_profile alter column status set default 'draft';


-- ---------------------------------------------------------------------------
-- 9. EVERY MEMBER, AND WHETHER THEY EVER SIGNED IN
-- ---------------------------------------------------------------------------
-- The Supabase Dashboard shows this too, under Authentication -> Users, with a
-- CSV export. This version adds what the dashboard cannot: their role, and what
-- they have actually built.
--
-- last_sign_in_at is NULL for someone who registered and never came back.
--
-- auth.users is only readable from a direct database connection. That is the
-- correct arrangement: email addresses should never be reachable with the
-- public anon key that ships in the browser.

select
  u.email,
  p.full_name,
  p.role,
  u.created_at                          as signed_up,
  u.last_sign_in_at,
  (u.email_confirmed_at is not null)    as email_confirmed,
  (select count(*) from public.artist_profile    ap where ap.user_id = u.id) as artist_profiles,
  (select count(*) from public.collector_profile cp where cp.user_id = u.id) as space_profiles
from auth.users u
left join public.profiles p on p.id = u.id
order by u.last_sign_in_at desc nulls last;

-- Older Supabase projects may not have every column above. If one is rejected,
-- drop that line — the minimal form always works:
--
--   select email, created_at, last_sign_in_at from auth.users
--   order by last_sign_in_at desc nulls last;

-- Just the addresses, for a mailing list:
--   select string_agg(email, ', ' order by email) from auth.users
--   where email_confirmed_at is not null;


-- ---------------------------------------------------------------------------
-- 10. CONFIRM — what is live now
-- ---------------------------------------------------------------------------

-- `is distinct from`, not `<>`. A NULL status makes `status <> 'approved'`
-- evaluate to NULL rather than true, so such a row would be counted in neither
-- column and quietly vanish from the totals. 017 declared the column NOT NULL
-- so this should not arise — but a count that can silently lose rows is not
-- worth keeping for the sake of two characters.

select
  (select count(*) from public.artist_profile    where status = 'approved')                as artists_live,
  (select count(*) from public.artist_profile    where status is distinct from 'approved') as artists_held,
  (select count(*) from public.collector_profile where status = 'approved')                as spaces_live,
  (select count(*) from public.collector_profile where status is distinct from 'approved') as spaces_held;
