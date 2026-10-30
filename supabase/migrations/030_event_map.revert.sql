-- Undo 030: removes events' map positions. Deploy the previous site code
-- first (the map and event forms read and write these columns). Nothing
-- else about any event changes.
begin;
alter table public.event drop column if exists geo_lat;
alter table public.event drop column if exists geo_lng;
notify pgrst, 'reload schema';
commit;
select count(*) as events_unchanged from public.event;
