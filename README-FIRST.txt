ART FUTURE CLUB — full build
============================

!! RUN BOTH MIGRATIONS FIRST, IN ORDER
   Supabase -> SQL Editor:

     supabase/migrations/014_gallery_work_owner.sql
     supabase/migrations/015_image_focal_points.sql

   014 prints how many gallery works it could attach and how many it could
   not. Read that number — see "What you will need to redo".

THEN
  1. Replace your whole  src  folder with the one in this zip.
  2. Copy the four files in  scripts/  over your existing ones.
  3. Replace  package.json.
  4. npm run verify:all
  5. Hard-refresh with Ctrl+Shift+R.


===============================================================
THE THREE THINGS THAT WERE MIXING CATEGORIES UP
===============================================================

1. GALLERY IMAGES APPEARING ON EVERY GALLERY

   Works were saved with  artist_id = profile.user_id  and loaded the same
   way. Admin-created galleries are unclaimed, so their user_id is NULL —
   every work uploaded to any of them was stored with artist_id = NULL, and
   every unclaimed gallery then matched ALL of them.

   One bug, two symptoms: it affected the galleries page AND the venues page.
   The works genuinely had no owner; it was never a display fault.

   !! WHAT YOU WILL NEED TO REDO
      Works with a NULL artist_id cannot be attributed — the database has no
      record of which gallery they were uploaded to. Migration 014 leaves them
      unattached rather than guessing, so they will DISAPPEAR from all
      galleries rather than appearing on all of them. They need re-uploading
      to the correct gallery.

      That is the honest trade: wrong everywhere, or absent until re-added.
      There is no third option, because the information was never stored.


2. "10 CHANCERY LANE GALLERY" SHOWING AS A VENUE

   The Collective Registry's third column was not reading venues at all. It
   read Event.list() and used the event's `venue` field as a name — so an
   EVENT held at a gallery appeared as a PLACE, carrying the event's image,
   the event's chapter ("Other") as its city, and linking to /events.

   The gallery's own profile was never consulted, which is why its real type
   made no difference.

   It now reads collector profiles: galleries labelled Gallery linking to
   /gallery, venues labelled with their actual kind linking to /venues.


3. "OTHER" WAS BOTH A VENUE AND A PERSON

   "Other" was in the venue type list, so a Collector, Curator or Advisor
   filed as "Other" appeared on the venues page as though they were a
   building. Removed — a space of uncertain kind should be Event Space or
   Institution.

   !! Anything currently saved as type "Other" will vanish from the venues
      page. Reclassify those in Admin -> Edit Listings.


===============================================================
ALSO IN THIS BUILD
===============================================================

* SKEWED HEADERS (raised three times). Covers were always cropped from the
  CENTRE, cutting the subject out. You can now DRAG to choose what stays in
  frame, on gallery covers and event headers. The picker shows the image at
  exactly the ratio it will display at.

* LONG BIOS collapse to a few lines with a "Read more" control. The button
  only appears when something is genuinely hidden.

* ADMIN -> EVENTS. Edit or delete any event, with a "Needs a chapter" filter
  and a banner counting how many have none. This is how you fix the events
  currently set to "Other" so they appear on chapter pages.

* ADMIN -> EDIT LISTINGS. Correct or remove any artist, gallery or venue.
  The claim email can be fixed while a listing is unclaimed, and is locked
  once a member has claimed it.

* MY COLLECTION on artist and gallery profiles.

* START A CHAPTER is now a partnership type. The link from the home page led
  to a form offering five options, none of which was starting a chapter. It
  now preselects the right one.
  !! This is an ENQUIRY route. Chapters still live in code.

* UPCOMING GATHERINGS shows three, by the date they happen rather than when
  they were added.

* LANDING PAGE FEATURED WORKS required a like in the last SEVEN DAYS, so on a
  young site the grid collapsed to one item. It now fills, and includes artist
  portfolio works — it was only ever reading gallery pieces.

* EVENTS PAGE: past events read most recent first.
* EVENT DESCRIPTIONS: two lines in the list, full text on the page.
* ARTWORK DETAILS beside the enlarged image.
* 300-WORD BIO LIMIT, counted as you type.
* ONE MAP with a filter by kind of space.
* MULTI-PHOTO UPLOAD for gallery spaces.
* MAPS no longer cover form fields.
* COLLECT BUTTON reports failures instead of failing silently.
* CHAPTER PAGE: venues only, and artists now have photos.


===============================================================
HOW TO TEST
===============================================================

Image leak    Open two galleries — each shows only its own works. Check the
              venues page too.

Registry      Home page, "The Collective Registry". 10 Chancery Lane should
              read GALLERY with its own logo, and link to the gallery page.

Categories    /venues should contain no galleries, no collectors, no curators.

Headers       Edit a gallery, upload a cover, drag the circle, save. The crop
              on the profile should match what you set.

Long bios     Open a gallery with a long description — four lines and a
              "Read more →". A short bio should show no button.

Events        /admin -> Events. The banner says how many need a chapter.
              Filter to them, edit one, set the chapter, save. It should then
              appear on that chapter's page.

Gatherings    Home page — three per chapter, soonest first.


===============================================================
VERIFIED
===============================================================
46/46 routes render clean · build clean from a fresh unzip · 13-point codebase
audit clean · category separation (24 checks) · layout · modals · provider ·
gallery ownership · focal point · expandable text · gatherings · chapter link.
