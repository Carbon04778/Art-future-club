-- ===========================================================================
-- 024 — profiles_public without a SECURITY DEFINER view
-- Run once, after 020. Safe to re-run. One transaction: all or nothing.
-- ===========================================================================
--
-- THE ADVISOR WARNING ("Security Definer View", CRITICAL)
--
-- 020 made profiles_public run as its owner on purpose: public.profiles is
-- own-row-or-admin, and the view is the one sanctioned way past that, limited
-- to id, full_name and role (the "AFC Team" badge on ArtistProfileView).
--
-- The real problem was not the reading. Supabase grants anon and authenticated
-- ALL privileges on everything in `public`, and a one-table view like this is
-- auto-updatable. Checked live 2026-10-04: anon held INSERT, UPDATE, DELETE
-- and TRUNCATE on profiles_public. Writes through an owner-rights view are
-- checked as the owner, who is not bound by row-level security on profiles.
--
-- THE FIX
--
-- The rights-bypassing part moves into a function in a schema the API does
-- not expose. The view becomes an ordinary security_invoker view over that
-- function — a view over a function cannot be written through at all — and
-- only SELECT is granted on it. What visitors can read is unchanged: the same
-- three columns, for every member.
--
-- Nothing in the app changes: it still queries profiles_public.
-- ===========================================================================

begin;

-- ------------------------------------------- 1. the one privileged reader
create schema if not exists private;
revoke all on schema private from public;
grant usage on schema private to anon, authenticated, service_role;

create or replace function private.public_profiles()
returns table (id uuid, full_name text, role text)
language sql
stable
security definer
set search_path = ''
as $$
  select p.id, p.full_name, p.role from public.profiles p
$$;

revoke all on function private.public_profiles() from public;
grant execute on function private.public_profiles() to anon, authenticated, service_role;

-- ----------------------------------------------------- 2. the public view
create or replace view public.profiles_public
  with (security_invoker = true)
as
  select id, full_name, role from private.public_profiles();

-- Read only. The Supabase default grants are what made writes possible.
revoke all on public.profiles_public from anon, authenticated;
grant select on public.profiles_public to anon, authenticated;

commit;

-- --------------------------------------------------------------- 3. confirm
--
-- Expected: view_is_invoker = true, rows_via_view = members_total,
-- email_leaked_by_view = 0, anon_write_grants = 0.
--
-- From outside, with the anon key:
--   <project>/rest/v1/profiles_public?select=id,full_name,role   still returns rows
--   <project>/rest/v1/profiles?select=email                      still returns []

select
  (select 'security_invoker=true' = any(reloptions)
     from pg_class where oid = 'public.profiles_public'::regclass)  as view_is_invoker,
  (select count(*) from public.profiles)                            as members_total,
  (select count(*) from public.profiles_public)                     as rows_via_view,
  (select count(*)
     from information_schema.columns
    where table_schema = 'public'
      and table_name   = 'profiles_public'
      and column_name  = 'email')                                   as email_leaked_by_view,
  (select count(*)
     from information_schema.role_table_grants
    where table_schema = 'public'
      and table_name   = 'profiles_public'
      and grantee in ('anon', 'authenticated')
      and privilege_type <> 'SELECT')                               as anon_write_grants;
