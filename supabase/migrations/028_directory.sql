-- ===========================================================================
-- 028 — the Directory: art stores, framers, printers (B11 in CLIENT-REQUESTS)
-- Run once, in TEST first, then LIVE. Safe to re-run.
-- Undo: 028_directory.revert.sql
-- ===========================================================================
--
-- Julie: a "Directory" page, "similar to venues", for places of interest —
-- "art stores, framers and printers would be the start". A profile image, a
-- bio, website and socials; no photo galleries for now. Businesses can claim
-- their listing; listed on the map.
--
-- They are collector_profile rows with three new types, exactly as venues
-- are. That gives them, unchanged, everything galleries and venues already
-- have: admin create/edit, claiming by email (013), the approval queue (017),
-- the map, and changing type (027).
--
-- This file changes NO rows. It updates three lists:
--   1. is_moderated_space  — directory listings, like galleries and venues,
--      are hidden from the public until approved. Must match
--      MODERATED_COLLECTOR_TYPES in src/lib/profileReadiness.js.
--   2. switch_target_types — members may ask to become one (A1).
--   3. can_post_open_call  — stays galleries and venues only (Julie:
--      "Galleries need to be paid/partner to post"). It used
--      is_moderated_space, which now includes the directory, so it names the
--      gallery and venue types itself.
-- ===========================================================================

begin;

create or replace function public.is_moderated_space(kind text)
returns boolean
language sql
immutable
as $$
  select coalesce(kind, '') in (
    'Gallery', 'Institution', 'Museum', 'Foundation', 'Event Space', 'Restaurant',
    'Art Store', 'Framer', 'Printer'
  );
$$;

create or replace function public.switch_target_types()
returns text[]
language sql
immutable
as $$
  select array['Artist', 'Collector', 'Curator', 'Advisor', 'Other',
               'Gallery', 'Institution', 'Museum', 'Foundation', 'Event Space', 'Restaurant',
               'Art Store', 'Framer', 'Printer'];
$$;

-- As in 026, with the gallery/venue types named instead of is_moderated_space.
create or replace function public.can_post_open_call()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select auth.uid() is not null and (
    public.is_admin()
    or exists (
      select 1 from public.collector_profile c
      where c.user_id = auth.uid()
        and c.status = 'approved'
        and c.type in ('Gallery', 'Institution', 'Museum', 'Foundation', 'Event Space', 'Restaurant')
        and (
          c.partnership_type in ('Paid Member', 'Partner')
          or exists (
            select 1 from public.subscription s
            where s.user_id = auth.uid()
              and s.status = 'active'
              and (s.expires_at is null or s.expires_at > now())
          )
        )
    )
  );
$$;

notify pgrst, 'reload schema';

commit;

-- Check
select
  public.is_moderated_space('Framer')                         as framer_needs_approval,
  public.is_moderated_space('Gallery')                        as gallery_still_needs_approval,
  not public.is_moderated_space('Collector')                  as collector_still_not,
  'Printer' = any (public.switch_target_types())              as can_switch_to_printer,
  (select count(*) from public.collector_profile
     where type in ('Art Store', 'Framer', 'Printer'))        as directory_listings_now,
  (select count(*) from public.collector_profile)             as spaces_unchanged;
