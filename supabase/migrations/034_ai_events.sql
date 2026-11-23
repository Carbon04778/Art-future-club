-- ===========================================================================
-- 034 — AI event drafts and approvals (C8 in CLIENT-REQUESTS)
-- Run once, in TEST first, then LIVE. Safe to re-run.
-- Undo: 034_ai_events.revert.sql
-- ===========================================================================
--
-- The weekly check reads gallery websites and saves what it finds HERE, never
-- in public.event. Nothing in these tables is public. An event only becomes
-- public through ai_event_review / ai_event_organiser_review below, which
-- enforce the approval rules inside the database so no page can skip a step:
--
--   unclaimed listing: admin approves            -> published
--   claimed listing:   admin approves, then the
--                      organiser approves        -> published
--   trial on:          approve only marks "checked"; nothing is published
--
-- Starts with the trial ON and the schedule OFF.
-- Existing events are not changed; event gains two optional columns.
-- ===========================================================================

begin;

alter table public.event
  -- The page gave a date but no time. The site then shows no time, rather
  -- than an invented one.
  add column if not exists date_only boolean not null default false,
  add column if not exists source_url text;

create table if not exists public.ai_event_settings (
  id             boolean primary key default true check (id),
  trial_mode     boolean not null default true,
  schedule_on    boolean not null default false,
  report_emails  text[] not null default '{}',
  updated_date   timestamptz not null default now()
);
insert into public.ai_event_settings (id) values (true) on conflict do nothing;

create table if not exists public.ai_event_source (
  id             uuid primary key default gen_random_uuid(),
  listing_id     uuid unique references public.collector_profile(id) on delete set null,
  name           text not null,
  url            text not null check (url ~* '^https?://'),
  city           text,
  active         boolean not null default true,
  last_checked   timestamptz,
  last_status    text,
  last_detail    text,
  last_hash      text,
  created_date   timestamptz not null default now(),
  updated_date   timestamptz not null default now()
);

create table if not exists public.ai_event_run (
  id             uuid primary key default gen_random_uuid(),
  trigger        text not null default 'schedule' check (trigger in ('schedule','manual')),
  status         text not null default 'running' check (status in ('running','done','failed')),
  started_at     timestamptz not null default now(),
  finished_at    timestamptz,
  source_ids     uuid[] not null default '{}',
  -- [{source_id, name, status, detail, found, cost}]
  results        jsonb not null default '[]',
  cost_usd       numeric not null default 0,
  report_sent_at timestamptz,
  report_error   text,
  created_date   timestamptz not null default now(),
  updated_date   timestamptz not null default now()
);
-- Two checks at once would read every site twice.
create unique index if not exists ai_event_one_running on public.ai_event_run ((true)) where status = 'running';

create table if not exists public.ai_event_draft (
  id              uuid primary key default gen_random_uuid(),
  source_id       uuid references public.ai_event_source(id) on delete set null,
  run_id          uuid references public.ai_event_run(id) on delete set null,
  listing_id      uuid references public.collector_profile(id) on delete set null,
  state           text not null default 'new' check (state in
                    ('new','checked','awaiting_organiser','changes','declined','rejected','published')),
  title           text not null,
  description     text,
  event_type      text not null default 'Exhibition',
  start_date      date,
  end_date        date,
  start_time      time,
  end_time        time,
  timezone        text,
  venue           text,
  address         text,
  chapter         text,
  organiser       text,
  booking_url     text,
  image_url       text,
  source_url      text not null,
  match_key       text not null,
  flags           jsonb not null default '[]',
  evidence        jsonb not null default '{}',
  duplicate_of    uuid references public.event(id) on delete set null,
  -- Set when a published event's website details changed.
  update_of       uuid references public.event(id) on delete set null,
  event_id        uuid references public.event(id) on delete set null,
  note            text,
  admin_by        uuid,
  admin_at        timestamptz,
  organiser_by    uuid,
  organiser_at    timestamptz,
  created_date    timestamptz not null default now(),
  updated_date    timestamptz not null default now()
);
create index if not exists ai_event_draft_state on public.ai_event_draft (state, created_date desc);
create index if not exists ai_event_draft_key on public.ai_event_draft (source_id, match_key);

create table if not exists public.ai_event_log (
  id            uuid primary key default gen_random_uuid(),
  draft_id      uuid not null references public.ai_event_draft(id) on delete cascade,
  actor         uuid,
  action        text not null,
  note          text,
  created_date  timestamptz not null default now()
);

-- ------------------------------------------------------------- who can see
alter table public.ai_event_settings enable row level security;
alter table public.ai_event_source   enable row level security;
alter table public.ai_event_run      enable row level security;
alter table public.ai_event_draft    enable row level security;
alter table public.ai_event_log      enable row level security;

drop policy if exists ai_settings_admin on public.ai_event_settings;
create policy ai_settings_admin on public.ai_event_settings for all to authenticated
  using (public.is_admin()) with check (public.is_admin());
drop policy if exists ai_source_admin on public.ai_event_source;
create policy ai_source_admin on public.ai_event_source for all to authenticated
  using (public.is_admin()) with check (public.is_admin());
drop policy if exists ai_run_admin on public.ai_event_run;
create policy ai_run_admin on public.ai_event_run for select to authenticated using (public.is_admin());
drop policy if exists ai_log_admin on public.ai_event_log;
create policy ai_log_admin on public.ai_event_log for select to authenticated using (public.is_admin());
-- An organiser sees only drafts for a listing they own, and only once admin
-- has approved them. There is NO insert/update/delete policy: drafts change
-- only through the functions below and the server's weekly check.
drop policy if exists ai_draft_read on public.ai_event_draft;
create policy ai_draft_read on public.ai_event_draft for select to authenticated
  using (
    public.is_admin()
    or (state = 'awaiting_organiser' and exists (
      select 1 from public.collector_profile p
       where p.id = listing_id and p.user_id = auth.uid()))
  );

revoke all on public.ai_event_settings, public.ai_event_source, public.ai_event_run,
              public.ai_event_draft, public.ai_event_log from anon, authenticated;
grant select, update on public.ai_event_settings to authenticated;
grant select, insert, update, delete on public.ai_event_source to authenticated;
grant select on public.ai_event_run, public.ai_event_draft, public.ai_event_log to authenticated;
grant all on public.ai_event_settings, public.ai_event_source, public.ai_event_run,
             public.ai_event_draft, public.ai_event_log to service_role;

-- ---------------------------------------------------------------- publishing
-- Internal: not callable from the site.
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
      description = coalesce(d.description, description),
      venue = coalesce(d.venue, venue), address = coalesce(d.address, address),
      chapter = coalesce(d.chapter, chapter),
      external_link = coalesce(d.booking_url, external_link), source_url = d.source_url
     where id = target;
    if not found then target := null; end if;
  end if;
  if target is null then
    insert into public.event (title, description, event_type, chapter, venue, address, start_date, end_date,
        image_url, external_link, organizer_id, organizer_name, is_free, date_only, source_url, geo_lat, geo_lng)
    values (d.title, d.description, d.event_type, coalesce(d.chapter, 'Other'), d.venue, d.address, s, e,
        -- No picture: the gallery's image is theirs; admin can add one.
        null, coalesce(d.booking_url, d.source_url), l.user_id, coalesce(d.organiser, l.display_name),
        -- Whether it is free is not read from the page, so do not claim it is.
        false, d.start_time is null, d.source_url,
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
      updated_date = now()
    where id = p_draft returning * into d;
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

create or replace function public.ai_event_organiser_review(p_draft uuid, p_action text, p_note text default null)
returns text language plpgsql security definer set search_path = public as $$
declare d public.ai_event_draft; owner_id uuid; next_state text;
begin
  select * into d from public.ai_event_draft where id = p_draft for update;
  if not found then raise exception 'This event is not waiting for you.'; end if;
  select user_id into owner_id from public.collector_profile where id = d.listing_id;
  if auth.uid() is null or owner_id is distinct from auth.uid() or d.state <> 'awaiting_organiser' then
    raise exception 'This event is not waiting for you.';
  end if;
  if p_action = 'approve' then
    if coalesce((select trial_mode from public.ai_event_settings where id), true) then
      raise exception 'Publishing is paused at the moment. Please try again later.'; end if;
    if coalesce(d.end_date, d.start_date) < current_date then raise exception 'This event has already ended.'; end if;
    update public.ai_event_draft set organiser_by = auth.uid(), organiser_at = now() where id = p_draft;
    perform public.ai_event_publish(p_draft);
    next_state := 'published';
  elsif p_action = 'change' then
    if nullif(trim(coalesce(p_note, '')), '') is null then raise exception 'Please say what should change.'; end if;
    next_state := 'changes';
  elsif p_action = 'decline' then next_state := 'declined';
  else raise exception 'Unknown action.';
  end if;
  if p_action <> 'approve' then
    update public.ai_event_draft set state = next_state, note = left(p_note, 1000), organiser_by = auth.uid(),
      organiser_at = now(), admin_by = null, admin_at = null, updated_date = now() where id = p_draft;
  end if;
  insert into public.ai_event_log (draft_id, actor, action, note) values (p_draft, auth.uid(), 'organiser:' || p_action, left(p_note, 1000));
  return next_state;
end $$;

revoke all on function public.ai_event_publish(uuid) from public, anon, authenticated;
revoke all on function public.ai_event_review(uuid, text, jsonb, text) from public, anon;
revoke all on function public.ai_event_organiser_review(uuid, text, text) from public, anon;
grant execute on function public.ai_event_review(uuid, text, jsonb, text) to authenticated;
grant execute on function public.ai_event_organiser_review(uuid, text, text) to authenticated;

notify pgrst, 'reload schema';
commit;

-- Check
select to_jsonb(e) as this_project from private.afc_environment e;
select trial_mode, schedule_on from public.ai_event_settings;
