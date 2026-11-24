-- ===========================================================================
-- 036 — a photo on an AI event draft (D6)
-- Run after 035, in TEST first, then LIVE. Safe to re-run.
-- Undo: 036_ai_event_photo.revert.sql
-- ===========================================================================
--
-- Julie: add a photo while editing a draft, instead of editing the event again
-- after it is published. The photo is kept in its own columns, apart from the
-- gallery's own image (image_url), which is never published.
--
-- No existing row changes.
-- ===========================================================================

begin;

alter table public.ai_event_draft
  add column if not exists photo_url text,
  add column if not exists photo_focal_x smallint not null default 50,
  add column if not exists photo_focal_y smallint not null default 50;

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
      external_link = coalesce(d.booking_url, external_link), source_url = d.source_url,
      image_url = coalesce(d.photo_url, image_url),
      image_focal_x = case when d.photo_url is null then image_focal_x else d.photo_focal_x end,
      image_focal_y = case when d.photo_url is null then image_focal_y else d.photo_focal_y end
     where id = target;
    if not found then target := null; end if;
  end if;
  if target is null then
    insert into public.event (title, description, event_type, chapter, venue, address, start_date, end_date,
        image_url, image_focal_x, image_focal_y, external_link, organizer_id, organizer_name, is_free, date_only, timezone, source_url, geo_lat, geo_lng)
    values (d.title, d.description, d.event_type, coalesce(d.chapter, 'Other'), d.venue, d.address, s, e,
        -- Only a photo the admin added. The gallery's own image is never used.
        d.photo_url, d.photo_focal_x, d.photo_focal_y, coalesce(d.booking_url, d.source_url), l.user_id,
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

create or replace function public.ai_event_review(
  p_draft uuid, p_action text, p_patch jsonb default '{}', p_note text default null)
returns text language plpgsql security definer set search_path = public as $$
declare
  d public.ai_event_draft;
  owner_id uuid;
  trial boolean;
  next_state text;
begin
  if not public.is_admin() then raise exception 'Only an admin can review AI events.'; end if;
  select * into d from public.ai_event_draft where id = p_draft for update;
  if not found then raise exception 'This draft no longer exists.'; end if;
  if d.state = 'published' then raise exception 'This event is already published.'; end if;

  if p_patch is not null and p_patch <> '{}'::jsonb then
    update public.ai_event_draft set
      title       = coalesce(nullif(trim(p_patch->>'title'), ''), title),
      description = case when p_patch ? 'description' then nullif(trim(p_patch->>'description'), '') else description end,
      event_type  = coalesce(nullif(p_patch->>'event_type', ''), event_type),
      start_date  = case when p_patch ? 'start_date' then nullif(p_patch->>'start_date', '')::date else start_date end,
      end_date    = case when p_patch ? 'end_date' then nullif(p_patch->>'end_date', '')::date else end_date end,
      start_time  = case when p_patch ? 'start_time' then nullif(p_patch->>'start_time', '')::time else start_time end,
      end_time    = case when p_patch ? 'end_time' then nullif(p_patch->>'end_time', '')::time else end_time end,
      timezone    = case when p_patch ? 'timezone' then nullif(p_patch->>'timezone', '') else timezone end,
      venue       = case when p_patch ? 'venue' then nullif(trim(p_patch->>'venue'), '') else venue end,
      address     = case when p_patch ? 'address' then nullif(trim(p_patch->>'address'), '') else address end,
      chapter     = case when p_patch ? 'chapter' then nullif(p_patch->>'chapter', '') else chapter end,
      organiser   = case when p_patch ? 'organiser' then nullif(trim(p_patch->>'organiser'), '') else organiser end,
      booking_url = case when p_patch ? 'booking_url' then nullif(trim(p_patch->>'booking_url'), '') else booking_url end,
      photo_url   = case when p_patch ? 'photo_url' then nullif(trim(p_patch->>'photo_url'), '') else photo_url end,
      photo_focal_x = case when p_patch ? 'photo_focal_x' then least(100, greatest(0, round((p_patch->>'photo_focal_x')::numeric)))::smallint else photo_focal_x end,
      photo_focal_y = case when p_patch ? 'photo_focal_y' then least(100, greatest(0, round((p_patch->>'photo_focal_y')::numeric)))::smallint else photo_focal_y end,
      updated_date = now()
    where id = p_draft returning * into d;
    if d.photo_url is not null and d.photo_url !~* '^https://' then raise exception 'The photo must be uploaded here.'; end if;
    -- A link shown to visitors must be a web link, never javascript: or data:.
    if d.booking_url is not null and d.booking_url !~* '^https?://' then raise exception 'The booking link must start with http:// or https://'; end if;
    -- What the organiser is looking at just changed: admin approves again.
    if d.state = 'awaiting_organiser' then
      update public.ai_event_draft set state = 'new', admin_by = null, admin_at = null where id = p_draft returning * into d;
    end if;
  end if;

  if p_action = 'save' then next_state := d.state;
  elsif p_action = 'reject' then
    next_state := 'rejected';
    update public.ai_event_draft set state = 'rejected', note = p_note, updated_date = now() where id = p_draft;
  elsif p_action = 'restore' then
    if d.state not in ('rejected','declined','checked') then raise exception 'Only a closed draft can be restored.'; end if;
    next_state := 'new';
    update public.ai_event_draft set state = 'new', note = null, admin_by = null, admin_at = null,
      organiser_by = null, organiser_at = null, updated_date = now() where id = p_draft;
  elsif p_action in ('keep_both','update_existing') then
    if d.duplicate_of is null then raise exception 'This draft has no duplicate to resolve.'; end if;
    update public.ai_event_draft set
      update_of = case when p_action = 'update_existing' then duplicate_of else update_of end,
      duplicate_of = null, updated_date = now() where id = p_draft;
    next_state := d.state;
  elsif p_action = 'approve' then
    if d.state not in ('new','changes','checked') then raise exception 'This draft is not waiting for admin approval.'; end if;
    if d.start_date is null then raise exception 'Add the start date first.'; end if;
    if d.venue is null and d.address is null then raise exception 'Add the location first.'; end if;
    if d.chapter is null then raise exception 'Choose the chapter first (or Other).'; end if;
    if d.end_date is not null and d.end_date < d.start_date then raise exception 'The end date is before the start date.'; end if;
    if coalesce(d.end_date, d.start_date) < current_date then raise exception 'This event has already ended.'; end if;
    if d.start_time is not null and not exists (select 1 from pg_timezone_names where name = d.timezone) then
      raise exception 'Choose the time zone, because this event has a time.'; end if;
    if d.duplicate_of is not null then raise exception 'Decide about the possible duplicate first.'; end if;
    select trial_mode into trial from public.ai_event_settings where id;
    select user_id into owner_id from public.collector_profile where id = d.listing_id;
    update public.ai_event_draft set admin_by = auth.uid(), admin_at = now(), note = null, updated_date = now() where id = p_draft;
    if coalesce(trial, true) then
      next_state := 'checked';
      update public.ai_event_draft set state = 'checked' where id = p_draft;
    elsif owner_id is not null then
      next_state := 'awaiting_organiser';
      update public.ai_event_draft set state = 'awaiting_organiser' where id = p_draft;
    else
      perform public.ai_event_publish(p_draft);
      next_state := 'published';
    end if;
  else raise exception 'Unknown action.';
  end if;

  insert into public.ai_event_log (draft_id, actor, action, note) values (p_draft, auth.uid(), 'admin:' || p_action, p_note);
  return next_state;
end $$;

-- "create or replace" keeps permissions; repeated to be certain.
revoke all on function public.ai_event_publish(uuid) from public, anon, authenticated;
revoke all on function public.ai_event_review(uuid, text, jsonb, text) from public, anon;
grant execute on function public.ai_event_review(uuid, text, jsonb, text) to authenticated;

notify pgrst, 'reload schema';
commit;

-- Check
select (select to_jsonb(e) from private.afc_environment e limit 1) as this_project,
       (select trial_mode from public.ai_event_settings) as trial_mode,
       (select schedule_on from public.ai_event_settings) as schedule_on,
       (select count(*) from public.ai_event_draft) as drafts,
       (select count(*) from public.ai_event_draft where photo_url is not null) as with_photo,
       (select count(*) from public.event) as events;
