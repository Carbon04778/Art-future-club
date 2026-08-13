# Stripe setup

Everything on the code side is written. What remains is account configuration,
and most of it must be done by the account owner.

---

## 1. Create the three products

Stripe Dashboard → **Products** → **Add product**. Start in **Test mode**.

| Product | Price | Billing |
|---|---|---|
| Premium Portfolio | **$12.00 USD** | Recurring, monthly |
| Featured Listing | **$49.00 USD** | **One-off** |
| Gallery Partnership | **$99.00 USD** | Recurring, monthly |

Copy each **price ID** — it starts `price_`, not `prod_`. You need all three.

> Featured Listing is a one-off payment that grants 30 days of visibility. It
> does **not** auto-renew; the member buys it again when they want another run.
> That is deliberate, and worth being explicit about on the pricing page.

## 2. Run the database migration

SQL Editor → run `supabase/migrations/009_stripe_subscription_states.sql`.

It adds the `past_due` state the webhook needs, and a unique index that makes
a duplicate grant impossible if Stripe delivers the same event twice.

Without it, failed payments are silently rejected by the database.

## 3. Deploy the two functions

Supabase → **Edge Functions** → **Deploy a new function** → **Via Editor**.
No CLI required.

- **`createCheckout`** — paste from `supabase/functions/createCheckout/index.ts`.
  Leave JWT verification ON: only signed-in members may start a checkout.

- **`stripeWebhook`** — paste from `supabase/functions/stripeWebhook/index.ts`.
  ⚠️ **Turn JWT verification OFF.** Stripe does not send a Supabase token;
  authenticity comes from the Stripe signature instead. Leaving it on means
  every webhook is rejected and no one ever receives what they paid for.

## 4. Add the webhook endpoint in Stripe

Stripe → **Developers** → **Webhooks** → **Add endpoint**:

```
https://YOUR_PROJECT.supabase.co/functions/v1/stripeWebhook
```

Subscribe to exactly these four events:

- `checkout.session.completed` — first payment
- `invoice.payment_succeeded` — renewal
- `invoice.payment_failed` — card declined
- `customer.subscription.deleted` — cancelled or lapsed

Stripe then shows a **signing secret** (`whsec_...`). You need it below.

> Handling only the first event was the original gap: a member who cancelled
> would have kept their paid features forever.

## 5. Set the secrets

Supabase → **Edge Functions** → **Secrets**:

| Secret | Value |
|---|---|
| `STRIPE_SECRET_KEY` | `sk_test_...` (or `sk_live_...` when going live) |
| `STRIPE_WEBHOOK_SECRET` | `whsec_...` from step 4 |
| `STRIPE_PRICE_PREMIUM` | `price_...` for Premium Portfolio |
| `STRIPE_PRICE_FEATURED` | `price_...` for Featured Listing |
| `STRIPE_PRICE_GALLERY` | `price_...` for Gallery Partnership |
| `SITE_URL` | `https://artfutureclub.netlify.app` |

`SUPABASE_URL`, `SUPABASE_ANON_KEY` and `SUPABASE_SERVICE_ROLE_KEY` are
injected automatically — do not add them.

## 6. Test before going live

Use Stripe's test card **4242 4242 4242 4242**, any future expiry, any CVC.

1. Sign in, go to **/upgrade**, choose Premium Portfolio
2. Pay with the test card
3. In Supabase, check a `subscription` row exists with `status = 'active'`
4. Check the artist profile now has `is_premium = true`
5. In Stripe → Webhooks, confirm the event shows **200**

Then test the paths that matter more:

- **Cancel** the subscription in Stripe → confirm `status` becomes `cancelled`
  and `is_premium` returns to false
- **Card declined** — use `4000 0000 0000 0341` → confirm `status` becomes
  `past_due` and access is **not** immediately removed

## 7. Going live

Swap to live keys, create the products again in live mode, add a second
webhook endpoint for live, and update `STRIPE_SECRET_KEY` and
`STRIPE_WEBHOOK_SECRET`.

⚠️ Test and live mode are entirely separate in Stripe. Test price IDs do not
work in live mode.

---

## Security note

`artist_profile.is_premium`, `is_featured` and the `subscription` table are
writable **only** by the service role. No member and no admin can grant paid
features from the app — this is enforced by database triggers and covered by
`003_rls_tests.sql` (`alice CANNOT grant herself is_premium`,
`admin CANNOT bypass the paywall either`).

The webhook is the single path by which anyone becomes premium.

## Not built

- **Customer portal** — self-service cancellation from account settings.
  Members currently cancel by contacting you, or through Stripe's emailed
  receipts. Adding it is a small Edge Function plus a button.
- **"Pinned to top of Artists Directory"** and **"highlighted in community
  forum"** are advertised on the pricing page but not yet implemented. The
  `is_featured` flag exists; nothing reads it in those two places.
