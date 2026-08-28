ART FUTURE CLUB — PDF portfolio export
======================================

APPLY
  1. Replace your whole  src  folder.
  2. Copy the NINE files in  scripts/  over yours.
  3. Replace  package.json.
  4. Copy  vercel.json  into the project ROOT.
  5. npm run verify:all
  6. Hard-refresh with Ctrl+Shift+R.

No SQL.


WHY THE TEXT RAN OFF THE PAGE
=============================
Only BODY text was wrapped. Headings, metadata and CV rows were drawn with
doc.text() and no width, so anything long ran straight past the right margin
and was lost.

Reproduced with the old code: a CV row pushed the venue 5mm off the page.

There were three more faults alongside it:

  * Page breaks were guessed. A few checks sat between SECTIONS, but nothing
    checked before drawing an individual line — so text ran off the bottom
    too, and a work could split with its title on one page and its details on
    the next.

  * CV rows used fixed columns at 20mm and 100mm. A title longer than 80mm
    ran underneath the venue beside it.

  * No images at all.

Every piece of text now goes through one function that wraps to the column
width and takes a page break when it runs out of room.


ARTWORK IS NOW INCLUDED
=======================
Each piece appears with its image above the title, medium, dimensions, year,
description and price.

  * Aspect ratio is preserved — nothing is stretched.
  * Images are downscaled to a 1400px long edge so the file stays small
    enough to email. A full-resolution portfolio would be too large to send,
    which defeats the point.
  * WebP is converted through a canvas, since jsPDF cannot embed it directly.
  * An image that fails to load is skipped rather than failing the export.
  * The button shows "Adding artwork 3 of 8..." as it works.

Page numbers are added on every page at the end, so the count is right.


NEW TEST
========
scripts/verify-pdf.mjs generates a REAL PDF from deliberately awkward content
— a 130-character title, an unbroken 75-letter word, forty long CV rows — and
fails if any line crosses the right margin or falls below the bottom one.

Part of npm run verify:all.


HOW TO TEST
===========
Open an artist profile with several works and click "Export PDF Portfolio".

Check: no text is cut off at any edge; each artwork appears with its picture;
long exhibition titles wrap instead of running under the venue; page numbers
are correct.

Try it on an artist with a long bio and a full CV — that is where the old
version broke down.


VERIFIED
========
46/46 routes · build clean · 5 generated-PDF checks · 21 implementation
checks · layout · datetime · categories · admin tabs · admin forms · modals.
