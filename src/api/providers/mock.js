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

let db = loadDb();

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

/* ---------------------------------------------------------------- entities */

function table(name) {
  if (!db[name]) db[name] = [];
  return db[name];
}

function entity(name) {
  return {
    async list(sort, limit) {
      await wait();
      const rows = sortRows(table(name), sort);
      return clone(limit ? rows.slice(0, limit) : rows);
    },

    async filter(where, sort, limit) {
      await wait();
      const rows = sortRows(
        table(name).filter((r) => matches(r, where)),
        sort
      );
      return clone(limit ? rows.slice(0, limit) : rows);
    },

    async get(id) {
      await wait();
      const row = table(name).find((r) => r.id === id);
      if (!row) {
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
      rows[i] = {
        ...rows[i],
        ...clone(payload),
        updated_date: new Date().toISOString(),
      };
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