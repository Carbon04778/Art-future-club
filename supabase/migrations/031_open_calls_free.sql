-- ===========================================================================
-- 031 — Open Calls free to view for now (owner, 2026-11-22)
-- Run once, in TEST first, then LIVE. Safe to re-run.
-- Undo (back to premium only, exactly as 026): 031_open_calls_free.revert.sql
-- ===========================================================================
--
-- Owner: "open that to free now" — with a reminder to make it premium again
-- later (docs/CLIENT-REQUESTS.md, "Reminders").
--
-- VIEWING: everyone, signed in or not (Julie, 2026-10-27: "Logged out
-- visitors can see all non premium features right now").
-- POSTING: unchanged — admins, or an approved gallery/venue that is a Paid
-- Member or Partner (can_post_open_call from 026).
--
-- No website change is needed: the Open Calls page asks open_call_access()
-- whether to show the list or "Upgrade to view". The premium rule itself
-- (has_premium_access) is kept, unused, so the undo file only has to put
-- two things back. No data changes.
-- ===========================================================================

begin;

create or replace function public.open_call_access()
returns table (can_view boolean, can_post boolean)
language sql
stable
security definer
set search_path = public
as $$
  select true, public.can_post_open_call();
$$;

grant execute on function public.open_call_access() to anon, authenticated;

drop policy if exists opencall_read on public.open_call;
create policy opencall_read on public.open_call
  for select using (true);

notify pgrst, 'reload schema';
commit;

-- Which project this ran in, and the result: expect can_view = true.
select to_jsonb(e) as this_project from private.afc_environment e;
select * from public.open_call_access();
