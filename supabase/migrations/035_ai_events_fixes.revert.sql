-- Undo 035. Deploy the previous site code first. Times of events that had a
-- time zone saved stay correct; they are shown in the visitor's zone again.
-- Then run 034_ai_events.sql again: it puts back the earlier publish function.
begin;
alter table public.ai_event_run drop column if exists locked_until;
alter table public.event drop column if exists timezone;
notify pgrst, 'reload schema';
commit;
select count(*) as events_unchanged from public.event;
