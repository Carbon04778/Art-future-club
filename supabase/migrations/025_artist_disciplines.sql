-- ===========================================================================
-- 025 — artists can have more than one discipline (A3 in CLIENT-REQUESTS)
-- Run once, in TEST first, then LIVE. Safe to re-run.
-- ===========================================================================
--
-- Julie: "can we add multiple options here?" — unlimited, one marked as the
-- main discipline, the same list as today.
--
-- `discipline` stays exactly as it is and remains the MAIN discipline. Every
-- page that shows or filters on it today keeps working unchanged.
-- `disciplines` is new: the full list, main one first.
--
-- Additive only. Each artist's list starts as their current discipline, so
-- nothing anyone sees changes until they tick more. The set_updated_date
-- trigger is paused for that one fill, so it does not make 77 artists look
-- "recently updated".
-- Undo: 025_artist_disciplines.revert.sql
-- ===========================================================================

begin;

alter table public.artist_profile
  add column if not exists disciplines text[] not null default '{}';

alter table public.artist_profile disable trigger set_updated_date;

update public.artist_profile
   set disciplines = array[discipline]
 where coalesce(trim(discipline), '') <> ''
   and disciplines = '{}';

alter table public.artist_profile enable trigger set_updated_date;

-- the site's API must see the new column straight away
notify pgrst, 'reload schema';

commit;

-- Check: every artist with a discipline has it as the first in the list.
select
  count(*)                                                        as artists,
  count(*) filter (where coalesce(trim(discipline), '') <> '')    as with_discipline,
  count(*) filter (where disciplines[1] = discipline)             as list_starts_with_it,
  count(*) filter (where coalesce(trim(discipline), '') <> ''
                     and (disciplines[1] is distinct from discipline)) as mismatched_should_be_0
from public.artist_profile;
