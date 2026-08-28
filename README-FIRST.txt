ART FUTURE CLUB — complete build
================================

APPLY
  1. Replace your whole  src  folder with the one in this zip.
  2. Copy the SIX files in  scripts/  over yours.
  3. Replace  package.json.
  4. Copy  vercel.json  into the project ROOT (beside package.json).
  5. npm run verify:all
  6. Hard-refresh with Ctrl+Shift+R.

MIGRATIONS — you confirmed 014, 015 and 016 have all run. They are included
only for reference.


=================================================================
EDITING AN ARTIST'S ARTWORK
=================================================================
Admin -> Edit Listings -> Edit on an artist now includes their ARTWORK.

Previously only the name and profile photo could be changed, so a wrong
title, a missing price or the wrong picture meant deleting the whole listing
and building it again.

You can now change a work's title, year, medium, dimensions, description,
price and image; remove a work; or add a new one. A new work appears at the
TOP, matching the artist's own editor.

Existing pieces keep their image unless you choose a new one — nothing is
re-uploaded needlessly.

Galleries are unaffected: they manage their works from their own profile
page, where the gallery-specific fields live.


=================================================================
PREMIUM LIMITS ARE NOW OFF — PAYMENTS STILL WORK
=================================================================
Everyone gets every feature while the site is being built. Nothing prompts an
upgrade, and nothing is capped:

  * artists can add unlimited portfolio works (was 4)
  * galleries can add unlimited works (was 4)
  * galleries can post unlimited exhibitions (was 1 per month)
  * open call links are open to everyone (was paid members only)

PAYMENTS ARE UNTOUCHED. The Upgrade page works, Stripe checkout works, and
anyone who does subscribe keeps their subscription. Only the RESTRICTIONS are
lifted.

TO TURN THEM BACK ON, one line:

    src/lib/featureLimits.js  ->  export const LIMITS_ENABLED = true;

That is the only change needed. Every check now reads from that switch, which
is why they could be lifted at all — they had been scattered across four files
with the numbers written inline.


=================================================================
EVENT AND COVER IMAGES — NO RE-UPLOADING NEEDED
=================================================================
An image whose position has NEVER been set now shows IN FULL. Nothing is
cropped, so every event and gallery cover already created stops being cut off
the moment this deploys. She does not need to touch or re-upload anything.

Once someone DRAGS the picker on an event or a cover, that one switches to a
full-bleed banner cropped to the point they chose.

You can now set that position in three places:
  * posting or editing an exhibition from a gallery profile
  * Admin -> Events (which also lets you replace the header image)
  * editing a gallery or venue cover

The event LIST thumbnail uses the same position as the header, so the preview
and the event page show the same part of the picture.


=================================================================
ALSO FIXED IN THIS BUILD
=================================================================
SAVING AN ARTIST HUNG FOREVER
  The edit form sent cover_image_url and focal points for every listing, but
  artist_profile has no cover columns — so Postgres rejected the update. My
  submit handler had no catch, so the error escaped and the button span
  forever with nothing said. Both fixed: cover fields now go only to galleries
  and venues, and failures are caught and shown.

IPAD AND IPHONE UPLOADS
  HEIC is the default iOS photo format and cannot be decoded by
  createImageBitmap. Uploads fell back to the raw file, which storage
  rejected. There is now a second decode path through an <img> element, which
  Safari can render. Confirmed working on iPhone.

CHAPTER ARTISTS
  "Voices of the Chapter" matched on `chapter` only, missing every artist who
  had set `based_in` instead — which is what the artists directory filters by.
  A chapter with a dozen members showed three. Both pages now use the same
  rule, and the "All <city> artists" button always appears instead of only
  once a chapter passed ten members.

VERCEL 404 ON SAVE
  vercel.json adds the SPA rewrites Vercel needs. Netlify has these in
  netlify.toml; Vercel had nothing, so any direct route or redirect returned
  404.


=================================================================
VERIFIED
=================================================================
46/46 routes render clean · build clean · every admin tab opens ·
categories · layout · modals · provider · limits · hybrid images ·
stuck-save · chapter artists · HEIC.
