/**
 * MOCK PROVIDER — demo / preview backend.
 *
 * Implements the exact same contract as the future Supabase provider so the
 * rest of the app never knows which one is running. Data lives in memory and
 * is mirrored to localStorage, so edits made during a demo survive a refresh.
 *
 * Swap it out by changing ONE line in src/api/base44Client.js.
 *
 * Contract notes (these matter — components depend on them):
 *   - list/filter resolve to a BARE ARRAY, not { data }
 *   - create resolves to the created row INCLUDING its generated id
 *   - get REJECTS when the row is missing (ArticleReader relies on this)
 */

import { SEED } from "../seed/index.js";
import {
  STATUS,
  effectiveStatus,
  isModeratedCollectorType,
} from "../../lib/profileReadiness.js";
// Relative, not "@/lib/slugs" — verify-provider.mjs loads this file under plain
// Node, where the Vite alias does not exist.
import { slugify } from "../../lib/slugs.js";

const STORAGE_KEY = "afc_mock_db_v1";
const SESSION_KEY = "afc_mock_session_v1";
const LATENCY_MS = 120; // keeps loading states visible & honest

const clone = (v) => JSON.parse(JSON.stringify(v));
const wait = (ms = LATENCY_MS) => new Promise((r) => setTimeout(r, ms));
const uid = () =>
  `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 10)}`;

/* ------------------------------------------------------------------ store */

function loadDb() {
  if (typeof window === "undefined") return clone(SEED);
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (raw) {
      const parsed = JSON.parse(raw);
      // Backfill any table added to the seed after this browser cached the db.
      for (const table of Object.keys(SEED)) {
        if (!Array.isArray(parsed[table])) parsed[table] = clone(SEED[table]);
      }
      return parsed;
    }
  } catch {
    /* corrupt cache — fall through to a clean seed */
  }
  return clone(SEED);
}

/* ------------------------------------------------------------------ slugs */

/**
 * Which field each sluggable table derives its url from.
 *
 * Mirrors the triggers in migration 019. Keys are ENTITY names, which is what
 * this provider uses as its table keys.
 */
const SLUG_SOURCE = {
  ArtistProfile: "display_name",
  CollectorProfile: "display_name",
  Event: "title",
};

/**
 * Give a row a unique slug, exactly as public.set_slug() does.
 *
 * Two behaviours are worth spelling out because they look like bugs:
 *
 *   - A row whose name yields no slug at all falls back to its id. One real
 *     event is titled entirely in Chinese and has no Latin slug; an empty url
 *     segment would be worse than a UUID.
 *   - A RENAME DOES NOT CHANGE THE SLUG. The database trigger fires on an
 *     update of display_name, but at that point the row still carries its old
 *     slug, so the trigger re-slugifies that and returns — it never looks at
 *     the new name. That is the right behaviour: a published url that silently
 *     changed when someone fixed a typo would break every existing link and
 *     every search result. Mirrored here so the demo behaves the same way.
 */
function ensureSlug(name, row, rows) {
  const field = SLUG_SOURCE[name];
  if (!field) return;
  if (row.slug) return;

  const base = slugify(row[field]);
  if (!base) {
    row.slug = String(row.id);
    return;
  }
  let candidate = base;
  let n = 1;
  while (rows.some((r) => r.id !== row.id && r.slug === candidate)) {
    n += 1;
    candidate = `${base}-${n}`;
  }
  row.slug = candidate;
}

/**
 * Backfill slugs across the seed, the same way migration 019 does.
 *
 * Ordered by created_date then id so the numbering of a duplicate name is
 * stable between runs rather than depending on object iteration order.
 */
function backfillSlugs(database) {
  for (const name of Object.keys(SLUG_SOURCE)) {
    const rows = database[name];
    if (!Array.isArray(rows)) continue;
    const ordered = [...rows].sort((a, b) =>
      String(a.created_date || "").localeCompare(String(b.created_date || "")) ||
      String(a.id).localeCompare(String(b.id))
    );
    for (const row of ordered) ensureSlug(name, row, rows);
  }
  return database;
}

let db = backfillSlugs(loadDb());

function persist() {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(db));
  } catch {
    /* quota or private mode — demo still works from memory */
  }
}

export function resetMockData() {
  db = clone(SEED);
  persist();
  if (typeof window !== "undefined") window.localStorage.removeItem(SESSION_KEY);
}

/* ------------------------------------------------------------- query bits */

function matches(row, where = {}) {
  return Object.entries(where).every(([key, cond]) => {
    const value = row[key];
    if (cond && typeof cond === "object" && !Array.isArray(cond)) {
      if ("$in" in cond) return cond.$in.includes(value);
      if ("$ne" in cond) return value !== cond.$ne;
    }
    return value === cond;
  });
}

function sortRows(rows, sort) {
  if (!sort) return rows;
  const desc = sort.startsWith("-");
  const key = desc ? sort.slice(1) : sort;
  return [...rows].sort((a, b) => {
    const av = a[key];
    const bv = b[key];
    if (av == null && bv == null) return 0;
    if (av == null) return 1;
    if (bv == null) return -1;
    const cmp = av > bv ? 1 : av < bv ? -1 : 0;
    return desc ? -cmp : cmp;
  });
}

/* -------------------------------------------------------------- moderation */

/**
 * Mirror of the RLS read policies in migration 017, so the demo build hides
 * exactly what the real database hides.
 *
 * Without this the preview would show unapproved profiles that Supabase would
 * refuse to return, and the moderation flow could not be demonstrated or
 * tested without a live database.
 *
 * `readSession` is a hoisted function declaration further down this file.
 */
const MODERATED_ENTITIES = ["ArtistProfile", "CollectorProfile"];

function isVisible(name, row, me) {
  if (!MODERATED_ENTITIES.includes(name)) return true;
  if (effectiveStatus(row) === STATUS.APPROVED) return true;
  // Private collectors, curators and advisors are not moderated — only the
  // spaces that publish a public page.
  if (name === "CollectorProfile" && !isModeratedCollectorType(row.type)) return true;
  if (me?.role === "admin") return true;
  return !!me && !!row.user_id && row.user_id === me.id;
}

function visible(name, rows) {
  if (!MODERATED_ENTITIES.includes(name)) return rows;
  const me = readSession();
  return rows.filter((r) => isVisible(name, r, me));
}

/**
 * Mirror of trg_protect_profile_status in migration 017.
 *
 * Without this the demo would happily let a member set their own profile to
 * "approved", so the flow could appear to work here and then be refused by the
 * real database — the worst kind of difference between the two providers.
 *
 * `prev` is null on insert.
 */
function guardStatusWrite(name, prev, next) {
  if (!MODERATED_ENTITIES.includes(name)) return;
  const me = readSession();
  if (me?.role === "admin") return;

  if (!prev) {
    if (next.status && ![STATUS.DRAFT, STATUS.PENDING].includes(next.status)) {
      throw new Error(
        "A new profile starts as a draft and must be approved before it is published."
      );
    }
    return;
  }

  const from = effectiveStatus(prev);
  const to = next.status ?? from;
  if (to === from) return;
  // The one transition a member may make for themselves.
  if (to === STATUS.PENDING && [STATUS.DRAFT, STATUS.REJECTED].includes(from)) return;

  throw new Error("Only an administrator can change a profile's review status.");
}

/**
 * Return only the requested columns, mirroring PostgREST's `select`.
 *
 * The demo provider projects for real rather than ignoring the argument. If it
 * returned every column regardless, a component reading a field that the live
 * query no longer asks for would work perfectly in the preview build and come
 * back undefined in production — the worst kind of difference between the two
 * providers, because it looks like nothing is wrong.
 */
function project(rows, columns) {
  if (!columns || columns === "*") return rows;
  const keys = columns.split(",").map((c) => c.trim()).filter(Boolean);
  return rows.map((row) =>
    Object.fromEntries(keys.filter((k) => k in row).map((k) => [k, row[k]]))
  );
}

/* ---------------------------------------------------------------- entities */

function table(name) {
  if (!db[name]) db[name] = [];
  return db[name];
}

function entity(name) {
  return {
    async list(sort, limit, columns) {
      await wait();
      // Visibility is applied BEFORE the limit, or a page of 10 could come
      // back part-empty because unapproved rows used up the allowance.
      const rows = sortRows(visible(name, table(name)), sort);
      return project(clone(limit ? rows.slice(0, limit) : rows), columns);
    },

    async filter(where, sort, limit, columns) {
      await wait();
      const rows = sortRows(
        visible(name, table(name)).filter((r) => matches(r, where)),
        sort
      );
      return project(clone(limit ? rows.slice(0, limit) : rows), columns);
    },

    async get(id) {
      await wait();
      const row = table(name).find((r) => r.id === id);
      // An unapproved profile behaves as though it does not exist, which is
      // what RLS does — it returns no row rather than a permission error.
      if (!row || !isVisible(name, row, readSession())) {
        const err = new Error(`${name} ${id} not found`);
        err.status = 404;
        throw err; // ArticleReader depends on this rejecting
      }
      return clone(row);
    },

    async create(payload) {
      await wait();
      const now = new Date().toISOString();
      const row = {
        id: uid(),
        created_date: now,
        updated_date: now,
        ...clone(payload),
      };
      // Stands in for `alter column status set default 'draft'` in migration
      // 017. Without it a profile created here would have no status, be read
      // as grandfathered-approved, and go live immediately — the exact thing
      // this feature exists to prevent.
      if (MODERATED_ENTITIES.includes(name) && !row.status) {
        row.status = STATUS.DRAFT;
      }
      guardStatusWrite(name, null, row);
      // Stands in for the BEFORE INSERT triggers in migration 019, so a row
      // created here comes back with its slug the way Supabase returns it.
      ensureSlug(name, row, table(name));
      table(name).push(row);
      persist();
      return clone(row);
    },

    async update(id, payload) {
      await wait();
      const rows = table(name);
      const i = rows.findIndex((r) => r.id === id);
      if (i === -1) {
        const err = new Error(`${name} ${id} not found`);
        err.status = 404;
        throw err;
      }
      const next = {
        ...rows[i],
        ...clone(payload),
        updated_date: new Date().toISOString(),
      };
      guardStatusWrite(name, rows[i], next);
      /*
       * Only regenerate when the slug was explicitly cleared — which is how the
       * database trigger behaves, and how an admin asks for a new url. A plain
       * rename deliberately keeps the existing slug so published links survive.
       */
      if (SLUG_SOURCE[name] && !next.slug) ensureSlug(name, next, rows);
      rows[i] = next;
      persist();
      return clone(rows[i]);
    },

    async delete(id) {
      await wait();
      const rows = table(name);
      const i = rows.findIndex((r) => r.id === id);
      if (i !== -1) rows.splice(i, 1);
      persist();
      return { id };
    },
  };
}

export const ENTITY_NAMES = [
  "Article",
  "ArtistProfile",
  "CollectedWork",
  "CollectorProfile",
  "Comment",
  "Event",
  "Follow",
  "ForumPost",
  "ForumReply",
  "GalleryWork",
  "Inquiry",
  "Like",
  "Message",
  "NewsletterSubscriber",
  "Notification",
  "OpenCall",
  "Subscription",
  // Read-state for derived notifications — see migration 018.
  "NotificationRead",
  "Profile",
];

export const entities = Object.fromEntries(
  ENTITY_NAMES.map((n) => [n, entity(n)])
);

/* -------------------------------------------------------------------- auth */

/**
 * Demo auth. Any email + any password (6+ chars) signs you in.
 * An address starting with "admin" gets the admin role so the client can see
 * the Admin Dashboard and the editorial "New Article" controls.
 */
function readSession() {
  if (typeof window === "undefined") return null;
  try {
    const raw = window.localStorage.getItem(SESSION_KEY);
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}

function writeSession(user) {
  if (typeof window === "undefined") return;
  if (user) window.localStorage.setItem(SESSION_KEY, JSON.stringify(user));
  else window.localStorage.removeItem(SESSION_KEY);
}

function userFromEmail(email) {
  const handle = String(email).split("@")[0] || "member";
  const pretty = handle
    .replace(/[._-]+/g, " ")
    .replace(/\b\w/g, (c) => c.toUpperCase());
  return {
    id: `user_${handle.toLowerCase()}`,
    email,
    full_name: pretty,
    role: /^admin/i.test(handle) ? "admin" : "user",
  };
}

export const auth = {
  async me() {
    await wait(60);
    const user = readSession();
    if (!user) {
      const err = new Error("Not authenticated");
      err.status = 401;
      throw err;
    }
    return clone(user);
  },

  async claimMyProfile() {
    // The demo provider has no pre-made profiles to claim.
    return [];
  },

  onAuthStateChange() {
    // No live session events in the demo provider; return the same shape the
    // Supabase client returns so callers can unsubscribe unconditionally.
    return { data: { subscription: { unsubscribe() {} } } };
  },

  async isAuthenticated() {
    return !!readSession();
  },

  async loginViaEmailPassword(email, password) {
    await wait(300);
    if (!email || !password || password.length < 6) {
      throw new Error("Enter any email and a password of 6+ characters.");
    }
    const user = userFromEmail(email);
    writeSession(user);
    return { access_token: "demo-token", user: clone(user) };
  },

  async register({ email, password }) {
    await wait(300);
    if (!email || !password || password.length < 6) {
      throw new Error("Enter any email and a password of 6+ characters.");
    }
    if (typeof window !== "undefined") {
      window.localStorage.setItem("afc_mock_pending_email", email);
    }
    return { ok: true, needsVerification: true };
  },

  async verifyOtp({ email, otpCode }) {
    await wait(300);
    if (String(otpCode).replace(/\D/g, "").length < 4) {
      throw new Error("Demo mode: enter any 4+ digit code.");
    }
    const user = userFromEmail(email);
    writeSession(user);
    return { access_token: "demo-token", user: clone(user) };
  },

  async resendOtp() {
    await wait(200);
    return { ok: true };
  },

  async resetPasswordRequest() {
    await wait(300);
    return { ok: true };
  },

  async resetPassword() {
    await wait(300);
    return { ok: true };
  },

  setToken() {
    /* the demo session is already persisted by login/verifyOtp */
  },

  loginWithProvider() {
    throw new Error(
      "Google sign-in is not available in the demo build. Use any email and password."
    );
  },

  logout(redirectTo) {
    writeSession(null);
    if (typeof window !== "undefined") {
      window.location.href =
        typeof redirectTo === "string" && redirectTo.startsWith("/")
          ? redirectTo
          : "/";
    }
  },

  redirectToLogin() {
    if (typeof window !== "undefined") window.location.href = "/login";
  },
};

/* ------------------------------------------------------------ integrations */

/**
 * Demo upload. Reads the file into a data URL so previews genuinely work
 * without any storage backend. Returns { file_url } — the exact shape all
 * ten call sites expect.
 */
async function UploadFile({ file }) {
  await wait(400);
  if (!file) throw new Error("No file provided");
  const file_url = await new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result);
    reader.onerror = () => reject(new Error("Could not read file"));
    reader.readAsDataURL(file);
  });
  return { file_url };
}

async function InvokeLLM() {
  await wait(400);
  return {
    text: "Thank you for your enquiry. The AFC team will be in touch within 3 business days.",
  };
}

export const integrations = { Core: { UploadFile, InvokeLLM } };

/* ---------------------------------------------------------------- functions */

const FUNCTIONS = {
  async geocodeAddress({ address }) {
    await wait(300);
    // Deterministic pseudo-coords so map pins land somewhere plausible.
    let h = 0;
    for (const ch of String(address)) h = (h * 31 + ch.charCodeAt(0)) % 100000;
    return {
      lat: 22 + (h % 4000) / 100 - 20,
      lng: 114 + (h % 7000) / 100 - 35,
      placename: address,
      region: "Demo Region",
    };
  },

  async createCheckout() {
    await wait(400);
    throw new Error(
      "Payments are disabled in the demo build. Stripe is connected in the production environment."
    );
  },
};

async function invoke(name, payload) {
  const fn = FUNCTIONS[name];
  if (!fn) throw new Error(`Unknown function: ${name}`);
  return fn(payload || {});
}

export const functions = { invoke };

export const BACKEND = "mock";