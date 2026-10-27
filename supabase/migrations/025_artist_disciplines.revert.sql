-- Undo 025: removes the disciplines list. `discipline` (the main one) was
-- never changed, so every artist keeps their main discipline.
-- Deploy the previous site code BEFORE running this, or profile saves fail.
begin;
alter table public.artist_profile drop column if exists disciplines;
notify pgrst, 'reload schema';
commit;
select count(*) as artists, count(*) filter (where coalesce(trim(discipline), '') <> '') as with_discipline
from public.artist_profile;
