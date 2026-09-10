-- ===========================================================================
-- 018 — notifications that reach people, and stay read
-- Run once, after 017. Safe to re-run.
-- ===========================================================================
--
-- WHAT WAS WRONG
--
-- The bell derived notifications from the underlying data — a good decision,
-- because a notification row whose write fails is lost silently and forever.
-- But it only covered three things: messages, forum replies and comments.
--
-- Nobody was ever told about an enquiry on their artwork, a new follower,
-- someone collecting their work, or — since 017 — whether their profile had
-- been approved or rejected. That last one is the worst: SubmitForReview
-- promises "we will email you", and the only email this system can send is
-- the signup code.
--
-- Two tables' worth of work is needed for that:
--
--   1. inquiry.artist_user_id has to be populated. RLS reads gate on it, so
--      an enquiry currently reaches nobody at all — the artist cannot even
--      open it, let alone be told it exists.
--
--   2. Read state needs somewhere to live. It was a single timestamp in
--      localStorage, so everything reappeared as unread on another device,
--      and opening the page marked everything read at once.
--
-- The notification table from 001 is left untouched. Nothing reads it, and
-- nothing writes to it after this release either; dropping it would be a
-- destructive change for no benefit.
-- ===========================================================================

-- ------------------------------------------------- 1. enquiries reach someone
--
-- artist_id is text and holds EITHER a profile id or a user id depending on
-- which page created it, so both are tried. Rows that match neither are left
-- null: those are enquiries against an unclaimed listing, which genuinely has
-- no owner to notify.

update public.inquiry i
set artist_user_id = a.user_id
from public.artist_profile a
where i.artist_user_id is null
  and a.user_id is not null
  and (a.id::text = i.artist_id or a.user_id::text = i.artist_id);

update public.inquiry i
set artist_user_id = c.user_id
from public.collector_profile c
where i.artist_user_id is null
  and c.user_id is not null
  and (c.id::text = i.artist_id or c.user_id::text = i.artist_id);

-- ------------------------------------------------------- 2. read state
--
-- Notifications stay DERIVED, so they have no row of their own. What is
-- recorded here is only "this member has read the thing identified by this
-- key" — e.g. "inquiry-<uuid>" or "follow-<uuid>". Deriving the notification
-- and storing the read flag separately keeps the property that matters: a
-- notification cannot be lost, because it is never written in the first place.

/*
 * NOTE THE `id`. A composite primary key would have been the natural shape
 * here, but the provider contract in src/api/providers/ requires every row to
 * carry an `id` — create resolves to the created row including it, and delete
 * takes one. The uniqueness that actually matters is enforced by the
 * constraint below, which also makes marking the same thing read twice
 * harmless.
 */
create table if not exists public.notification_read (
  id                uuid primary key default gen_random_uuid(),
  user_id           uuid not null references auth.users(id) on delete cascade,
  notification_key  text not null,
  read_at           timestamptz not null default now(),
  created_date      timestamptz not null default now(),
  updated_date      timestamptz not null default now(),
  unique (user_id, notification_key)
);

create index if not exists idx_notification_read_user
  on public.notification_read (user_id);

alter table public.notification_read enable row level security;

grant select, insert, delete on public.notification_read to authenticated;

-- Yours and only yours, in every direction. There is no update policy: marking
-- something read is an insert, and marking it unread again is a delete.
drop policy if exists notification_read_own on public.notification_read;
create policy notification_read_own on public.notification_read
  for select to authenticated
  using (user_id = auth.uid());

drop policy if exists notification_read_insert_own on public.notification_read;
create policy notification_read_insert_own on public.notification_read
  for insert to authenticated
  with check (user_id = auth.uid());

drop policy if exists notification_read_delete_own on public.notification_read;
create policy notification_read_delete_own on public.notification_read
  for delete to authenticated
  using (user_id = auth.uid());

-- ---------------------------------------------------------------- 3. confirm

select
  (select count(*) from public.inquiry)                              as enquiries_total,
  (select count(*) from public.inquiry where artist_user_id is not null) as enquiries_now_reaching_someone,
  (select count(*) from public.inquiry where artist_user_id is null)     as enquiries_against_unclaimed_listings,
  (select count(*) from public.notification_read)                    as read_markers;
