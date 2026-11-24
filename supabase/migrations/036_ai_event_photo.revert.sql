-- Undo 036. Deploy the previous site code first, then run this, then run
-- 034_ai_events.sql and 035_ai_events_fixes.sql again (they put back the
-- earlier functions). Photos already on published events stay.
begin;
alter table public.ai_event_draft drop column if exists photo_url;
alter table public.ai_event_draft drop column if exists photo_focal_x;
alter table public.ai_event_draft drop column if exists photo_focal_y;
notify pgrst, 'reload schema';
commit;
