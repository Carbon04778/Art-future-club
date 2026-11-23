-- ===========================================================================
-- 035 — event time zones (C10) and a lock for the AI check (C8)
-- Run after 034, in TEST first, then LIVE. Safe to re-run.
-- Undo: 035_ai_events_fixes.revert.sql
-- ===========================================================================
--
-- * event.timezone: where the event's times are meant ("Asia/Hong_Kong"). Empty
--   for every existing event, which keeps showing exactly as it does today.
-- * ai_event_run.locked_until: only one check works at a time, so a scheduled
--   call and "Run now" cannot overwrite each other.
-- * Publishing an AI draft now saves the event's time zone.
--
-- No existing row changes.
-- ===========================================================================

begin;

alter table public.event add column if not exists timezone text;
alter table public.ai_event_run add column if not exists locked_until timestamptz;

create or replace function public.ai_event_publish(p_draft uuid)
returns uuid language plpgsql security definer set search_path = public as $$
declare
  d public.ai_event_draft;
  l public.collector_profile;
  tz text;
  s timestamptz; e timestamptz;
  target uuid;
  same_place boolean;
begin
  select * into d from public.ai_event_draft where id = p_draft for update;
  select * into l from public.collector_profile where id = d.listing_id;
  tz := coalesce(nullif(d.timezone, ''), 'UTC');
  -- No time on the page: midday UTC keeps the same calendar date for nearly
  -- every visitor, and date_only hides the time.
  if d.start_time is null then
    s := (d.start_date + time '12:00') at time zone 'UTC';
    e := (d.end_date + time '12:00') at time zone 'UTC';
  else
    s := (d.start_date + d.start_time) at time zone tz;
    if d.end_date is not null or d.end_time is not null then
      e := (coalesce(d.end_date, d.start_date) + coalesce(d.end_time, time '23:59')) at time zone tz;
    end if;
  end if;
  same_place := l.id is not null and lower(trim(coalesce(d.venue, ''))) = lower(trim(l.display_name));

  target := d.update_of;
  if target is not null then
    update public.event set
      title = d.title, start_date = s, end_date = e,
      date_only = (d.start_time is null),
      timezone = case when d.start_time is null then null else tz end,
      description = coalesce(d.description, description),
      venue = coalesce(d.venue, venue), address = coalesce(d.address, address),
      chapter = coalesce(d.chapter, chapter),
      external_link = coalesce(d.booking_url, external_link), source_url = d.source_url
     where id = target;
    if not found then target := null; end if;
  end if;
  if target is null then
    insert into public.event (title, description, event_type, chapter, venue, address, start_date, end_date,
        image_url, external_link, organizer_id, organizer_name, is_free, date_only, timezone, source_url, geo_lat, geo_lng)
    values (d.title, d.description, d.event_type, coalesce(d.chapter, 'Other'), d.venue, d.address, s, e,
        -- No picture: the gallery's image is theirs; admin can add one.
        null, coalesce(d.booking_url, d.source_url), l.user_id,
        -- The listing's own name: a gallery page finds its events by it.
        coalesce(l.display_name, d.organiser),
        -- Whether it is free is not read from the page, so do not claim it is.
        false, d.start_time is null, case when d.start_time is null then null else tz end, d.source_url,
        case when same_place then l.geo_lat end, case when same_place then l.geo_lng end)
    returning id into target;
  end if;
  update public.ai_event_draft set state = 'published', event_id = target, updated_date = now() where id = p_draft;
  return target;
end $$;

-- "create or replace" keeps the permissions 034 set; repeated to be certain.
revoke all on function public.ai_event_publish(uuid) from public, anon, authenticated;

notify pgrst, 'reload schema';
commit;

-- Check: which project, then trial/schedule, and that no event changed
select (select to_jsonb(e) from private.afc_environment e limit 1) as this_project,
       (select trial_mode from public.ai_event_settings) as trial_mode,
       (select schedule_on from public.ai_event_settings) as schedule_on,
       (select count(*) from public.event) as events,
       (select count(*) from public.event where timezone is not null) as with_timezone;
