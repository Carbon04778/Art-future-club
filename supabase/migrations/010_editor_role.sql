-- ===========================================================================
-- 010 — the "editor" role
-- Run once, after 002_rls.sql. Safe to re-run.
-- ===========================================================================
--
-- An editor writes and publishes editorial articles. Nothing else.
--
--   editor CAN     create, edit, publish and delete articles
--   editor CANNOT  moderate the forum
--                  read enquiries (which contain buyer names, emails, prices)
--                  read the newsletter list
--                  change anyone's role
--                  grant paid features
--
-- That separation is the point: interns writing articles should not have
-- access to sales enquiries.
-- ===========================================================================

-- 1. Allow the new value.
alter table public.profiles drop constraint if exists profiles_role_check;
alter table public.profiles
  add constraint profiles_role_check
  check (role in ('user', 'editor', 'admin'));

-- 2. A helper mirroring is_admin(). SECURITY DEFINER so it can read profiles
--    without recursing into that table's own policies.
create or replace function public.is_editor()
returns boolean
language sql
security definer
stable
set search_path = public
as $$
  select coalesce(
    (select role in ('editor', 'admin') from public.profiles where id = auth.uid()),
    false
  );
$$;

-- 3. Articles: editors get the same write access admins have.
drop policy if exists article_read_published on public.article;
create policy article_read_published on public.article
  for select using (published = true or public.is_editor());

drop policy if exists article_write_admin on public.article;
create policy article_write_admin on public.article
  for all to authenticated
  using (public.is_editor())
  with check (public.is_editor());

-- Everything else keeps using is_admin(), so an editor gains nothing beyond
-- the article table. The 38 checks in 003_rls_tests.sql still hold.
