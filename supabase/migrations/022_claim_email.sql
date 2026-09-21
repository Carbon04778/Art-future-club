-- ===========================================================================
-- 022  claim_email — the address an admin-created listing is filed under
--
-- RECONSTRUCTED, THEN VERIFIED. Safe to run; see the note below.
--
-- NUMBERING: this was first written as 012, which was wrong. 012 is
-- 012_admin_delete_subscribers.sql — AdminSubscribersPanel.jsx names that file
-- and describes what it does. claim_email was never a numbered migration at
-- all: it was added by hand, probably alongside 013, and no file ever recorded
-- it. It sits at the end rather than pretending to a number it never had.
--
-- ORDER, IF YOU EVER REPLAY FROM AN EMPTY DATABASE: 013 reads claim_email, so
-- run this BEFORE 013 despite the number. Against the existing database the
-- order is irrelevant — the column is already there and every statement below
-- is a no-op.
--
-- 013 was recovered verbatim with pg_get_functiondef. This could not be:
-- nothing dumps a plain ALTER TABLE after the fact, so it is reconstructed
-- from what the database and the code prove must be there.
--
-- WHAT IS EVIDENCE
--
--   * `claim_email` exists on both public.artist_profile and
--     public.collector_profile, and is read and written daily: 013's
--     claim_my_profile() matches on it, AdminCreatePanel and
--     AdminEditListingsPanel write it, scripts/import-galleries.mjs set it on
--     283 of the 302 rows of the September 2026 gallery import.
--   * It is nullable. 19 imported rows and most pre-existing galleries hold
--     NULL, and the panels write NULL for an empty field.
--   * No committed migration creates it. 001_schema.sql does not mention it;
--     grep finds it only in 013 and 021, both of which only ever read it.
--
-- VERIFIED 2026-09-22 against information_schema.columns, run by the owner in
-- the SQL editor: both columns are `text`, nullable, no default. So the column
-- definitions below are confirmed, not inferred. Only the index remains an
-- addition rather than a recovery.
--
-- WHAT WAS INFERENCE, NOW CONFIRMED
--
--   * `text`. Every other string column in 001_schema.sql is text, and the
--     column holds arbitrary addresses with no length seen. Confirmed above.
--   * The index below. claim_my_profile() looks up
--     `user_id is null and lower(claim_email) = <address>`, so a partial
--     functional index is the natural companion — but whether the original 012
--     created one, and under what name, is unknown.
--
-- SAFE TO RUN AS IS. Every statement is `if not exists`, so against the live
-- database — where the columns already exist — this changes nothing except
-- possibly adding the index. It adds no constraint and no default, because
-- imposing either would be inventing a rule nobody wrote.
--
-- TO CHECK WHAT IS REALLY THERE, run this first and compare:
--
--   select table_name, data_type, is_nullable, column_default
--   from information_schema.columns
--   where column_name = 'claim_email'
--     and table_name in ('artist_profile', 'collector_profile');
--
--   select tablename, indexname, indexdef from pg_indexes
--   where indexdef ilike '%claim_email%';
--
-- If either disagrees with this file, trust the database and correct the file.
--
-- WHAT THE COLUMN IS FOR
--
-- An admin-created listing has no user_id — it is unclaimed. claim_email
-- records the address it was filed under so the real gallery or artist can take
-- ownership by registering with that address; 013 does the attaching. It
-- creates no account by itself and grants nothing on its own.
--
-- It is NOT a private field: the read policies in 017 let anyone read an
-- approved row, and RLS filters rows rather than columns, so an approved
-- listing's claim address is readable with the anon key. That is tolerable
-- because these are published business contact addresses — the same ones on the
-- listing's public `email` field. Do not put a personal address here expecting
-- it to stay private.
-- ===========================================================================

alter table public.artist_profile
  add column if not exists claim_email text;

alter table public.collector_profile
  add column if not exists claim_email text;

-- Partial and functional, to match exactly how claim_my_profile() looks a row
-- up: lowercased, and only among rows nobody owns yet. Claiming happens once
-- per member at registration, so this is about correctness of plan shape on a
-- growing table rather than a hot path.
create index if not exists idx_artist_claim_email
  on public.artist_profile (lower(claim_email))
  where user_id is null and claim_email is not null;

create index if not exists idx_collector_claim_email
  on public.collector_profile (lower(claim_email))
  where user_id is null and claim_email is not null;
