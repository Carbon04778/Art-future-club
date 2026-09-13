# SEO

How search visibility works on this site, what was wrong, and what to do when
you add something new.

Live site: **https://www.artfutureclub.com** — note the `www`. The apex
(`artfutureclub.com`) answers `308` and redirects to it, so `www` is the address
every canonical url, `og:url` and sitemap entry must use. If that ever changes in
the Vercel domain settings, change `SITE_URL` in `src/lib/seo.js` to match, and
set `VITE_SITE_URL` for anything else.

---

## 1. Readable urls

Before: `/artists/d9ab6f21-5cc1-4d93-8c3a-9a3365bb8e10`
Now: `/artists/naishi-jogani`

Every public page except editorial was addressed by a UUID. A UUID cannot be
read aloud, remembered, or recognised in a list of search results, and search
engines are explicit that urls should use descriptive words rather than generated
ids. Editorial already did this correctly; migration **019** brings artists,
galleries, venues and events into line.

**Nothing breaks.** Around 322 UUID urls may already be shared or indexed. Each
page resolves by slug first, falls back to the id, and then rewrites the address
bar to the clean url so search engines settle on one address.

| Piece | Where |
| --- | --- |
| Slug column, backfill, uniqueness, triggers | `supabase/migrations/019_slugs.sql` |
| `slugify`, `pathId`, `artistPath`, `spacePath`, `eventPath`, `findBySlugOrId` | `src/lib/slugs.js` |
| Demo-mode equivalent of the triggers | `src/api/providers/mock.js` |

Three things the real data needed, all handled:

- One event is titled entirely in Chinese and slugifies to nothing. Those fall
  back to the id rather than producing an empty url.
- Two events share a title. Duplicates get a numeric suffix (`-2`).
- Fifteen event titles exceeded 70 characters and are truncated on a word-safe
  boundary.

### Renaming does not change a slug — on purpose

The trigger fires on an update of `display_name`, but at that moment the row
still carries its old slug, so the trigger re-slugifies that and returns. A url
that silently changed because someone fixed a typo would break every existing
link and every search result. To deliberately re-issue a slug, set it to `''` or
`NULL` and save; the trigger then regenerates it from the name.

### Adding a page type

If you add a new public detail route:

1. Add a slug column and trigger for its table, following 019.
2. Add a path helper to `src/lib/slugs.js`.
3. Resolve the route param with `findBySlugOrId` and redirect with
   `shouldRedirectToSlug`.
4. Add the table to `api/sitemap.js` and `api/prerender.js`.

---

## 2. Meta tags

`src/lib/seo.js` is the single implementation. `applySeo()` sets the title,
description, canonical, Open Graph, Twitter card, geo tags and JSON-LD, and
returns the function that undoes them — so tags never leak from one page to the
next, and leaving a page restores the site-wide defaults instead of blanking
them.

| Page | Hook | Structured data |
| --- | --- | --- |
| Artist | `useArtistSeo` | `Person` + `VisualArtwork` per portfolio piece |
| Gallery / venue | `useGallerySeoMeta` | `Gallery` / `Museum` / `Organization` / `Restaurant` / `EventVenue` |
| Event | `useEventSeo` | `Event` |
| Article | `useSeoMeta` | `Article` |
| Whole site | `index.html` | `Organization` + `WebSite` |

Every page also emits a `BreadcrumbList`, so a result reads
`artfutureclub.com › Artists › Naishi Jogani` rather than a bare url.

### What was wrong

- **Artist and event pages had no meta tags at all.** Shared anywhere, they
  appeared as "Art Future Club — Global Artist Community" with no image. All
  twenty artists and 160 events looked identical in search results.
- **`og:image` was a root-relative path.** Facebook, LinkedIn, X, Slack, WhatsApp
  and iMessage all require an absolute url and silently show nothing for a
  relative one, so no link to this site has ever had a preview image. Everything
  goes through `absoluteUrl()` now.
- **No page set a canonical url.** The same profile is reachable by slug and by
  id, and a gallery on both `/gallery/:id` and `/venues/:id` — four addresses for
  one page, with the ranking split between them.
- **Held profiles could be indexed.** A profile awaiting review is visible only
  to its owner and an admin, so it now carries `noindex, follow`.

Canonical urls are built from the record, never from `window.location` — the
redirect from an old UUID url is asynchronous, so reading the address bar would
sometimes declare the UUID form canonical, which is the exact duplicate this is
meant to collapse.

### Column lists

Several list queries are trimmed to named columns for speed. **A projection that
omits `slug` silently produces UUID links**, because the path helper falls back
to the id. Any query whose rows become a link must ask for `slug`; `verify:seo`
checks the ones that exist today.

---

## 3. Crawling

### robots.txt

Previously pointed at `https://REPLACE-WITH-YOUR-DOMAIN/sitemap.xml` — a
placeholder that was never filled in, so no crawler ever found a sitemap. It now
names the real sitemap, disallows the member-only areas, and names the AI
crawlers explicitly (GPTBot, ClaudeBot, PerplexityBot, OAI-SearchBot, Applebot
and the rest). They are covered by `User-agent: *` anyway, but several read only
the block naming them.

### sitemap.xml

Generated live from the database by `api/sitemap.js`, routed by `vercel.json`,
and cached at the edge for six hours — there are 443 urls and they change
constantly, so a file written at build time would be stale immediately.

Only public rows are listed. A held profile would otherwise advertise a page that
returns "not available", which is how a site earns a crawl-error report. Note
that rows predating migration 017 have a `NULL` status: PostgREST treats `NULL`
as not-equal-to-anything, so the filter covers it explicitly or every
grandfathered profile drops out.

Before: a request for `/sitemap.xml` hit the SPA catch-all and returned the HTML
shell with a `200 OK` — to a crawler, a broken sitemap rather than an absent one.

### Prerendering

`api/prerender.js`. This is a client-rendered React app: the HTML a request
receives is an empty `<div id="root">` and a script tag. Googlebot renders
JavaScript eventually. Almost nothing else does:

- GPTBot, ClaudeBot, PerplexityBot and the other AI crawlers do not execute
  JavaScript at all.
- Facebook, LinkedIn, X, Slack, WhatsApp and iMessage read only the raw HTML when
  building a link preview.

So for a crawler, `vercel.json` rewrites the five detail routes to a function
that fetches the record server-side and returns the shell with the real title,
description, canonical, Open Graph tags, JSON-LD and a readable block of body
text already in it.

**It degrades safely.** The response is the real `index.html` shell with the
app's own script tag intact, so a browser landing there still boots the full
React app. If the user-agent matching is ever too broad, a human gets a working
site rather than a dead static page. On any failure the untouched shell is
served, which is exactly the behaviour before the file existed.

The user-agent pattern spells each generic token as a character class
(`[Bb][Oo][Tt]`) rather than relying on a case-insensitive flag, because Vercel
compiles that value as a plain JavaScript regex with no flags — `(?i)` would
silently match nothing. `verify:seo` compiles the live pattern and asserts that
thirteen real crawler user-agents match and six real browser user-agents do not.

The prerenderer deliberately mirrors the client hooks. A crawler and a browser
must be shown the same thing, or the page is cloaking.

---

## 4. Tests

```
npm run verify:seo           # helpers, tags, robots, sitemap, ua pattern (159 checks)
npm run verify:slug-routes   # the real pages on both url forms (46 checks)
npm run verify:all           # everything
```

`verify:slug-routes` mounts the actual pages and checks that a readable url opens
the right record, an old UUID url opens it and redirects, arriving on the slug
does **not** redirect, a missing record says so rather than spinning, and tags do
not accumulate across navigations.

---

## 5. Still worth doing

- **A 1200×630 share image.** `public/images/AdobeStock_528827486.jpg` is
  1024×674. It still renders as a large card, but every platform recommends
  1200×630. Replace the file and update the two `og:image:width/height` values in
  `index.html` together.
- **Submit the sitemap** in Google Search Console and Bing Webmaster Tools. A
  sitemap that exists is not the same as one that has been submitted.
