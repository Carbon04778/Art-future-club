-- Undo 034. Deploy the previous site code first. Deletes AI drafts and their
-- history. Events already published stay, but lose date_only and source_url
-- (a date-only event would then show a midday-UTC time).
begin;
drop function if exists public.ai_event_organiser_review(uuid, text, text);
drop function if exists public.ai_event_review(uuid, text, jsonb, text);
drop function if exists public.ai_event_publish(uuid);
drop table if exists public.ai_event_log;
drop table if exists public.ai_event_draft;
drop table if exists public.ai_event_run;
drop table if exists public.ai_event_source;
drop table if exists public.ai_event_settings;
alter table public.event drop column if exists date_only;
alter table public.event drop column if exists source_url;
notify pgrst, 'reload schema';
commit;
select count(*) as events_unchanged from public.event;
