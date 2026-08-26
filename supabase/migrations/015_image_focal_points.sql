-- ===========================================================================
-- 015 — remember where to crop a wide header image
-- Run once. Safe to re-run.
-- ===========================================================================
--
-- Cover images are shown in a wide banner, so a tall or square photo has to be
-- cropped to fit. The crop was always taken from the CENTRE, which cut the
-- subject out of most images — the repeated complaint that headers look
-- "skewed" and "cut off".
--
-- These columns record which part of the image to keep, as a percentage:
-- 0 = left/top, 50 = centre, 100 = right/bottom. The uploader drags to choose
-- it, and every page that renders the image honours the same point.
--
-- Defaulting to 50 means existing images are unchanged until someone adjusts
-- them.
-- ===========================================================================

alter table public.collector_profile
  add column if not exists cover_focal_x smallint default 50,
  add column if not exists cover_focal_y smallint default 50;

alter table public.event
  add column if not exists image_focal_x smallint default 50,
  add column if not exists image_focal_y smallint default 50;

alter table public.article
  add column if not exists cover_focal_x smallint default 50,
  add column if not exists cover_focal_y smallint default 50;

-- Keep the values sane. A stray number would silently push the subject out of
-- frame rather than erroring.
do $$
begin
  alter table public.collector_profile
    add constraint cover_focal_range
    check (cover_focal_x between 0 and 100 and cover_focal_y between 0 and 100);
exception when duplicate_object then null;
end $$;

do $$
begin
  alter table public.event
    add constraint image_focal_range
    check (image_focal_x between 0 and 100 and image_focal_y between 0 and 100);
exception when duplicate_object then null;
end $$;

select 'focal point columns added' as result;
