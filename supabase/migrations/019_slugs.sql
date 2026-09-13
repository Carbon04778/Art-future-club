-- ===========================================================================
-- 019 — readable URLs for artists, galleries, venues and events
-- Run once, after 018. Safe to re-run.
-- ===========================================================================
--
-- WHY
--
-- Every public page except editorial is addressed by a UUID:
--
--   /artists/d9ab6f21-5cc1-4d93-8c3a-9a3365bb8e10
--   /gallery/a25fb6fd-e42b-45a0-a38e-959f5a9f123a
--
-- Search engines are explicit that URLs should use descriptive words rather
-- than generated ids, and a UUID tells a human nothing either — it cannot be
-- read aloud, remembered, or recognised in a list of search results.
--
-- article already has a slug and does this correctly. This brings the other
-- three into line: 20 artists, 142 galleries and venues, 160 events.
--
-- NOTHING BREAKS. The id is still the primary key and the pages still accept
-- one, so every link already shared or indexed keeps working; the app then
-- redirects to the slug and points its canonical tag there.
--
-- THREE THINGS THE REAL DATA NEEDED
--
--   * One event is titled entirely in Chinese, which slugifies to nothing.
--     Those fall back to the id rather than producing an empty URL.
--   * Two events share a title. Duplicates get a numeric suffix.
--   * Fifteen event slugs exceeded 70 characters and are truncated.
-- ===========================================================================

-- -------------------------------------------------------------- 1. slugify
--
-- Accented Latin characters are folded by hand rather than with unaccent,
-- which is an extension that may not be installed. Without the fold, "Málaga"
-- would become "m-laga" instead of "malaga".

create or replace function public.slugify(input text)
returns text
language sql
immutable
as $$
  select nullif(
    trim(both '-' from
      regexp_replace(
        lower(
          translate(
            coalesce(input, ''),
            'àáâãäåèéêëìíîïòóôõöùúûüýñçšžðþæøœßÀÁÂÃÄÅÈÉÊËÌÍÎÏÒÓÔÕÖÙÚÛÜÝÑÇ',
            'aaaaaaeeeeiiiiooooouuuuyncszdtaoosAAAAAAEEEEIIIIOOOOOUUUUYNC'
          )
        ),
        '[^a-z0-9]+', '-', 'g'
      )
    ),
    ''
  );
$$;

-- A slug is capped at 70 characters and never ends mid-hyphen.
create or replace function public.slug_trim(input text)
returns text
language sql
immutable
as $$
  select nullif(trim(both '-' from left(coalesce(input, ''), 70)), '');
$$;

-- ---------------------------------------------------------- 2. the columns

alter table public.artist_profile    add column if not exists slug text;
alter table public.collector_profile add column if not exists slug text;
alter table public.event             add column if not exists slug text;

-- -------------------------------------------------------------- 3. backfill
--
-- Numbered per duplicate base so the second "Beyond the Ordinary" becomes
-- "...-2" rather than failing the unique index. Rows whose name yields nothing
-- take the id, which is guaranteed unique and still a working URL.

do $$
declare
  t record;
begin
  for t in
    select * from (values
      ('artist_profile',    'display_name'),
      ('collector_profile', 'display_name'),
      ('event',             'title')
    ) as v(tbl, col)
  loop
    execute format($f$
      with numbered as (
        select id,
               public.slug_trim(public.slugify(%I)) as base,
               row_number() over (
                 partition by public.slug_trim(public.slugify(%I))
                 order by created_date, id
               ) as rn
        from public.%I
        where slug is null or slug = ''
      )
      update public.%I target
      set slug = case
            when n.base is null then target.id::text
            when n.rn = 1       then n.base
            else public.slug_trim(n.base || '-' || n.rn)
          end
      from numbered n
      where target.id = n.id
    $f$, t.col, t.col, t.tbl, t.tbl);
  end loop;
end $$;

-- ------------------------------------------------------- 4. keep them unique
--
-- Partial, so a row that somehow has no slug does not block the index.

create unique index if not exists idx_artist_slug
  on public.artist_profile (slug) where slug is not null;
create unique index if not exists idx_collector_slug
  on public.collector_profile (slug) where slug is not null;
create unique index if not exists idx_event_slug
  on public.event (slug) where slug is not null;

-- --------------------------------------------- 5. new rows get one for free
--
-- One function for all three tables: it reads display_name or title from the
-- row as JSON, so it does not need to know which table it is on. The table
-- name is only needed to check the slug is free, which is done with dynamic
-- SQL against TG_TABLE_NAME.
--
-- An explicitly supplied slug is always respected, so an admin can override
-- the generated one.

create or replace function public.set_slug()
returns trigger
language plpgsql
as $$
declare
  src   text;
  base  text;
  cand  text;
  n     int := 1;
  taken boolean;
begin
  if new.slug is not null and new.slug <> '' then
    new.slug := public.slug_trim(public.slugify(new.slug));
    if new.slug is not null then return new; end if;
  end if;

  src  := coalesce(to_jsonb(new) ->> 'display_name', to_jsonb(new) ->> 'title', '');
  base := public.slug_trim(public.slugify(src));

  if base is null then
    new.slug := new.id::text;
    return new;
  end if;

  loop
    cand := case when n = 1 then base else public.slug_trim(base || '-' || n) end;
    execute format(
      'select exists(select 1 from public.%I where slug = $1 and id <> $2)',
      tg_table_name
    ) into taken using cand, new.id;
    exit when not taken;
    n := n + 1;
    -- Give up gracefully rather than spinning on a pathological duplicate.
    if n > 50 then
      cand := public.slug_trim(base || '-' || left(new.id::text, 8));
      exit;
    end if;
  end loop;

  new.slug := cand;
  return new;
end;
$$;

drop trigger if exists trg_slug_artist on public.artist_profile;
create trigger trg_slug_artist
  before insert or update of slug, display_name on public.artist_profile
  for each row execute function public.set_slug();

drop trigger if exists trg_slug_collector on public.collector_profile;
create trigger trg_slug_collector
  before insert or update of slug, display_name on public.collector_profile
  for each row execute function public.set_slug();

drop trigger if exists trg_slug_event on public.event;
create trigger trg_slug_event
  before insert or update of slug, title on public.event
  for each row execute function public.set_slug();

-- ---------------------------------------------------------------- 6. confirm

select
  (select count(*) from public.artist_profile    where slug is not null) as artists_with_slug,
  (select count(*) from public.collector_profile where slug is not null) as spaces_with_slug,
  (select count(*) from public.event             where slug is not null) as events_with_slug,
  (select count(*) from public.event where slug ~ '^[0-9a-f]{8}-') as events_fell_back_to_id;
