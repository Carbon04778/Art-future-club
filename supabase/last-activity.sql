-- ===========================================================================
-- When did anyone last do anything?
--
-- NOT a migration. Paste one block at a time into the Supabase SQL editor
-- (Dashboard -> SQL Editor -> New query). Nothing here changes data.
--
-- The SQL editor runs as postgres, so it can read auth.users — the only
-- place sign-ins are recorded. The app's own tables record what people made
-- (works, events, posts, messages...) in created_date / updated_date.
-- ===========================================================================


-- ---------------------------------------------------------------------------
-- 1. THE ONE-LINE ANSWER: the single most recent thing that happened
-- ---------------------------------------------------------------------------
with activity as (
  select 'sign-in'            as what, email                    as who, last_sign_in_at as at from auth.users where last_sign_in_at is not null
  union all select 'sign-up',          email,                    created_at   from auth.users
  union all select 'work uploaded',    coalesce(artist_name,'?'), created_date from public.gallery_work
  union all select 'work edited',      coalesce(artist_name,'?'), updated_date from public.gallery_work
  union all select 'artist profile',   display_name,             updated_date from public.artist_profile
  union all select 'collector profile',display_name,             updated_date from public.collector_profile
  union all select 'article',          title,                    updated_date from public.article
  union all select 'event',            title,                    updated_date from public.event
  union all select 'open call',        title,                    updated_date from public.open_call
  union all select 'forum post',       title,                    created_date from public.forum_post
  union all select 'forum reply',      left(body, 40),           created_date from public.forum_reply
  union all select 'comment',          left(body, 40),           created_date from public.comment
  union all select 'like',             user_id::text,            created_date from public."like"
  union all select 'follow',           follower_id::text,        created_date from public.follow
  union all select 'message',          coalesce(sender_name,'?'), created_date from public.message
  union all select 'inquiry',          artist_id,                created_date from public.inquiry
  union all select 'collected work',   user_id::text,            created_date from public.collected_work
  union all select 'newsletter signup',email,                    created_date from public.newsletter_subscriber
  union all select 'subscription',     user_id::text,            updated_date from public.subscription
)
select what, who, at, now() - at as ago
from activity
order by at desc
limit 25;


-- ---------------------------------------------------------------------------
-- 2. PER TABLE: the last time each kind of thing happened, side by side
-- ---------------------------------------------------------------------------
select 'sign-in'            as what, max(last_sign_in_at) as last_at, count(*) as total from auth.users
union all select 'sign-up',           max(created_at),   count(*) from auth.users
union all select 'work uploaded',     max(created_date), count(*) from public.gallery_work
union all select 'artist profile',    max(updated_date), count(*) from public.artist_profile
union all select 'collector profile', max(updated_date), count(*) from public.collector_profile
union all select 'article',           max(updated_date), count(*) from public.article
union all select 'event',             max(updated_date), count(*) from public.event
union all select 'open call',         max(updated_date), count(*) from public.open_call
union all select 'forum post',        max(created_date), count(*) from public.forum_post
union all select 'forum reply',       max(created_date), count(*) from public.forum_reply
union all select 'comment',           max(created_date), count(*) from public.comment
union all select 'like',              max(created_date), count(*) from public."like"
union all select 'follow',            max(created_date), count(*) from public.follow
union all select 'message',           max(created_date), count(*) from public.message
union all select 'inquiry',           max(created_date), count(*) from public.inquiry
union all select 'collected work',    max(created_date), count(*) from public.collected_work
union all select 'newsletter signup', max(created_date), count(*) from public.newsletter_subscriber
union all select 'subscription',      max(updated_date), count(*) from public.subscription
order by last_at desc nulls last;


-- ---------------------------------------------------------------------------
-- 3. PER MEMBER: who signed in most recently, and what they last uploaded
-- ---------------------------------------------------------------------------
select
  u.email,
  p.full_name,
  p.role,
  u.last_sign_in_at,
  now() - u.last_sign_in_at                       as since_last_sign_in,
  u.created_at                                    as signed_up,
  (select max(created_date) from public.gallery_work w where w.owner_id = u.id) as last_upload,
  (select count(*)          from public.gallery_work w where w.owner_id = u.id) as uploads
from auth.users u
left join public.profiles p on p.id = u.id
order by u.last_sign_in_at desc nulls last;
