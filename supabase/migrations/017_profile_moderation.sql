-- ===========================================================================
-- 017 — new profiles must be approved before they go public
-- Run once, after 002_rls.sql. Safe to re-run.
-- ===========================================================================
--
-- THE PROBLEM
--
-- Anyone could sign up, put anything at all on their profile, and be live on
-- the public site the moment they pressed Save. Nobody looked first.
--
-- WHY THIS IS IN THE DATABASE AND NOT IN THE INTERFACE
--
-- The browser holds the anon key — it ships inside the public JavaScript
-- bundle. Hiding unapproved profiles with a filter in React would hide them
-- from the site while leaving every one of them readable straight from the
-- REST API. The content would still be published; it would just not be drawn.
--
-- There is a practical reason too: thirteen separate public surfaces read
-- these two tables (the directories, three maps, the chapter pages, the
-- registry, trending, both profile pages, the community sidebar). One policy
-- per table covers all of them at once, and covers every page added later.
--
-- WHAT IS DELIBERATELY NOT MODERATED
--
--   * Every profile that already exists. Grandfathered as approved below —
--     this must not retrospectively unpublish the current membership.
--   * Private collectors, curators and advisors. They share a table with
--     galleries, but they publish no gallery page and no imagery.
--   * Edits made after approval. A profile is reviewed once, when it first
--     goes live. Automated screening is planned for a later phase; the
--     'flagged' status below exists so it can hook in without a migration.
--
-- Re-run 003_rls_tests.sql afterwards. It must still report 38 passes.
-- ===========================================================================

-- ------------------------------------------------------------------ columns
--
-- NOTE THE DEFAULT. Adding the column with default 'approved' backfills every
-- existing row in one statement — that is the grandfathering. The default is
-- then changed to 'draft' immediately below, so only NEW profiles are gated.
-- Doing it in this order avoids a separate UPDATE that could miss rows written
-- between the two statements.

alter table public.artist_profile
  add column if not exists status       text not null default 'approved',
  add column if not exists review_note  text,
  add column if not exists reviewed_at  timestamptz,
  add column if not exists reviewed_by  uuid references auth.users(id) on delete set null;

alter table public.collector_profile
  add column if not exists status       text not null default 'approved',
  add column if not exists review_note  text,
  add column if not exists reviewed_at  timestamptz,
  add column if not exists reviewed_by  uuid references auth.users(id) on delete set null;

-- From here on, anything new starts as a draft.
alter table public.artist_profile    alter column status set default 'draft';
alter table public.collector_profile alter column status set default 'draft';

do $$
begin
  alter table public.artist_profile add constraint artist_profile_status_check
    check (status in ('draft','pending','approved','rejected','flagged'));
exception when duplicate_object then null;
end $$;

do $$
begin
  alter table public.collector_profile add constraint collector_profile_status_check
    check (status in ('draft','pending','approved','rejected','flagged'));
exception when duplicate_object then null;
end $$;

-- The directories filter on this on every page load.
create index if not exists idx_artist_status    on public.artist_profile(status);
create index if not exists idx_collector_status on public.collector_profile(status);

-- ------------------------------------------------------------- which spaces
--
-- collector_profile holds galleries and venues alongside private collectors,
-- curators and advisors. Only the first group publishes a public page with
-- imagery, so only that group is moderated.
--
-- This list must match MODERATED_COLLECTOR_TYPES in src/lib/profileReadiness.js
-- (which derives it from VENUE_TYPES in src/lib/venueTypes.js).
-- scripts/verify-moderation.mjs fails if the two ever drift apart.

create or replace function public.is_moderated_space(kind text)
returns boolean
language sql
immutable
as $$
  select coalesce(kind, '') in (
    'Gallery', 'Institution', 'Museum', 'Foundation', 'Event Space', 'Restaurant'
  );
$$;

-- ------------------------------------------------------------- read policies
--
-- Replaces `for select using (true)` on both tables.
--
-- A profile is visible when it is approved, or to the member who owns it, or
-- to an admin. auth.uid() is NULL for anonymous visitors, so `user_id =
-- auth.uid()` is NULL rather than true for them — an unclaimed draft created
-- by an admin is therefore visible to admins only, which is correct.

drop policy if exists artist_read on public.artist_profile;
create policy artist_read on public.artist_profile
  for select using (
    status = 'approved'
    or user_id = auth.uid()
    or public.is_admin()
  );

drop policy if exists collector_read on public.collector_profile;
create policy collector_read on public.collector_profile
  for select using (
    status = 'approved'
    or not public.is_moderated_space(type)
    or user_id = auth.uid()
    or public.is_admin()
  );

-- ------------------------------------------------------------------ trigger
--
-- PRIVILEGE GUARD — the equivalent of trg_protect_paywall on the billing
-- columns. Without it a member could simply run
--   update artist_profile set status = 'approved' where user_id = <their id>
-- and the entire review step would be decorative.
--
-- Unlike the paywall columns, admins DO need to write this from the browser,
-- because approving is done in the Admin Dashboard. So the rule is not
-- "service role only" but "admins, plus one specific transition for members".

create or replace function public.protect_profile_status()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  -- PostgREST always sets the role explicitly. 'none' means a direct database
  -- connection (SQL editor or psql), which already has full access — the same
  -- reasoning as 005_fix_admin_triggers.sql.
  from_browser boolean :=
    coalesce(current_setting('role', true), 'none') in ('anon', 'authenticated');
begin
  if not from_browser then return new; end if;
  if public.is_admin() then return new; end if;

  if tg_op = 'INSERT' then
    -- A member may start a draft, or submit immediately. Nothing else.
    if new.status not in ('draft', 'pending') then
      raise exception
        'A new profile starts as a draft and must be approved before it is published.';
    end if;
    return new;
  end if;

  -- Reviewer fields are the admin's record of the decision, not the
  -- member's to write.
  if new.review_note is distinct from old.review_note
     or new.reviewed_by is distinct from old.reviewed_by
     or new.reviewed_at is distinct from old.reviewed_at then
    raise exception 'Review details can only be set by an administrator.';
  end if;

  -- An ordinary edit that does not touch the status.
  if new.status is not distinct from old.status then return new; end if;

  -- The single transition a member may make: submitting for review.
  if new.status = 'pending' and old.status in ('draft', 'rejected') then
    return new;
  end if;

  raise exception 'Only an administrator can change a profile''s review status.';
end;
$$;

drop trigger if exists trg_protect_artist_status on public.artist_profile;
create trigger trg_protect_artist_status
  before insert or update on public.artist_profile
  for each row execute function public.protect_profile_status();

drop trigger if exists trg_protect_collector_status on public.collector_profile;
create trigger trg_protect_collector_status
  before insert or update on public.collector_profile
  for each row execute function public.protect_profile_status();

-- ------------------------------------------------------------------ confirm

select
  (select count(*) from public.artist_profile    where status = 'approved') as artists_live,
  (select count(*) from public.artist_profile    where status <> 'approved') as artists_held,
  (select count(*) from public.collector_profile where status = 'approved') as spaces_live,
  (select count(*) from public.collector_profile where status <> 'approved') as spaces_held;
