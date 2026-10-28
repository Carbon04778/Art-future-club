-- ===========================================================================
-- 026 — Open Calls for premium members only (B9 in CLIENT-REQUESTS)
-- Run once, in TEST first, then LIVE. Safe to re-run.
-- Undo: 026_open_calls_premium.revert.sql
-- ===========================================================================
--
-- Julie:
--   * premium = "Anyone in a paid plan or that I have manually marked as a
--     premium member". Both are an ACTIVE subscription: Set Premium in the
--     admin (grantMembership) writes one too. Checked on live 2026-10-28:
--     the 18 premium artist accounts and the 18 accounts with an active
--     subscription are the same 18 people.
--   * Partner / Paid Member galleries and venues count as premium as well
--     (partnership_type, set by an admin).
--   * "Galleries need to be paid/partner to post."
--   * Everyone else, signed in or not, sees "Upgrade to view".
--
-- WHY IN THE DATABASE: the site's public key ships in its JavaScript. Hiding
-- the list only in the page would leave every open call readable straight
-- from the API — the same reason 017 moderates profiles here.
--
-- Changes nothing stored. Only who may read and who may post.
-- ===========================================================================

begin;

-- ---------------------------------------------------------- who is premium
-- SECURITY DEFINER so it can look at the caller's own subscription and
-- spaces whatever their read policies say; it only ever answers about
-- auth.uid(), never about anyone else.
create or replace function public.has_premium_access()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select auth.uid() is not null and (
    public.is_admin()
    or exists (
      select 1 from public.subscription s
      where s.user_id = auth.uid()
        and s.status = 'active'
        and (s.expires_at is null or s.expires_at > now())
    )
    or exists (
      select 1 from public.collector_profile c
      where c.user_id = auth.uid()
        and c.partnership_type in ('Paid Member', 'Partner')
    )
  );
$$;

-- ------------------------------------------------------ who may post one
-- Admins, or the owner of an APPROVED gallery/venue that is paid or a
-- partner. Private collectors and artists do not post open calls.
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
        and public.is_moderated_space(c.type)
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

-- The page asks both questions in one call.
create or replace function public.open_call_access()
returns table (can_view boolean, can_post boolean)
language sql
stable
security definer
set search_path = public
as $$
  select public.has_premium_access(), public.can_post_open_call();
$$;

grant execute on function public.has_premium_access() to anon, authenticated;
grant execute on function public.can_post_open_call() to anon, authenticated;
grant execute on function public.open_call_access()   to anon, authenticated;

-- ---------------------------------------------------------------- policies
-- Was: for select using (true) — anyone, signed in or not.
drop policy if exists opencall_read on public.open_call;
create policy opencall_read on public.open_call
  for select using (
    public.has_premium_access()
    or posted_by_id = auth.uid()
  );

-- Was (008): any signed-in member could post, or an admin on anyone's
-- behalf. Admins keep posting on someone's behalf.
drop policy if exists opencall_insert_own on public.open_call;
create policy opencall_insert_own on public.open_call
  for insert to authenticated
  with check (
    (posted_by_id = auth.uid() and public.can_post_open_call())
    or public.is_admin()
  );

-- update / delete stay as they were: the poster or an admin.

notify pgrst, 'reload schema';

commit;

-- Check: the two policies, and how many accounts are premium today.
select
  (select count(*) from pg_policies where tablename = 'open_call' and policyname = 'opencall_read'
     and qual like '%has_premium_access%')                                  as read_policy_ok,
  (select count(*) from pg_policies where tablename = 'open_call' and policyname = 'opencall_insert_own'
     and with_check like '%can_post_open_call%')                            as insert_policy_ok,
  (select count(distinct user_id) from public.subscription
     where status = 'active' and (expires_at is null or expires_at > now())) as premium_by_subscription,
  (select count(*) from public.collector_profile
     where user_id is not null and partnership_type in ('Paid Member','Partner')) as premium_by_partnership,
  (select count(*) from public.open_call)                                   as open_calls_stored;
