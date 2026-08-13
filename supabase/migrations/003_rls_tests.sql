-- ===========================================================================
-- RLS ADVERSARIAL TEST SUITE
-- Run AFTER 001_schema.sql and 002_rls.sql.
--
-- This does not test that the app works. It tests that an ATTACKER FAILS.
-- Every check below is an attack that must be blocked.
--
-- Expected final output:  ALL RLS TESTS PASSED
-- Any FAIL line is a security hole. Do not deploy until this is clean.
-- ===========================================================================

set client_min_messages to warning;

create temp table results(name text, ok boolean, detail text);
grant all on results to anon, authenticated, service_role;

-- SECURITY DEFINER so the recorder can still write after `set role`.
create or replace function pg_temp.check(nm text, cond boolean, det text default '')
returns void language plpgsql security definer as $$
begin insert into results values (nm, cond, det); end $$;

-- Runs SQL and reports whether it was BLOCKED (raised an error).
-- NOT security definer: this must execute with the caller's privileges,
-- otherwise every "attack" would run as superuser and appear to succeed.
create or replace function pg_temp.blocked(sql text)
returns boolean language plpgsql as $$
begin
  execute sql;
  return false;   -- it succeeded => NOT blocked => security hole
exception when others then
  return true;    -- rejected => good
end $$;

-- ------------------------------------------------------------- fixtures
--
-- Remove any fixtures left by a previous run FIRST. Without this the suite is
-- not idempotent: the final section grants is_premium as service_role, and on
-- a second run the fixture insert would conflict, leaving that flag already
-- true — which then reports three false failures on the paywall checks.
-- Run as the SQL Editor's own role (postgres). Do NOT switch to service_role
-- here: in a real Supabase project service_role has no DELETE privilege on
-- auth.users, which is owned by supabase_auth_admin.
delete from public.article where title in ('Live','Secret Draft','Admin post');
delete from public.newsletter_subscriber where email in ('subscriber@example.com','newsub@example.com');
delete from public.inquiry where buyer_email in ('buyer@example.com','a@b.c');
-- Delete by id as well as email. The fixtures use fixed uuids, so if those
-- ids already exist under a different email the email-only cleanup misses
-- them and stale is_premium flags cause false paywall failures.
delete from auth.users where email in ('alice@example.com','bob@example.com','admin@example.com');
delete from auth.users where id in (
  '11111111-1111-1111-1111-111111111111',
  '22222222-2222-2222-2222-222222222222',
  '33333333-3333-3333-3333-333333333333'
);
delete from public.artist_profile where id = 'aaaaaaaa-0000-0000-0000-000000000001';
delete from public.forum_post    where id = 'dddddddd-0000-0000-0000-000000000001';

-- Remove anything left by a previous run so this file is safely re-runnable.
-- Everything else cascades from auth.users.
delete from public.newsletter_subscriber
  where email in ('subscriber@example.com','newsub@example.com');
delete from public.inquiry
  where buyer_email in ('buyer@example.com','a@b.c');
delete from auth.users
  where email in ('alice@example.com','bob@example.com','admin@example.com');

insert into auth.users (id, email) values
  ('11111111-1111-1111-1111-111111111111', 'alice@example.com'),
  ('22222222-2222-2222-2222-222222222222', 'bob@example.com'),
  ('33333333-3333-3333-3333-333333333333', 'admin@example.com')
on conflict do nothing;

-- Promotion must go through service_role — trg_protect_role blocks everyone
-- else, which is itself the privilege-escalation defence under test below.
set role service_role;
-- Create the profile rows explicitly. The on_auth_user_created trigger lives
-- on auth.users, which is outside the public schema and therefore absent after
-- a schema-scoped restore. Creating them here keeps this suite reliable in
-- both a live project and a restored one.
insert into public.profiles (id, email, full_name, role) values
  ('11111111-1111-1111-1111-111111111111','alice@example.com','Alice','user'),
  ('22222222-2222-2222-2222-222222222222','bob@example.com','Bob','user'),
  ('33333333-3333-3333-3333-333333333333','admin@example.com','Admin','admin')
on conflict (id) do update set role = excluded.role;
reset role;

insert into public.artist_profile (id, user_id, display_name, discipline)
values ('aaaaaaaa-0000-0000-0000-000000000001',
        '11111111-1111-1111-1111-111111111111', 'Alice', 'Painting');

insert into public.article (id, title, body, author_name, published, slug)
values ('cccccccc-0000-0000-0000-000000000001','Live','b','AFC', true, 'live'),
       ('cccccccc-0000-0000-0000-000000000002','Secret Draft','b','AFC', false, 'draft');

insert into public.message (sender_id, recipient_id, body)
values ('11111111-1111-1111-1111-111111111111',
        '22222222-2222-2222-2222-222222222222', 'private words');

insert into public.inquiry (artist_id, artist_user_id, buyer_name, buyer_email, message)
values ('aaaaaaaa-0000-0000-0000-000000000001',
        '11111111-1111-1111-1111-111111111111',
        'Rich Buyer', 'buyer@example.com', 'I will pay 50000');

insert into public.subscription (user_id, plan, status)
values ('11111111-1111-1111-1111-111111111111', 'premium_portfolio', 'active');

insert into public.newsletter_subscriber (email) values ('subscriber@example.com');

insert into public.forum_post (id, author_id, title, body, category)
values ('dddddddd-0000-0000-0000-000000000001',
        '11111111-1111-1111-1111-111111111111', 'Alice post', 'body', 'General');

-- ===========================================================================
-- ATTACK SURFACE 1 — ANONYMOUS VISITOR (the anon key in the browser)
-- ===========================================================================
set role anon;
select set_config('request.jwt.claim.sub', '', false);

select pg_temp.check('anon CANNOT read private messages',
  (select count(*) from public.message) = 0,
  'leaked ' || (select count(*) from public.message)::text);

select pg_temp.check('anon CANNOT read inquiries (buyer emails)',
  (select count(*) from public.inquiry) = 0,
  'leaked ' || (select count(*) from public.inquiry)::text);

select pg_temp.check('anon CANNOT read subscriptions',
  (select count(*) from public.subscription) = 0);

select pg_temp.check('anon CANNOT read notifications',
  (select count(*) from public.notification) = 0);

select pg_temp.check('anon CANNOT read newsletter list',
  (select count(*) from public.newsletter_subscriber) = 0);

select pg_temp.check('anon CANNOT see unpublished drafts',
  (select count(*) from public.article where published = false) = 0);

select pg_temp.check('anon CAN read published articles',
  (select count(*) from public.article where published and slug = 'live') = 1);

select pg_temp.check('anon CAN read artist profiles (public directory)',
  (select count(*) from public.artist_profile
   where id='aaaaaaaa-0000-0000-0000-000000000001') = 1);

select pg_temp.check('anon CANNOT insert an artist profile',
  pg_temp.blocked($$insert into public.artist_profile (display_name, discipline)
                    values ('Hacker','Painting')$$));

-- Attempt the delete, then confirm the specific row survived.
--
-- Checking for a raised error is not enough: Supabase grants anon table-level
-- DELETE and relies on RLS, so a blocked delete simply matches zero rows and
-- returns DELETE 0 rather than erroring. Counting all posts is also wrong once
-- the site has real content. Only the target row's survival proves anything.
select pg_temp.blocked($$delete from public.forum_post
                         where id='dddddddd-0000-0000-0000-000000000001'$$);
select pg_temp.check('anon CANNOT delete a forum post',
  (select count(*) from public.forum_post
   where id='dddddddd-0000-0000-0000-000000000001') = 1);

select pg_temp.check('anon CAN submit an inquiry (public form)',
  not pg_temp.blocked($$insert into public.inquiry
    (artist_id, buyer_name, buyer_email, message)
    values ('aaaaaaaa-0000-0000-0000-000000000001','Anon','a@b.c','hi')$$));

select pg_temp.check('anon CAN subscribe to newsletter',
  not pg_temp.blocked($$insert into public.newsletter_subscriber (email)
                        values ('newsub@example.com')$$));

reset role;

-- ===========================================================================
-- ATTACK SURFACE 2 — SIGNED-IN MEMBER ATTACKING ANOTHER MEMBER
-- Bob is authenticated and tries to reach Alice's data.
-- ===========================================================================
set role authenticated;
select set_config('request.jwt.claim.sub', '22222222-2222-2222-2222-222222222222', false);

select pg_temp.check('bob CANNOT edit alice''s artist profile',
  pg_temp.blocked($$update public.artist_profile set bio='hacked'
                    where id='aaaaaaaa-0000-0000-0000-000000000001'$$)
  or (select bio is distinct from 'hacked'
      from public.artist_profile
      where id='aaaaaaaa-0000-0000-0000-000000000001'));

select pg_temp.check('bob CANNOT delete alice''s artist profile',
  (select count(*) from public.artist_profile
   where id='aaaaaaaa-0000-0000-0000-000000000001') = 1);

select pg_temp.check('bob CANNOT read alice''s inquiries',
  (select count(*) from public.inquiry) = 0,
  'leaked ' || (select count(*) from public.inquiry)::text);

select pg_temp.check('bob CANNOT read alice''s subscription',
  (select count(*) from public.subscription) = 0);

select pg_temp.check('bob CANNOT see unpublished drafts',
  (select count(*) from public.article where published = false) = 0);

select pg_temp.check('bob CANNOT read the newsletter list',
  (select count(*) from public.newsletter_subscriber) = 0);

select pg_temp.check('bob CANNOT delete alice''s forum post',
  (select count(*) from public.forum_post
   where id='dddddddd-0000-0000-0000-000000000001') = 1);

select pg_temp.check('bob CANNOT publish an article',
  pg_temp.blocked($$insert into public.article (title, body, author_name, published)
                    values ('Fake','x','Bob',true)$$));

select pg_temp.check('bob CANNOT forge a like as alice',
  pg_temp.blocked($$insert into public."like" (user_id, target_id, target_type)
    values ('11111111-1111-1111-1111-111111111111',
            'aaaaaaaa-0000-0000-0000-000000000001','artist_profile')$$));

select pg_temp.check('bob CANNOT send a message impersonating alice',
  pg_temp.blocked($$insert into public.message (sender_id, recipient_id, body)
    values ('11111111-1111-1111-1111-111111111111',
            '22222222-2222-2222-2222-222222222222','forged')$$));

-- Bob IS a party to the alice->bob message, so he must see exactly that one.
select pg_temp.check('bob CAN read messages he is party to',
  (select count(*) from public.message where body = 'private words') = 1);

-- ---- PRIVILEGE ESCALATION: the single most dangerous attack -------------
select pg_temp.check('bob CANNOT promote himself to admin',
  pg_temp.blocked($$update public.profiles set role='admin'
                    where id='22222222-2222-2222-2222-222222222222'$$)
  or (select role from public.profiles
      where id='22222222-2222-2222-2222-222222222222') = 'user');

reset role;

-- ===========================================================================
-- ATTACK SURFACE 3 — PAYWALL BYPASS
-- Alice owns her profile. She must NOT be able to grant herself premium.
-- ===========================================================================
set role authenticated;
select set_config('request.jwt.claim.sub', '11111111-1111-1111-1111-111111111111', false);

select pg_temp.check('alice CAN edit her own bio',
  not pg_temp.blocked($$update public.artist_profile set bio='my real bio'
                        where id='aaaaaaaa-0000-0000-0000-000000000001'$$));

select pg_temp.check('alice CANNOT grant herself is_premium',
  pg_temp.blocked($$update public.artist_profile set is_premium=true
                    where id='aaaaaaaa-0000-0000-0000-000000000001'$$));

select pg_temp.check('alice CANNOT grant herself is_featured',
  pg_temp.blocked($$update public.artist_profile set is_featured=true
                    where id='aaaaaaaa-0000-0000-0000-000000000001'$$));

select pg_temp.check('paywall columns still false after attacks',
  (select not is_premium and not is_featured
   from public.artist_profile
   where id='aaaaaaaa-0000-0000-0000-000000000001'));

select pg_temp.check('alice CAN read her own inquiries',
  (select count(*) from public.inquiry) >= 1);

select pg_temp.check('alice CAN read her own subscription',
  (select count(*) from public.subscription
   where user_id='11111111-1111-1111-1111-111111111111') >= 1);

reset role;

-- ===========================================================================
-- ATTACK SURFACE 4 — ADMIN CAPABILITIES (must actually work)
-- ===========================================================================
set role authenticated;
select set_config('request.jwt.claim.sub', '33333333-3333-3333-3333-333333333333', false);

select pg_temp.check('admin CAN see unpublished drafts',
  (select count(*) from public.article where published = false
   and slug = 'draft') = 1);

select pg_temp.check('admin CAN publish an article',
  not pg_temp.blocked($$insert into public.article (title, body, author_name, published)
                        values ('Admin post','x','Admin',true)$$));

select pg_temp.check('admin CAN moderate (delete) any forum post',
  not pg_temp.blocked($$delete from public.forum_post
                        where id='dddddddd-0000-0000-0000-000000000001'$$));

select pg_temp.check('admin CAN read the newsletter list',
  (select count(*) from public.newsletter_subscriber
   where email='subscriber@example.com') = 1);

select pg_temp.check('admin CAN read all inquiries',
  (select count(*) from public.inquiry) >= 1);

-- Even an admin must not be able to hand out paid features for free.
select pg_temp.check('admin CANNOT bypass the paywall either',
  pg_temp.blocked($$update public.artist_profile set is_premium=true
                    where id='aaaaaaaa-0000-0000-0000-000000000001'$$));

reset role;

-- ===========================================================================
-- ATTACK SURFACE 5 — SERVICE ROLE (the Stripe webhook) must be able to grant
-- ===========================================================================
set role service_role;

select pg_temp.check('service_role CAN grant is_premium (Stripe webhook)',
  not pg_temp.blocked($$update public.artist_profile set is_premium=true
                        where id='aaaaaaaa-0000-0000-0000-000000000001'$$));

select pg_temp.check('service_role CAN change a user role',
  not pg_temp.blocked($$update public.profiles set role='admin'
                        where id='22222222-2222-2222-2222-222222222222'$$));

reset role;

-- ===========================================================================
-- REPORT  — one result set: summary row first, then every check.
-- ===========================================================================

select
  case
    when count(*) = 0
      then '*** HARNESS BROKEN — 0 CHECKS RECORDED, THIS IS NOT A PASS ***'
    when count(*) filter (where not ok) = 0
      then format('ALL RLS TESTS PASSED  (%s checks)', count(*))
    else format('*** %s OF %s FAILED — DO NOT DEPLOY ***',
                count(*) filter (where not ok), count(*))
  end as result,
  '' as check_name
from results

union all

select
  case when ok then 'PASS' else 'FAIL' end,
  name || case when ok or detail = '' then '' else '   [' || detail || ']' end
from results
order by 1, 2;