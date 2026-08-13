/**
 * SUPABASE PROVIDER — production backend.
 *
 * Implements exactly the same contract as providers/mock.js, so switching
 * between them is a one-line change in src/api/base44Client.js and no page or
 * component needs to change.
 *
 * CONTRACT (components depend on all four — do not "improve" them):
 *   1. list/filter resolve to a BARE ARRAY, never { data }
 *   2. create resolves to the created row INCLUDING its generated id
 *   3. get REJECTS when the row is missing (ArticleReader relies on this to
 *      fall through from an id lookup to a slug lookup)
 *   4. UploadFile resolves to { file_url }
 */

import { createClient } from "@supabase/supabase-js";

const url = import.meta.env.VITE_SUPABASE_URL;
const anonKey = import.meta.env.VITE_SUPABASE_ANON_KEY;

// This module is always imported so the facade can choose between backends at
// runtime. It must therefore NOT throw when credentials are absent — in that
// case the facade selects the demo provider and nothing here is ever called.
export const supabase = url && anonKey
  ? createClient(url, anonKey, {
      auth: {
        persistSession: true,
        autoRefreshToken: true,
        detectSessionInUrl: true,
      },
    })
  : null;

function client() {
  if (!supabase) {
    throw new Error(
      "Supabase is not configured. Set VITE_SUPABASE_URL and " +
        "VITE_SUPABASE_ANON_KEY in .env (see .env.example)."
    );
  }
  return supabase;
}

/* ------------------------------------------------- entity name -> table name */

const TABLES = {
  Article: "article",
  ArtistProfile: "artist_profile",
  CollectedWork: "collected_work",
  CollectorProfile: "collector_profile",
  Comment: "comment",
  Event: "event",
  Follow: "follow",
  ForumPost: "forum_post",
  ForumReply: "forum_reply",
  GalleryWork: "gallery_work",
  Inquiry: "inquiry",
  Like: "like",
  Message: "message",
  NewsletterSubscriber: "newsletter_subscriber",
  Notification: "notification",
  OpenCall: "open_call",
  Subscription: "subscription",
  // Roles live on profiles; the admin members panel reads and updates them.
  Profile: "profiles",
};

/* ------------------------------------------------------------ query helpers */

/**
 * Sort strings are Base44-style: "-created_date" descending, "start_date"
 * ascending. nullsFirst:false keeps rows with a null sort key at the end,
 * matching how the demo provider and the original backend ordered them.
 */
function applySort(query, sort) {
  if (!sort) return query;
  const desc = sort.startsWith("-");
  const column = desc ? sort.slice(1) : sort;
  return query.order(column, { ascending: !desc, nullsFirst: false });
}

/**
 * The whole filter language the app uses: equality, plus { $in: [...] }.
 * ($ne is supported too, for parity with the demo provider.)
 */
function applyWhere(query, where = {}) {
  for (const [column, condition] of Object.entries(where)) {
    if (condition && typeof condition === "object" && !Array.isArray(condition)) {
      if ("$in" in condition) {
        query = query.in(column, condition.$in);
        continue;
      }
      if ("$ne" in condition) {
        query = query.neq(column, condition.$ne);
        continue;
      }
    }
    query = condition === null ? query.is(column, null) : query.eq(column, condition);
  }
  return query;
}

function fail(error, context) {
  const err = new Error(error?.message || `${context} failed`);
  err.status = error?.code === "PGRST116" ? 404 : error?.status;
  err.cause = error;
  throw err;
}

/* ----------------------------------------------------------------- entities */

function entity(name) {
  const table = TABLES[name];

  return {
    async list(sort, limit) {
      let q = applySort(client().from(table).select("*"), sort);
      if (limit) q = q.limit(limit);
      const { data, error } = await q;
      if (error) fail(error, `${name}.list`);
      return data ?? [];
    },

    async filter(where, sort, limit) {
      let q = applySort(applyWhere(client().from(table).select("*"), where), sort);
      if (limit) q = q.limit(limit);
      const { data, error } = await q;
      if (error) fail(error, `${name}.filter`);
      return data ?? [];
    },

    async get(id) {
      const { data, error } = await supabase
        .from(table)
        .select("*")
        .eq("id", id)
        .single();
      // .single() errors when zero rows match — which is the behaviour
      // ArticleReader depends on. Do not soften this to return null.
      if (error) fail(error, `${name}.get`);
      return data;
    },

    async create(payload) {
      const { data, error } = await supabase
        .from(table)
        .insert(payload)
        .select()
        .single();
      if (error) fail(error, `${name}.create`);
      return data;
    },

    async update(id, payload) {
      const { data, error } = await supabase
        .from(table)
        .update(payload)
        .eq("id", id)
        .select()
        .single();
      if (error) fail(error, `${name}.update`);
      return data;
    },

    async delete(id) {
      const { error } = await client().from(table).delete().eq("id", id);
      if (error) fail(error, `${name}.delete`);
      return { id };
    },
  };
}

export const entities = Object.fromEntries(
  Object.keys(TABLES).map((n) => [n, entity(n)])
);

/* --------------------------------------------------------------------- auth */

/**
 * The app expects { id, email, full_name, role }. Supabase's auth.users has
 * only id and email, so full_name and role come from the profiles table.
 */
async function currentUser() {
  const {
    data: { user },
  } = await client().auth.getUser();
  if (!user) {
    const err = new Error("Not authenticated");
    err.status = 401;
    throw err;
  }

  const { data: profile } = await supabase
    .from("profiles")
    .select("full_name, role")
    .eq("id", user.id)
    .maybeSingle();

  return {
    id: user.id,
    email: user.email,
    full_name: profile?.full_name || user.email?.split("@")[0] || "",
    // Never trust a client-side default here: the real gate is RLS +
    // trg_protect_role in the database. This value only drives UI visibility.
    role: profile?.role || "user",
  };
}

export const auth = {
  me: currentUser,

  /**
   * Subscribe to auth events. ResetPassword uses this to know when the client
   * has finished turning a recovery link into a session — the URL fragment is
   * consumed and cleared before React renders, so it cannot be read directly.
   */
  onAuthStateChange(callback) {
    return client().auth.onAuthStateChange((event) => callback(event));
  },

  async isAuthenticated() {
    const {
      data: { session },
    } = await client().auth.getSession();
    return !!session;
  },

  async loginViaEmailPassword(email, password) {
    const { data, error } = await client().auth.signInWithPassword({ email, password });
    if (error) throw new Error(error.message);
    return { access_token: data.session?.access_token, user: await currentUser() };
  },

  async register({ email, password, full_name }) {
    const { data, error } = await client().auth.signUp({
      email,
      password,
      options: { data: { full_name: full_name || "" } },
    });
    if (error) throw new Error(error.message);

    // When "Confirm email" is OFF in the Supabase dashboard, signUp returns a
    // session immediately and there is no code to enter. When it is ON, there
    // is no session yet and the user must supply the emailed token. Reporting
    // which happened lets the UI adapt without a code change either way.
    return { ok: true, needsVerification: !data.session };
  },

  /**
   * Requires one dashboard change: set the "Confirm signup" email template to
   * use {{ .Token }} instead of {{ .ConfirmationURL }}, so users receive a
   * 6-digit code. That matches the existing Register.jsx UI exactly.
   */
  async verifyOtp({ email, otpCode }) {
    const { data, error } = await client().auth.verifyOtp({
      email,
      token: String(otpCode),
      type: "signup",
    });
    if (error) throw new Error(error.message);
    return { access_token: data.session?.access_token, user: await currentUser() };
  },

  async resendOtp(email) {
    const { error } = await client().auth.resend({ type: "signup", email });
    if (error) throw new Error(error.message);
    return { ok: true };
  },

  async resetPasswordRequest(email) {
    const { error } = await client().auth.resetPasswordForEmail(email, {
      redirectTo: `${window.location.origin}/reset-password`,
    });
    if (error) throw new Error(error.message);
    return { ok: true };
  },

  /**
   * Supabase delivers a recovery session via the URL fragment, which the
   * client picks up automatically (detectSessionInUrl). By the time the user
   * reaches this form they are already in a recovery session, so the reset is
   * simply an update to the password.
   */
  async resetPassword({ newPassword }) {
    const { error } = await client().auth.updateUser({ password: newPassword });
    if (error) throw new Error(error.message);
    return { ok: true };
  },

  setToken() {
    /* handled by the Supabase client's own session persistence */
  },

  async loginWithProvider(provider = "google", redirectTo = "/") {
    const { error } = await client().auth.signInWithOAuth({
      provider,
      options: { redirectTo: `${window.location.origin}${redirectTo}` },
    });
    if (error) throw new Error(error.message);
  },

  async logout(redirectTo) {
    await client().auth.signOut();
    if (typeof window !== "undefined") {
      window.location.href =
        typeof redirectTo === "string" && redirectTo.startsWith("/") ? redirectTo : "/";
    }
  },

  redirectToLogin() {
    if (typeof window !== "undefined") window.location.href = "/login";
  },
};

/* ------------------------------------------------------------- integrations */

const BUCKET = "uploads";
const MAX_EDGE = 2000; // px on the long side
const QUALITY = 0.82;

/**
 * Downscale and re-encode before upload.
 *
 * This is not a nicety. Supabase's free tier allows 1 GB of storage and 5 GB
 * of egress per month; unmodified phone photos and artwork scans run 3-5 MB
 * each, which exhausts both within weeks. Capping the long edge at 2000px and
 * re-encoding to WebP typically cuts size 8-15x with no visible loss at web
 * display sizes. It also markedly improves page load.
 */
async function compressImage(file) {
  if (!file.type?.startsWith("image/") || file.type === "image/gif") return file;

  try {
    const bitmap = await createImageBitmap(file);
    const scale = Math.min(1, MAX_EDGE / Math.max(bitmap.width, bitmap.height));
    if (scale === 1 && file.size < 400_000) return file;

    const canvas = document.createElement("canvas");
    canvas.width = Math.round(bitmap.width * scale);
    canvas.height = Math.round(bitmap.height * scale);
    canvas.getContext("2d").drawImage(bitmap, 0, 0, canvas.width, canvas.height);

    const blob = await new Promise((resolve) =>
      canvas.toBlob(resolve, "image/webp", QUALITY)
    );
    if (!blob || blob.size >= file.size) return file;

    return new File([blob], file.name.replace(/\.\w+$/, "") + ".webp", {
      type: "image/webp",
    });
  } catch {
    return file; // never block an upload because compression failed
  }
}

async function UploadFile({ file }) {
  if (!file) throw new Error("No file provided");

  const optimised = await compressImage(file);
  const {
    data: { user },
  } = await client().auth.getUser();

  const safeName = optimised.name.replace(/[^\w.\-]/g, "_");
  const path = `${user?.id ?? "public"}/${crypto.randomUUID()}-${safeName}`;

  const { error } = await supabase.storage
    .from(BUCKET)
    .upload(path, optimised, { cacheControl: "31536000", upsert: false });
  if (error) throw new Error(error.message);

  const { data } = client().storage.from(BUCKET).getPublicUrl(path);
  return { file_url: data.publicUrl };
}

async function InvokeLLM() {
  // Deliberately not wired up. Its only caller generated a "thanks, we'll be
  // in touch" acknowledgement, which a transactional email does better and
  // without putting an LLM key in the infrastructure.
  return {
    text: "Thank you for your enquiry. The AFC team will be in touch within 3 business days.",
  };
}

export const integrations = { Core: { UploadFile, InvokeLLM } };

/* ---------------------------------------------------------------- functions */

/**
 * Geocoding without a deployed Edge Function.
 *
 * OpenStreetMap's Nominatim allows cross-origin browser requests, so address
 * lookup can work straight from the page. This keeps "Locate address" working
 * before anyone installs the Supabase CLI, and stays as a fallback afterwards.
 *
 * Nominatim's usage policy allows roughly one request per second, which suits
 * a human typing an address into a form.
 */
async function geocodeInBrowser({ address }) {
  if (!address) throw new Error("Address is required");

  const url = new URL("https://nominatim.openstreetmap.org/search");
  url.searchParams.set("q", address);
  url.searchParams.set("format", "json");
  url.searchParams.set("limit", "1");
  url.searchParams.set("addressdetails", "1");

  const res = await fetch(url, { headers: { Accept: "application/json" } });
  if (!res.ok) throw new Error(`Address lookup failed (${res.status})`);

  const [hit] = await res.json();
  if (!hit) throw new Error("Address not found. Try a simpler address.");

  const a = hit.address ?? {};
  return {
    lat: parseFloat(hit.lat),
    lng: parseFloat(hit.lon),
    placename:
      a.suburb || a.neighbourhood || a.city_district || a.city || a.town || address,
    region: [a.city || a.town || a.state, a.country].filter(Boolean).join(", "),
    display_name: hit.display_name,
  };
}

async function invoke(name, payload) {
  const body = payload || {};
  try {
    const { data, error } = await client().functions.invoke(name, { body });

    // supabase-js reports any non-2xx as a generic "non-2xx status code" and
    // discards the body, so the function's own explanation is lost. Read it
    // off the FunctionsHttpError context instead.
    if (error) {
      let detail = "";
      try {
        const res = error?.context;
        if (res && typeof res.json === "function") {
          const parsed = await res.json();
          detail = parsed?.error || parsed?.message || "";
        }
      } catch {
        /* body was not JSON */
      }
      throw new Error(detail || error.message);
    }

    if (data) return data;
    throw new Error("Empty response");
  } catch (err) {
    // The Edge Functions are an optional deployment step. Geocoding has a
    // browser-side equivalent, so fall back rather than failing the feature.
    if (name === "geocodeAddress") return geocodeInBrowser(body);
    throw err;
  }
}

export const functions = { invoke };

export const BACKEND = "supabase";