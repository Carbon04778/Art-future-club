# Backups and restore

Supabase's free tier includes **no backups**. Once real members start uploading
portfolios, that is the single biggest risk to this project — larger than any
usage limit. The workflow in `.github/workflows/backup-database.yml` closes
that gap at no cost.

---

## Setup (once, ~2 minutes)

1. Supabase → **Project Settings → Database → Connection string → URI**,
   and pick **Session pooler**. Replace `[YOUR-PASSWORD]` with the real
   database password.

2. GitHub → your repo → **Settings → Secrets and variables → Actions →
   New repository secret**

   | Name | Value |
   |---|---|
   | `SUPABASE_DB_URL` | the full connection string from step 1 |

3. GitHub → **Actions → Backup database → Run workflow**. Confirm it goes
   green, then check the **Artifacts** section for the `.sql.gz` file.

Do not skip step 3. An untested backup is not a backup.

After that it runs nightly at 03:00 UTC. Backups are kept 90 days.

---

## What the backup contains

| Included | Not included |
|---|---|
| All 18 tables and their data | Uploaded files in Storage |
| Indexes, triggers, functions | Auth users (`auth` schema) |
| RLS policies | The `on_auth_user_created` trigger |
| GRANTs | |

**Two gaps worth understanding.**

**Auth users are not backed up.** The `auth` schema is managed by Supabase and
is not accessible to `pg_dump` over a normal connection. If you lose the
project entirely, members would need to re-register. Rows in `profiles`,
`artist_profile` and so on survive and can be relinked by id. This is a real
argument for Supabase Pro once you have a meaningful membership.

**Storage files are not backed up.** Uploaded artwork lives in the `uploads`
bucket, not the database. Phase 3 moves media to Cloudflare R2, which has its
own durability. Until then, uploaded images are the least-protected asset.

---

## Restoring

```bash
# 1. Recreate the schema, including objects outside the public schema.
#    This matters: the on_auth_user_created trigger lives on auth.users and
#    is NOT in the dump, because the dump is scoped to the public schema.
psql "$NEW_DB_URL" -f supabase/migrations/001_schema.sql

# 2. Restore the data.
gunzip -c afc-backup-YYYY-MM-DD_HHMM.sql.gz | psql "$NEW_DB_URL"

# 3. Re-apply RLS. The dump carries policies, but re-running is harmless
#    and guarantees they match the current migration file.
psql "$NEW_DB_URL" -f supabase/migrations/002_rls.sql

# 4. PROVE the restore is secure before pointing the app at it.
psql "$NEW_DB_URL" -f supabase/migrations/003_rls_tests.sql
#    Must print: ALL RLS TESTS PASSED  (38 checks)

# 5. Recreate the storage bucket.
psql "$NEW_DB_URL" -f supabase/migrations/004_storage.sql
```

Then update `VITE_SUPABASE_URL` and `VITE_SUPABASE_ANON_KEY` in Netlify.

**Step 4 is not optional.** A restore that silently loses its policies gives
you a working-looking site with every private message readable by anyone.

---

## Things learned the hard way

These were found by actually dumping and restoring a real database, not by
reading the manual. They are recorded here so nobody reintroduces them.

**`--no-acl` makes a backup useless.** It is commonly recommended for
portability, but it strips every `GRANT`. A restore made with it produced a
database where `anon` and `authenticated` had no access to any table — the app
came back completely broken. The workflow deliberately omits that flag and
fails the build if a dump contains fewer than 10 `GRANT` statements.

**A schema-scoped dump omits the `auth.users` trigger.** `on_auth_user_created`
is what creates a `profiles` row on signup. Restore without re-running
`001_schema.sql` and signups appear to succeed while silently creating no
profile — so nobody has a role, and the Admin Dashboard is unreachable. Hence
step 1 above.

**A truncated dump looks fine.** A cut-off `pg_dump` is still valid gzip and
restores without complaint, just missing rows. The workflow checks for the
`PostgreSQL database dump complete` marker that every complete dump ends with,
and fails without it.

---

## When to move to Supabase Pro

This setup is genuinely sufficient while the site is new. Move to Pro when:

- you have real members whose accounts you cannot ask people to recreate
  (auth users are the gap this cannot cover), or
- you cross ~80% of any free-tier limit, or
- the client would consider a day of lost data a serious business problem.

Pro is $25/month and includes daily backups with point-in-time recovery, plus
no 7-day pausing.
