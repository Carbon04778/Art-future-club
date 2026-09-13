/**
 * Data layer facade — the single point every page talks to.
 *
 * The backend is chosen AUTOMATICALLY:
 *
 *   .env has VITE_SUPABASE_URL + VITE_SUPABASE_ANON_KEY  ->  Supabase (real data)
 *   neither is set                                        ->  demo data
 *
 * That means no line ever needs commenting in or out. A developer who clones
 * this repo without credentials gets a working demo; your machine and Netlify,
 * which do have the variables, get the real database.
 *
 * To force the demo even with credentials present, set VITE_USE_MOCK=true.
 */

import * as mockProvider from "@/api/providers/mock";
import * as supabaseProvider from "@/api/providers/supabase";
import { bumpDataRevision } from "@/lib/dataRevision";
import {
  cachedRead,
  cacheKey,
  invalidateEntityCache,
  setEntityCacheEnabled,
} from "@/lib/entityCache";

const hasSupabaseCredentials =
  !!import.meta.env.VITE_SUPABASE_URL && !!import.meta.env.VITE_SUPABASE_ANON_KEY;

const forceMock = String(import.meta.env.VITE_USE_MOCK ?? "") === "true";

const provider = hasSupabaseCredentials && !forceMock ? supabaseProvider : mockProvider;

/**
 * Announce every write, in one place.
 *
 * Pages hold their data in useState and never revalidate, so anything saved
 * elsewhere stayed invisible until the browser was reloaded. Wrapping the
 * three mutating methods here means a page only has to observe
 * useDataRevision() — no call site has to remember to announce anything, and
 * neither provider needs to know this exists.
 *
 * The wrapper is deliberately transparent: it returns exactly what the
 * provider returned, so the documented contract (create resolves to the
 * created row including its id, delete resolves to { id }) is untouched. The
 * bump happens only after the write actually succeeds — a rejected write has
 * changed nothing and must not trigger a refetch.
 */
function announceWrites(entities) {
  return Object.fromEntries(
    Object.entries(entities).map(([name, entity]) => [
      name,
      {
        ...entity,

        /*
         * Cached reads. `list` and `filter` only — not `get`.
         *
         * `get` is documented to REJECT when a row is missing, and ArticleReader
         * plus every detail page depend on that. Caching it would mean deciding
         * whether to cache a rejection, which is a good way to make a page say
         * "not available" for a record that exists. The cost is in the lists
         * anyway: one of them is half a megabyte.
         */
        list(...args) {
          return cachedRead(cacheKey(name, "list", args), () => entity.list(...args));
        },
        filter(...args) {
          return cachedRead(cacheKey(name, "filter", args), () => entity.filter(...args));
        },

        async create(...args) {
          const row = await entity.create(...args);
          invalidateEntityCache();
          bumpDataRevision();
          return row;
        },
        async update(...args) {
          const row = await entity.update(...args);
          invalidateEntityCache();
          bumpDataRevision();
          return row;
        },
        async delete(...args) {
          const result = await entity.delete(...args);
          invalidateEntityCache();
          bumpDataRevision();
          return result;
        },
      },
    ])
  );
}

/**
 * Clear cached reads whenever the signed-in identity changes.
 *
 * This is a CORRECTNESS requirement, not a tidiness one. Row visibility depends
 * on who is asking — an unapproved profile is returned to its owner and to an
 * admin, and to nobody else. A list cached while an admin was signed in must
 * never be handed to the next person to use that browser.
 *
 * Cleared BEFORE the call runs, because logout navigates away and may not
 * return. Clearing early is always safe; the cache only ever loses data.
 */
function clearCacheOnIdentityChange(auth) {
  const IDENTITY_CHANGING = [
    "loginViaEmailPassword",
    "loginWithProvider",
    "register",
    "verifyOtp",
    "logout",
    "setToken",
    "resetPassword",
  ];

  const wrapped = { ...auth };
  for (const method of IDENTITY_CHANGING) {
    if (typeof auth[method] !== "function") continue;
    wrapped[method] = (...args) => {
      invalidateEntityCache();
      return auth[method](...args);
    };
  }

  /*
   * Belt and braces for the transitions no explicit call covers — a token
   * refresh, or another tab signing out. Subscribing here rather than relying
   * on the app to do it, because the guarantee above has to hold whether or not
   * any component happens to be listening.
   */
  if (typeof auth.onAuthStateChange === "function") {
    try {
      auth.onAuthStateChange(() => invalidateEntityCache());
    } catch {
      /* a provider that cannot subscribe still has the explicit wrappers */
    }
  }

  return wrapped;
}

/*
 * The verify suite creates fixtures through the provider directly and then
 * renders pages through this facade, so a cache between the two would make
 * those 700-odd checks depend on timing. Off under `--mode test`; the dedicated
 * cache test turns it on itself.
 */
setEntityCacheEnabled(import.meta.env.MODE !== "test");

export const base44 = {
  entities: announceWrites(provider.entities),
  auth: clearCacheOnIdentityChange(provider.auth),
  integrations: provider.integrations,
  functions: provider.functions,
};

/** "supabase" or "mock". DemoBanner keys off this and hides itself on Supabase. */
export const BACKEND = provider.BACKEND;
