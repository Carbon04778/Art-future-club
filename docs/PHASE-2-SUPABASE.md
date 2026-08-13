# Phase 2 — Supabase setup

Follow in order. Steps 1–5 take about 30 minutes. **Do not skip step 4.**

At the end of this, the app switches from demo data to a real shared database
by changing **one line**.

---

## 1. Create the project

1. supabase.com → **New project**
2. Note the database password somewhere safe — it is shown once.
3. Pick the region closest to your users (Singapore or Hong Kong for an
   Asia-based audience; latency on the free tier is noticeable).

## 2. Run the migrations

**SQL Editor → New query.** Paste and run each file, in this order:

| Order | File | What it does |
|---|---|---|
| 1 | `supabase/migrations/001_schema.sql` | 18 tables, indexes, triggers |
| 2 | `supabase/migrations/002_rls.sql` | Row Level Security policies |
| 3 | `supabase/migrations/004_storage.sql` | uploads bucket + policies |

Each should end with `Success. No rows returned`.

## 3. Configure auth

**Authentication → Providers → Email:** enable it.

**Authentication → Emails → Confirm signup.**

Supabase now requires custom SMTP before templates can be edited. You have two
options, and the app adapts automatically to either — no code change needed.

**Option A — for now (free, no domain required).**
Authentication → Sign In / Providers → Email → turn **Confirm email OFF**.

Signup then completes instantly with no code. `register()` detects that a
session came back and sends the user straight to onboarding. Perfect for
building and for client demos.

Trade-off: anyone can register with an address they do not own. Fine while the
site is not public; not acceptable at launch.

**Option B — before launch (free tier, needs a domain).**
Set up SMTP with Resend (3,000 emails/month free), verify the client's domain,
then Authentication → Emails → Confirm signup → **Source**, and replace the
body with:

```html
<h2>Confirm your email address</h2>
<p>Your Art Future Club verification code is:</p>
<h1 style="letter-spacing:4px">{{ .Token }}</h1>
<p>Enter this code to finish signing up. It expires in 60 minutes.</p>
```

Turn **Confirm email ON**. The app switches back to the 6-digit code screen by
itself.

Note: Supabase's built-in email sender is rate-limited to a handful per hour
and is not intended for production, so real SMTP is needed at launch anyway.

**For Google sign-in** (optional, can wait): Providers → Google, add your
OAuth client ID and secret, then add your Netlify URL under
**URL Configuration → Redirect URLs**.

## 4. ⚠️ Verify security — do not skip

**SQL Editor → New query.** Paste and run
`supabase/migrations/003_rls_tests.sql`.

The last line must read:

```
ALL RLS TESTS PASSED  (38 checks)
```

This runs 38 attacks against your own database — anonymous visitors trying to
read private messages, one member trying to edit another's profile, a user
trying to promote themselves to admin, an artist trying to grant themselves
premium without paying.

**If any line says FAIL, stop and fix it before going further.** A failure here
is not a bug, it is a data breach waiting to happen. The browser holds the anon
key — it is public by design, and these policies are the only thing protecting
the data.

If you see `HARNESS BROKEN — 0 CHECKS RECORDED`, the script did not run
properly. That is not a pass either.

Afterwards, clean up the test rows:

```sql
delete from auth.users where email in
  ('alice@example.com','bob@example.com','admin@example.com');
```

Everything else cascades.

## 5. Wire up the app

Copy your keys from **Project Settings → API**:

```bash
# .env  (never commit this)
VITE_SUPABASE_URL=https://xxxxx.supabase.co
VITE_SUPABASE_ANON_KEY=eyJhbGci...
```

The anon key is safe in the browser — that is what RLS is for. **The
service_role key must never appear in a `VITE_` variable**, because everything
prefixed `VITE_` is compiled into the public JavaScript bundle.

Then flip the switch in `src/api/base44Client.js`:

```js
// import * as provider from "@/api/providers/mock";
import * as provider from "@/api/providers/supabase";
```

That is the entire code change. No page or component is touched.

```bash
npm install
npm run dev
```

Add the same two variables in **Netlify → Site configuration → Environment
variables** before deploying.

## 6. Create your admin account

Register through the app, then in the SQL editor:

```sql
update public.profiles set role = 'admin' where email = 'you@yourdomain.com';
```

This must be done in SQL — the app itself cannot change roles, which is
exactly the privilege-escalation defence tested in step 4.

If you get `ERROR: role may only be changed by service_role`, you are on the
original triggers. Run `005_fix_admin_triggers.sql` once, then retry. (Or, as
a one-off, wrap the update in `set role service_role;` ... `reset role;`.)

Then **sign out and back in** — the role is read at login.

---

## 7. Edge functions (needed for maps and payments)

Requires the Supabase CLI: `npm i -g supabase`

```bash
supabase login
supabase link --project-ref YOUR_PROJECT_REF

supabase functions deploy geocodeAddress
supabase functions deploy createCheckout

# Stripe does not send a Supabase JWT, so verification must be off.
# The Stripe signature check inside the function is what authenticates it.
supabase functions deploy stripeWebhook --no-verify-jwt
```

Set the secrets (**Edge Functions → Secrets**, or via CLI):

| Secret | Needed by | Notes |
|---|---|---|
| `SITE_URL` | createCheckout | e.g. `https://art-future-club.netlify.app` |
| `STRIPE_SECRET_KEY` | both Stripe fns | |
| `STRIPE_WEBHOOK_SECRET` | stripeWebhook | from the Stripe webhook endpoint page |
| `STRIPE_PRICE_PREMIUM` | createCheckout | `price_...` |
| `STRIPE_PRICE_FEATURED` | createCheckout | `price_...` |
| `STRIPE_PRICE_GALLERY` | createCheckout | `price_...` |

`SUPABASE_URL`, `SUPABASE_ANON_KEY` and `SUPABASE_SERVICE_ROLE_KEY` are
injected automatically.

In Stripe, add the webhook endpoint
`https://YOUR_PROJECT.supabase.co/functions/v1/stripeWebhook`
subscribed to `checkout.session.completed`.

**Geocoding works without any of this** — only payments need Stripe. Deploy
`geocodeAddress` first and leave Stripe until Phase 4 if you prefer.

---

## Free-tier housekeeping

**The project pauses after 7 days of no requests.** Add
`.github/workflows/keep-supabase-awake.yml` (in this repo) and set
`SUPABASE_URL` and `SUPABASE_ANON_KEY` as repository secrets.

**Backups.** The free tier has none. `.github/workflows/backup-database.yml`
runs a nightly `pg_dump` at no cost — set the `SUPABASE_DB_URL` repository
secret to switch it on, then trigger it once manually to confirm it works.
Full setup and the restore procedure: `docs/BACKUP-RESTORE.md`.

**Watch storage.** 1 GB total, 5 GB egress/month. The provider compresses
images on upload (2000px, WebP) which buys roughly 8–15×, but an active art
platform will still reach it. Phase 3 moves media to Cloudflare R2.

---

## Troubleshooting

| Symptom | Cause | Fix |
|---|---|---|
| Every list is empty, console shows `permission denied` | RLS on, GRANTs missing | Re-run `002_rls.sql` in full |
| Signup email contains a link, not a code | Template not changed | Step 3 — use `{{ .Token }}` |
| Admin Dashboard invisible after promoting | `profiles.role` cached in session | Sign out and back in |
| Uploads fail with `new row violates row-level security` | Bucket policies missing | Run `004_storage.sql` |
| Site works locally, breaks on Netlify | Env vars not set there | Netlify → Environment variables |
| `Missing VITE_SUPABASE_URL` on boot | No `.env` | Copy `.env.example` to `.env` |

---

## What Phase 2 does not cover

- **Migrating existing Base44 data** — Phase 5. Note that passwords cannot be
  migrated (Base44 hashes them), so members will need a reset email at cutover.
  Plan that announcement rather than surprising people.
- **Moving images off `media.base44.com`** — Phase 3. Until then the Base44
  account must stay open or every image breaks.
- **Server-side rendering for social previews** — Phase 6.

---

## Phase 3 (do this FIRST) — cut the Base44 cord

Every image on the site still loads from `media.base44.com`. **Until this is
done, cancelling the Base44 account will break every image on the site.**

One command, run locally:

```bash
npm i -D sharp          # optional but recommended — shrinks files ~10x
npm run localise-images
```

It downloads all 12 images, optimises them, writes them to `public/images/`,
and rewrites every reference in the source. Then:

```bash
npm run verify:all
git add . && git commit -m "Localise images, remove Base44 dependency" && git push
```

Check the live site looks right. **Then the Base44 account can be cancelled.**

`sharp` is optional — without it, images download unchanged and the script says
so. If `npm i -D sharp` fails on Windows (it is a native module), just skip it;
these are only 12 files.

To preview without changing anything: `npm run localise-images -- --dry`

If it reports any failed downloads, or warns about dynamically built URLs, do
not cancel Base44 until those are resolved.
