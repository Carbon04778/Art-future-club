-- Undo 027. Deploy the previous site code first (its pages call these
-- functions).
--
-- KEEPS profile_archive and profile_switch_request if they hold anything:
-- the archive is the only copy of any profile replaced by a switch. Drop
-- them by hand only once they are confirmed empty or no longer needed.
begin;
drop trigger if exists trg_protect_collector_type on public.collector_profile;
drop function if exists public.protect_profile_type();
drop function if exists public.restore_profile_archive(uuid);
drop function if exists public.review_profile_switch(uuid, boolean, text);
drop function if exists public.cancel_profile_switch();
drop function if exists public.request_profile_switch(text, text, text);
drop function if exists public.switch_target_types();
notify pgrst, 'reload schema';
commit;
select
  (select count(*) from public.profile_switch_request) as requests_kept,
  (select count(*) from public.profile_archive)         as archived_profiles_kept;
