-- ===========================================================================
-- Storage bucket + policies
-- Run AFTER 002_rls.sql
-- ===========================================================================

-- Public read: artwork and avatars are meant to be seen. Writes are restricted
-- to signed-in users, into a folder named after their own user id.
insert into storage.buckets (id, name, public)
values ('uploads', 'uploads', true)
on conflict (id) do nothing;

drop policy if exists uploads_public_read   on storage.objects;
drop policy if exists uploads_insert_own    on storage.objects;
drop policy if exists uploads_update_own    on storage.objects;
drop policy if exists uploads_delete_own    on storage.objects;

create policy uploads_public_read on storage.objects
  for select using (bucket_id = 'uploads');

-- The provider writes to `${user.id}/${uuid}-${filename}`, so the first path
-- segment must equal the caller's own id. This stops one member overwriting
-- another member's artwork.
create policy uploads_insert_own on storage.objects
  for insert to authenticated
  with check (
    bucket_id = 'uploads'
    and (storage.foldername(name))[1] = auth.uid()::text
  );

create policy uploads_update_own on storage.objects
  for update to authenticated
  using (
    bucket_id = 'uploads'
    and (storage.foldername(name))[1] = auth.uid()::text
  );

create policy uploads_delete_own on storage.objects
  for delete to authenticated
  using (
    bucket_id = 'uploads'
    and (storage.foldername(name))[1] = auth.uid()::text
  );
