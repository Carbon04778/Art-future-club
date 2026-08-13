-- ===========================================================================
-- 008 — let admins create galleries, venues and artist profiles
-- Run once, after 002_rls.sql. Safe to re-run.
-- ===========================================================================
--
-- WHY
--
-- The original insert policies required user_id = auth.uid(), meaning a
-- profile could only ever be created by the person it belongs to. An admin
-- therefore could not add a partner gallery or venue, and could not set up a
-- profile on a member's behalf — which made gallery and venue features
-- impossible to test or populate.
--
-- WHAT THIS ALLOWS
--
-- Admins may create profiles with a NULL user_id ("unclaimed" profiles). The
-- listing is live and visible immediately; the gallery or artist can be
-- attached to a real login later by setting user_id.
--
-- WHAT IT STILL PREVENTS
--
-- Ordinary members remain unable to create or edit anyone else's profile.
-- The paywall columns (is_premium / is_featured) stay service-role only, so
-- an admin still cannot hand out paid features for free — that remains the
-- billing webhook's job alone.
-- ===========================================================================

-- ---------------------------------------------------------------- artists
drop policy if exists artist_insert_own on public.artist_profile;
create policy artist_insert_own on public.artist_profile
  for insert to authenticated
  with check (
    user_id = auth.uid()                          -- your own profile
    or (public.is_admin() and user_id is null)    -- admin-created, unclaimed
    or (public.is_admin() and user_id is not null)-- admin acting for a member
  );

-- ------------------------------------------------------- galleries/venues
drop policy if exists collector_insert_own on public.collector_profile;
create policy collector_insert_own on public.collector_profile
  for insert to authenticated
  with check (
    user_id = auth.uid()
    or public.is_admin()
  );

-- Admins already had update/delete via the existing policies; those remain.

-- ---------------------------------------------------- gallery works/events
-- Same reasoning: an admin populating a partner gallery needs to be able to
-- add its works, and to schedule events on its behalf.
drop policy if exists gwork_insert_own on public.gallery_work;
create policy gwork_insert_own on public.gallery_work
  for insert to authenticated
  with check (owner_id = auth.uid() or public.is_admin());

drop policy if exists event_insert_own on public.event;
create policy event_insert_own on public.event
  for insert to authenticated
  with check (organizer_id = auth.uid() or public.is_admin());

drop policy if exists opencall_insert_own on public.open_call;
create policy opencall_insert_own on public.open_call
  for insert to authenticated
  with check (posted_by_id = auth.uid() or public.is_admin());

-- user_id must be nullable for unclaimed profiles. It already is, but make
-- the intent explicit so a future migration does not tighten it by accident.
alter table public.artist_profile    alter column user_id drop not null;
alter table public.collector_profile alter column user_id drop not null;
