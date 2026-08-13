-- ===========================================================================
-- Art Future Club — Phase 2 schema
-- Run this FIRST in the Supabase SQL Editor, then 002_rls.sql
-- ===========================================================================
--
-- NAMING NOTE (deliberate, do not "fix"):
-- Timestamp columns are created_date / updated_date, NOT created_at/updated_at.
-- The app sorts on these strings ("-created_date", "start_date") in 65 places.
-- Matching the existing names means zero component changes.
--
-- Enums are text + CHECK rather than Postgres ENUM types: altering a Postgres
-- enum requires a migration, whereas a CHECK constraint is a one-line change.
-- ===========================================================================

-- ---------------------------------------------------------------- extensions
create extension if not exists "pgcrypto";

-- ------------------------------------------------------------------ helpers
create or replace function public.set_updated_date()
returns trigger
language plpgsql
as $$
begin
  new.updated_date = now();
  return new;
end;
$$;

-- ===========================================================================
-- profiles — extends auth.users with full_name + role
-- The app's auth.me() expects { id, email, full_name, role }.
-- ===========================================================================
create table if not exists public.profiles (
  id            uuid primary key references auth.users(id) on delete cascade,
  email         text,
  full_name     text default '',
  role          text not null default 'user' check (role in ('user','admin')),
  created_date  timestamptz not null default now(),
  updated_date  timestamptz not null default now()
);

-- Is the CURRENT user an admin? Reads the profiles table.
-- SECURITY DEFINER so it can read profiles without recursing into its own RLS.
create or replace function public.is_admin()
returns boolean
language sql
security definer
stable
set search_path = public
as $$
  select coalesce(
    (select role = 'admin' from public.profiles where id = auth.uid()),
    false
  );
$$;


-- Auto-create a profile row whenever someone signs up.
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.profiles (id, email, full_name)
  values (
    new.id,
    new.email,
    coalesce(new.raw_user_meta_data->>'full_name', split_part(new.email, '@', 1))
  )
  on conflict (id) do nothing;
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- ===========================================================================
-- Content tables
-- ===========================================================================

create table if not exists public.article (
  id                    uuid primary key default gen_random_uuid(),
  title                 text not null,
  subtitle              text,
  body                  text not null,
  author_name           text not null,
  author_id             uuid references auth.users(id) on delete set null,
  category              text default 'Feature'
                          check (category in ('Feature','Interview','Review','News','Essay','Opinion')),
  categories            jsonb default '[]'::jsonb,
  tags                  jsonb default '[]'::jsonb,
  cover_image_url       text,
  cover_image_alt       text,
  cover_image_caption   text,
  images                jsonb default '[]'::jsonb,
  layout                text default 'cover_top'
                          check (layout in ('cover_top','image_after_intro','image_left','image_right','no_cover')),
  closing_image_url     text,
  closing_image_alt     text,
  closing_image_caption text,
  slug                  text unique,
  seo_title             text,
  seo_description       text,
  seo_keywords          text,
  canonical_url         text,
  og_image_url          text,
  geo_placename         text,
  geo_region            text,
  geo_lat               double precision,
  geo_lng               double precision,
  publish_date          timestamptz,
  published             boolean not null default false,
  featured              boolean not null default false,
  reading_time_mins     numeric,
  created_date          timestamptz not null default now(),
  updated_date          timestamptz not null default now()
);

create table if not exists public.artist_profile (
  id                   uuid primary key default gen_random_uuid(),
  user_id              uuid references auth.users(id) on delete cascade,
  display_name         text not null,
  discipline           text not null
                         check (discipline in ('Painting','Sculpture','Photography','Installation',
                           'Video Art','Performance','Drawing','Printmaking','Ceramics','Sound Art',
                           'Digital Art','Mixed Media','Other')),
  based_in             text,
  chapter              text check (chapter in ('Hong Kong','London','New York','Los Angeles',
                         'Bangkok','Milano','Toronto','Zurich','Other')),
  bio                  text,
  website              text,
  instagram            text,
  twitter              text,
  tiktok               text,
  linkedin             text,
  avatar_url           text,
  portfolio_works      jsonb default '[]'::jsonb,
  cv                   jsonb default '{}'::jsonb,
  seeking              jsonb default '[]'::jsonb,
  open_to_commissions  boolean default false,
  -- PAYWALL COLUMNS: service-role writable only. See 002_rls.sql.
  is_premium           boolean not null default false,
  is_featured          boolean not null default false,
  featured_until       timestamptz,
  created_date         timestamptz not null default now(),
  updated_date         timestamptz not null default now()
);

create table if not exists public.collector_profile (
  id                uuid primary key default gen_random_uuid(),
  user_id           uuid references auth.users(id) on delete cascade,
  display_name      text not null,
  type              text not null default 'Collector'
                      check (type in ('Collector','Gallery','Institution','Curator','Advisor')),
  partnership_type  text check (partnership_type in ('Paid Member','Partner')),
  based_in          text,
  bio               text,
  website           text,
  instagram         text,
  facebook          text,
  linkedin          text,
  avatar_url        text,
  cover_image_url   text,
  address           text,
  opening_hours     text,
  phone             text,
  email             text,
  space_images      jsonb default '[]'::jsonb,
  interests         jsonb default '[]'::jsonb,
  budget_range      text,
  seeking           jsonb default '[]'::jsonb,
  seo_title         text,
  seo_description   text,
  seo_keywords      text,
  geo_placename     text,
  geo_region        text,
  geo_lat           double precision,
  geo_lng           double precision,
  created_date      timestamptz not null default now(),
  updated_date      timestamptz not null default now()
);

create table if not exists public.gallery_work (
  id                 uuid primary key default gen_random_uuid(),
  artist_id          text,
  artist_name        text,
  artist_discipline  text,
  title              text not null,
  year               text,
  medium             text,
  dimensions         text,
  description        text,
  image_url          text not null,
  available_for_sale boolean default false,
  price              text,
  currency           text default 'USD',
  tags               jsonb default '[]'::jsonb,
  owner_id           uuid references auth.users(id) on delete cascade,
  created_date       timestamptz not null default now(),
  updated_date       timestamptz not null default now()
);

create table if not exists public.event (
  id             uuid primary key default gen_random_uuid(),
  title          text not null,
  description    text,
  event_type     text not null
                   check (event_type in ('Exhibition','Opening','Talk','Workshop',
                     'Fair','Auction','Social','Other')),
  chapter        text,
  venue          text,
  address        text,
  start_date     timestamptz not null,
  end_date       timestamptz,
  image_url      text,
  external_link  text,
  organizer_id   uuid references auth.users(id) on delete set null,
  organizer_name text,
  is_free        boolean default true,
  ticket_price   text,
  created_date   timestamptz not null default now(),
  updated_date   timestamptz not null default now()
);

create table if not exists public.open_call (
  id             uuid primary key default gen_random_uuid(),
  title          text not null,
  description    text,
  type           text not null default 'Open Call'
                   check (type in ('Open Call','Residency','Competition','Grant',
                     'Exhibition','Commission','Other')),
  organizer      text not null,
  location       text,
  deadline       date,
  fee            text,
  is_free        boolean default true,
  prize          text,
  external_link  text,
  image_url      text,
  disciplines    jsonb default '[]'::jsonb,
  posted_by_id   uuid references auth.users(id) on delete set null,
  posted_by_name text,
  created_date   timestamptz not null default now(),
  updated_date   timestamptz not null default now()
);

-- ===========================================================================
-- Community
-- ===========================================================================

create table if not exists public.forum_post (
  id                uuid primary key default gen_random_uuid(),
  author_id         uuid references auth.users(id) on delete cascade,
  author_name       text,
  author_discipline text,
  author_chapter    text,
  title             text not null,
  body              text not null,
  category          text not null
                      check (category in ('General','Critique Request','Collaboration',
                        'Advice','Opportunity','Technical','Other')),
  image_url         text,
  reply_count       integer not null default 0,
  created_date      timestamptz not null default now(),
  updated_date      timestamptz not null default now()
);

create table if not exists public.forum_reply (
  id                uuid primary key default gen_random_uuid(),
  post_id           uuid not null references public.forum_post(id) on delete cascade,
  author_id         uuid references auth.users(id) on delete cascade,
  author_name       text,
  author_discipline text,
  body              text not null,
  created_date      timestamptz not null default now(),
  updated_date      timestamptz not null default now()
);

create table if not exists public.comment (
  id           uuid primary key default gen_random_uuid(),
  user_id      uuid not null references auth.users(id) on delete cascade,
  user_name    text,
  target_id    text not null,
  target_type  text not null check (target_type in ('artist_profile','collector_profile','gallery_work')),
  body         text not null,
  created_date timestamptz not null default now(),
  updated_date timestamptz not null default now()
);

create table if not exists public."like" (
  id           uuid primary key default gen_random_uuid(),
  user_id      uuid not null references auth.users(id) on delete cascade,
  target_id    text not null,
  target_type  text not null check (target_type in ('artist_profile','collector_profile','gallery_work')),
  created_date timestamptz not null default now(),
  updated_date timestamptz not null default now(),
  unique (user_id, target_id, target_type)
);

create table if not exists public.follow (
  id             uuid primary key default gen_random_uuid(),
  follower_id    uuid not null references auth.users(id) on delete cascade,
  following_id   text not null,
  following_name text,
  created_date   timestamptz not null default now(),
  updated_date   timestamptz not null default now(),
  unique (follower_id, following_id)
);

-- ===========================================================================
-- Private / transactional  (strictest RLS — see 002_rls.sql)
-- ===========================================================================

create table if not exists public.message (
  id             uuid primary key default gen_random_uuid(),
  sender_id      uuid not null references auth.users(id) on delete cascade,
  sender_name    text,
  recipient_id   uuid not null references auth.users(id) on delete cascade,
  recipient_name text,
  body           text not null,
  read           boolean not null default false,
  thread_id      text,
  created_date   timestamptz not null default now(),
  updated_date   timestamptz not null default now()
);

create table if not exists public.inquiry (
  id              uuid primary key default gen_random_uuid(),
  artist_id       text not null,
  artist_name     text,
  artist_user_id  uuid references auth.users(id) on delete cascade,
  work_title      text,
  work_image_url  text,
  price           text,
  currency        text,
  buyer_name      text not null,
  buyer_email     text not null,
  message         text not null,
  status          text not null default 'new' check (status in ('new','replied','closed')),
  type            text not null default 'purchase' check (type in ('purchase','commission')),
  created_date    timestamptz not null default now(),
  updated_date    timestamptz not null default now()
);

create table if not exists public.notification (
  id             uuid primary key default gen_random_uuid(),
  user_id        uuid not null references auth.users(id) on delete cascade,
  type           text not null check (type in ('follow','like','comment','inquiry','message')),
  from_user_name text,
  message        text not null,
  link           text,
  read           boolean not null default false,
  created_date   timestamptz not null default now(),
  updated_date   timestamptz not null default now()
);

create table if not exists public.subscription (
  id                 uuid primary key default gen_random_uuid(),
  user_id            uuid not null references auth.users(id) on delete cascade,
  stripe_customer_id text,
  stripe_session_id  text,
  plan               text not null
                       check (plan in ('premium_portfolio','featured_listing','gallery_partnership')),
  status             text not null default 'active' check (status in ('active','cancelled','expired')),
  expires_at         timestamptz,
  created_date       timestamptz not null default now(),
  updated_date       timestamptz not null default now()
);

create table if not exists public.collected_work (
  id                   uuid primary key default gen_random_uuid(),
  user_id              uuid not null references auth.users(id) on delete cascade,
  collector_profile_id uuid references public.collector_profile(id) on delete cascade,
  artist_id            text not null,
  artist_name          text,
  work_ref             text not null,
  work_title           text,
  work_image_url       text,
  work_medium          text,
  work_dimensions      text,
  work_year            text,
  work_description     text,
  work_price           text,
  work_currency        text default 'USD',
  created_date         timestamptz not null default now(),
  updated_date         timestamptz not null default now()
);

create table if not exists public.newsletter_subscriber (
  id           uuid primary key default gen_random_uuid(),
  email        text not null unique,
  consent      boolean not null default true,
  source       text default 'article',
  created_date timestamptz not null default now(),
  updated_date timestamptz not null default now()
);

-- ===========================================================================
-- Indexes — every column the app filters or sorts on
-- ===========================================================================
create index if not exists idx_article_published    on public.article(published, created_date desc);
create index if not exists idx_article_slug         on public.article(slug);
create index if not exists idx_article_featured     on public.article(featured) where featured;

create index if not exists idx_artist_user          on public.artist_profile(user_id);
create index if not exists idx_artist_chapter       on public.artist_profile(chapter);
create index if not exists idx_artist_discipline    on public.artist_profile(discipline);
create index if not exists idx_artist_featured      on public.artist_profile(is_featured) where is_featured;

create index if not exists idx_collector_user       on public.collector_profile(user_id);
create index if not exists idx_collector_type       on public.collector_profile(type);

create index if not exists idx_gwork_artist         on public.gallery_work(artist_id);
create index if not exists idx_gwork_owner          on public.gallery_work(owner_id);

create index if not exists idx_event_start          on public.event(start_date);
create index if not exists idx_event_chapter        on public.event(chapter);
create index if not exists idx_event_organizer      on public.event(organizer_id);

create index if not exists idx_opencall_deadline    on public.open_call(deadline);
create index if not exists idx_opencall_poster      on public.open_call(posted_by_id);

create index if not exists idx_fpost_author         on public.forum_post(author_id);
create index if not exists idx_fpost_category       on public.forum_post(category);
create index if not exists idx_freply_post          on public.forum_reply(post_id);

create index if not exists idx_comment_target       on public.comment(target_id, target_type);
create index if not exists idx_like_target          on public."like"(target_id, target_type);
create index if not exists idx_like_user            on public."like"(user_id);
create index if not exists idx_follow_follower      on public.follow(follower_id);
create index if not exists idx_follow_following     on public.follow(following_id);

create index if not exists idx_message_sender       on public.message(sender_id);
create index if not exists idx_message_recipient    on public.message(recipient_id);
create index if not exists idx_inquiry_artist       on public.inquiry(artist_id);
create index if not exists idx_inquiry_artist_user  on public.inquiry(artist_user_id);
create index if not exists idx_notification_user    on public.notification(user_id, read);
create index if not exists idx_subscription_user    on public.subscription(user_id);
create index if not exists idx_collected_user       on public.collected_work(user_id);

-- ===========================================================================
-- updated_date triggers on every table
-- ===========================================================================
do $$
declare t text;
begin
  foreach t in array array[
    'profiles','article','artist_profile','collector_profile','gallery_work','event',
    'open_call','forum_post','forum_reply','comment','like','follow','message',
    'inquiry','notification','subscription','collected_work','newsletter_subscriber'
  ]
  loop
    execute format('drop trigger if exists set_updated_date on public.%I', t);
    execute format(
      'create trigger set_updated_date before update on public.%I
       for each row execute function public.set_updated_date()', t);
  end loop;
end $$;

-- ===========================================================================
-- Keep forum_post.reply_count accurate
-- ===========================================================================
create or replace function public.sync_reply_count()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if tg_op = 'INSERT' then
    update public.forum_post set reply_count = reply_count + 1 where id = new.post_id;
  elsif tg_op = 'DELETE' then
    update public.forum_post set reply_count = greatest(reply_count - 1, 0) where id = old.post_id;
  end if;
  return null;
end;
$$;

drop trigger if exists trg_reply_count on public.forum_reply;
create trigger trg_reply_count
  after insert or delete on public.forum_reply
  for each row execute function public.sync_reply_count();
