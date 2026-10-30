-- ===========================================================================
-- 029 — Collectors: collections, privacy, and who may see them
--       (B10 in CLIENT-REQUESTS)
-- Run once, in TEST first, then LIVE. Safe to re-run.
-- Undo: 029_collectors.revert.sql
-- ===========================================================================
--
-- Julie:
--   * collectors "collect their favourite work" — "If they can create
--     different collections, that would be ideal. Like in pinterest." Any
--     artwork, for sale or not ("it is a virtual collection").
--   * "Only collectors can see other collectors as well as premium users" —
--     including for non-premium artists and galleries: "We want to keep
--     collectors as private as possible."
--   * a collector can make their profile private.
--
-- BEFORE THIS FILE: every collector profile and every saved work could be
-- read by anyone, signed in or not, straight from the API with the public
-- key that ships in the site's JavaScript.
--
-- "Collectors" here are the people profile types: Collector, Curator,
-- Advisor, Other — everything that is not a gallery, venue or Directory
-- listing (is_moderated_space). Galleries, venues, Directory listings and
-- artists are public exactly as before, and so are the works THEY collect.
--
-- Changes no existing row's content. Adds two columns (both empty / false),
-- one table, three functions, and replaces three read policies.
-- ===========================================================================

begin;

-- ----------------------------------------------------------------- columns
alter table public.collector_profile
  add column if not exists is_private boolean not null default false;

create table if not exists public.collection (
  id            uuid primary key default gen_random_uuid(),
  user_id       uuid not null references auth.users(id) on delete cascade,
  name          text not null check (char_length(trim(name)) between 1 and 80),
  description   text,
  created_date  timestamptz not null default now(),
  updated_date  timestamptz not null default now()
);
create index if not exists idx_collection_user on public.collection(user_id);

-- A saved work belongs to one collection; the same work may be saved into
-- several (one row each). Deleting a collection keeps its works: they go
-- back to "Unsorted" (collection_id null), which is where every work saved
-- before collections existed already is.
alter table public.collected_work
  add column if not exists collection_id uuid references public.collection(id) on delete set null;
create index if not exists idx_collected_collection on public.collected_work(collection_id);

-- ---------------------------------------------------------------- who sees
-- SECURITY DEFINER: these look at the caller's own subscription and
-- profiles, and at the owner's profile, whatever the read policies say.
-- They only ever answer yes/no.

create or replace function public.is_people_type(kind text)
returns boolean
language sql
immutable
as $$
  select not public.is_moderated_space(kind);
$$;

-- May the caller see collectors at all? Admins, premium members, and
-- members who are collectors themselves (Julie: "Only collectors can see
-- other collectors as well as premium users").
create or replace function public.can_see_collectors()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select auth.uid() is not null and (
    public.is_admin()
    or public.has_premium_access()
    or exists (
      select 1 from public.collector_profile c
      where c.user_id = auth.uid() and public.is_people_type(c.type)
    )
  );
$$;

-- May the caller see what this member has collected? Their own, an admin,
-- anyone for an artist's or gallery's collection (public as before), and
-- for a collector's: only those allowed to see collectors, and never when
-- the collector has made their profile private.
create or replace function public.can_see_member_collection(owner uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select
    owner = auth.uid()
    or public.is_admin()
    or case
         when exists (select 1 from public.collector_profile c
                       where c.user_id = owner and public.is_people_type(c.type)) then
           not exists (select 1 from public.collector_profile c
                        where c.user_id = owner and public.is_people_type(c.type) and c.is_private)
           and public.can_see_collectors()
         else true
       end;
$$;

grant execute on function public.can_see_collectors()             to anon, authenticated;
grant execute on function public.can_see_member_collection(uuid)  to anon, authenticated;

-- ---------------------------------------------------------------- policies
-- collector_profile. Was (017): approved, or any people type, or owner, or
-- admin — so every collector was public. Galleries, venues and Directory
-- listings keep exactly their old rule.
drop policy if exists collector_read on public.collector_profile;
create policy collector_read on public.collector_profile
  for select using (
    user_id = auth.uid()
    or public.is_admin()
    or (public.is_moderated_space(type) and status = 'approved')
    or (public.is_people_type(type) and not is_private and public.can_see_collectors())
  );

-- collected_work. Was: for select using (true).
drop policy if exists collected_read on public.collected_work;
create policy collected_read on public.collected_work
  for select using (public.can_see_member_collection(user_id));

-- collection: read like the works in it; write your own.
alter table public.collection enable row level security;
drop policy if exists collection_read on public.collection;
create policy collection_read on public.collection
  for select using (public.can_see_member_collection(user_id));
drop policy if exists collection_insert_own on public.collection;
create policy collection_insert_own on public.collection
  for insert to authenticated with check (user_id = auth.uid());
drop policy if exists collection_update_own on public.collection;
create policy collection_update_own on public.collection
  for update to authenticated using (user_id = auth.uid()) with check (user_id = auth.uid());
drop policy if exists collection_delete_own on public.collection;
create policy collection_delete_own on public.collection
  for delete to authenticated using (user_id = auth.uid());

-- A work can only be filed in one of your OWN collections.
drop policy if exists collected_insert_own on public.collected_work;
create policy collected_insert_own on public.collected_work
  for insert to authenticated
  with check (
    user_id = auth.uid()
    and (collection_id is null
         or exists (select 1 from public.collection k where k.id = collection_id and k.user_id = auth.uid()))
  );
drop policy if exists collected_update_own on public.collected_work;
create policy collected_update_own on public.collected_work
  for update to authenticated
  using (user_id = auth.uid())
  with check (
    user_id = auth.uid()
    and (collection_id is null
         or exists (select 1 from public.collection k where k.id = collection_id and k.user_id = auth.uid()))
  );

notify pgrst, 'reload schema';

commit;

-- Check
select
  (select count(*) from information_schema.columns
     where table_name = 'collector_profile' and column_name = 'is_private')            as private_column_1,
  (select count(*) from information_schema.tables where table_name = 'collection')     as collection_table_1,
  (select count(*) from pg_policies where tablename = 'collected_work'
     and policyname = 'collected_read' and qual like '%can_see_member_collection%')    as works_policy_1,
  (select count(*) from public.collected_work)                                          as saved_works_unchanged,
  (select count(*) from public.collected_work where collection_id is null)             as all_unsorted_for_now,
  (select count(*) from public.collector_profile where is_private)                      as private_profiles_0;
