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

const hasSupabaseCredentials =
  !!import.meta.env.VITE_SUPABASE_URL && !!import.meta.env.VITE_SUPABASE_ANON_KEY;

const forceMock = String(import.meta.env.VITE_USE_MOCK ?? "") === "true";

const provider = hasSupabaseCredentials && !forceMock ? supabaseProvider : mockProvider;

export const base44 = {
  entities: provider.entities,
  auth: provider.auth,
  integrations: provider.integrations,
  functions: provider.functions,
};

/** "supabase" or "mock". DemoBanner keys off this and hides itself on Supabase. */
export const BACKEND = provider.BACKEND;
