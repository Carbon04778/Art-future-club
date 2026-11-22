-- ===========================================================================
-- Undo 033 — new open call links go back to 032's rule (whole title, cut at
-- 70). Existing links are kept as they are, so no shared link breaks.
-- ===========================================================================

begin;
drop trigger if exists trg_open_call_slug_words on public.open_call;
drop function if exists public.open_call_slug_words();
notify pgrst, 'reload schema';
commit;

select to_jsonb(e) as this_project from private.afc_environment e;
select title, slug from public.open_call order by created_date desc;
