-- Undo 028: the three lists exactly as 017, 027 and 026 left them.
-- Deploy the previous site code first. Any directory listings already made
-- stay in the table; with this undone they are no longer held for approval,
-- so set them to draft (or delete them) BEFORE running this if any exist:
--   select id, display_name, type, status from public.collector_profile
--    where type in ('Art Store', 'Framer', 'Printer');
begin;

create or replace function public.is_moderated_space(kind text)
returns boolean
language sql
immutable
as $$
  select coalesce(kind, '') in (
    'Gallery', 'Institution', 'Museum', 'Foundation', 'Event Space', 'Restaurant'
  );
$$;

create or replace function public.switch_target_types()
returns text[]
language sql
immutable
as $$
  select array['Artist', 'Collector', 'Curator', 'Advisor', 'Other',
               'Gallery', 'Institution', 'Museum', 'Foundation', 'Event Space', 'Restaurant'];
$$;

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

notify pgrst, 'reload schema';
commit;
select (select count(*) from public.collector_profile where type in ('Art Store', 'Framer', 'Printer')) as directory_listings_left;
