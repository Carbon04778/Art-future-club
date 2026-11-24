# Client requests

Julie's change requests, kept word for word so nothing is lost or reworded.
Worked through **one at a time**: each gets a check of what it touches, a plan,
frontend + backend tests, TEST first, then live with the owner's approval.

Status: **open** · **on hold** (waiting on an answer) · **in progress** · **done**

## Reminders for the owner

- **Payments are PAUSED** (owner, 2026-11-23: "remove every places that ask
  for payemnt for now save all in files till futher notice"). Hidden by one
  switch, `PAYMENTS_ENABLED` in `src/lib/featureLimits.js`; everything hidden
  and how to bring it back is in `docs/PAYMENTS-PAUSED.md`.
- **Open Calls is FREE to view for now** (owner, 2026-11-22: "open that to
  free now", remind later). Made premium-only again by running
  `supabase/migrations/031_open_calls_free.revert.sql` (TEST, then LIVE) —
  no website change needed. Who counts as premium then: admins, active
  subscriptions (20 on 2026-11-22, all set by hand — payments not switched
  on), and Paid Member / Partner galleries/venues (2). Posting stayed
  restricted the whole time. 031 run by the owner on TEST and LIVE
  2026-11-22; live check 12/12 (reports/B9-open-calls-free-live.html):
  logged out sees all 4 open calls on phone and desktop, no Post button;
  admin still sees and can post.

---

## Batch A — received 2026-10-17

### A1. Collector can switch to artist — **done, live 2026-10-29** (v12 2838489 · v11/GitHub dad2849; migration 027 on TEST and LIVE)

> If people sign up as a collector by mistake can we allow them to change their
> profile to be an artist instead. Its happened already a couple times with
> people i asked to test.

### A2. Add chapters from the admin page — **left out for now** (owner, 2026-10-27: to be done and billed separately; Julie's text saved below)

> If I want to add a new chapter how do I do this? Is this something we can add
> to the admin page? I know you mentioned i have to ask you but this seems
> complicated and costly as well. I need to add 3 Chapters now, one is for
> Seattle, one for Cairnes and one for Taiwan. Im concerned every time i have
> to ask

Open: spelling "Cairns"? "Taiwan" or a city (Taipei)? Photo, tagline, about
text and credit for each.

### A3. Multiple disciplines for artists — **done, live 2026-10-27** (v12 4c92dbf · v11/GitHub 9cbbda6; migration 025 on TEST and LIVE)

> When creating a new artist account Under "discipline" can we add multiple
> options here? Similar to how you add what opportunities they are looking for

### A4. Newest article larger on the Editorial page — **done, live 2026-10-27** (v12 532ab9f · v11/GitHub a6c326a; live browser check 13/13)

> On the editorial page, can we show the most recent article preview larger
> than other articles? So full length across an maybe first paragraph then
> (continue reading button)

Questions sent for A1, A3, A4 on 2026-10-17 (featured vs newest, filters,
subtitle vs first paragraph; who can switch, approval, gallery/venue too;
max disciplines, main discipline, same list).

---

## Batch B — received 2026-10-18

### B1. One map with a filter — **done, live 2026-10-19** (v12 b6ea4fd · v11/GitHub 2db58ec)

Built 2026-10-18: one map, filters All / Artists / Galleries / Venues; artists
as one pin per chapter city (every published artist, paged — no 200 cap);
`/gallery-map` redirects to `/map?show=galleries`. Tested in real Chrome on
live data (read-only) 20/20; verify:map 34/34; verify:all passes. After deploy,
checked on the live site with the Google map: counts match the database,
Hong Kong lists 55 artists, and picking a pin then changing filter recovers
(Galleries 479, Venues 19, All 501).

Found while testing, not caused by B1 and not fixed here: on the **Leaflet
fallback** map (used only when Google is unavailable), after picking a pin
the map stays zoomed on it when the filter changes, so the list can read
"0 in view". The old code does exactly the same; the Google map (normal
case) recovers. Worth a separate small fix.

> Can we make the map one map and filter by artist gallery venue or all?

Today (2026-10-18): `/map` stacks two maps — a Google map of galleries and
venues (`SpacesMap`, already filters All / Galleries / Venues) above an older
Leaflet map of artists with one dot per chapter city (`ArtistMap.jsx`).
`/gallery-map` is a third page showing the same gallery/venue map alone.
Artists have no address or coordinates — only a chapter (city) — so they can
only be placed at their city unless they are given a location.

### B2. Sold works stay on the artist page — **done, live 2026-10-19** (v12 b56b3b6 · v11/GitHub 1f13cd7)

> Allow pieces that are bought remain on the artist page saying "purchsed" so
> another button under "available for sale" that says sold….

Built 2026-10-19: a "Sold" tick box under "Available for sale" in the artist
editor, Admin Add Listing and Admin Edit Listings. A sold work stays on the
artist page labelled SOLD, with no price and no Enquire; the lightbox and PDF
say Sold; the directory's "for sale" filter skips it. No database change
(works are JSON). Also fixed: Admin Edit Listings rebuilt each work from a
fixed list and dropped every other field (added_date, now sold) — it now keeps
them. Gallery artworks unchanged (not asked for). Tested: verify:sold 29/29,
real browser on TEST 27/27 (report: reports/B2-sold-works.html), verify:all
passes. Live after deploy (read-only): 13/13 — for-sale works on four real
artists still show price + Enquire, nothing mislabelled, main pages clean.

### B3. Link articles to the writer — **done, live 2026-10-19** (v12 f4e24c8 · v11/GitHub bb49249)

> Hot link connecting written articles to editor + artist page of the writer

Found 2026-10-19: `author_id` is the account that POSTED an article (one admin
account posted 95 for eight writers), so the writer is the typed
`author_name` — typed inconsistently ("Benedetta Barzaghi", "…Barzaghi ",
"Barzaghi Benedetta"). Writers are matched by a name key (case, spaces,
apostrophes and word order ignored); no data changed.

Built: the article byline links to the writer's artist page if they have one
(+ "All articles"), otherwise to a new writer page /editorial/writer/<name>
listing everything they wrote; artist pages get a "Writing" section (none for
non-writers). Tested: verify:writers 29/29; real browser on the real articles
22/22 — every writer's count matches the database (Benedetta 44 across all
spellings, Rachel 36, Pranavi 12, Saskia 11, Julie 10, Nicola 1, Erynne 1);
verify:all passes. Report: reports/B3-writer-links.html. Live after deploy:
the same browser test 22/22.

Follow-up (not a fault): link previews and search engines see writer pages
with the general site title, because the bot pre-render (vercel.json
`/:section/:segment`) only covers one-level addresses. Articles are
unaffected. Writers with no artist page have no photo or bio to show.

### B4. Headings inside article text — **done, live 2026-10-19** (v12 18fbd04 · v11/GitHub ffe0a51)

> When uploading the editorials, i would like to be able to add headers in the
> text so slightly larger and bold text to distinguish from the main body.

Built 2026-10-19: a paragraph starting with "## " is a heading (larger, bold);
an "+ Add heading" button in the editor starts one at the cursor, with a hint
under the text box. Only that explicit marker counts — 144 short lines
(addresses, dates, credits) must never be guessed into headings. Images are
never placed between a heading and its paragraph; reading time and the
crawler copy ignore the marker; a bare "##" left empty is dropped. Tested:
verify:headings 26/26; all 115 live articles render byte-for-byte as before
(old vs new component); real browser on TEST 17/17 (wrote and published an
article through the editor); verify:all passes. Report:
reports/B4-article-headings.html. Live after deploy 13/13: eight recent
articles unchanged (paragraph counts match the database, no headings, no
"##"); a REAL sign-in through the live login page, the editor opened, Add
heading worked, then Cancel — 118 articles before and after, nothing saved.

Follow-up seen while testing (pre-existing, not B4): on an article with no
cover image the category tag sits on the "Back to Editorial" line.

### B5. Article gallery as a one-at-a-time slider — **done, live 2026-10-20** (v12 3cbe32e · v11/GitHub e3694cd)

> The Gallery in the middle of the editorials, can this be a single image that
> you scroll through to the next image because right now it looks very
> unprofessional the way its set up.

Built 2026-10-20: a gallery of 2+ images is a slider — one image at a time,
shown whole, arrows on the image, swipe, keyboard ← → (the gallery takes
focus), caption + "2 / 6" + dots. A single gallery image is unchanged. On the
existing Embla carousel. 73 of 115 live articles get a slider.

Also fixed (pre-existing): the editor's "full width" tick was ignored —
ArticleBody dropped `full` when reading images. 4 articles had 7 images
ticked; they now show full width as intended.

Tested: verify:gallery 18/18; all 115 live articles keep every word and
every image (73 slider, 4 full-width fixed, 38 byte-for-byte unchanged);
real browser on real articles 18/18 incl. arrows, wrap-round, keyboard,
dots, swipe, phone, full width, single image; before/after screenshots;
verify:all passes (30 scripts). Report: reports/B5-article-gallery.html.
Live after deploy: the same browser checks 17/17.

### B6. Save editorials as drafts — **done, live 2026-10-31** (v12 3899019 · v11/GitHub 4156533)

> We need a save function in Editorials so we can go back to them and complete
> later

### B7. Map counts wrong, and events missing from the map — **events on the map: done, live 2026-10-30** (v12 d553eb6 · v11/GitHub ef210cc; migration 030 on TEST and LIVE). Counts: Julie checking

> The map function still seems to have some issues and one thing still
> missing. It says only 56 artists in hong kong for example however there is
> more than that, similar with the galleries and venues. For the missing part,
> we had asked that events also be added to the "map" search.

Note: see "Row caps that still truncate silently" in OUTSTANDING.md — a likely
cause of the low counts. Closely tied to B1; plan them together.

Checked live 2026-10-18 (read-only):
- Artists: 77 rows in total — 65 approved (public), 12 drafts. Hong Kong: 58 by
  chapter (55 approved + 3 drafts), 59 counting `based_in`. The map shows 55,
  which is every *published* HK artist. So the map is right about what is
  published; the gap is drafts awaiting approval and artists not yet on the
  site. Confirm with Julie which artists she expected to see.
- The artist map loads only the newest 200 artists (`ArtistMap.jsx:32`). Not
  biting yet (77 rows) but will once the site passes 200 — fix with B1.
- Galleries + venues: 500 approved, 498 have coordinates and appear; 2 do not.
- Events: 163, with `venue`/`address` text but no coordinates — they would need
  geocoding to go on the map.

Planned 2026-10-20, then skipped: add geo_lat/geo_lng to event (additive,
TEST first); fill them from the matching gallery listing's pin where the venue
is already on the site, else the existing geocodeAddress lookup; geocode on
save in both event forms; an "Events" map filter, upcoming events only.
Counts: nothing to build — tell Julie the map shows every published HK artist
(55); 3 more are drafts; ask which others she expected.

### B8. Create galleries and venues from a CSV file — **answered 2026-10-27; needs her CSV export**

> Is it possible to create the galleries & Venues using a CSV file and
> populating (no image just the field text data) this would save us so much
> time for the other chapters. We have fully focused on hong kong and it takes
> a long time to do one by one. You now helped me with the list i sent however
> I still have to finish NY & Londo and this is a lot, doing one by one seems
> like it is not necessary when we have tools like CSV files.

Planned 2026-10-20, then skipped: Admin → "Import CSV" — template download,
upload with a row-by-row preview (ready / already on site / problem), create
live unclaimed listings with map pins looked up and links cleaned, "Undo this
import". No database change. Open questions: Julie's real column headings;
leave claim_email out (a wrong one hands a listing to the wrong person);
Julie runs it herself from the admin panel.

### B9. Open Calls for premium members only — **done, live 2026-10-28** (v12 901bae6 · v11/GitHub d7a0a86; migration 026 on TEST and LIVE; live check 5/5)

> Open Calls is only open to view by premium users- artists and collectors can
> view and respond if premium and Galleries can list or add to this section)

### B10. A Collectors page — **done, live 2026-10-30** (v12 a1234ad · v11/GitHub 852d77a; migration 029 on TEST and LIVE)

> Need a "collectors" page, this is the collectors profile, on here they can
> write a bio and they have a section where the can "collect" ther favorite
> work. Only collectors can see other collectors as well as premium users

### B11. A "Directory" (was "Yellow Pages") — **done, live 2026-10-29** (v12 d560e3a · v11/GitHub 2e0a399; migration 028 on TEST and LIVE)

> Need to add the "Yellow Pages" page, Similar to venus this is where we can
> list places of interest like art stores, framers, printers etc. They only
> need a profile image and a bio (along with social media website address etc
> basic info) no need to upload photos at this point.

### B12. Admin counts for galleries, venues, collectors — **done, live**

> In the admin panel where it says how many artists, can we also add how many
> Galleries, Venues, Collectors so we have that data easily accessible?

Built 2026-10-20: Galleries, Venues and Collectors cards beside Artists, each
an exact database count with "N not published" when there are drafts (drafts
members have not submitted — so Approvals can still be empty). Artists now
counts exactly too (it read a list capped at 200). Tested with a real sign-in
on live data (read-only): every card equals the database (77 / 483 / 19 / 3);
verify:all passes. Report: reports/B12-admin-counts.html.

Follow-up (pre-existing): on a phone the admin page scrolls 877px sideways —
the row of 12 tabs does not wrap. Same before and after B12.

### B13. Clean up Instagram and website links — **done, live**

> When entering instagram links if people add @ or www. It cannot be accepted.
> Lots of links do not work now because they were entered incorrectly. I had to
> go back and edit every artist because of this issue. I am hoping the galleries
> do not have the same problem however I believe they do as they were all
> uploaded as links

Built 2026-10-20/21. Julie was right about galleries. Seen on the live site:
- every gallery page linked Instagram as
  `instagram.com/https://www.instagram.com/…` (452 of 460 are saved as full
  URLs; the page glued instagram.com/ in front again);
- a website saved as `www.evaku.hk` linked back into our own site;
- artist TikTok links lacked the `@` TikTok needs;
- the website boxes were strict "URL" fields, so the browser refused `www.`.

Fix: every page reads links through one set of rules (`src/lib/links.js`):
handle, `@handle`, full URL, `www.` and bare `anna.com` all work. This repairs
every saved link at once **without rewriting anyone's data**. 1,229 of the
1,241 saved values now link correctly. Forms accept `www.` and tidy only what
is wrong on save (`@` dropped, `https://` added); a value already right is kept
byte-for-byte. Google's copy (`api/prerender.js`, SEO tags) uses the same rules.

Needs a person (12 values that are not links, shown as no link rather than a
broken one): Tonnae instagram "tonnaeart @tonnaekwong"; amisifrncn instagram
"Infinity créative. 1", twitter "Jay-Z lokonga", tiktok "Infinity créative ∆",
linkedin "https://www linkea .tech"; Elysee ipenda instagram "Elysee ipenda";
Pranavi Halai twitter/tiktok "n/a"; Shanti Satyan tiktok "none"; waiszecb
linkedin with spaces; galleries "AF Projects/Louise Alexander Gallery" and
"induction gallery" (gallery name in the website box); Hauser & Wirth Zürich
(an email in the Instagram box).

Not changed (outside B13): event, open-call and exhibition "external link"
boxes are still strict URL fields.

Tests: verify:links (926 checks, in verify:all), and a real-Chrome run over
every published artist with a link plus galleries (live data, read-only) and
real saves through the forms on TEST, put back afterwards. Report:
reports/B13-links.html.

### B14. Profile photo can't be adjusted — **done, live**

> People are having difficulty uploading their profile images. They are not
> able to adjust the view still. You were going to add parameters before but
> also allow for adjusting but they said they still cannot adjust.

Built 2026-10-21. Cause: the artist's own form and the gallery owner's form
had a bare file picker — no adjusting at all. Only the collector and admin
forms could crop.

Fix: one picker (`src/components/ProfilePhotoPicker.jsx`) on the artist,
gallery and collector forms: choose a photo, drag it into place and zoom, with
the circle the profile shows drawn over it; the round preview shows the result;
"Adjust current photo" re-opens a photo already uploaded (no need to find the
file again); Cancel keeps the old one. Uploading on save is unchanged (WebP).
Admin forms already had the cropper and are unchanged.

Tests: verify:photo (30 checks, in verify:all), and real Chrome with a real
sign-in (TEST, nothing saved): dragging provably moves the crop, zoom works,
phone fits, Cancel works, re-adjusting an uploaded photo works, a photo that
can't be fetched says so. 22/22. Report: reports/B14-profile-photo.html.

---

## Also open from earlier

- Draft article slug `osaze/akil/stigler`: fix is live in code (0ce6b0b);
  the one-row data repair has not been run in live yet. Its SQL file was in
  `.tmp/` and was deleted on 2026-10-18 (see below) — needs writing again.
- 2026-10-18: a `verify:all` run deleted `.tmp/` (two test scripts removed
  the whole folder; fixed in 053c449). Lost: the WebP migration manifest, all
  batch apply/undo SQL, and the only local backup of the **284 originals that
  were converted in place** (fake `.webp` files). The site is unaffected and
  shows WebP versions of those images. The other 687 originals are still in
  Supabase storage, so undo for those can be rebuilt from storage if needed.
- 9 empty (zero-byte) image files need re-uploading by an editor: Lily
  Stockman article ×7, "Heart to Hart", Richard Crosbie closing image.

## B12–B14 live — 2026-10-21

Pushed as 5d7d2b9 (v11; lint, verify:links 926, verify:photo 30,
verify:adminpanel 127 and verify:all passed there first). Real Chrome on the
live site after the deploy: B12 admin counts 18/18 (real sign-in, read-only);
B13 links 11/11 — 163 profile pages, all 356 links as expected, none broken;
B14 photo adjusting 14/14 (real sign-in; chosen, dragged, zoomed, cancelled —
nothing saved, confirmed no profile created). Google's copy checked as
Googlebot: Eva Ku now gives https://www.evaku.hk/, Loyal its website.

## Julie's answers — received 2026-10-27 (her words)

**A1. Switching profile type**
- Who: "This should be for anyone who signed up to an account by mistake I think."
- Approval: "It should be sent to the approval que"
- Who switches: "They should be able to do it from their profile"
- Other way round (artist → collector): "Yes"

**A3. Disciplines**
- Maximum: "unlimited"
- Main discipline: "Sure that works"
- List: "This listing is ok for now, no one has requested anything different"

**A4. Newest article larger**
- Order: "The newest article should always be first then featured can follow."
- Filters/search: "Only on the main page"
- Preview text: "Subtitle is probably enough."

**B7. Map counts**
- "OK Let me double check maybe its because I am seeing all even if not published?"

**B8. CSV import**
- Columns: "Yes, its the same i sent you before that you used to create the ones for
  boston maine etc. Its currently a google doc but i can export to a csv. Do you
  still have access?"
  (We have the 363 listings that import produced, in
  supabase/imports/gallery-import-2026-09/manifest.json, but not her original
  sheet or its exact column headings. Ask her for the CSV export.)
- No claim email in bulk imports: "Yes thanks."

**B9. Open Calls premium only**
- Premium: "Anyone in a paid plan or that I have manually marked as a premium
  member since we have not yet activated payments"
- Non-premium sees: "When the click on that page it will just say “Upgrade to
  view” and maybe a prompt button to click on to upgrade."
- Galleries posting: "Galleries need to be paid/partner to post"
- Logged out: "Logged out visitors can see all non premium features right now as
  we want to encourage people to join we main change this in the future."

**B10. Collectors page**
- Collections: "Currently Artists and Galleries can “collect” but I am not sure
  what it looks like from a collectors profile. If they can create different
  collections, that would be ideal. Like in pinterest."
- Which works: "Both as it is a virtual collection"
- Visibility (non-premium artists/galleries can't see collectors): "Yes thats
  correct. We want to keep collectors as private as possible."
- Private profile: "Yes"

**B11. Directory**
- Categories: "art stores, framers and printers would be the start"
- Claiming: "Businesses should be able to claim their account as well this make
  less admin for us in the future"
- Map and cities: "Yes ideally"
- Name: "Directory would be great thank you!"

**A2. Chapters — NOT to build now** (owner 2026-10-27: later, billed
separately). Kept so nothing is lost: "Cairns" confirmed; third chapter is
"Taipei". Taglines and about text as she sent them:
- Cairns: "Tropical North Australia, where reef culture meets creative
  practice." About: "Cairns sits in tropical Far North Queensland, where the
  Great Barrier Reef, rainforest and a layered First Nations heritage shape a
  distinctive regional arts culture. AFC's Cairns chapter convenes artists,
  curators and collectors working at the intersection of ecology, Indigeneity
  and the Asia-Pacific, from gallery spaces in the CBD to studios along the
  Cairns esplanade."
- Seattle: "Pacific Northwest craft, tech culture and independent spirit."
  About: "Seattle's chapter draws on the Pacific Northwest's independent
  gallery culture and its long history of studio craft. From Pioneer Square
  galleries to Georgetown studios and Capitol Hill project spaces, our
  programme connects artists and collectors across a city where
  experimentation and craft traditions sit side by side."
- Taipei: "A vibrant East Asian hub for contemporary art and cultural
  dialogue." About: "Taipei's chapter sits at the heart of one of East Asia's
  most dynamic and self-assured art cities. From the galleries of the Daan and
  Neihu districts to the institutions of Zhongshan, our programme convenes
  artists, collectors and curators engaged in conversation across the island
  and the wider Asia-Pacific region."
- Not yet sent: photos and photo credits.

Not answered: the 12 links to correct by hand, and the 9 empty images to
re-upload (both were requests for her to act, not questions).

## A3 live — 2026-10-27, and a paging bug found (pre-existing)

Live browser check, read-only: 7/8. Live has the disciplines list (78
artists, 0 mismatched); all 65 published artists listed; Mixed Media (14) and
Printmaking (1) filters exact; profile form opens with the picker; phone fits;
no page errors. A4 rechecked on live: 13/13.

The one failure is a bug that was already on the site, not A3:
src/hooks/useProgressiveList.js (unchanged since before v12). Scroll the
Artists page to the bottom, then pick a filter: it shows 18 and says
"18 of 36 — keep scrolling" forever; more never load. A fresh page with the
same filter loads all 36. Cause: when the list shrinks, the "load more"
marker reappears one render after the watcher was set up, so nothing watches
it. Same code on the Galleries and Venues pages. Not fixed yet — owner to
decide.

## Paging bug fixed and live — 2026-10-28

The stuck "18 of 36 — keep scrolling" list (above) is fixed: v12 3e9ab7d ·
v11/GitHub 8cfc0d8. Live browser checks after deploy, read-only: paging 8/8
(65 artists, 481 galleries, 19 venues; filter and search after scrolling to
the end load everything); A3 now 8/8 (was 7/8 only because of this bug); A4
13/13. The same test on the old live code had shown the bug ("Showing 18 of
36"): reports/paging-before-fix.html.

## Editorial: one large card — live 2026-10-28

Reported by the owner: admins saw two large cards, one a draft. Cause: an old
unpublished copy of "The Color of an Imagined World" (slug osaze/akil/stigler)
is marked featured, and featured articles were shown large whatever their
status. Now only live articles are large. v12 356a55a · v11/GitHub 4139f9c.
Live after deploy, real admin sign-in, read-only: 16/16 — one large card, 3
drafts in the grid. The draft row itself is still in the database (removing
it is optional; would be backed up first).

## A1 live — 2026-10-29

TEST, full flow with real sign-ins: 33/33 (every direction, approve, decline,
undo, restore, direct-change trick refused). Live after deploy, read-only:
Approvals tab opens with the new code and no errors; every main page and both
profile editors load; earlier live checks all still pass — Editorial 16/16,
Open Calls 5/5, paging 8/8, disciplines 8/8, admin counts 18/18. A live run
with one temporary hidden member (scripts/ui-test-profile-switch-live.mjs) is
written but was not run: creating an account on live needs the owner's OK.
A1 live run with one temporary hidden member (owner's OK, 2026-10-29): 14/14 —
request sent from the real panel, shown in Approvals, declined with a note,
member saw it, asked again and cancelled; published profiles unchanged (65
artists, 502 spaces); the temporary member deleted (0 left).

## B11 live — 2026-10-29

TEST, real sign-ins: 25/25 (listing, own page without photos, map, not on
Galleries/Venues, claim, Printer sign-up held for approval and approved,
open calls galleries-only, phone). Live after deploy, read-only: 6/6 —
/directory with categories ("coming soon" until listings are added), menu
link, map filter, Galleries and Venues unaffected, no errors. Earlier live
checks all still pass: Editorial 16/16, Open Calls 5/5, paging 8/8,
disciplines 8/8, admin counts 18/18. Live has no Directory listings yet —
the AFC team adds them in Add Listing (types Art Store / Framer / Printer).

## B10 live — 2026-10-30

TEST, pages + database asked as each visitor: 31/31. Live after 029 and the
deploy, read-only: collectors 7/7 (public API returns no collector
profiles; artists' saved works still public; signed out locked with no menu
link; the admin sees the page and link), and every earlier live check still
passes — Directory 6/6, Editorial 16/16, Open Calls 5/5, paging 8/8,
disciplines 8/8, admin counts 18/18. The 23 works saved on live are in
"Unsorted"; galleries (481) unaffected.

## B7 live — 2026-10-30

TEST: 12/12 (Events filter, popup, posting with no end date at a venue's pin
at the right time, phone). Live after 030 and the deploy, read-only: event
map 7/7 (52 of 53 upcoming events placed; the Events filter shows them; a
pin opens its popup; the map no longer scrolls sideways on a phone — it had
scrolled 41px since the B11 Directory button), and every earlier live check
still passes — Collectors 7/7, Directory 6/6, Editorial 16/16, Open Calls
5/5, paging 8/8, disciplines 8/8, admin counts 18/18.
The one unplaced upcoming event, "Jennifer Brou | Somewhere Still", has no
pinned listing for its venue; it is placed from its address the next time it
is saved (Admin → Events → edit → save).

## B6 live — 2026-10-31

TEST, real sign-in: 10/10 (title-only draft saved hidden, second save
updated the same article, found under Drafts, continued, published). Live
after the deploy, read-only: drafts 5/5 — a visitor sees no Drafts list and
the public API returns no drafts; the admin sees all 3 live drafts and
Continue editing opens one (nothing saved). Every earlier live check still
passes: Editorial 16/16, event map 7/7, Collectors 7/7, Directory 6/6, Open
Calls 5/5, paging 8/8, disciplines 8/8, admin counts 18/18.

## Chapters and About Us — received 2026-10-31 (owner adding, with guidance)

The owner adds the chapters himself for now (A2). Images received in chat:
- Taipei: chapter image, credit "Artwork by: Adam Dupuis".
- Seattle: chapter image (collage "Everyone is welcome here"), credit
  Julie: "Seattle credit is erynne Byrd-quigtar" → "Artwork by: Erynne
  Byrd-Quigtar".
- Cairns: on hold — Julie: "Still waiting for Carin's chapter to send an
  image so hold on that one until we have it please".
About Us:
- Add Erynne Byrd-Quigtar, "Editorial Editor — Seattle" (Julie: "her about
  is correct").
- Replace Christie Melville's photo with the new one.
Taglines and about text for Taipei and Seattle: saved above (A2 answers).

## Next round — Julie's references (2026-10-31, not started)

Julie: "For the references let me revert back to that this week ... I just
need to make some notes on what parts I liked". References:
- Galleries view: https://www.artmajeur.com/signaturefineart#presentation
- Artist view: https://www.saatchiart.com/en-gb/art/Painting-Octhopuses/626451/10544327/view
- Featured in: https://www.saatchiart.com/en-gb/moncada
Wait for her notes before planning.

## Seattle, Taipei and About Us — built 2026-10-31 (v12, not yet live)

- Seattle = Ch.09, Taipei = Ch.10 (Julie's order: Seattle, Cairns, Taiwan;
  Cairns will be Ch.11). Images public/images/chapter-seattle.webp and
  chapter-taipei.webp; credits on the home page chapters section.
- No "Local Pulse" line for the new chapters — the older ones are hand
  written ("3 active exhibitions · 16°C clear"); hidden until Julie sends one.
- About Us: Erynne Byrd-Quigtar added (7 people); Christie's photo replaced
  (old one kept in backups/team-photos/).
- Found and fixed while doing this: the "Add Event" form on the Events page
  offered London, Tokyo, Berlin, Seoul, Mexico City — no Hong Kong. It now
  offers the real chapters plus Online and Other. Five pages that typed the
  eight cities by hand (article tags, Community filter, footer, Partnership
  text, event form) now read the one chapter list — Cairns needs one edit.
- Database: the old chapter rule (001) was dropped by 007. Live artist rows
  with an empty chapter prove it for artists; TEST accepted a Taipei event.
- Checks: verify:chapters 153/153 (in verify:all); real Chrome 38/38
  (reports/A2-chapters.html).

## Events page stopped at September — fixed 2026-11-11

Reported by the owner. Cause: the Events page loaded only the 200 OLDEST
events (list("start_date", 200)); live had 291, so everything from late
September on — every current and upcoming event — was missing. Live before
the fix: 200 shown, first heading "September 2026" (reports/events-all-BEFORE-fix.html).
All event lists now load every event a page at a time (src/lib/loadAll.js):
Events page, home chapters section (was 500), chapter pages (500), map (1000),
admin Events tab (newest 500). Also: on phones the page scrolled 2px sideways
because one address ("Tomorrow Maybe") contains pasted links; long addresses
now wrap. Checks: verify:events-all 16/16; real Chrome on live data 13/13.

Found, not changed (owner to decide):
- Times show in the VISITOR's time zone. 187 of 291 events are stored at
  03:00 UTC (11:00 Hong Kong); a New York event on 13 Nov shows as Thu 12 Nov
  21:00 to a New York visitor.
- Event "hlhu": starts 2028-09-22, ends 2026-09-25 — looks like a test entry.
- "Tomorrow Maybe" address contains "[1] (https://www.instagram.com/...)".

Live 2026-11-11 (v11/GitHub 710d256): Events 13/13 on the live site (291
events, opens on November 2026; was 2/13 before). Chapters 38/38, event map
7/7, drafts 4/4, editorial checked again. Drafts test now handles live having
no drafts (it had assumed at least one).

---

## Batch C — received 2026-11-12 (her words)

**Quote sent (owner, 2026-11-12), split into 4 parts, about 1 month in all:**
- Part 1 — $120: outstanding from the past job (new chapters Seattle/Taipei,
  switch profile A1 — both already live) + CSV import (C12 = B8).
  **PAID — owner, 2026-11-16. Building: CSV import.**
- Part 2 — $330: C3–C7 (artwork page, collections, Featured in, Similar).
- Part 3 — $200: C1–C2 (represented artists, follow, news, reviews).
- Part 4 — $300: C8 (AI events), plus about $5–20/month running cost.
  **PAID — owner, 2026-11-23.** AI: Mistral (key works, 12-site trial read-only
  2026-11-23). Weekly report email to Julie added, under the separate email
  automations quote (owner, 2026-11-23; price and payment not recorded).
- Not in the quote: C9 favicon, C10 event date range, C11 exports.

> 1. Gallery Profile Pages
> Reference: https://www.artmajeur.com/signaturefineart#presentation
> This reference is for the layout inside an individual gallery profile, not the main gallery listing page.
> Replace the "Works" section with "Represented Artists."
> Allow galleries to link to the existing Art Future Club profiles of artists they represent.
> Each represented artist should be clickable and link to their profile.
> This feature applies to gallery profiles only.
>
> 2. Follow, News and Reviews
> Add the following features to gallery profiles, venue profiles and individual directory listing pages:
> A Follow/Unfollow button.
> A visible follower count.
> A Reviews section with a visible review count and an option to submit a review.
> A News section where the profile owner can add updates.
> Please confirm how review moderation and publishing permissions will be handled before implementation.
>
> 3. Artwork Detail Page Layout
> References:
> Artist profile: https://www.saatchiart.com/en-gb/moncada
> Artwork detail page: https://www.saatchiart.com/en-gb/art/Painting-Octhopuses/626451/10544327/view
> When a visitor clicks on an artwork, the page should prioritise the selected artwork first, followed by information about the artist.
> Please use this section order:
> Selected artwork and its details — make the artwork image the main visual focus.
> About the Artist — include artist information, a profile link and a Follow button.
> More from [Artist Name] — display other artworks by the same artist.
> Similar Artworks — display related artworks by other artists.
> The current "More from [Artist Name]" section should appear after the artist information, rather than being the next main section beneath the selected artwork.
> Use the Saatchi Art references for the page hierarchy and presentation; we do not need to replicate all their features.
>
> 4. Collect Artworks into Collections
> Add a collection-saving feature similar to Pinterest.
> When a member clicks Collect on an artwork, open a dialog with two options:
> Create a new collection: enter a collection name and save the artwork.
> Add to an existing collection: choose one of their existing collections and save the artwork.
> Members should be able to display their collections on their profiles, including collector, artist and gallery profiles.
>
> 5. Display Collections as Compact Cards
> To keep profiles from becoming overcrowded, display each collection as a card containing:
> The collection name.
> A cover image using the first artwork added to that collection.
> Do not display every saved artwork directly on the profile. Clicking a collection card should open a dedicated collection page showing all the saved artworks, each linked to its artwork detail page.
>
> 6. "Featured in Curated Collections"
> Add a "Featured in Curated Collections" section to artist profiles, using the Saatchi Art artist profile as a reference.
> This section should display collections that include that artist's work, using the same compact format: collection name, cover image and a link to the full collection.
> Keep these two sections distinct:
> Collections: collections created by the profile owner.
> Featured in Curated Collections: collections that include the artist's work.
>
> 7. Similar Artworks
> Add "Similar Artworks" below the "More from [Artist Name]" section on artwork detail pages.
> Include artworks by other artists.
> Link each artwork to its detail page.
> Please propose how related artworks will be selected—for example, by style, subject, medium or colour.
>
> 8. AI Event Automation and Discovery
> Please implement an AI automation that collects new events from gallery and venue websites and prepares them for publication on Art Future Club.
> Weekly Event Collection
> Run the automation weekly to check designated gallery and venue websites for new events.
> Extract available information, including the event title, description, dates, times, location, organiser and booking link.
> Retain the source URL for verification.
> Check for duplicate listings before creating a new event.
> Draft Creation and Approval
> Automatically create a draft event listing from the extracted information.
> Place each draft in an admin approval queue. Events must not be published automatically.
> Keep all extracted information and AI-generated content editable.
> Require admin approval and organiser approval before publishing.
> AI must not invent missing event details. Clearly flag missing or uncertain information for review.
> Event Discovery
> Recommend relevant events based on members' interests, location and the artists, galleries or venues they follow.
> Explore natural-language search, allowing members to search using phrases such as "painting workshops near me this weekend."
> Developer response requested: Please advise on the technical approach, website access restrictions, running costs and how the admin and organiser approval workflow would operate.
>
> 9. Update the Website Favicon
> Please replace the current favicon with the Art Future Club logo so it appears in browser tabs, bookmarks and supported browser shortcuts.
> Use the official logo, ensuring it remains clear and recognisable at small sizes.
> Apply the updated favicon across the entire website.
> Include the appropriate favicon formats and sizes for desktop and mobile browsers
>
> 10. Display the Full Event Date Range
> Page: https://www.artfutureclub.com/events
> Currently, event listings show only the start date. Please display both the start and end dates so visitors can clearly see the full event period and whether an event is still running.
> Show the date range on both event cards and individual event pages — for example, "8–15 December 2026."
> For single-day events, display the date only once.
> Keep multi-day events in the current events listings until their end date has passed, rather than removing them after the start date.
> Clearly label events as Upcoming, Ongoing or Past, based on their start and end dates.
> Ensure the event creation form supports start and end dates, with times and a timezone where applicable.
>
> 11. Export Contacts and Subscription Lists from the Admin Page
> Please add an option in the admin dashboard to download contact and subscription lists for:
> Members
> Collectors
> Galleries
> Venues
> Artists
> Newsletter subscribers
> Allow admins to export each group separately or download a combined list in CSV format or an equivalent spreadsheet-compatible format.
> Where available, include:
> Name or organisation name
> Email address
> Account/profile type
> Subscription status
> Signup date
> Newsletter or marketing consent status
> The purpose is to make it easier to contact these groups and send relevant updates. Please include filters for active subscriptions and marketing consent, remove duplicate email addresses from combined exports, and restrict downloads to authorised admins. Unsubscribed contacts should be clearly identified and excluded from marketing mailing lists.
>
> 12. This is a request from the last 3 edits but not done yet: Bulk Import Gallery and Venue Profiles via CSV
> Please add a CSV import feature in the admin dashboard so we can create multiple gallery and venue profiles at once, rather than entering each one manually.
> We are currently focused on Hong Kong, and bulk importing would significantly reduce the time needed to populate these listings.
> Support imports for both galleries and venues, with a field to identify the listing type.
> Import text-based field data only—images are not required.
> Provide a downloadable CSV template matching the website's fields, such as name, description, address, city, country, website, contact email, phone number and opening hours, where supported.
> Validate the file and show a preview before confirming the import.
> Flag missing required information and formatting errors, identifying the affected rows.
> Check for potential duplicates and allow admins to skip them or update existing listings.
> Allow profiles to be imported as drafts for review before publishing.
> Show an import summary with the number of listings created, updated, skipped or unsuccessful.
> Please ensure this feature can also be used for other locations as we expand beyond Hong Kong.

### What already exists (checked in the code, 2026-11-12)
- C1: no "Represented Artists" link between galleries and artists yet.
- C2: Follow exists for ARTISTS only (FollowButton, follow table keyed on
  the artist's user id). Galleries/venues/directory listings are often
  unclaimed (no owner), so following must be keyed on the listing. No
  reviews, no news posts.
- C3: there is NO artwork page — works open in a pop-up (PortfolioLightbox).
  A real page (/artworks/:id) is new: route, page, links from every grid, SEO.
- C4–C5: Collect already exists from B10 (CollectButton "Save to…" menu,
  new collection on the spot; collection + collected_work tables, migration
  029). Needs: the two-option dialog, collections on artist and gallery
  profiles, compact cards, a collection page.
- C6: new (reads collected_work by artist).
- C7: new; artists have disciplines (A3) — usable for "similar".
- C8: nothing yet. New: scheduled job, website reader, AI extraction, draft
  queue, organiser approval, recommendations, search.
- C8 + C10 fixes LIVE 2026-11-23 (v11/GitHub 01ee32c; 035 on TEST and LIVE): TEST
  end to end 64/64, live dates 13/13, AI screens 26/26. C10 (not in the quote) included
  by the owner (2026-11-23); pricing not recorded. Old events keep no time zone.
- C8 LIVE 2026-11-23 (v11/GitHub 1bd39d0; 034 on TEST and LIVE; trial on, schedule
  off). TEST end to end 49/49, live read-only 26/26. Still to do: first real run on
  live (proves the Vercel keys), the 10-website trial, and the report email sender.
  verify:ai-events 170/170, SQL rehearsed locally 43/43, Chrome 26/26 with
  simulated drafts, real reading trial 11 sites (dates identical in 3 runs).
- C9: public/favicon.png is really a JPEG (512x512), one size only.
- C10: end_date is stored and shown on the event's own page, not on the
  list; the list marks past by START date. Ties in with the time-zone
  finding above (times show in the visitor's zone).
- C11: newsletter subscribers already export to CSV (AdminSubscribersPanel).
- C12: = B8 (planned 2026-10-20, not built).

## C12 CSV import — built 2026-11-16 (v12, not yet live)

Admin → **Import CSV** (new tab after Add Listing). No database change.
- Template download (site fields: listing_type, name, city, country,
  address, description, website, contact_email, phone, opening_hours,
  socials, disciplines, latitude/longitude or geo, SEO). Her own headings
  also work (display_name, based_in, bio, geo…); a file with no type column
  asks "every row is a: Gallery / Museum / …".
- Preview before anything is saved: Ready / Already on the site / Problem,
  with the row number and the reason. Duplicates by name (+city) or website,
  checked against EVERY listing; Skip (default) or Update. Update fills only
  non-empty cells, never renames, retypes, publishes or changes the owner.
  A member-owned listing is never updated.
- New listings: drafts waiting in Approvals (default) or live at once.
  Unclaimed, no claim email. Map pin from the file's coordinates, else
  looked up from the address (about 1 s a listing).
- Summary: created / updated / skipped / unsuccessful, results CSV, and
  "Undo this import" — remembered in the browser, so it still works after
  opening Approvals or refreshing, until the next import.
- Fixed on the way: Add Listing's duplicate check and the Approvals queue
  read only the newest 500 listings (live has 505); the admin tab row made
  the whole admin page scroll sideways on phones (now scrolls by itself).
- Checks: verify:csv-import 119/119 (includes Julie's real 363-row
  September sheet — all read, all detected as already on the site if
  imported again); real Chrome on TEST 32/32 (reports/C12-csv-import.html),
  everything cleaned up afterwards. Run 3 times (32/32 each); template and
  results files opened in real Excel: columns right, Chinese/accents/dashes
  intact (reports/C12-downloads/).

Live 2026-11-17 (v11/GitHub 012aa2b, bundle index-CIbKezY1.js): read-only
live check 17/17 (reports/C12-csv-import-live.html) — tab there, template
downloads, preview against the real 505 listings finds duplicates incl. the
oldest and the member-owned one, phone fits, Cancel, 505 → 505 listings
(nothing saved). Earlier live checks still pass: Events 13/13, Chapters
38/38, drafts 4/4, event map 7/7, Editorial 16/16.

## Batch D — received 2026-11-24 (her words), after the AI events went live in trial

> if a gallery has not claimed them my approval is enough
> 10 is a good test to start. I can see this will take some getting used to. the first 100 galleries on the site by alphebetical order have already been checked by me for correct information. so 10 -20 to start using those woudl be great
> yes to all of these please: For you: a report after each check, and alerts when something needs your attention
> • For galleries: an email when an event needs their approval, with a reminder
> • For members: suggested events, messages and inquiries sent to their inbox
> the events page looks great thanks for the update.
> some of the images however are not loading or taking a long time to load
> for the suggested for you section, is it possible to have the image in the suggestion as well?
> I will test the approvals section today

- D1: approval rule CONFIRMED (unclaimed: admin alone). Already how it works.
- D2: trial with 10–20 of the first 100 galleries alphabetically — to add on live.
- D3: email automations: she said yes to the list. The message she answered had
  no price (owner removed the quote line). $300 not yet told to her — send before starting.
- D4: Events page images slow / not loading — to investigate.
- D5: image in the "For you" suggestions — to build.

> (2026-11-24, via the owner) can she be able to add photos to the edit secon of the event so she do not have to go back and edit and add

- D6: photo in the AI draft's Edit form, with positioning; published with the event. Migration 036.
