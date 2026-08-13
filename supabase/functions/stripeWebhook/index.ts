// Creates a Stripe Checkout session for the three paid tiers.
//
// CHANGES FROM THE ORIGINAL BASE44 VERSION:
//   - price IDs come from env vars instead of being hardcoded in source
//   - success/cancel URLs default to SITE_URL, not app.base44.com. That was a
//     live bug: paying customers were returned to the wrong domain.
//   - the caller is identified from their Supabase JWT

import Stripe from "npm:stripe@14.21.0";
import { createClient } from "npm:@supabase/supabase-js@2";

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

// Read inside the request, not at module scope: a missing secret at load
// time takes the whole function down with an opaque 500 before any of our
// error handling runs.
function plans() {
  return {
    premium_portfolio:   { price_id: Deno.env.get("STRIPE_PRICE_PREMIUM"),  mode: "subscription", secret: "STRIPE_PRICE_PREMIUM" },
    featured_listing:    { price_id: Deno.env.get("STRIPE_PRICE_FEATURED"), mode: "payment",      secret: "STRIPE_PRICE_FEATURED" },
    gallery_partnership: { price_id: Deno.env.get("STRIPE_PRICE_GALLERY"),  mode: "subscription", secret: "STRIPE_PRICE_GALLERY" },
  };
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS });

  try {
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) {
      return Response.json({ error: "Unauthorized" }, { status: 401, headers: CORS });
    }

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL"),
      Deno.env.get("SUPABASE_ANON_KEY"),
      { global: { headers: { Authorization: authHeader } } },
    );

    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
      return Response.json({ error: "Unauthorized" }, { status: 401, headers: CORS });
    }

    const { plan, success_url, cancel_url } = await req.json();
    const config = plans()[plan];
    if (!config) {
      return Response.json(
        { error: `Unknown plan "${plan}".` },
        { status: 400, headers: CORS },
      );
    }
    if (!config.price_id) {
      return Response.json(
        { error: `Secret ${config.secret} is not set in Supabase → Edge Functions → Secrets.` },
        { status: 400, headers: CORS },
      );
    }
    if (!config.price_id.startsWith("price_")) {
      // The most common setup mistake: copying the product id instead of the
      // price id. Stripe rejects it with an unhelpful message.
      return Response.json(
        { error: `${config.secret} is "${config.price_id.slice(0, 12)}…" — it must start with price_, not prod_.` },
        { status: 400, headers: CORS },
      );
    }

    const site = Deno.env.get("SITE_URL") ?? "";

    const stripeKey = Deno.env.get("STRIPE_SECRET_KEY");
    if (!stripeKey) {
      return Response.json(
        { error: "Secret STRIPE_SECRET_KEY is not set in Supabase → Edge Functions → Secrets." },
        { status: 400, headers: CORS },
      );
    }
    const stripe = new Stripe(stripeKey, {
      apiVersion: "2023-10-16",
      // Deno has no Node http module. Without the fetch client the Stripe SDK
      // throws as soon as it is constructed, which surfaces as an opaque 500.
      httpClient: Stripe.createFetchHttpClient(),
    });

    const session = await stripe.checkout.sessions.create({
      payment_method_types: ["card"],
      mode: config.mode,
      line_items: [{ price: config.price_id, quantity: 1 }],
      success_url: success_url || `${site}/upgrade?status=success`,
      cancel_url: cancel_url || `${site}/upgrade?status=cancelled`,
      customer_email: user.email,
      // The webhook reads these back to know who paid for what.
      metadata: { user_id: user.id, plan },
    });

    return Response.json({ url: session.url, session_id: session.id }, { headers: CORS });
  } catch (err) {
    // Log the full error for the dashboard, and return the message so it is
    // visible on screen rather than only as an opaque 500.
    console.error("createCheckout failed:", err);
    return Response.json(
      { error: String(err?.message ?? err) },
      { status: 500, headers: CORS },
    );
  }
});