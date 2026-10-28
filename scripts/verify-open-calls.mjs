/**
 * Verifies Open Calls for premium members only (B9 in docs/CLIENT-REQUESTS.md):
 * who sees the list, who sees "Upgrade to view", who may post, and that the
 * database rule (migration 026) says the same thing.
 *
 * Run: npm run verify:opencalls
 */
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { JSDOM } from "jsdom";

const ROOT = fileURLToPath(new URL("..", import.meta.url));
const dom = new JSDOM("<!doctype html><html><body><div id='root'></div></body></html>", { url: "http://localhost/open-calls", pretendToBeVisual: true });
const { window } = dom;
globalThis.window = window; globalThis.document = window.document;
Object.defineProperty(globalThis, "navigator", { value: window.navigator, configurable: true });
for (const k of ["HTMLElement", "Element", "Node", "Event", "MouseEvent", "SVGElement", "Image", "HTMLInputElement"]) globalThis[k] = window[k];
globalThis.requestAnimationFrame = (cb) => setTimeout(() => cb(Date.now()), 0);
globalThis.ResizeObserver = window.ResizeObserver = class { observe() {} unobserve() {} disconnect() {} };
globalThis.matchMedia = window.matchMedia = () => ({ matches: false, media: "", addListener() {}, removeListener() {}, addEventListener() {}, removeEventListener() {} });
globalThis.IntersectionObserver = window.IntersectionObserver = class { observe() {} unobserve() {} disconnect() {} takeRecords() { return []; } };
globalThis.IS_REACT_ACT_ENVIRONMENT = false;

const React = (await import("react")).default;
const { createRoot } = await import("react-dom/client");
const { MemoryRouter } = await import("react-router-dom");
const { base44 } = await import("../src/api/base44Client.js");
const OpenCalls = (await import("../src/pages/OpenCalls.jsx")).default;

let pass = 0;
const fails = [];
const check = (n, c, d = "") => (c ? pass++ : fails.push(`${n}${d ? ` — ${d}` : ""}`));
const tick = (ms = 80) => new Promise((r) => setTimeout(r, ms));

const CALLS = [
  { id: "c1", title: "Spring Residency", type: "Residency", organizer: "Studio X", deadline: new Date(Date.now() + 9e8).toISOString(), external_link: "https://example.com/apply", is_free: true },
  { id: "c2", title: "Old Grant", type: "Grant", organizer: "Fund Y", deadline: "2020-01-01" },
];
let ACCESS, USER, listCalls, createResult;
base44.auth.openCallAccess = async () => ACCESS;
base44.auth.me = async () => { if (!USER) throw new Error("signed out"); return USER; };
base44.entities.OpenCall.list = async () => { listCalls++; return CALLS; };
base44.entities.OpenCall.create = async (row) => { if (createResult instanceof Error) throw createResult; return { id: "new", ...row }; };

const c = document.getElementById("root");
async function page(access, user) {
  ACCESS = access; USER = user; listCalls = 0;
  const root = createRoot(c);
  root.render(React.createElement(MemoryRouter, null, React.createElement(OpenCalls)));
  for (let i = 0; i < 40 && !/upgrade to view|spring residency|no opportunities/i.test(c.textContent); i++) await tick(50);
  await tick(100);
  const text = c.textContent;
  return {
    root, text,
    locked: !!c.querySelector('[data-testid="open-calls-locked"]'),
    list: /Spring Residency/.test(text),
    post: [...c.querySelectorAll("button")].some((b) => /post opportunity/i.test(b.textContent)),
    upgradeHref: c.querySelector('[data-testid="open-calls-locked"] a[href="/upgrade"]') ? "/upgrade" : "",
    signIn: !!c.querySelector('[data-testid="open-calls-locked"] a[href="/login"]'),
  };
}

// ---- signed out
{
  const p = await page({ can_view: false, can_post: false }, null);
  check("signed out: 'Upgrade to view'", p.locked && /upgrade to view/i.test(p.text));
  check("signed out: an Upgrade button to /upgrade", p.upgradeHref === "/upgrade");
  check("signed out: offered sign-in too", p.signIn);
  check("signed out: no list shown", !p.list);
  check("signed out: the list is never even requested", listCalls === 0, `${listCalls} requests`);
  check("signed out: no Post button", !p.post);
  p.root.unmount();
}
// ---- signed in, not premium
{
  const p = await page({ can_view: false, can_post: false }, { id: "u", role: "user" });
  check("member, not premium: 'Upgrade to view'", p.locked && p.upgradeHref === "/upgrade");
  check("member, not premium: no sign-in link (already signed in)", !p.signIn);
  check("member, not premium: no list, never requested", !p.list && listCalls === 0);
  check("member, not premium: no Post button", !p.post);
  p.root.unmount();
}
// ---- premium member
{
  const p = await page({ can_view: true, can_post: false }, { id: "u", role: "user" });
  check("premium: sees the list", p.list && !p.locked);
  check("premium: past deadlines still listed separately", /Past Deadlines/.test(p.text) && /Old Grant/.test(p.text));
  check("premium: Apply opens the real link", !!c.querySelector('a[href="https://example.com/apply"]'));
  check("premium (not a gallery): no Post button", !p.post);
  p.root.unmount();
}
// ---- paid / partner gallery: view and post
{
  const p = await page({ can_view: true, can_post: true }, { id: "g", role: "user" });
  check("partner gallery: sees the list and the Post button", p.list && p.post);
  // a refused save now says why instead of spinning forever
  [...c.querySelectorAll("button")].find((b) => /post opportunity/i.test(b.textContent)).click();
  await tick(120);
  const form = c.querySelector("form");
  const fill = (el, v) => { Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, "value").set.call(el, v); el.dispatchEvent(new window.Event("input", { bubbles: true })); };
  const inputs = [...form.querySelectorAll("input[required]")];
  inputs.forEach((i, n) => fill(i, `x${n}`));
  await tick();
  createResult = new Error('new row violates row-level security policy for table "open_call"');
  form.dispatchEvent(new window.Event("submit", { bubbles: true, cancelable: true }));
  await tick(200);
  check("a refused post explains who may post", /only admins and paid or partner galleries/i.test(c.textContent));
  check("…and the button stops spinning", !form.querySelector("button[type=submit]").disabled);
  p.root.unmount();
}
// ---- admin
{
  const p = await page({ can_view: true, can_post: true }, { id: "a", role: "admin" });
  check("admin: list and Post button", p.list && p.post);
  p.root.unmount();
}
// ---- the access check fails (bad connection): no list, and it says so —
// never "Upgrade to view", which would be wrong for a paying member
{
  const p = await page({ can_view: false, can_post: false, failed: true }, { id: "u", role: "user" });
  const failed = () => !!c.querySelector('[data-testid="open-calls-failed"]');
  check("access check failed: no list, never requested", !p.list && listCalls === 0);
  check("access check failed: says it couldn't load, offers Try again (not 'Upgrade')", failed() && !p.locked);
  ACCESS = { can_view: true, can_post: false };
  [...c.querySelectorAll("button")].find((b) => /try again/i.test(b.textContent)).click();
  for (let i = 0; i < 30 && !/Spring Residency/.test(c.textContent); i++) await tick(50);
  check("Try again: once the check succeeds the list appears", /Spring Residency/.test(c.textContent) && !failed());
  p.root.unmount();
}
// ---- the list fails to load: not "No opportunities posted yet"
{
  const real = base44.entities.OpenCall.list;
  let fail = true;
  base44.entities.OpenCall.list = async () => { listCalls++; if (fail) throw new Error("offline"); return CALLS; };
  const p = await page({ can_view: true, can_post: false }, { id: "u", role: "user" });
  for (let i = 0; i < 30 && !c.querySelector('[data-testid="open-calls-failed"]'); i++) await tick(50);
  check("list failed: says it couldn't load, not 'No opportunities posted yet'", !!c.querySelector('[data-testid="open-calls-failed"]') && !/no opportunities posted/i.test(c.textContent));
  fail = false;
  [...c.querySelectorAll("button")].find((b) => /try again/i.test(b.textContent)).click();
  for (let i = 0; i < 30 && !/Spring Residency/.test(c.textContent); i++) await tick(50);
  check("Try again: the list loads", /Spring Residency/.test(c.textContent));
  base44.entities.OpenCall.list = real;
  p.root.unmount();
}

// ---- the source and the database rule
const src = (f) => readFileSync(join(ROOT, f), "utf8");
const page_ = src("src/pages/OpenCalls.jsx");
check("page no longer uses the switched-off paywall flag", !/isLocked|featureLimits/.test(page_));
check("page asks the database who may see and post", /openCallAccess\(\)/.test(page_));
const provider = src("src/api/providers/supabase.js");
check("a call with no deadline sends null, not \"\" (the database refused \"\")", /deadline: form.deadline || null/.test(page_));
check("provider calls the open_call_access database function", /rpc\("open_call_access"\)/.test(provider));
check("provider: any error answers 'no' (and marks it a failure)", /if \(error\) return \{ can_view: false, can_post: false, failed: true \}/.test(provider));
const mig = src("supabase/migrations/026_open_calls_premium.sql");
check("026: read policy requires premium (or your own post)", /create policy opencall_read[\s\S]*has_premium_access\(\)[\s\S]*posted_by_id = auth\.uid\(\)/.test(mig));
check("026: posting requires can_post_open_call, admins keep posting for others", /posted_by_id = auth\.uid\(\) and public\.can_post_open_call\(\)\)\s*or public\.is_admin\(\)/.test(mig));
check("026: premium = active, unexpired subscription", /status = 'active'\s*and \(s\.expires_at is null or s\.expires_at > now\(\)\)/.test(mig));
check("026: partner and paid galleries count as premium", /partnership_type in \('Paid Member', 'Partner'\)/.test(mig));
check("026: only APPROVED galleries/venues may post", /c\.status = 'approved'\s*and public\.is_moderated_space\(c\.type\)/.test(mig));
check("026: changes no stored data", !/\b(update|delete|insert into|alter table|drop table)\b/i.test(mig.replace(/--.*$/gm, "").replace(/for (insert|update|delete)/gi, "")));
const undo = src("supabase/migrations/026_open_calls_premium.revert.sql");
check("undo restores public reading and 008's posting rule", /for select using \(true\)/.test(undo) && /posted_by_id = auth\.uid\(\) or public\.is_admin\(\)/.test(undo));

console.log(`verify:opencalls — ${pass} passed, ${fails.length} failed`);
if (fails.length) { for (const f of fails) console.log("  ✗", f); process.exit(1); }
process.exit(0);
