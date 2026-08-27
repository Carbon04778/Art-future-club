// Grant or revoke a complimentary membership.
//
// WHY THIS IS AN EDGE FUNCTION
//
// artist_profile.is_premium / is_featured and collector_profile.partnership_type
// are protected by a database trigger: anon and authenticated are refused
// outright. That is what makes the paywall real — without it, any member could
// grant themselves premium.
//
// Comping therefore cannot be an ordinary update. This function holds the
// service-role key server-side, checks the CALLER is an admin, and performs
// one narrow action. The paywall stays intact for everyone else.
//
// Every grant is recorded in the subscription table with plan "complimentary"
// so a comped account is distinguishable from a paying one — otherwise the
// revenue figures quietly include memberships nobody paid for.
//
// Deploy with Verify JWT ON — the caller's token is required.

import { createClient } from "npm:@supabase/supabase-js@2";

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};
const json = (body, status = 200) => Response.json(body, { status, headers: CORS });

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS });

  try {
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) return json({ error: "Not signed in." }, 401);

    // Who is asking — using the CALLER's token, not the service role.
    const caller = createClient(
      Deno.env.get("SUPABASE_URL"),
      Deno.env.get("SUPABASE_ANON_KEY"),
      { global: { headers: { Authorization: authHeader } } },
    );
    const { data: { user: me } } = await caller.auth.getUser();
    if (!me) return json({ error: "Not signed in." }, 401);

    const admin = createClient(
      Deno.env.get("SUPABASE_URL"),
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY"),
    );

    // Verified server-side. A client claiming to be an admin proves nothing.
    const { data: myProfile } = await admin
      .from("profiles").select("role").eq("id", me.id).maybeSingle();
    if (myProfile?.role !== "admin") {
      return json({ error: "Only an admin may grant a membership." }, 403);
    }

    const { profile_id, kind, grant } = await req.json();
    if (!profile_id) return json({ error: "No profile specified." }, 400);
    if (!["premium", "featured", "partnership"].includes(kind)) {
      return json({ error: `Unknown membership kind "${kind}".` }, 400);
    }

    const on = grant !== false;
    let target = null;

    if (kind === "premium" || kind === "featured") {
      const { data: artist } = await admin
        .from("artist_profile").select("id, user_id, display_name")
        .eq("id", profile_id).maybeSingle();
      if (!artist) return json({ error: "That artist profile no longer exists." }, 404);
      target = artist;

      const patch = kind === "premium"
        ? { is_premium: on }
        : {
            is_featured: on,
            // A featured listing runs 30 days, matching the paid tier.
            featured_until: on
              ? new Date(Date.now() + 30 * 86_400_000).toISOString()
              : null,
          };

      const { error } = await admin
        .from("artist_profile").update(patch).eq("id", profile_id);
      if (error) return json({ error: error.message }, 500);
    } else {
      const { data: gallery } = await admin
        .from("collector_profile").select("id, user_id, display_name")
        .eq("id", profile_id).maybeSingle();
      if (!gallery) return json({ error: "That gallery profile no longer exists." }, 404);
      target = gallery;

      const { error } = await admin
        .from("collector_profile")
        .update({ partnership_type: on ? "Paid Member" : null })
        .eq("id", profile_id);
      if (error) return json({ error: error.message }, 500);
    }

    /*
     * Record it, so a comped membership is not mistaken for a sale.
     *
     * Only when the profile belongs to a real account: subscription.user_id
     * references auth.users, and an unclaimed listing has no user to record
     * against. The feature is still granted either way.
     */
    if (target.user_id) {
      if (on) {
        await admin.from("subscription").insert({
          user_id: target.user_id,
          plan: kind === "premium" ? "premium_portfolio"
              : kind === "featured" ? "featured_listing"
              : "gallery_partnership",
          status: "active",
          stripe_session_id: `comp_${kind}_${profile_id}_${Date.now()}`,
          stripe_customer_id: "",
          expires_at: new Date(Date.now() + 365 * 86_400_000).toISOString(),
        });
      } else {
        await admin.from("subscription")
          .update({ status: "cancelled" })
          .eq("user_id", target.user_id)
          .like("stripe_session_id", "comp_%");
      }
    }

    console.log(`Admin ${me.email} ${on ? "granted" : "revoked"} ${kind} for ${target.display_name}`);
    return json({ ok: true, kind, granted: on, profile: target.display_name });
  } catch (err) {
    console.error("grantMembership failed:", err);
    return json({ error: String(err?.message ?? err) }, 500);
  }
});
