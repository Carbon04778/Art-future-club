ART FUTURE CLUB — items 32, 33, 34, 35  (+ blank-page fix)

HOW TO APPLY
------------
1. Replace your whole  src  folder with the one in this zip.
2. Copy the three files in  scripts/  over your existing ones.
3. Replace  package.json  (it registers the new test).
4. Run:  npm run verify:all
   Expect: 34, 7, 39, 9, 28, 57, 8 passed, 46/46 routes, build succeeded.

No database migration is needed.


THE BLANK PAGE
--------------
"Post Exhibition" went blank because CHAPTER_OPTIONS was used but never
imported. An undefined value renders as nothing, so there was no build error
and no lint warning — just a white screen.

Fixed, and there is now a test that opens the modal and fails if it crashes:
scripts/verify-modals.mjs. The route tests could never have caught this,
because a modal only exists after a click.


WHAT CHANGED
------------
34  Exhibitions now carry a chapter.
    It was hardcoded to "Other", so every exhibition ever posted was invisible
    on the chapter pages. There is now a chapter selector, defaulting to the
    gallery's own city.

    !! Existing exhibitions still say "Other". Open each one, set the chapter,
       and save. Check which need fixing with:

       select title, chapter from public.event order by start_date desc;

33  Exhibitions are sorted. Neither list was sorted at all before. Upcoming
    now reads soonest first; past reads most recent first.

32  New venue types: Museum, Restaurant, Event Space.

35  Museums can be found on their own — the venues page has a type filter.


ONE THING WORTH KNOWING
-----------------------
type === "Institution" was hardcoded in SEVEN places. Adding "Museum" would
have offered it in the editors and then silently hidden those venues on the
venues page, the map, the header and the back links. All seven now use one
helper in src/lib/venueTypes.js, and a test fails if the hardcoded check
comes back.


HOW TO TEST
-----------
Blank page  Gallery profile -> Exhibitions -> Post Exhibition. The form should
            open, with an AFC Chapter dropdown.

34          Edit an exhibition, set its chapter, save. Then open that
            chapter's page — it should appear under Upcoming Gatherings.

33          Post two exhibitions with different dates; check the ordering.

32          Admin -> Add Listing -> Venue. Type now includes Museum,
            Restaurant and Event Space.

35          Create a Museum, then open /venues. A second row of filter buttons
            appears; clicking Museum shows only museums.
