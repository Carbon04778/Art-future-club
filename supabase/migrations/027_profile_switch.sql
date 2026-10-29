-- ===========================================================================
-- 027 — members can ask to change their profile type (A1 in CLIENT-REQUESTS)
-- Run once, in TEST first, then LIVE. Safe to re-run.
-- Undo: 027_profile_switch.revert.sql
-- ===========================================================================
--
-- Julie (agreed 2026-10-28): anyone who signed up as the wrong type can ask
-- to switch — Artist, Collector, Gallery or a venue type — in either
-- direction, from their own profile, and the request goes to the approval
-- queue. Their current profile stays exactly as it is until an admin
-- approves.
--
-- ON APPROVAL
--   * Gallery/venue/collector → another of those: the same profile simply
--     changes type (same table). Nothing is lost.
--   * Artist ↔ gallery/venue/collector: profiles of these two kinds live in
--     different tables. The old profile is saved WHOLE to profile_archive
--     (with a gallery's works and a collector's collected works), then a new
--     profile is made with the name, photo, bio, location, website and
--     socials. It keeps the SAME id, so followers and enquiries follow it.
--     Artworks / CV / disciplines (artist) and address / hours / gallery
--     works (gallery) cannot move — they stay in the archive, and
--     restore_profile_archive() puts the old profile back.
--
-- ALSO CLOSED: a private collector could change their own type to Gallery
-- from the edit form and be published as a gallery with no review. A member
-- can no longer change type directly; it goes through the request.
--
-- Additive. No existing row is changed by running this file.
-- ===========================================================================

begin;

-- ------------------------------------------------------------------ tables
create table if not exists public.profile_switch_request (
  id             uuid primary key default gen_random_uuid(),
  user_id        uuid not null references auth.users(id) on delete cascade,
  from_kind      text not null check (from_kind in ('artist', 'space')),
  from_id        uuid not null,
  from_type      text not null,          -- 'Artist' or the space's type
  display_name   text,
  to_type        text not null,
  to_discipline  text,                    -- main discipline, when becoming an artist
  reason         text,
  status         text not null default 'pending'
                   check (status in ('pending', 'approved', 'rejected', 'cancelled')),
  review_note    text,
  reviewed_by    uuid references auth.users(id) on delete set null,
  reviewed_at    timestamptz,
  archive_id     uuid,
  created_date   timestamptz not null default now(),
  updated_date   timestamptz not null default now()
);
-- One waiting request per member.
create unique index if not exists idx_switch_one_pending
  on public.profile_switch_request(user_id) where status = 'pending';
create index if not exists idx_switch_status on public.profile_switch_request(status);

create table if not exists public.profile_archive (
  id               uuid primary key default gen_random_uuid(),
  user_id          uuid,
  kind             text not null check (kind in ('artist', 'space')),
  profile_id       uuid not null,
  profile          jsonb not null,
  gallery_works    jsonb not null default '[]'::jsonb,
  collected_works  jsonb not null default '[]'::jsonb,
  reason           text,
  request_id       uuid,
  archived_by      uuid,
  archived_at      timestamptz not null default now(),
  restored_at      timestamptz
);

alter table public.profile_switch_request enable row level security;
alter table public.profile_archive        enable row level security;

-- Members read their own requests; admins read all. Nobody writes these
-- tables directly — only through the functions below.
drop policy if exists switch_read on public.profile_switch_request;
create policy switch_read on public.profile_switch_request
  for select using (user_id = auth.uid() or public.is_admin());

drop policy if exists archive_read on public.profile_archive;
create policy archive_read on public.profile_archive
  for select using (public.is_admin());

-- ---------------------------------------------------------- allowed types
-- Must match COLLECTOR_TYPES (+ "Artist") in src/lib/venueTypes.js.
create or replace function public.switch_target_types()
returns text[]
language sql
immutable
as $$
  select array['Artist', 'Collector', 'Curator', 'Advisor', 'Other',
               'Gallery', 'Institution', 'Museum', 'Foundation', 'Event Space', 'Restaurant'];
$$;

-- ------------------------------------------------------- member: request
create or replace function public.request_profile_switch(
  p_to_type text,
  p_discipline text default null,
  p_reason text default null
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  me        uuid := auth.uid();
  n_artist  int;
  n_space   int;
  v_kind    text;
  v_id      uuid;
  v_type    text;
  v_name    text;
  rid       uuid;
begin
  if me is null then
    raise exception 'Please sign in first.';
  end if;
  if not (p_to_type = any (public.switch_target_types())) then
    raise exception 'Unknown profile type: %', p_to_type;
  end if;

  select count(*) into n_artist from artist_profile    where user_id = me;
  select count(*) into n_space  from collector_profile where user_id = me;
  if n_artist + n_space <> 1 then
    raise exception 'This account has % profiles, so it cannot be switched here. Please contact the AFC team.', n_artist + n_space;
  end if;

  if n_artist = 1 then
    select id, 'Artist', display_name into v_id, v_type, v_name from artist_profile where user_id = me;
    v_kind := 'artist';
  else
    select id, type, display_name into v_id, v_type, v_name from collector_profile where user_id = me;
    v_kind := 'space';
  end if;

  if v_type = p_to_type then
    raise exception 'Your profile is already a %.', p_to_type;
  end if;
  if p_to_type = 'Artist' and coalesce(trim(p_discipline), '') = '' then
    raise exception 'Please choose your main discipline.';
  end if;
  if exists (select 1 from profile_switch_request where user_id = me and status = 'pending') then
    raise exception 'You already have a request waiting for approval.';
  end if;

  insert into profile_switch_request
    (user_id, from_kind, from_id, from_type, display_name, to_type, to_discipline, reason)
  values
    (me, v_kind, v_id, v_type, v_name, p_to_type,
     case when p_to_type = 'Artist' then trim(p_discipline) end,
     nullif(trim(coalesce(p_reason, '')), ''))
  returning id into rid;
  return rid;
end;
$$;

-- -------------------------------------------------------- member: cancel
create or replace function public.cancel_profile_switch()
returns int
language plpgsql
security definer
set search_path = public
as $$
declare n int;
begin
  update profile_switch_request
     set status = 'cancelled', updated_date = now()
   where user_id = auth.uid() and status = 'pending';
  get diagnostics n = row_count;
  return n;
end;
$$;

-- --------------------------------------------------------- admin: review
create or replace function public.review_profile_switch(
  p_request uuid,
  p_approve boolean,
  p_note text default null
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  r      profile_switch_request%rowtype;
  ap     artist_profile%rowtype;
  cp     collector_profile%rowtype;
  arch   uuid;
begin
  if not public.is_admin() then
    raise exception 'Only an administrator can review profile changes.';
  end if;

  select * into r from profile_switch_request where id = p_request for update;
  if not found or r.status <> 'pending' then
    raise exception 'This request is no longer waiting for review.';
  end if;

  if not p_approve then
    update profile_switch_request
       set status = 'rejected', review_note = nullif(trim(coalesce(p_note, '')), ''),
           reviewed_by = auth.uid(), reviewed_at = now(), updated_date = now()
     where id = r.id;
    return null;
  end if;

  -- The profile must still be the one the request was made from.
  if r.from_kind = 'artist' then
    select * into ap from artist_profile where id = r.from_id and user_id = r.user_id for update;
  else
    select * into cp from collector_profile where id = r.from_id and user_id = r.user_id for update;
  end if;
  if not found then
    raise exception 'The member''s profile has changed since they asked. Ask them to send the request again.';
  end if;

  if r.from_kind = 'space' and r.to_type <> 'Artist' then
    -- Same table: the profile just changes type. Approved by this review.
    update collector_profile
       set type = r.to_type, status = 'approved', reviewed_by = auth.uid(), reviewed_at = now()
     where id = r.from_id;
  else
    -- Different table: archive the old profile whole, then replace it.
    insert into profile_archive
      (user_id, kind, profile_id, profile, gallery_works, collected_works, reason, request_id, archived_by)
    values (
      r.user_id, r.from_kind, r.from_id,
      case when r.from_kind = 'artist' then to_jsonb(ap) else to_jsonb(cp) end,
      coalesce((select jsonb_agg(to_jsonb(w)) from gallery_work w where w.gallery_id = r.from_id), '[]'::jsonb),
      coalesce((select jsonb_agg(to_jsonb(c)) from collected_work c where c.collector_profile_id = r.from_id), '[]'::jsonb),
      'Profile type changed: ' || r.from_type || ' → ' || r.to_type,
      r.id, auth.uid()
    )
    returning id into arch;

    if r.from_kind = 'artist' then
      delete from artist_profile where id = r.from_id;
      insert into collector_profile
        (id, user_id, display_name, type, based_in, bio, website, instagram, twitter, tiktok, linkedin,
         avatar_url, status, reviewed_by, reviewed_at)
      values
        (ap.id, ap.user_id, ap.display_name, r.to_type, ap.based_in, ap.bio, ap.website, ap.instagram,
         ap.twitter, ap.tiktok, ap.linkedin, ap.avatar_url, 'approved', auth.uid(), now());
    else
      -- gallery_work and collected_work of this space go with it (on delete
      -- cascade) — both are in the archive above.
      delete from collector_profile where id = r.from_id;
      insert into artist_profile
        (id, user_id, display_name, discipline, disciplines, based_in, bio, website, instagram, twitter,
         tiktok, linkedin, avatar_url, status, reviewed_by, reviewed_at)
      values
        (cp.id, cp.user_id, cp.display_name, r.to_discipline, array[r.to_discipline], cp.based_in, cp.bio,
         cp.website, cp.instagram, cp.twitter, cp.tiktok, cp.linkedin, cp.avatar_url, 'approved',
         auth.uid(), now());
    end if;
  end if;

  update profile_switch_request
     set status = 'approved', review_note = nullif(trim(coalesce(p_note, '')), ''),
         reviewed_by = auth.uid(), reviewed_at = now(), archive_id = arch, updated_date = now()
   where id = r.id;
  return r.from_id;
end;
$$;

-- ------------------------------------------------- admin: undo a switch
-- Puts an archived profile back, exactly as it was (same id, its works).
-- The profile that replaced it is archived in turn first, so this can
-- itself be undone.
create or replace function public.restore_profile_archive(p_archive uuid)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  ar  profile_archive%rowtype;
  ap  artist_profile%rowtype;
  cp  collector_profile%rowtype;
begin
  if not public.is_admin() then
    raise exception 'Only an administrator can restore a profile.';
  end if;
  select * into ar from profile_archive where id = p_archive and restored_at is null for update;
  if not found then
    raise exception 'Nothing to restore: this archive does not exist or was already restored.';
  end if;

  if ar.kind = 'artist' then
    select * into cp from collector_profile where id = ar.profile_id;
    if found then
      insert into profile_archive (user_id, kind, profile_id, profile, gallery_works, collected_works, reason, archived_by)
      values (cp.user_id, 'space', cp.id, to_jsonb(cp),
        coalesce((select jsonb_agg(to_jsonb(w)) from gallery_work w where w.gallery_id = cp.id), '[]'::jsonb),
        coalesce((select jsonb_agg(to_jsonb(c)) from collected_work c where c.collector_profile_id = cp.id), '[]'::jsonb),
        'Replaced when an earlier profile was restored', auth.uid());
      delete from collector_profile where id = cp.id;
    end if;
    insert into artist_profile select * from jsonb_populate_record(null::artist_profile, ar.profile);
  else
    select * into ap from artist_profile where id = ar.profile_id;
    if found then
      insert into profile_archive (user_id, kind, profile_id, profile, reason, archived_by)
      values (ap.user_id, 'artist', ap.id, to_jsonb(ap), 'Replaced when an earlier profile was restored', auth.uid());
      delete from artist_profile where id = ap.id;
    end if;
    insert into collector_profile select * from jsonb_populate_record(null::collector_profile, ar.profile);
    insert into gallery_work   select * from jsonb_populate_recordset(null::gallery_work, ar.gallery_works);
    insert into collected_work select * from jsonb_populate_recordset(null::collected_work, ar.collected_works);
  end if;

  update profile_archive set restored_at = now() where id = ar.id;
  return ar.profile_id;
end;
$$;

grant execute on function public.request_profile_switch(text, text, text) to authenticated;
grant execute on function public.cancel_profile_switch()                   to authenticated;
grant execute on function public.review_profile_switch(uuid, boolean, text) to authenticated;
grant execute on function public.restore_profile_archive(uuid)             to authenticated;
revoke execute on function public.request_profile_switch(text, text, text) from anon;
revoke execute on function public.cancel_profile_switch()                   from anon;
revoke execute on function public.review_profile_switch(uuid, boolean, text) from anon;
revoke execute on function public.restore_profile_archive(uuid)             from anon;

-- ------------------------------------------- members cannot change type
-- Same pattern as protect_profile_status (017): browsers only, admins
-- exempt. Approving a request runs as an admin, so it passes.
create or replace function public.protect_profile_type()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  from_browser boolean :=
    coalesce(current_setting('role', true), 'none') in ('anon', 'authenticated');
begin
  if not from_browser or public.is_admin() then return new; end if;
  if new.type is distinct from old.type then
    raise exception 'To change your profile type, use "Change profile type" on your profile — the AFC team approves it.';
  end if;
  return new;
end;
$$;

drop trigger if exists trg_protect_collector_type on public.collector_profile;
create trigger trg_protect_collector_type
  before update of type on public.collector_profile
  for each row execute function public.protect_profile_type();

notify pgrst, 'reload schema';

commit;

-- Check
select
  (select count(*) from information_schema.tables
     where table_schema = 'public' and table_name in ('profile_switch_request', 'profile_archive'))   as tables_2,
  (select count(*) from pg_proc where proname in
     ('request_profile_switch', 'cancel_profile_switch', 'review_profile_switch',
      'restore_profile_archive', 'protect_profile_type', 'switch_target_types'))                        as functions_6,
  (select count(*) from pg_trigger where tgname = 'trg_protect_collector_type')                         as trigger_1,
  (select count(*) from public.artist_profile)                                                          as artists_unchanged,
  (select count(*) from public.collector_profile)                                                       as spaces_unchanged;
