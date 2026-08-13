-- ===========================================================================
-- 007 — relax over-strict taxonomy CHECK constraints
-- Run once, after 002_rls.sql. Safe to re-run.
-- ===========================================================================
--
-- WHAT WAS WRONG
--
-- The original schema derived its CHECK constraints from the legacy entity
-- definitions, which listed fewer values than the interface actually offers.
-- Any save using one of the newer options was rejected by the database, which
-- surfaced as features silently "not working":
--
--   forum_post.category        UI offers Open Call / Exhibition News /
--                              Opportunities  -> community posting failed
--   open_call.type             UI offers Fellowship            -> open calls failed
--   article.category           UI offers Artist Feature, Art Fair, Chapter: …
--                              and 17 more                     -> publishing failed
--   article.layout             UI offers gallery_middle, intro_middle
--   event.event_type           UI offers Screening, Performance
--   event.chapter              UI offers Tokyo, Berlin, Seoul, Mexico City, Online
--   collector_profile.type     UI offers Foundation
--
-- WHY DROPPING THEM IS THE RIGHT FIX
--
-- These are editorial taxonomies, not security boundaries. They change as the
-- club grows — new chapters, new event formats, new article categories — and
-- every change would otherwise need a database migration. The interface is
-- the correct place to define the vocabulary; the database just stores it.
--
-- WHAT DELIBERATELY KEEPS ITS CONSTRAINT
--
--   profiles.role              privilege boundary — must stay ('user','admin')
--   subscription.plan/status   billing logic depends on exact values
--   inquiry.status/type        drives app logic
--   like/comment.target_type   drives polymorphic lookups
--
-- Re-run 003_rls_tests.sql afterwards. It must still report 38 passes.
-- ===========================================================================

alter table public.article           drop constraint if exists article_category_check;
alter table public.article           drop constraint if exists article_layout_check;
alter table public.artist_profile    drop constraint if exists artist_profile_discipline_check;
alter table public.artist_profile    drop constraint if exists artist_profile_chapter_check;
alter table public.collector_profile drop constraint if exists collector_profile_type_check;
alter table public.collector_profile drop constraint if exists collector_profile_partnership_type_check;
alter table public.event             drop constraint if exists event_event_type_check;
alter table public.event             drop constraint if exists event_chapter_check;
alter table public.open_call         drop constraint if exists open_call_type_check;
alter table public.forum_post        drop constraint if exists forum_post_category_check;

-- Keep the columns NOT NULL where the app always supplies a value, so we do
-- not silently accept blank taxonomies.
alter table public.artist_profile alter column discipline set not null;
alter table public.event          alter column event_type set not null;
alter table public.forum_post     alter column category   set not null;

-- Confirm what remains constrained.
select
  rel.relname  as table_name,
  con.conname  as constraint_name
from pg_constraint con
join pg_class rel on rel.oid = con.conrelid
join pg_namespace ns on ns.oid = rel.relnamespace
where ns.nspname = 'public'
  and con.contype = 'c'
  and con.conname like '%_check'
order by 1, 2;
