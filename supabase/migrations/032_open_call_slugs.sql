-- ===========================================================================
-- 032 — readable links for open calls
-- Run once, in TEST first, then LIVE. Safe to re-run. Needs 019 (slugify,
-- slug_trim, set_slug), which both projects already have.
-- ===========================================================================
--
-- Owner, 2026-11-22: open call links showed "numbers and random stuff" —
--   /open-calls/01a2b842-f210-4751-bc6b-8df0...
-- Now, the same as artists, galleries and events since 019:
--   /open-calls/open-call-01-glitch-the-broken-screen
--
-- NOTHING BREAKS. The site works before and after this runs: it shows the
-- slug when there is one and the id when not, and an old id link still opens
-- the call, then tidies the address bar to the slug.
--
-- The slug is made once, from the title. Editing the title later keeps the
-- slug (set_slug respects an existing one), so a link already shared never
-- stops working. Two calls with the same title get "-2", "-3".
--
-- Only adds a column, fills it and keeps it filled. No other data changes.
-- Undo: 032_open_call_slugs.revert.sql
-- ===========================================================================

begin;

alter table public.open_call add column if not exists slug text;

-- Fill existing calls, oldest first, numbering duplicates.
with numbered as (
  select id,
         public.slug_trim(public.slugify(title)) as base,
         row_number() over (
           partition by public.slug_trim(public.slugify(title))
           order by created_date, id
         ) as rn
  from public.open_call
  where slug is null or slug = ''
)
update public.open_call target
set slug = case
      when n.base is null then target.id::text
      when n.rn = 1       then n.base
      else public.slug_trim(n.base || '-' || n.rn)
    end
from numbered n
where target.id = n.id;

create unique index if not exists idx_open_call_slug
  on public.open_call (slug) where slug is not null;

-- New and edited calls: the same trigger function as artists, galleries and events.
drop trigger if exists trg_slug_open_call on public.open_call;
create trigger trg_slug_open_call
  before insert or update of slug, title on public.open_call
  for each row execute function public.set_slug();

notify pgrst, 'reload schema';
commit;

-- Which project this ran in, and the result: every call should have a slug.
select to_jsonb(e) as this_project from private.afc_environment e;
select title, slug from public.open_call order by created_date desc;
