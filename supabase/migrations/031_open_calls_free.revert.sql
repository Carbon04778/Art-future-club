-- ===========================================================================
-- Undo 031 — Open Calls back to PREMIUM ONLY, exactly as migration 026 set it.
-- Run in TEST first, then LIVE. Safe to re-run. No website change needed.
--
-- Who can view after this: admins, members with an active subscription, and
-- members whose gallery/venue is a Paid Member or Partner. Everyone else
-- sees "Upgrade to view". Posting is unchanged.
-- ===========================================================================

begin;

create or replace function public.open_call_access()
returns table (can_view boolean, can_post boolean)
language sql
stable
security definer
set search_path = public
as $$
  select public.has_premium_access(), public.can_post_open_call();
$$;

grant execute on function public.open_call_access() to anon, authenticated;

drop policy if exists opencall_read on public.open_call;
create policy opencall_read on public.open_call
  for select using (
    public.has_premium_access()
    or posted_by_id = auth.uid()
  );

notify pgrst, 'reload schema';
commit;

-- Which project this ran in, and the result. The SQL editor is not signed in
-- as a site member, so like a logged-out visitor it should show
-- can_view = false. (Admins and premium members still see the list.)
select to_jsonb(e) as this_project from private.afc_environment e;
select * from public.open_call_access();
