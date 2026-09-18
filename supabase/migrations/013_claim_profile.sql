-- ===========================================================================
-- 013  claim_my_profile()
--
-- Lets a member take ownership of an admin-created listing that was filed
-- under their email address. AdminCreatePanel and scripts/import-galleries.mjs
-- both write `claim_email` on rows with a null `user_id` ("unclaimed"); this
-- function attaches such a row to the caller's account.
--
-- Called from src/pages/Onboarding.jsx on mount, via claimMyProfile() in
-- src/api/providers/supabase.js. It runs BEFORE onboarding creates a profile,
-- which matters — see "already has a profile" below.
--
-- Recovered from the live database on 2026-09-18 with
--   select pg_get_functiondef('public.claim_my_profile'::regproc);
-- This migration and 012 were originally applied by hand in the Supabase SQL
-- editor and never committed, so the repo and the database had drifted. The
-- body below is that dump verbatim; only comments and the grant were added.
--
-- BEHAVIOUR WORTH KNOWING
--
--   * Confirmed addresses only. A row is claimed only if the caller's
--     auth.users.email_confirmed_at is set, so signing up with someone else's
--     address cannot hand over their listing without proving access to it.
--   * At most one listing per kind, per member: `limit 1` ordered by
--     created_date. If the same address is the claim_email on two unclaimed
--     listings of the same kind, only the OLDEST is ever claimed; the other
--     stays unclaimed and needs an admin to reassign it.
--   * Already has a profile => claims nothing. The `not exists` guards mean a
--     member who already owns an artist/collector profile will not pick up an
--     admin-created one. So a listing added for someone who registered
--     earlier and already built a profile cannot be self-claimed.
--   * Type is not checked on collector_profile: a Gallery, Venue or Collector
--     row all match the same way and all report 'collector'.
--   * One-way. Nothing here un-claims; clearing user_id is a manual SQL edit.
--
-- Safe to re-run: CREATE OR REPLACE, and the claim itself is idempotent
-- because a claimed row no longer has user_id null.
-- ===========================================================================

CREATE OR REPLACE FUNCTION public.claim_my_profile()
 RETURNS TABLE(claimed text)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  me        uuid := auth.uid();
  my_email  text;
  hit       uuid;
begin
  if me is null then
    return;
  end if;

  select lower(u.email) into my_email
  from auth.users u
  where u.id = me and u.email_confirmed_at is not null;

  -- Unconfirmed addresses cannot claim: otherwise signing up with someone
  -- else's address, without ever proving access to it, would hand over their
  -- profile.
  if my_email is null then
    return;
  end if;

  if not exists (select 1 from public.artist_profile where user_id = me) then
    select id into hit
    from public.artist_profile
    where user_id is null and lower(claim_email) = my_email
    order by created_date
    limit 1;

    if hit is not null then
      update public.artist_profile set user_id = me where id = hit;
      claimed := 'artist';
      return next;
    end if;
  end if;

  if not exists (select 1 from public.collector_profile where user_id = me) then
    select id into hit
    from public.collector_profile
    where user_id is null and lower(claim_email) = my_email
    order by created_date
    limit 1;

    if hit is not null then
      update public.collector_profile set user_id = me where id = hit;
      claimed := 'collector';
      return next;
    end if;
  end if;

  return;
end;
$function$;

-- Stating the intent explicitly. Postgres grants EXECUTE to PUBLIC by default,
-- so this matches the live database rather than changing it; an anonymous
-- caller is already a no-op because auth.uid() is null for them.
grant execute on function public.claim_my_profile() to authenticated;
