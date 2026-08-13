# Art Future Club

A global community platform for artists, galleries, collectors and curators — with city chapters in Hong Kong, London, New York, Los Angeles, Bangkok, Milano, Toronto and Zurich.

React 18 · Vite 6 · Tailwind · React Router 6 · Deployed on Netlify

---

## Status: Phase 1 complete — preview build

This build has been **fully decoupled from Base44**. The platform SDK, its Vite plugin, and all platform bootstrap code are gone. In their place is a provider-based data layer with a demo backend, so the site runs standalone and can be deployed and reviewed today.

**What works right now:** every page, all navigation, search and filtering, artist and gallery profiles, the editorial reader, the three maps, the forum, messaging, likes/follows/comments, image upload previews, and sign-in.

**What is deliberately stubbed until Phase 2:** data does not persist to a server (it lives in the browser), Google sign-in, and Stripe checkout.

---

## Quick start

```bash
npm install
npm run dev          # http://localhost:5173
```

No environment variables needed. The demo provider is bundled.

### Signing in to the preview

Any email address and any password of 6+ characters will sign you in.

| To see | Sign in as |
|---|---|
| A normal member | `anything@example.com` |
| **Admin** (Admin Dashboard, editorial publishing controls) | any address starting with `admin`, e.g. `admin@artfutureclub.com` |

Demo data resets if you clear browser storage.

---

## Scripts

| Command | What it does |
|---|---|
| `npm run dev` | Dev server with hot reload |
| `npm run build` | Production build to `dist/` |
| `npm run preview` | Serve the production build locally |
| `npm run lint` | ESLint |
| `npm run verify` | Demo-provider contract tests (34 checks) |
| `npm run verify:backend` | Backend auto-selection tests (7 checks) |
| `npm run verify:supabase` | Supabase provider query + contract tests (38 checks) |
| `npm run localise-images` | Downloads remote images locally, rewrites all references |
| `npm run verify:render` | Mounts all 46 route states in a headless DOM and fails on any React error |
| `npm run verify:all` | All of the above, then a production build |

Run `npm run verify:all` before every push. It catches broken data contracts and render errors that a build alone will not.

---

## Deploying to Netlify

1. Push this repo to GitHub.
2. In Netlify: **Add new site → Import an existing project → GitHub**, pick the repo.
3. Netlify reads `netlify.toml`, so the settings are already correct:
   - Build command: `npm run build`
   - Publish directory: `dist`
   - Node version: 20
4. Deploy.

`public/_redirects` provides the SPA fallback. Without it, refreshing a deep link like `/editorial/julie-chan-painting-the-city` would 404.

No environment variables are required for this phase.

---

## Architecture — the important part

Everything talks to the backend through **one file**: `src/api/base44Client.js`. It is a thin facade that re-exports whichever provider is active.

```
src/api/
  base44Client.js         ← the single switch. Change one import to swap backends.
  providers/
    mock.js               ← demo backend (current)
    supabase.js           ← production backend (Phase 2)
  seed/
    index.js              ← demo content, shaped to match the real schema
```

The backend is chosen **automatically** from the environment:

| `.env` | Backend used |
|---|---|
| `VITE_SUPABASE_URL` + `VITE_SUPABASE_ANON_KEY` set | Supabase (real data) |
| neither set | demo data |
| `VITE_USE_MOCK=true` | demo data, even with credentials |

Nothing is ever commented in or out. A fresh clone with no credentials gets a
working demo; your machine and Netlify get the real database.

That is why the migration is cheap: 35 pages, 35 custom components and 50 UI primitives are all backend-agnostic and were not modified.

### The provider contract

Any provider must honour these, because components depend on them:

- `list` / `filter` resolve to a **bare array**, not `{ data }`
- `create` resolves to the **created row including its generated `id`**
- `get` **rejects** when the row is missing (`ArticleReader` relies on this to fall through from id-lookup to slug-lookup)
- Rows carry `id`, `created_date`, `updated_date`
- `UploadFile` resolves to `{ file_url }`

`npm run verify` asserts all of this.

### Query surface

Deliberately small — this is the whole language the app uses:

```js
Entity.list(sort, limit)
Entity.filter(where, sort, limit)   // equality, plus { $in: [...] }
Entity.get(id)
Entity.create(obj)
Entity.update(id, obj)
Entity.delete(id)
```

Sort strings: `created_date`, `-created_date`, `-updated_date`, `start_date`.

---

## Roadmap

| Phase | Scope | Status |
|---|---|---|
| **1** | Decouple from Base44, provider layer, demo data, Netlify deploy | ✅ Done |
| **2** | Supabase: schema, auth, **Row Level Security**, `supabase.js` provider | ✅ Built — see `docs/PHASE-2-SUPABASE.md` to activate |
| **3** | Localise site images (`npm run localise-images`) — cuts the Base44 dependency | ✅ Tooling ready |
| **4** | Stripe checkout + webhook — Edge Functions written, need deploying | |
| **5** | Real data migration, user re-invite, go live | |
| **6** *(optional)* | SSR for search + social previews | |

### Phase 2 — ready to activate

Everything is written and tested. Follow `docs/PHASE-2-SUPABASE.md`:

```
supabase/migrations/
  001_schema.sql      18 tables, indexes, triggers
  002_rls.sql         Row Level Security policies
  003_rls_tests.sql   38 adversarial security tests — RUN THIS
  004_storage.sql     uploads bucket + policies
supabase/functions/
  geocodeAddress/     address -> coordinates
  createCheckout/     Stripe Checkout session
  stripeWebhook/      grants paid features (service role only)
```

Activating is one line in `src/api/base44Client.js`. No page or component
changes.

**Step 4 of the guide is not optional.** `003_rls_tests.sql` runs 38 attacks
against your own database and must print `ALL RLS TESTS PASSED`. The browser
holds the anon key — it is public by design, and these policies are the only
thing standing between a visitor and every private message in the database.

### Older notes

- `docs/schema-reference/entities/` holds the original entity definitions as JSON Schema. These are the source of truth for the Postgres DDL.
- **Name the timestamp columns `created_date` and `updated_date`**, not `created_at`/`updated_at`. Unidiomatic, but it means zero changes across the component tree.
- `docs/schema-reference/functions/` holds the three original Deno edge functions (`createCheckout`, `stripeWebhook`, `geocodeAddress`). They are already Deno, so they port to Supabase Edge Functions nearly verbatim.
- **Row Level Security is not optional.** The browser holds the anon key. Without policies, anyone can read every private `Message` and `Inquiry`, and grant themselves `is_premium`. Budget real time for it.
- `Subscription`, `ArtistProfile.is_premium` and `ArtistProfile.is_featured` must be **service-role writable only** — they are what the Stripe webhook grants.

---

## Project structure

```
public/            static assets, _redirects, manifest, favicon
scripts/           verification harnesses
src/
  api/             data layer (see Architecture)
  components/      35 app components + ui/ (50 shadcn primitives)
  hooks/           SEO meta injection, responsive helpers
  lib/             auth context, chapter content, utils
  pages/           35 route pages
  index.css        design tokens (HSL custom properties) + fonts
docs/
  BACKUP-RESTORE.md    backup setup + restore procedure
  PHASE-2-SUPABASE.md  Supabase activation guide
  schema-reference/  entity + function definitions carried over for Phase 2
netlify.toml       build + redirect + cache headers
```

## Design system

Tokens live as CSS custom properties in `src/index.css` and are mapped into Tailwind in `tailwind.config.js`. Dark canvas, cyan primary, magenta accent, pale-yellow highlight.

Fonts: Fraunces (display), Inter (body), JetBrains Mono (the `font-mono-caps` label style).

## Known placeholders

- `public/favicon.png` is a generated placeholder in the brand palette — replace with the real logo mark.
- `public/robots.txt` has a `REPLACE-WITH-YOUR-DOMAIN` sitemap line.
- The preview banner (`src/components/DemoBanner.jsx`) renders only while the mock provider is active and disappears automatically in Phase 2.

---

## Automated backups

`.github/workflows/database-backup.yml` runs a nightly `pg_dump`, verifies the
dump contains the tables that matter, and keeps 30 days of history as GitHub
artifacts. Free, and it closes the biggest gap in the Supabase free tier.

Setup is one repository secret (`SUPABASE_DB_URL`) — instructions are in the
comments at the top of that file. The dump and restore have both been tested
end to end.

Do this before real member data exists, not after.

---

## Dependency security notes

`npm install` reports 2 moderate advisories, both in `react-router-dom`. This is
a considered decision, not an oversight.

**Why we are not upgrading:**

| Advisory | Applies to this app? |
|---|---|
| Open redirect via backslash in `<Link>` / `useNavigate` | **No.** `src/lib/authReturnTo.js` already rejects any resolved path containing a backslash or a `//` prefix — the exact attack this describes. |
| Arbitrary constructor injection in `deserializeErrors()` during **SSR hydration** | **No.** This app is client-rendered only. There is no SSR path. |

No patched 6.x release exists — the fix lands in 7.17.1+. Upgrading to v7 was
tested and **makes things worse**: it trades these 2 moderate advisories for 2
*high* ones (RSC-mode CSRF), which are equally inapplicable since we do not use
RSC mode either.

Six genuinely unused packages were removed instead, which eliminated the
`quill` XSS advisory at the root rather than suppressing it: `react-quill`,
`@hello-pangea/dnd`, `canvas-confetti`, `@stripe/react-stripe-js`,
`@stripe/stripe-js`, `three`.

**Do not run `npm audit fix --force`.** It will downgrade or major-bump the
router and break routing. Re-evaluate when React Router ships a patched 6.x, or
when the app moves to SSR (Phase 6), at which point the second advisory becomes
genuinely relevant and the upgrade should be done deliberately with the
`verify:render` harness as the safety net.
