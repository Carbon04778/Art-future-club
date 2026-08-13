/**
 * Verifies the Supabase provider translates the app's calls into the correct
 * supabase-js query chains, and honours the same response contract as the
 * demo provider.
 *
 * Uses a recording stub instead of a live database, so it runs in CI with no
 * credentials. Run: npm run verify:supabase
 */

import { readFileSync, writeFileSync, mkdirSync, rmSync } from "node:fs";

const calls = [];
let nextResult = { data: [], error: null };

/* ------------------------------------------- recording supabase-js stub ---- */

function makeQuery(table) {
  const chain = { table, ops: [] };
  const q = {
    select(cols) { chain.ops.push(["select", cols]); return q; },
    eq(c, v)     { chain.ops.push(["eq", c, v]);     return q; },
    neq(c, v)    { chain.ops.push(["neq", c, v]);    return q; },
    is(c, v)     { chain.ops.push(["is", c, v]);     return q; },
    in(c, v)     { chain.ops.push(["in", c, v]);     return q; },
    order(c, o)  { chain.ops.push(["order", c, o]);  return q; },
    limit(n)     { chain.ops.push(["limit", n]);     return q; },
    insert(p)    { chain.ops.push(["insert", p]);    return q; },
    update(p)    { chain.ops.push(["update", p]);    return q; },
    delete()     { chain.ops.push(["delete"]);       return q; },
    single()     { chain.ops.push(["single"]);       return q; },
    maybeSingle(){ chain.ops.push(["maybeSingle"]);  return q; },
    then(res)    { calls.push(chain); return Promise.resolve(nextResult).then(res); },
  };
  return q;
}

const stub = {
  from(table) { return makeQuery(table); },
  auth: {
    getUser:  async () => ({ data: { user: { id: "u1", email: "a@b.c" } } }),
    getSession: async () => ({ data: { session: { access_token: "t" } } }),
    signInWithPassword: async (a) => { calls.push(["signInWithPassword", a]); return { data: { session: { access_token: "t" } }, error: null }; },
    signUp:   async (a) => { calls.push(["signUp", a]); return { data: {}, error: null }; },
    verifyOtp: async (a) => { calls.push(["verifyOtp", a]); return { data: { session: { access_token: "t" } }, error: null }; },
    resend:   async (a) => { calls.push(["resend", a]); return { error: null }; },
    resetPasswordForEmail: async (e, o) => { calls.push(["resetPasswordForEmail", e, o]); return { error: null }; },
    updateUser: async (a) => { calls.push(["updateUser", a]); return { error: null }; },
    signInWithOAuth: async (a) => { calls.push(["signInWithOAuth", a]); return { error: null }; },
    signOut:  async () => { calls.push(["signOut"]); return { error: null }; },
  },
  storage: { from: () => ({
    upload: async (p, f) => { calls.push(["upload", p, f?.name]); return { error: null }; },
    getPublicUrl: (p) => ({ data: { publicUrl: `https://cdn.test/${p}` } }),
  })},
  functions: { invoke: async (n, o) => { calls.push(["fn", n, o]); return { data: { ok: true }, error: null }; } },
};

/* --- load the provider with imports rewritten to the stub + fake env ------- */

const src = readFileSync(new URL("../src/api/providers/supabase.js", import.meta.url), "utf8")
  .replace(/import\s*{\s*createClient\s*}\s*from\s*"@supabase\/supabase-js";/, "")
  .replace(/import\.meta\.env\.VITE_SUPABASE_URL/g, '"https://test.supabase.co"')
  .replace(/import\.meta\.env\.VITE_SUPABASE_ANON_KEY/g, '"anon-test-key"')
  .replace(/export const supabase = url && anonKey[\s\S]*?: null;/, "export const supabase = globalThis.__STUB__;");

globalThis.__STUB__ = stub;
globalThis.window = { location: { origin: "https://site.test", href: "/" } };
if (!globalThis.crypto?.randomUUID) Object.defineProperty(globalThis, "crypto", { value: { randomUUID: () => "uuid" }, configurable: true });

mkdirSync(new URL("../.tmp/", import.meta.url), { recursive: true });
const tmp = new URL("../.tmp/provider-under-test.mjs", import.meta.url);
writeFileSync(tmp, src);
// Import the URL directly — .pathname yields "/C:/..." on Windows, which
// then gains a second drive letter and fails to resolve.
const { entities, auth, integrations, functions } = await import(tmp.href);

/* ------------------------------------------------------------------ checks */

let pass = 0;
const failures = [];
const check = (name, cond, detail = "") =>
  cond ? pass++ : failures.push(`${name}${detail ? ` — ${detail}` : ""}`);

const last = () => calls[calls.length - 1];
const opsOf = (c) => JSON.stringify(c.ops);

// --- table name mapping ----------------------------------------------------
nextResult = { data: [], error: null };
await entities.ArtistProfile.list();
check("ArtistProfile maps to artist_profile", last().table === "artist_profile", last().table);

await entities.ForumPost.list();
check("ForumPost maps to forum_post", last().table === "forum_post", last().table);

await entities.NewsletterSubscriber.list();
check("NewsletterSubscriber maps to newsletter_subscriber", last().table === "newsletter_subscriber", last().table);

await entities.Like.list();
check("Like maps to like", last().table === "like", last().table);

// 17 content entities + Profile (roles, read by the admin members panel).
check("all 18 entities exposed", Object.keys(entities).length === 18, String(Object.keys(entities).length));
check("Profile maps to the profiles table", (await (async () => {
  await entities.Profile.list();
  return last().table;
})()) === "profiles");

// --- sorting ---------------------------------------------------------------
await entities.Article.list("-created_date", 10);
check("descending sort -> ascending:false",
  opsOf(last()).includes('["order","created_date",{"ascending":false,"nullsFirst":false}]'), opsOf(last()));
check("limit forwarded", opsOf(last()).includes('["limit",10]'));

await entities.Event.filter({ chapter: "Hong Kong" }, "start_date", 50);
check("ascending sort -> ascending:true",
  opsOf(last()).includes('["order","start_date",{"ascending":true,"nullsFirst":false}]'));
check("equality filter -> eq()", opsOf(last()).includes('["eq","chapter","Hong Kong"]'));

// --- the $in operator (the one non-trivial query in the app) ---------------
await entities.CollectorProfile.filter(
  { type: { $in: ["Gallery", "Institution"] } }, "-updated_date", 300);
check("$in -> in()", opsOf(last()).includes('["in","type",["Gallery","Institution"]]'), opsOf(last()));

// --- multi-key filter ------------------------------------------------------
await entities.Comment.filter({ target_id: "x", target_type: "artist_profile" }, "created_date", 50);
const ops = opsOf(last());
check("multi-key filter -> chained eq()",
  ops.includes('["eq","target_id","x"]') && ops.includes('["eq","target_type","artist_profile"]'));

// --- boolean filter used by the homepage ----------------------------------
await entities.Article.filter({ published: true }, "-created_date", 200);
check("boolean filter -> eq(true)", opsOf(last()).includes('["eq","published",true]'));

// --- response contract -----------------------------------------------------
nextResult = { data: [{ id: "1" }, { id: "2" }], error: null };
const rows = await entities.Article.list();
check("list returns a BARE ARRAY", Array.isArray(rows) && rows.length === 2);

nextResult = { data: null, error: null };
const empty = await entities.Article.filter({ published: true });
check("null data coerced to []", Array.isArray(empty) && empty.length === 0);

nextResult = { data: { id: "new1", title: "T" }, error: null };
const created = await entities.ForumPost.create({ title: "T" });
check("create returns the row with id", created?.id === "new1");
check("create uses insert().select().single()",
  opsOf(last()).includes('["insert"') && opsOf(last()).includes('["single"]'));

const updated = await entities.ForumPost.update("new1", { title: "T2" });
check("update returns the row", updated?.id === "new1");
check("update scopes by id", opsOf(last()).includes('["eq","id","new1"]'));

await entities.ForumPost.delete("new1");
check("delete scopes by id",
  opsOf(last()).includes('["delete"]') && opsOf(last()).includes('["eq","id","new1"]'));

// --- get must REJECT on miss (ArticleReader depends on this) --------------
nextResult = { data: null, error: { message: "no rows", code: "PGRST116" } };
let threw = false, status;
try { await entities.Article.get("missing"); } catch (e) { threw = true; status = e.status; }
check("get REJECTS when row missing", threw);
check("get maps PGRST116 to 404", status === 404, String(status));

nextResult = { data: { id: "a1" }, error: null };
const got = await entities.Article.get("a1");
check("get returns the row when found", got?.id === "a1");
check("get uses .single()", opsOf(last()).includes('["single"]'));

// --- errors propagate ------------------------------------------------------
nextResult = { data: null, error: { message: "permission denied for table message" } };
let rlsThrew = false;
try { await entities.Message.list(); } catch { rlsThrew = true; }
check("RLS denial surfaces as a rejection", rlsThrew);

// --- auth ------------------------------------------------------------------
nextResult = { data: { full_name: "Alice A", role: "admin" }, error: null };
const me = await auth.me();
check("me() returns id/email/full_name/role",
  me.id === "u1" && me.email === "a@b.c" && me.full_name === "Alice A" && me.role === "admin",
  JSON.stringify(me));

nextResult = { data: null, error: null };
const me2 = await auth.me();
check("me() defaults role to 'user' when no profile row", me2.role === "user");
check("me() falls back to email handle for full_name", me2.full_name === "a");

await auth.loginViaEmailPassword("a@b.c", "pw");
check("login calls signInWithPassword",
  calls.some((c) => Array.isArray(c) && c[0] === "signInWithPassword"));

await auth.verifyOtp({ email: "a@b.c", otpCode: "123456" });
const otp = calls.find((c) => Array.isArray(c) && c[0] === "verifyOtp");
check("verifyOtp sends type:'signup'", otp?.[1]?.type === "signup", JSON.stringify(otp?.[1]));
check("verifyOtp coerces code to string", typeof otp?.[1]?.token === "string");

// register() must report whether an emailed code is actually required
stub.auth.signUp = async (a) => { calls.push(["signUp", a]); return { data: { session: { access_token: "t" } }, error: null }; };
const regNoConfirm = await auth.register({ email: "a@b.c", password: "pw" });
check("register reports needsVerification:false when session returned",
  regNoConfirm.needsVerification === false, JSON.stringify(regNoConfirm));

stub.auth.signUp = async (a) => { calls.push(["signUp", a]); return { data: { session: null }, error: null }; };
const regConfirm = await auth.register({ email: "a@b.c", password: "pw" });
check("register reports needsVerification:true when no session",
  regConfirm.needsVerification === true, JSON.stringify(regConfirm));

await auth.loginWithProvider("google", "/");
const oauth = calls.find((c) => Array.isArray(c) && c[0] === "signInWithOAuth");
check("OAuth uses the google provider", oauth?.[1]?.provider === "google");
check("OAuth redirect is absolute",
  oauth?.[1]?.options?.redirectTo?.startsWith("https://site.test"));

// --- upload ----------------------------------------------------------------
const uploaded = await integrations.Core.UploadFile({
  file: { name: "my art.pdf", type: "application/pdf", size: 1000 },
});
check("UploadFile returns { file_url }", typeof uploaded.file_url === "string");
const up = calls.find((c) => Array.isArray(c) && c[0] === "upload");
check("upload path namespaced by user id", up?.[1]?.startsWith("u1/"), up?.[1]);
check("upload sanitises the filename", !up?.[1]?.includes(" "), up?.[1]);

// --- edge functions --------------------------------------------------------
await functions.invoke("geocodeAddress", { address: "Central" });
const fn = calls.find((c) => Array.isArray(c) && c[0] === "fn");
check("functions.invoke passes name + body",
  fn?.[1] === "geocodeAddress" && fn?.[2]?.body?.address === "Central");

/* ------------------------------------------------------------------ report */

rmSync(new URL("../.tmp/", import.meta.url), { recursive: true, force: true });

console.log(`\n  passed: ${pass}`);
if (failures.length) {
  console.log(`  FAILED: ${failures.length}\n`);
  failures.forEach((f) => console.log(`   ✗ ${f}`));
  process.exit(1);
}
console.log("  supabase provider emits correct queries and honours the contract\n");
