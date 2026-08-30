ART FUTURE CLUB — four launch issues
====================================

APPLY
  1. Replace your whole  src  folder.
  2. Copy the TEN files in  scripts/  over yours.
  3. Replace  package.json.
  4. Copy  vercel.json  into the project ROOT.
  5. npm run verify:all
  6. Hard-refresh with Ctrl+Shift+R.

No SQL.


1. BLANK SCREEN WHEN ADDING AN EXHIBITION IMAGE  — MY FAULT
===========================================================
FocalPointPicker was used but never imported. An undefined component renders
as nothing, so the page went white with no build error and no lint warning.

It only crashed AFTER a file was selected, because the picker does not render
until there is an image to position. Every existing test opened the modal and
stopped — which is exactly why this reached you.

TWO NEW GUARDS, both proven against the real bug:

  scripts/verify-imports.mjs
      Scans all 99 source files for a component used in JSX but never
      imported. Runs FIRST in verify:all and takes about a second. Removing
      the import again makes it fail and names the file.

  verify-modals.mjs now SELECTS A FILE
      Opens each modal, chooses an image, and fails if anything crashes
      afterwards. With the import removed it reports:
      "ReferenceError: FocalPointPicker is not defined".

This is the fourth blank screen from a missing import. It should be the last —
the check is static and cannot be forgotten.


2. SHARE LINKS AND COMMENT IN THE ENLARGED VIEW
===============================================
Sharing now sits to the RIGHT of Like and Collect, so the row reads: what you
can do with the work, then where you can send it. Comments sit beneath, below
a divider.


3. PORTFOLIO DESCRIPTIONS HIDDEN UNTIL OPENED
=============================================
A paragraph under every thumbnail pushed the works apart and made the
portfolio hard to scan. The description now appears only when a piece is
clicked, beside the enlarged image, where there is room for it.


4. GALLERIES AND VENUES IN ALPHABETICAL ORDER
=============================================
Both lists came back in whatever order the database returned. Sorted properly
now: case is ignored, and numbers are handled so "2 Ships" comes before
"10 Chancery Lane" rather than after it.

Venues were done too — same table, same problem.


VERIFIED
========
Every suite re-run after these changes, not just the new ones:

  imports · 46/46 routes · build · admin tabs · admin forms · modals
  (18 checks, including file selection) · layout · categories · datetime ·
  PDF · provider contract · 15 checks on the four issues above.
