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
        async create(...args) {
          const row = await entity.create(...args);
          bumpDataRevision();
          return row;
        },
        async update(...args) {
          const row = await entity.update(...args);
          bumpDataRevision();
          return row;
        },
        async delete(...args) {
          const result = await entity.delete(...args);
          bumpDataRevision();
          return result;
        },
      },
    ])
  );
}

export const base44 = {
  entities: announceWrites(provider.entities),
  auth: provider.auth,
  integrations: provider.integrations,
  functions: provider.functions,
};

/** "supabase" or "mock". DemoBanner keys off this and hides itself on Supabase. */
export const BACKEND = provider.BACKEND;
