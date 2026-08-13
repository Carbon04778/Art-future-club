-- ===========================================================================
-- 005 — allow direct database connections to change role / paywall columns
-- Run this once, after 002_rls.sql.
-- ===========================================================================
--
-- WHY THIS IS NEEDED
--
-- The original triggers allowed changes only when current_setting('role') was
-- exactly 'service_role'. But the Supabase SQL Editor connects as `postgres`,
-- where current_setting('role') returns 'none' — so promoting your own admin
-- account was blocked, which is not what we wanted.
--
-- WHY IT IS STILL SAFE
--
-- Requests from the app go through PostgREST, which ALWAYS sets the role
-- explicitly to 'anon' or 'authenticated'. Those two remain blocked, which is
-- the whole point: no member can promote themselves or grant themselves paid
-- features from the browser.
--
-- 'none' is only ever seen on a direct database connection — the SQL Editor,
-- or psql with the database password. Anyone holding those already has full
-- administrative access, so blocking them protects nothing.
--
-- Re-run 003_rls_tests.sql after this. It must still report 38 passes.
-- ===========================================================================

create or replace function public.protect_role_column()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.role is distinct from old.role
     and coalesce(current_setting('role', true), 'none') in ('anon', 'authenticated') then
    raise exception 'role may only be changed by service_role or a direct database connection';
  end if;
  return new;
end;
$$;

create or replace function public.protect_paywall_columns()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if coalesce(current_setting('role', true), 'none') in ('anon', 'authenticated')
     and (new.is_premium     is distinct from old.is_premium
       or new.is_featured    is distinct from old.is_featured
       or new.featured_until is distinct from old.featured_until) then
    raise exception 'is_premium / is_featured / featured_until are set by billing only';
  end if;
  return new;
end;
$$;
