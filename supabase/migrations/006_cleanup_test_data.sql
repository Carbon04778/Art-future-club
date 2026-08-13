-- ===========================================================================
-- 006 — remove the fixtures created by 003_rls_tests.sql
--
-- The security suite inserts real rows (test users, two articles, a message,
-- an inquiry, a subscription, a forum post) so it has something to attack.
-- They are harmless but they show up in the app, so clear them once you have
-- seen ALL RLS TESTS PASSED.
--
-- Safe to run more than once. Safe to run even if you never ran the tests.
-- ===========================================================================

-- Articles created by the suite.
delete from public.article
where title in ('Live', 'Secret Draft', 'Admin post')
   or slug  in ('live', 'draft');

-- Newsletter signups created by the anon-insert checks.
delete from public.newsletter_subscriber
where email in ('subscriber@example.com', 'newsub@example.com');

-- Inquiries created by the anon-insert checks.
delete from public.inquiry
where buyer_email in ('buyer@example.com', 'a@b.c');

-- The fixture users. Everything else they own cascades from here:
-- artist_profile, message, inquiry, subscription, forum_post, profiles.
delete from auth.users
where email in (
  'alice@example.com',
  'bob@example.com',
  'admin@example.com'
);

-- Confirm the cleanup.
select
  (select count(*) from auth.users)             as users_remaining,
  (select count(*) from public.article)         as articles_remaining,
  (select count(*) from public.artist_profile)  as artist_profiles_remaining,
  (select count(*) from public.inquiry)         as inquiries_remaining;
