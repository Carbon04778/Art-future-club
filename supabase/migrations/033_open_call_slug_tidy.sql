-- ===========================================================================
-- 033 — tidier open call links. Run after 032, in TEST first, then LIVE.
-- Safe to re-run.
-- ===========================================================================
--
-- 032 made each link from the whole title, cut at 70 characters. Open call
-- titles carry a tagline after two spaces, so three of the four live links
-- were long and cut mid-word:
--   cyber-punk-the-living-world-the-code-finishes-booting-and-a-world-walk
--   code-pattern-the-hidden-order-look-closer-there-was-a-system-inside-th
--
-- Now an open call's link is made from its MAIN title — the part before two
-- spaces, if there are two — and a long one is cut at a whole word:
--   cyber-punk-the-living-world
--   code-pattern-the-hidden-order
--   open-call-01-glitch-the-broken-screen
--
-- The four live links were made by 032 on 2026-11-22 and are not yet on the
-- site, so nobody has them; this re-makes them once. After this, a link is
-- made when a call is posted and never changes (renaming keeps it).
--
-- Open calls only: artists, galleries and events keep 019's rule untouched.
-- Undo: 033_open_call_slug_tidy.revert.sql (rule back to 032's).
-- ===========================================================================

begin;

create or replace function public.open_call_slug_words()
returns trigger
language plpgsql
as $$
declare
  main text;
  full_slug text;
  base text;
  cand text;
  n int := 1;
begin
  -- An existing or supplied link is kept; 019's set_slug tidies it after.
  if new.slug is not null and new.slug <> '' then return new; end if;

  main := split_part(coalesce(new.title, ''), '  ', 1);
  full_slug := coalesce(public.slugify(main), public.slugify(new.title));
  if full_slug is null then return new; end if;  -- set_slug falls back to the id

  -- At most 66 characters, cut at a whole word, leaving room for "-2".."-50".
  base := case
    when length(full_slug) <= 66 then full_slug
    else coalesce(nullif(regexp_replace(left(full_slug, 67), '-[^-]*$', ''), ''), left(full_slug, 66))
  end;

  loop
    cand := case when n = 1 then base else base || '-' || n end;
    exit when not exists (select 1 from public.open_call where slug = cand and id <> new.id);
    n := n + 1;
    if n > 50 then cand := base || '-' || left(new.id::text, 8); exit; end if;
  end loop;

  new.slug := cand;
  return new;
end;
$$;

-- Runs before 032's trg_slug_open_call (triggers fire in name order).
drop trigger if exists trg_open_call_slug_words on public.open_call;
create trigger trg_open_call_slug_words
  before insert or update of slug, title on public.open_call
  for each row execute function public.open_call_slug_words();

-- Re-make the links 032 made, once. Only rows whose link is still exactly
-- what 032 produced from the full title, so a re-run changes nothing.
update public.open_call
set slug = null
where slug = public.slug_trim(public.slugify(title))
  and slug is distinct from (
    case when length(public.slugify(split_part(title, '  ', 1))) <= 66
      then public.slugify(split_part(title, '  ', 1)) end
  );

notify pgrst, 'reload schema';
commit;

select to_jsonb(e) as this_project from private.afc_environment e;
select title, slug from public.open_call order by created_date desc;
