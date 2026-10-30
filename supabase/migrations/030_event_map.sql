-- ===========================================================================
-- 030 — events on the map (B7 in CLIENT-REQUESTS)
-- Run once, in TEST first, then LIVE. Safe to re-run.
-- Undo: 030_event_map.revert.sql
-- ===========================================================================
--
-- Julie: "we had asked that events also be added to the 'map' search."
--
-- Events had a venue name and an address but no position, so the map could
-- not place them. This adds a position (geo_lat, geo_lng) and fills it from
-- the pin of the listing the event takes place at — the venue name matches
-- a gallery, venue or Directory listing's name exactly (ignoring capitals
-- and spaces). Checked on live 2026-10-30: that places 52 of the 53 upcoming
-- events precisely, on the venue's own pin. Events at a place with no
-- listing keep no position here; the site looks their address up when the
-- event is next saved.
--
-- Writes ONLY the two new columns, ONLY on events that match exactly one
-- pinned listing name. set_updated_date is paused for the fill, so no event
-- looks "recently updated". Nothing else in any row changes.
-- ===========================================================================

begin;

alter table public.event
  add column if not exists geo_lat double precision,
  add column if not exists geo_lng double precision;

alter table public.event disable trigger set_updated_date;

-- One pinned, approved listing per name. A name used by two listings in
-- different places is ambiguous: skipped, not guessed.
with pins as (
  select lower(trim(display_name)) as name,
         min(geo_lat) as lat, min(geo_lng) as lng,
         count(distinct (geo_lat, geo_lng)) as places
    from public.collector_profile
   where geo_lat is not null and geo_lng is not null and status = 'approved'
   group by lower(trim(display_name))
)
update public.event e
   set geo_lat = p.lat, geo_lng = p.lng
  from pins p
 where p.places = 1
   and lower(trim(e.venue)) = p.name
   and e.geo_lat is null;

alter table public.event enable trigger set_updated_date;

notify pgrst, 'reload schema';

commit;

-- Check
select
  (select count(*) from public.event)                                           as events,
  (select count(*) from public.event where geo_lat is not null)                 as placed,
  (select count(*) from public.event
     where coalesce(end_date, start_date) >= now())                             as upcoming,
  (select count(*) from public.event
     where coalesce(end_date, start_date) >= now() and geo_lat is not null)    as upcoming_placed,
  (select max(updated_date) from public.event)                                  as newest_updated_unchanged;
