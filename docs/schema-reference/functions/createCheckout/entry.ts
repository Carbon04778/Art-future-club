import { createClientFromRequest } from 'npm:@base44/sdk@0.8.38';
import Stripe from 'npm:stripe@14.21.0';

const PLANS = {
  premium_portfolio: {
    price_id: 'price_1TvavODlA55f3e5vUfXnxzug',
    mode: 'subscription',
  },
  featured_listing: {
    price_id: 'price_1TvavODlA55f3e5v56Nd4gBA',
    mode: 'payment',
  },
  gallery_partnership: {
    price_id: 'price_1TvaxoDlA55f3e5vb90ZXzTI',
    mode: 'subscription',
  },
};

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 });

    const { plan, success_url, cancel_url } = await req.json();
    const planConfig = PLANS[plan];
    if (!planConfig) return Response.json({ error: 'Invalid plan' }, { status: 400 });

    const stripe = new Stripe(Deno.env.get('STRIPE_SECRET_KEY'));

    const session = await stripe.checkout.sessions.create({
      payment_method_types: ['card'],
      mode: planConfig.mode,
      line_items: [{ price: planConfig.price_id, quantity: 1 }],
      success_url: success_url || 'https://app.base44.com/success',
      cancel_url: cancel_url || 'https://app.base44.com/cancel',
      customer_email: user.email,
      metadata: {
        base44_app_id: Deno.env.get('BASE44_APP_ID'),
        user_id: user.id,
        plan,
      },
    });

    return Response.json({ url: session.url, session_id: session.id });
  } catch (error) {
    console.error('Checkout error:', error.message);
    return Response.json({ error: error.message }, { status: 500 });
  }
});