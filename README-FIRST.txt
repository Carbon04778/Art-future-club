ART FUTURE CLUB — four items
============================

APPLY
  1. Replace your whole  src  folder.
  2. Copy the FIVE files in  scripts/  over yours.
  3. Replace  package.json.
  4. npm run verify:all
  5. Hard-refresh with Ctrl+Shift+R.

If you have not already run them:
     supabase/migrations/014_gallery_work_owner.sql
     supabase/migrations/015_image_focal_points.sql


1. EXPANDING PHOTOGRAPHS DOES NOT SAVE  — FIXED, AND THIS WAS THE REAL CAUSE
============================================================================
The full-width tick existed, saved correctly, and the article rendered it.
What was missing: when an article was OPENED FOR EDITING, the flag was not
read back. So the tick appeared cleared, and saving wrote full:false over a
setting that had genuinely been made.

It saved every time. It was erased the next time the article was opened.

TO TEST
  Edit an article, tick "Full width" on a gallery image, save. Reopen it —
  the tick should still be there. View the article: that image should run the
  full width instead of sitting in the two-column grid.


2. SET PREMIUM / FEATURE BY HAND  — ALREADY BUILT, NEEDS DEPLOYING
==================================================================
The buttons are in Admin -> Artists, and the Edge Function that backs them is
included in this zip at  supabase/functions/grantMembership.

!! IT IS NOT DEPLOYED YET. That is why nothing happens when you click.

TO DEPLOY
  Supabase -> Edge Functions -> Deploy a new function -> Via Editor
  Name it exactly:  grantMembership
  Paste the contents of supabase/functions/grantMembership/index.ts
  Deploy with Verify JWT ON.

WHY IT WORKS THIS WAY
  is_premium, is_featured and partnership_type cannot be written by an
  ordinary account — that is what makes the paywall real. Without it any
  member could grant themselves premium by editing their own profile.

  The function is the narrow exception: it holds the service-role key on the
  server, checks the caller is an admin, and records every grant. Comping
  works; the paywall stays intact for everyone else.


3. ARTIST BIO: 50 WORDS  — DONE
================================
New bios are capped at 50 words, counted as you type.

Existing longer statements are NOT truncated. They collapse to about the same
height with a "Read more" control, so nothing already written is lost — it is
just no longer filling the whole profile.


4. CHANCERY LANE IMAGES NOW MISSING  — EXPECTED, AND RECOVERABLE
=================================================================
This is the consequence of migration 014 that I flagged. Works uploaded to an
unclaimed gallery were stored with NO owner, so the database has no record of
which gallery they belonged to. Rather than guess, the migration left them
unattached — which is why they vanished rather than appearing everywhere.

THE IMAGES ARE STILL THERE. To find them:

    select id, title, artist_name, image_url
    from public.gallery_work
    where gallery_id is null;

If they all belong to 10 Chancery Lane, assign them in one go:

    update public.gallery_work
    set gallery_id = (
      select id from public.collector_profile
      where display_name = '10 Chancery Lane Gallery' limit 1
    )
    where gallery_id is null;

!! Run the SELECT first. If works from several galleries are mixed in there,
   assign them individually instead — the update above would put them all in
   one place.


VERIFIED
========
46/46 routes render clean · build clean · categories · layout · 14 checks on
the four items above.
