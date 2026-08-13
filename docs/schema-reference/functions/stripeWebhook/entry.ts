import { createClientFromRequest } from 'npm:@base44/sdk@0.8.38';
import Stripe from 'npm:stripe@14.21.0';

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const stripe = new Stripe(Deno.env.get('STRIPE_SECRET_KEY'));
    const webhookSecret = Deno.env.get('STRIPE_WEBHOOK_SECRET');

    const body = await req.text();
    const signature = req.headers.get('stripe-signature');

    let event;
    try {
      event = await stripe.webhooks.constructEventAsync(body, signature, webhookSecret);
    } catch (err) {
      console.error('Webhook signature error:', err.message);
      return new Response('Invalid signature', { status: 400 });
    }

    if (event.type === 'checkout.session.completed') {
      const session = event.data.object;
      const { user_id, plan } = session.metadata || {};
      if (!user_id || !plan) {
        console.error('Missing metadata in session', session.id);
        return Response.json({ received: true });
      }

      // Calculate expiry: featured listing = 30 days, premium = ongoing (1 year marker)
      const daysToAdd = plan === 'featured_listing' ? 30 : 365;
      const expires_at = new Date(Date.now() + daysToAdd * 24 * 60 * 60 * 1000).toISOString();

      await base44.asServiceRole.entities.Subscription.create({
        user_id,
        plan,
        status: 'active',
        stripe_session_id: session.id,
        stripe_customer_id: session.customer || '',
        expires_at,
      });

      // For premium: mark the artist profile
      if (plan === 'premium_portfolio') {
        const profiles = await base44.asServiceRole.entities.ArtistProfile.filter({ user_id });
        if (profiles.length > 0) {
          await base44.asServiceRole.entities.ArtistProfile.update(profiles[0].id, { is_premium: true });
        }
      }
      if (plan === 'featured_listing') {
        const profiles = await base44.asServiceRole.entities.ArtistProfile.filter({ user_id });
        if (profiles.length > 0) {
          await base44.asServiceRole.entities.ArtistProfile.update(profiles[0].id, { is_featured: true, featured_until: expires_at });
        }
      }

      console.log(`Subscription created for user ${user_id}, plan: ${plan}`);
    }

    return Response.json({ received: true });
  } catch (error) {
    console.error('Webhook error:', error.message);
    return Response.json({ error: error.message }, { status: 500 });
  }
});