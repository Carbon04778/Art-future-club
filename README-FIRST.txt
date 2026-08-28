ART FUTURE CLUB — chapter ordering + admin form testing
=======================================================

APPLY
  1. Replace your whole  src  folder.
  2. Copy the SEVEN files in  scripts/  over yours.
  3. Replace  package.json.
  4. Copy  vercel.json  into the project ROOT (beside package.json).
  5. npm run verify:all
  6. Hard-refresh with Ctrl+Shift+R.

No SQL. 014, 015 and 016 have all run; nothing here adds a column.


!! READ THIS FIRST — THE VERCEL SITE IS SERVING OLD CODE
=======================================================
The screenshot showed 18 June, 25 June and 4 July under "Upcoming Gatherings"
on 28 August, and the "7 ACTIVE EXHIBITIONS - 29C HUMID" line that was removed
months ago.

Neither is possible with the current build. Vercel is running a stale deploy.

Until that is fixed, she will keep reporting bugs that are already solved —
which accounts for most of today. Check Vercel -> Deployments: is the newest
one green, is it from the latest commit, and is the project connected to the
same GitHub repo?


CHAPTER PAGE GATHERINGS — FIXED
===============================
The landing page and the events page were corrected earlier; the chapter pages
were missed. Two faults there:

  * They treated an event as current until its END date. A show that opened in
    June with no end date recorded still appeared in August.
  * They matched the chapter name EXACTLY, so anything cased differently or
    with a stray space was dropped.

All three pages now agree: strictly upcoming, soonest first, matched
case-insensitively.


"THE EVENT EDIT PAGE GOES BLANK"
================================
I could not reproduce it. I mounted the panel with the exact event from the
screenshot — chapter "Other", no end date — clicked Edit, and the form opened
prefilled. Then again with no image at all. Both fine.

This points at the stale deploy above rather than the code.

BUT THE GAP THAT LET IT REACH HER WAS REAL, so I closed it:

  scripts/verify-admin-forms.mjs  (new, 15 checks)

  The existing tab test clicks every admin tab, but with EMPTY lists — so a
  form that crashes on a real record passes it. This seeds each panel with a
  realistic row, clicks Edit, and fails if the form crashes or renders blank.

  It covers Events, Edit Listings and Editorial, using deliberately awkward
  fixtures: an event with a null end date and a null image, an artist with a
  portfolio work, a gallery with a cover.

  Now part of npm run verify:all.


VERIFIED
========
46/46 routes · build clean · 33 admin-tab checks · 15 admin-FORM checks ·
11 gathering-ordering checks · categories · layout · modals · provider.
