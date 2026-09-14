-- ===========================================================================
-- 020 — stop handing out every member's email address
-- Run once, after 019. Safe to re-run.
-- ===========================================================================
--
-- THE PROBLEM
--
-- 002_rls.sql gave public.profiles this policy:
--
--   -- Public read (display names appear all over the app).
--   create policy profiles_read on public.profiles for select using (true);
--
-- The intent was display names. But row-level security filters ROWS, not
-- COLUMNS — granting read on the row hands over every column in it. The table
-- holds `email` and `role`, so the anon key that ships inside the JavaScript
-- bundle could read the address of every member, and see which accounts are
-- administrators.
--
-- Confirmed against production before writing this: 39 addresses and 6 admin
-- accounts, retrievable by anyone, with no credentials beyond the public key.
--
-- WHAT THE APP ACTUALLY NEEDS
--
-- Only four places read this table. Three are the admin panels, which need the
-- email and are admin-only anyway. The fourth is ArtistProfileView, which reads
-- ONE column — `role` — to show an "AFC Team" / "AFC Editor" badge.
--
-- So: the table becomes own-row-or-admin, and a view exposes the three columns
-- that are genuinely public. Nothing visible to a member changes.
-- ===========================================================================

-- ------------------------------------------------------- 1. the public view
--
-- No `email`. That is the entire point.
--
-- A view runs with the privileges of its OWNER unless security_invoker is set,
-- and the owner here owns public.profiles, so the restrictive policy below does
-- not block it. That is exactly what makes this work: the view is the ONE
-- sanctioned way past that policy, and it can only ever return three columns.

drop view if exists public.profiles_public;

create view public.profiles_public as
  select id, full_name, role
  from public.profiles;

-- Explicitly NOT security_invoker. Spelled out because a future Postgres
-- default change, or someone "tidying" this, would silently empty the view and
-- take the badge with it.
alter view public.profiles_public set (security_invoker = false);

grant select on public.profiles_public to anon, authenticated;

-- ------------------------------------------------- 2. close the table itself
--
-- Own row, or an admin. `is_admin()` is SECURITY DEFINER (001_schema.sql), so
-- it reads profiles without recursing into this policy.

drop policy if exists profiles_read on public.profiles;

create policy profiles_read on public.profiles
  for select
  using (
    id = auth.uid()
    or public.is_admin()
  );

-- ---------------------------------------------------------------- 3. confirm
--
-- Run this as a DIRECT connection (the SQL editor) and it reports the shape of
-- the fix, not what any particular visitor can see — the editor bypasses RLS.
--
-- To prove the fix from the outside, request this with the anon key:
--   <project>/rest/v1/profiles?select=email
-- It must come back empty. And:
--   <project>/rest/v1/profiles_public?select=id,full_name,role
-- must still return rows.

select
  (select count(*) from public.profiles)                            as members_total,
  (select count(*) from public.profiles_public)                     as visible_via_view,
  (select count(*)
     from information_schema.columns
    where table_schema = 'public'
      and table_name   = 'profiles_public'
      and column_name  = 'email')                                   as email_leaked_by_view,
  (select count(*)
     from pg_policies
    where schemaname = 'public'
      and tablename  = 'profiles'
      and policyname = 'profiles_read'
      and qual like '%is_admin%')                                   as policy_is_restricted;
