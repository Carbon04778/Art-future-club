-- ===========================================================================
-- Undo 032 — open calls back to id links. Safe to re-run.
-- The site keeps working: it uses the id when a call has no slug.
-- ===========================================================================

begin;
drop trigger if exists trg_slug_open_call on public.open_call;
drop index if exists public.idx_open_call_slug;
alter table public.open_call drop column if exists slug;
notify pgrst, 'reload schema';
commit;

select to_jsonb(e) as this_project from private.afc_environment e;
select count(*) as open_calls from public.open_call;
