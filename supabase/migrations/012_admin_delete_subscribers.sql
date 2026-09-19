-- ===========================================================================
-- 012  let an admin delete a newsletter subscriber
--
-- RECONSTRUCTED, NOT RECOVERED — but its purpose is documented in the code.
--
-- 002_rls.sql gave newsletter_subscriber an INSERT policy for anyone and a
-- SELECT policy for admins, and stopped there. With RLS enabled and no DELETE
-- policy, a delete matches no policy and silently removes nothing, so an
-- unsubscribe request could not be honoured from the interface at all.
--
-- src/components/AdminSubscribersPanel.jsx names this file:
--
--   "Deleting requires migration 012 — before that there was no delete policy
--    at all, so an unsubscribe request could not be honoured from the
--    interface."
--
-- and its delete handler tells the admin, on an RLS error, to
-- "Run migration 012_admin_delete_subscribers.sql in Supabase." So the intent
-- and the filename are certain; only the exact SQL was never committed.
--
-- WHY THIS MATTERS BEYOND CONVENIENCE
--
-- A subscriber list is personal data and an unsubscribe is a request to erase
-- it. Leaving the only route a manual database edit makes honouring one depend
-- on someone having dashboard access.
--
-- SCOPE — admins only, delete only.
--
-- Not granted to anon. An anonymous visitor may still subscribe (002), but
-- letting the same key delete rows would let anyone empty the list, and an
-- unsubscribe link cannot be authenticated as the subscriber without a token
-- flow that does not exist here.
--
-- Safe to run more than once: the policy is dropped first, and the grant is
-- idempotent. If the live database already has an equivalent policy under a
-- different name, this adds a second one — PERMISSIVE policies are ORed, so
-- the effect is the same, but check before assuming:
--
--   select policyname, cmd, roles, qual from pg_policies
--   where tablename = 'newsletter_subscriber';
-- ===========================================================================

-- RLS is already enabled on this table by 002_rls.sql.

-- DELETE needs the table privilege as well as a policy: a policy permits rows,
-- a grant permits the verb, and both are required.
grant delete on public.newsletter_subscriber to authenticated;

drop policy if exists newsletter_delete_admin on public.newsletter_subscriber;
create policy newsletter_delete_admin on public.newsletter_subscriber
  for delete to authenticated
  using (public.is_admin());
