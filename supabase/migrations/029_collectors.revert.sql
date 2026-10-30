-- Undo 029: the read policies exactly as 002 and 017 left them (everyone
-- can read collectors and saved works again). Deploy the previous site code
-- first.
--
-- KEEPS the collection table, collected_work.collection_id and
-- collector_profile.is_private: they hold members' collections and choices.
-- Drop them by hand only once you are sure they are not wanted.
begin;

drop policy if exists collector_read on public.collector_profile;
create policy collector_read on public.collector_profile
  for select using (
    status = 'approved'
    or not public.is_moderated_space(type)
    or user_id = auth.uid()
    or public.is_admin()
  );

drop policy if exists collected_read on public.collected_work;
create policy collected_read on public.collected_work
  for select using (true);

drop policy if exists collected_insert_own on public.collected_work;
create policy collected_insert_own on public.collected_work
  for insert to authenticated with check (user_id = auth.uid());
drop policy if exists collected_update_own on public.collected_work;
create policy collected_update_own on public.collected_work
  for update to authenticated using (user_id = auth.uid()) with check (user_id = auth.uid());

notify pgrst, 'reload schema';
commit;
select (select count(*) from public.collection) as collections_kept,
       (select count(*) from public.collected_work) as saved_works_kept;
