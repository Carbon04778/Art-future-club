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

// ---- still loading: a spinner, never "No opportunities posted yet"
{
  const real = base44.entities.OpenCall.list;
  let release;
  base44.entities.OpenCall.list = () => { listCalls++; return new Promise((r) => { release = () => r(CALLS); }); };
  ACCESS = { can_view: true, can_post: false }; USER = null; listCalls = 0;
  const root = createRoot(c);
  root.render(React.createElement(MemoryRouter, null, React.createElement(OpenCalls)));
  for (let i = 0; i < 30 && !release; i++) await tick(50);
  await tick(100);
  check("while loading: a spinner shows", !!c.querySelector('[data-testid="open-calls-loading"]'));
  check("while loading: does NOT say 'No opportunities posted yet'", !/no opportunities posted/i.test(c.textContent));
  release();
  for (let i = 0; i < 30 && !/Spring Residency/.test(c.textContent); i++) await tick(50);
  check("once loaded: the list replaces the spinner", /Spring Residency/.test(c.textContent) && !c.querySelector('[data-testid="open-calls-loading"]'));
  base44.entities.OpenCall.list = real;
  root.unmount();
}

// ---- every call opens its own page; Edit for the poster or an admin only
const MINE = { id: "c3", title: "My Fellowship", type: "Fellowship", organizer: "Me Gallery", posted_by_id: "g", description: "Line one\nLine two", is_free: false, fee: "£10" };
{
  CALLS.push(MINE);
  const p = await page({ can_view: true, can_post: true }, { id: "g", role: "user" });
  const links = [...c.querySelectorAll('[data-testid="open-call-link"]')].map((a) => a.getAttribute("href"));
  check("each title links to its own page /open-calls/<id>", ["/open-calls/c1", "/open-calls/c2", "/open-calls/c3"].every((h) => links.includes(h)), links.join(","));
  check("each card has 'View full details'", [...c.querySelectorAll('[data-testid="open-call-card"]')].every((card) => /view full details/i.test(card.textContent)));
  const edits = [...c.querySelectorAll('[data-testid="open-call-edit"]')];
  check("the poster sees Edit on their own call only", edits.length === 1 && edits[0].closest('[data-testid="open-call-card"]').textContent.includes("My Fellowship"), `${edits.length} edit buttons`);
  // edit it: the form opens filled in, Save sends an update (not a new post)
  let updated = null;
  base44.entities.OpenCall.update = async (id, row) => { updated = { id, row: { ...row } }; Object.assign(MINE, row); return { ...MINE }; };
  base44.entities.OpenCall.create = async () => { throw new Error("create must not be called when editing"); };
  edits[0].click();
  await tick(120);
  const form = c.querySelector('[data-testid="open-call-form"] form');
  check("Edit opens the form filled in with the call", form?.querySelector('input[name="title"]')?.value === "My Fellowship" && form?.querySelector('input[name="fee"]')?.value === "£10");
  check("the form says Edit and Save changes", /edit open call/i.test(c.querySelector('[data-testid="open-call-form"]').textContent) && /save changes/i.test(form.textContent));
  const fill = (el, v) => { Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, "value").set.call(el, v); el.dispatchEvent(new window.Event("input", { bubbles: true })); };
  fill(form.querySelector('input[name="title"]'), "My Fellowship 2027");
  await tick();
  form.dispatchEvent(new window.Event("submit", { bubbles: true, cancelable: true }));
  for (let i = 0; i < 30 && !/My Fellowship 2027/.test(c.textContent); i++) await tick(50);
  check("Save updates that call by its id", updated?.id === "c3" && updated.row.title === "My Fellowship 2027", JSON.stringify(updated?.id));
  check("Save never changes who posted it", updated && !("posted_by_id" in updated.row) && !("posted_by_name" in updated.row));
  check("the new title shows straight away and the form closes", /My Fellowship 2027/.test(c.textContent) && !c.querySelector('[data-testid="open-call-form"]'));
  p.root.unmount();
  Object.assign(MINE, { title: "My Fellowship", description: "Line one\nLine two", is_free: false, fee: "£10" });
}
{
  const p = await page({ can_view: true, can_post: false }, { id: "someone-else", role: "user" });
  check("another member sees no Edit buttons", !c.querySelector('[data-testid="open-call-edit"]'));
  p.root.unmount();
  const q = await page({ can_view: true, can_post: true }, { id: "a", role: "admin" });
  check("an admin sees Edit on every call", c.querySelectorAll('[data-testid="open-call-edit"]').length === CALLS.length);
  q.root.unmount();
}
// a refused edit explains who may edit
{
  base44.entities.OpenCall.update = async () => { throw new Error("Cannot coerce the result to a single JSON object"); };
  const p = await page({ can_view: true, can_post: true }, { id: "a", role: "admin" });
  c.querySelector('[data-testid="open-call-edit"]').click();
  await tick(120);
  c.querySelector('[data-testid="open-call-form"] form').dispatchEvent(new window.Event("submit", { bubbles: true, cancelable: true }));
  await tick(200);
  check("a refused edit says only the poster or an admin can edit", /only the person who posted this open call, or an admin/i.test(c.textContent));
  p.root.unmount();
}

// ---- the open call's own page
{
  const { Routes, Route } = await import("react-router-dom");
  const OpenCallDetail = (await import("../src/pages/OpenCallDetail.jsx")).default;
  // The page looks a call up by its slug first, then by its id (old links).
  let filtered = [];
  base44.entities.OpenCall.filter = async (where) => { filtered.push(where); return CALLS.filter((x) => (where.slug != null ? x.slug === where.slug : x.id === where.id)); };
  base44.entities.OpenCall.get = async (id) => { filtered.push({ id }); const r = CALLS.find((x) => x.id === id); if (!r) throw new Error("not found"); return r; };
  const detail = async (id, access, user) => {
    ACCESS = access; USER = user; filtered = [];
    const root = createRoot(c);
    root.render(React.createElement(MemoryRouter, { initialEntries: [`/open-calls/${id}`] },
      React.createElement(Routes, null, React.createElement(Route, { path: "/open-calls/:id", element: React.createElement(OpenCallDetail) }))));
    for (let i = 0; i < 40 && !c.querySelector('[data-testid="open-call-title"],[data-testid="open-call-missing"],[data-testid="open-calls-locked"]'); i++) await tick(50);
    await tick(80);
    return root;
  };
  let r = await detail("c3", { can_view: true, can_post: false }, null);
  const desc = c.querySelector('[data-testid="open-call-description"]');
  check("own page: shows the title big", c.querySelector("h1[data-testid=open-call-title]")?.textContent === "My Fellowship");
  check("own page: the FULL description, line breaks kept", desc?.textContent === "Line one\nLine two" && /pre-line/.test(desc.className));
  check("own page: fee, type and organiser shown", /£10/.test(c.textContent) && /Fellowship/.test(c.textContent) && /Me Gallery/.test(c.textContent));
  check("own page: an id link still finds the call", filtered.some((w) => w.id === "c3"));
  check("own page: a visitor sees no Edit/Delete", !c.querySelector('[data-testid="open-call-owner-tools"]'));
  check("own page: a back link to all open calls", !!c.querySelector('a[href="/open-calls"]'));
  r.unmount();
  r = await detail("c1", { can_view: true, can_post: false }, null);
  check("own page: Apply opens the real link", c.querySelector('[data-testid="open-call-apply"]')?.getAttribute("href") === "https://example.com/apply");
  r.unmount();
  r = await detail("c3", { can_view: true, can_post: true }, { id: "g", role: "user" });
  check("own page: the poster sees Edit and Delete", !!c.querySelector('[data-testid="open-call-owner-tools"]'));
  r.unmount();
  r = await detail("c1", { can_view: true, can_post: true }, { id: "a", role: "admin" });
  check("own page: an admin sees Edit and Delete", !!c.querySelector('[data-testid="open-call-owner-tools"]'));
  r.unmount();
  // readable links (032): a slug opens the call, and the list links to it
  MINE.slug = "my-fellowship";
  r = await detail("my-fellowship", { can_view: true, can_post: false }, null);
  check("own page: a readable slug link opens the call", c.querySelector("h1[data-testid=open-call-title]")?.textContent === "My Fellowship");
  check("own page: the tab title is '<title> | Open Calls | Art Future Club'", document.title === "My Fellowship | Open Calls | Art Future Club", document.title);
  r.unmount();
  {
    const { openCallPath } = await import("../src/components/openCalls.jsx");
    check("links use the slug when there is one, else the id", openCallPath(MINE) === "/open-calls/my-fellowship" && openCallPath({ id: "c1" }) === "/open-calls/c1");
  }
  delete MINE.slug;
  r = await detail("nope", { can_view: true, can_post: false }, null);
  check("own page: an unknown id says 'not found'", !!c.querySelector('[data-testid="open-call-missing"]'));
  r.unmount();
  r = await detail("c1", { can_view: false, can_post: false }, null);
  check("own page: when Open Calls is premium again, it says 'Upgrade to view' and loads nothing", !!c.querySelector('[data-testid="open-calls-locked"]') && filtered.length === 0);
  r.unmount();
}

// ---- the source and the database rule
const src = (f) => readFileSync(join(ROOT, f), "utf8");
const page_ = src("src/pages/OpenCalls.jsx") + src("src/components/openCalls.jsx");
const app = src("src/App.jsx");
check("App has the /open-calls/:id route", /path="\/open-calls\/:id" element=\{<OpenCallDetail \/>\}/.test(app));
const admin = src("src/pages/AdminDashboard.jsx");
check("Admin Open Calls tab: View, Edit, New and a confirm before Delete", /admin-open-call-edit/.test(admin) && /admin-open-call-new/.test(admin) && /openCallPath\(c\)/.test(admin) && /window\.confirm\(`Delete/.test(admin));
const rls = src("supabase/migrations/002_rls.sql");
check("database: the poster or an admin may edit (002 opencall_update_own)", /create policy opencall_update_own[\s\S]*?using \(posted_by_id = auth\.uid\(\) or public\.is_admin\(\)\)/.test(rls));
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
