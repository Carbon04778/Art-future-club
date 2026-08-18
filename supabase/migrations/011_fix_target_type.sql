-- ===========================================================================
-- 011 — allow 'portfolio_work' as a comment / like target
-- Run once, after 002_rls.sql. Safe to re-run.
-- ===========================================================================
--
-- THE BUG
--
-- ArtistProfileView passes targetType="portfolio_work" for each work in an
-- artist's portfolio, but the CHECK constraints only permitted
-- artist_profile, collector_profile and gallery_work.
--
-- Every comment and every like on an artist's artwork was therefore rejected
-- by Postgres. In the interface this looked like nothing happening: the typed
-- comment stayed in the box, and only appeared to "work" after a reload
-- because the reload re-read the list from the database and showed nothing.
--
-- Notifications were affected too — the notification is only created after
-- the comment succeeds, so a rejected comment meant no notification either.
--
-- These are display taxonomies, not security boundaries. Dropping the
-- constraint keeps the interface free to add new target types without a
-- migration each time; the RLS policies still control who may write.
-- ===========================================================================

alter table public.comment   drop constraint if exists comment_target_type_check;
alter table public."like"    drop constraint if exists like_target_type_check;

-- Keep them NOT NULL: a comment or like must still say what it is attached to.
alter table public.comment alter column target_type set not null;
alter table public."like"  alter column target_type set not null;

select
  (select count(*) from public.comment) as comments,
  (select count(*) from public."like")  as likes;