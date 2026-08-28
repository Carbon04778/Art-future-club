-- ===========================================================================
-- 016 — the social columns galleries and venues were missing
-- Run once. Safe to re-run.
-- ===========================================================================
--
-- THE BUG
--
-- The admin panel offers Instagram, X/Twitter, LinkedIn and TikTok when
-- creating a gallery or venue, and sends all four. collector_profile only has
-- instagram and linkedin — so Supabase rejected the whole insert with
--
--     Could not find the 'twitter' column of 'collector_profile'
--
-- which read as though a Twitter handle were REQUIRED. It was not: the save
-- was failing outright, and that column simply happened to be named first.
--
-- artist_profile already has all four, so galleries were the odd one out.
-- ===========================================================================

alter table public.collector_profile
  add column if not exists twitter text,
  add column if not exists tiktok  text;

select
  count(*) filter (where twitter is not null) as with_twitter,
  count(*) as total
from public.collector_profile;
