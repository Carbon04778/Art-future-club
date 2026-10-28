-- Undo 026: Open Calls readable by everyone again, and any signed-in member
-- may post (or an admin on anyone's behalf) — exactly the policies from
-- 002_rls.sql and 008. No stored data changes.
-- Deploy the previous site code first if the page relies on open_call_access.
begin;
drop policy if exists opencall_read on public.open_call;
create policy opencall_read on public.open_call
  for select using (true);
drop policy if exists opencall_insert_own on public.open_call;
create policy opencall_insert_own on public.open_call
  for insert to authenticated
  with check (posted_by_id = auth.uid() or public.is_admin());
drop function if exists public.open_call_access();
drop function if exists public.can_post_open_call();
drop function if exists public.has_premium_access();
notify pgrst, 'reload schema';
commit;
select policyname, qual, with_check from pg_policies where tablename = 'open_call' order by policyname;
