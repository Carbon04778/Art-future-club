-- ===========================================================================
-- 014 — gallery works must belong to a specific gallery
-- Run once. Safe to re-run.
-- ===========================================================================
--
-- THE BUG
--
-- GalleryProfile saved each work with  artist_id = profile.user_id  and then
-- listed works with  filter({ artist_id: profile.user_id }).
--
-- Admin-created galleries are unclaimed: their user_id is NULL. So every work
-- uploaded to any unclaimed gallery was stored with artist_id = NULL, and
-- every unclaimed gallery then matched ALL of them.
--
-- The visible result was that images added to one gallery appeared on every
-- other gallery and on the venues page.
--
-- THE FIX
--
-- Key works to the gallery's PROFILE id, which always exists, rather than to
-- user_id, which usually does not. artist_id is left alone: it records which
-- artist made the piece, which is a different question from which gallery is
-- showing it.
-- ===========================================================================

alter table public.gallery_work
  add column if not exists gallery_id uuid references public.collector_profile(id) on delete cascade;

create index if not exists idx_gallery_work_gallery
  on public.gallery_work (gallery_id);

-- ---------------------------------------------------------------------------
-- Repair existing rows.
--
-- Works whose artist_id matches a real user_id can be attributed with
-- confidence. Works with a NULL artist_id cannot — they are exactly the
-- orphans this bug created, and there is no record of which gallery they were
-- uploaded to. They are left unattached rather than guessed at, so they stop
-- appearing on every gallery.
-- ---------------------------------------------------------------------------
update public.gallery_work w
set gallery_id = c.id
from public.collector_profile c
where w.gallery_id is null
  and w.artist_id is not null
  and w.artist_id <> ''
  and c.user_id::text = w.artist_id;

select
  count(*) filter (where gallery_id is not null) as attached,
  count(*) filter (where gallery_id is null)     as orphaned,
  count(*)                                       as total
from public.gallery_work;
