# Payments paused (2026-11-23, until further notice)

Owner: "please remove every places that ask for payemnt for now save all in
files till futher notice".

Nothing was deleted. Everything below is hidden by one switch.

## To bring payments back

In `src/lib/featureLimits.js` set `PAYMENTS_ENABLED = true`, run
`npm run verify:all`, push. No database change is needed.

Separate switches, not changed by this one:

- `LIMITS_ENABLED` (same file): the free-plan limits. Was already false.
  Limits now apply only when BOTH switches are true.
- `supabase/migrations/031_open_calls_free.revert.sql`: makes viewing Open
  Calls premium-only again. Run on TEST, then LIVE.

## What is hidden

| Place | File | What was there |
|---|---|---|
| `/upgrade` page (now goes to home) | `src/App.jsx`, `src/pages/Upgrade.jsx` | 3 plans: Premium Portfolio $12/month, Featured Listing $49 for 30 days, Gallery Partnership $99/month |
| `/membership-policy` page (now goes to home) | `src/App.jsx`, `src/pages/MembershipPolicy.jsx` | Prices and billing rules |
| Footer, most pages | `src/components/SlimFooter.jsx` | "Membership", "Membership Policy" |
| Footer, home and About | `src/components/ManifestoFooter.jsx` | "Membership", "Membership Policy" |
| Community sidebar | `src/pages/ArtistCommunity.jsx` | "Upgrade ↑" |
| Artist profile editor, top bar | `src/pages/ArtistProfileEdit.jsx` | "Upgrade ↑" |
| About Us | `src/pages/AboutUs.jsx` | "Membership" paragraph (paid plans) |
| Collectors, locked page | `src/components/CollectorsGate.jsx` | "Upgrade Membership ↑" button |
| Open Calls, locked message | `src/components/openCalls.jsx` | "Upgrade Membership ↑" button (not shown anyway while 031 is in force) |
| Pop-up: more than 4 artworks (artist) | `src/pages/ArtistProfileEdit.jsx` | "You've reached the free limit" |
| Pop-up: more than 4 works (gallery) | `src/pages/GalleryProfile.jsx` | "You've reached the free limit" |
| Pop-up: more than 1 exhibition a month | `src/components/gallery/ExhibitionsSection.jsx` | "Monthly limit reached" |
| Sitemap | `api/sitemap.js` | `/membership-policy` |

## Left as it is, on purpose

- **Collectors stay private.** This is Julie's privacy rule (B10), enforced by
  the database (029): collectors, premium members and admins only.
- **Posting Open Calls** stays with admins and Paid Member / Partner galleries
  and venues (026). Nobody else sees a Post button or a payment prompt.
- Premium and Featured badges, and the Paid Member / Partner labels.
- Admin: Set Premium, Feature, and the Subscriptions tab.
- Stripe, the `createCheckout` and `stripeWebhook` functions, and every
  existing subscription. Existing subscriptions are NOT cancelled by this;
  that is done in Stripe.
- Artwork and event ticket prices: those are sales by members.

## Before turning payments back on

The plans promise things no code does yet: priority placement / pinned to top
of the Artists Directory, highlighted in the forum, monthly editorial
spotlight, portfolio analytics. Build them or remove them from the plans.
