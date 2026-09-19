-- ===========================================================================
-- 021  admin_listings — one pageable list of artists and spaces
--
-- WHY A VIEW
--
-- AdminEditListingsPanel showed artists and spaces as one merged list, but the
-- merge happened in JavaScript: two queries capped at 500 rows each, combined
-- and then filtered and searched in the browser. That has two faults.
--
--   1. The cap truncates silently. Past 500 rows the oldest listings are
--      simply absent, the search cannot find them, and nothing on the page
--      says so. collector_profile passed 300 rows during the September 2026
--      gallery import and is heading for ~500.
--   2. You cannot paginate a client-side merge. "Page 2" of two separately
--      capped queries is not a well-defined set of rows.
--
-- Doing the union in SQL fixes both: one query can sort, filter, search, page
-- and count across both tables, so the panel can show "1-50 of 503" and never
-- hide a row.
--
-- READ-ONLY. The panel still writes through ArtistProfile / CollectorProfile;
-- `kind` tells it which. Nothing updates this view.
--
-- SECURITY — security_invoker = true, and this is NOT optional
--
-- A view runs with its OWNER's privileges unless security_invoker is set, and
-- the owner here owns both underlying tables. This view carries claim_email,
-- status and user_id, so leaving it at the default would hand every listing's
-- claim address to anyone holding the anon key that ships in the browser
-- bundle — the same shape of leak migration 020 was written to close.
--
-- With security_invoker = true the caller's own RLS applies instead: the
-- artist_read / collector_read policies from 017. An admin sees everything
-- (is_admin()), a member sees their own, and anon sees only approved rows.
-- The panel is admin-only, so it sees the whole set.
--
-- Contrast 020 deliberately: profiles_public sets security_invoker = FALSE
-- because it is the sanctioned way past a restrictive policy and can only ever
-- return three harmless columns. This view is the opposite case.
--
-- Columns are cast to text so the two branches of the union always agree, even
-- if `type`, `discipline` or `status` is later changed to an enum.
-- ===========================================================================

create or replace view public.admin_listings as
  select
    'artist'::text        as kind,
    ap.id,
    ap.display_name,
    null::text            as type,
    ap.discipline::text   as discipline,
    ap.based_in,
    ap.claim_email,
    ap.user_id,
    ap.status::text       as status,
    ap.created_date,
    ap.slug,
    ap.avatar_url
  from public.artist_profile ap

  union all

  select
    'collector'::text     as kind,
    cp.id,
    cp.display_name,
    cp.type::text         as type,
    null::text            as discipline,
    cp.based_in,
    cp.claim_email,
    cp.user_id,
    cp.status::text       as status,
    cp.created_date,
    cp.slug,
    cp.avatar_url
  from public.collector_profile cp;

-- Spelled out rather than relied upon: see the security note above.
alter view public.admin_listings set (security_invoker = true);

-- Signed-in callers only. Not granted to anon — nothing public reads this, and
-- RLS is a second line of defence here, not the only one.
grant select on public.admin_listings to authenticated;
