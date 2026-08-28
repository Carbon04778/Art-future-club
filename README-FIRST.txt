ART FUTURE CLUB — event times, saving, and image sizes
======================================================

APPLY
  1. Replace your whole  src  folder.
  2. Copy the EIGHT files in  scripts/  over yours.
  3. Replace  package.json.
  4. Copy  vercel.json  into the project ROOT.
  5. npm run verify:all
  6. Hard-refresh with Ctrl+Shift+R.

No SQL.


1. "THE TIME IS DIFFERENT FROM WHAT I ENTERED"  — FOUND AND FIXED
=================================================================
Timestamps are stored in UTC. A datetime-local input shows and returns LOCAL
time. The forms took the first 16 characters of the stored ISO string — the
right SHAPE, but a UTC time labelled as local.

Reproduced exactly:

    she types             2026-09-01T18:00   (6pm Hong Kong)
    database stores       2026-09-01T10:00Z
    reopened, she sees    2026-09-01T10:00   <-- eight hours out

And saving again shifted it a further eight hours. Every edit moved the event.

There is now one shared helper — src/lib/datetime.js — used by the admin
events panel, the exhibition form and the article publish date. Verified in
Hong Kong, Lagos and New York, including five consecutive saves with no drift.


2. "EDITING THE EVENT DOES NOT SAVE"  — A SECOND BUG
====================================================
The payload spread the form AFTER image_url:

    { image_url, ...form }

`form` carries the OLD image_url, so it overwrote the file that had just been
uploaded. A new header image was uploaded to storage and then discarded.

The end date was also still being converted the old way, so it drifted even
after the start date was fixed.


3. GALLERY COVER IMAGES WERE A QUARTER THE SIZE
===============================================
    event header    aspect-[16/9], up to 70vh
    gallery cover   a fixed 288px

The same photograph filled the screen on an event page and read as a thin
strip on a gallery. Gallery covers now use the same ratio and the same 70vh
cap. The enlarged artwork view was already correct.


4. CHAPTER PAGE GATHERINGS
==========================
The landing and events pages were fixed earlier; the chapter pages were
missed. They treated an event as current until its END date, so a June show
with no end date still showed in August, and they matched the chapter name
exactly so anything cased differently was dropped. All three pages now agree.


NEW TESTS
=========
scripts/verify-datetime.mjs     17 checks, run in several timezones
scripts/verify-admin-forms.mjs  15 checks — opens every admin EDIT form with
                                a real record, which the tab test could not do
                                because it uses empty lists

Both are part of npm run verify:all.


!! STILL WORTH CHECKING: VERCEL
===============================
The screenshot showed June events as "upcoming" on 28 August and the "7 ACTIVE
EXHIBITIONS" line removed months ago. Neither is possible with current code —
Vercel is serving a stale deploy. Until that is fixed she will keep reporting
things that are already solved.


VERIFIED
========
46/46 routes · build clean · 33 admin-tab · 15 admin-form · 17 datetime ·
11 gathering-ordering · 8 image-size · categories · layout · modals.
