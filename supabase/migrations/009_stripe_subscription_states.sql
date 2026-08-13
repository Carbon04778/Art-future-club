-- ===========================================================================
-- 009 — subscription states used by the Stripe webhook
-- Run once, after 002_rls.sql. Safe to re-run.
-- ===========================================================================
--
-- The original constraint allowed only active / cancelled / expired. The
-- webhook needs one more:
--
--   past_due  a renewal payment failed. Stripe retries a failing card for
--             several days, so the member is NOT immediately downgraded —
--             the state is recorded, and access is only revoked if Stripe
--             ultimately cancels the subscription.
--
-- Without this, invoice.payment_failed would be rejected by the database and
-- the failure would go unrecorded.
-- ===========================================================================

alter table public.subscription drop constraint if exists subscription_status_check;

alter table public.subscription
  add constraint subscription_status_check
  check (status in ('active', 'past_due', 'cancelled', 'expired'));

-- Stripe retries webhooks, so the same checkout session can arrive twice.
-- A unique index makes a duplicate grant impossible even if the application
-- level guard is ever bypassed.
create unique index if not exists idx_subscription_stripe_session
  on public.subscription (stripe_session_id)
  where stripe_session_id is not null and stripe_session_id <> '';

-- Renewals and cancellations are looked up by customer, not session.
create index if not exists idx_subscription_stripe_customer
  on public.subscription (stripe_customer_id);

select 'subscription states: ' ||
  string_agg(quote_literal(v), ', ')
from unnest(array['active','past_due','cancelled','expired']) v;
