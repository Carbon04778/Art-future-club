/**
 * Verifies the Collectors work (B10 in docs/CLIENT-REQUESTS.md): collections
 * like Pinterest boards, the "Save to…" menu, the members-only Collectors
 * pages, the private switch, and the database rules (migration 029).
 *
 * Run: npm run verify:collectors
 */
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { JSDOM } from "jsdom";

const ROOT = fileURLToPath(new URL("..", import.meta.url));
const dom = new JSDOM("<!doctype html><html><head></head><body><div id='root'></div></body></html>", { url: "http://localhost/collectors", pretendToBeVisual: true });
const { window } = dom;
globalThis.window = window; globalThis.document = window.document;
Object.defineProperty(globalThis, "navigator", { value: window.navigator, configurable: true });
for (const k of ["HTMLElement", "Element", "Node", "Event", "MouseEvent", "KeyboardEvent", "SVGElement", "Image", "HTMLInputElement", "HTMLSelectElement"]) globalThis[k] = window[k];
globalThis.requestAnimationFrame = (cb) => setTimeout(() => cb(Date.now()), 0);
globalThis.ResizeObserver = window.ResizeObserver = class { observe() {} unobserve() {} disconnect() {} };
globalThis.IS_REACT_ACT_ENVIRONMENT = false;

const React = (await import("react")).default;
const { createRoot } = await import("react-dom/client");
const { MemoryRouter, Routes, Route } = await import("react-router-dom");
const { base44 } = await import("../src/api/base44Client.js");
const VT = await import("../src/lib/venueTypes.js");
const { collectorPath } = await import("../src/lib/slugs.js");
const MyCollection = (await import("../src/components/MyCollection.jsx")).default;
const CollectButton = (await import("../src/components/CollectButton.jsx")).default;
const Collectors = (await import("../src/pages/Collectors.jsx")).default;
const CollectorPublic = (await import("../src/pages/CollectorPublic.jsx")).default;

let pass = 0;
const fails = [];
const check = (n, c, d = "") => (c ? pass++ : fails.push(`${n}${d ? ` — ${d}` : ""}`));
const tick = (ms = 80) => new Promise((r) => setTimeout(r, ms));
const waitFor = async (fn) => { for (let i = 0; i < 40 && !fn(); i++) await tick(50); };
const c = document.getElementById("root");
const btn = (re, scope = c) => [...scope.querySelectorAll("button")].find((b) => re.test(b.textContent.trim()));
const setVal = (el, v) => { Object.getOwnPropertyDescriptor((el.tagName === "SELECT" ? window.HTMLSelectElement : window.HTMLInputElement).prototype, "value").set.call(el, v); el.dispatchEvent(new window.Event(el.tagName === "SELECT" ? "change" : "input", { bubbles: true })); };
const src = (f) => readFileSync(join(ROOT, f), "utf8");
window.confirm = () => true;

// ---- the shared rules
check("people types are collectors, curators, advisors, other", JSON.stringify(VT.PEOPLE_TYPES) === '["Collector","Curator","Advisor","Other"]');
check("no gallery, venue or Directory type is a people type", VT.COLLECTOR_TYPES.filter((t) => !VT.PEOPLE_TYPES.includes(t)).every((t) => t === "Gallery" || VT.isVenueType(t) || VT.isDirectoryType(t)));
check("a collector's page is /collectors/…", collectorPath({ slug: "jane" }) === "/collectors/jane");

// ---- an in-memory store standing in for the database
let WORKS = [], COLS = [];
const id = () => Math.random().toString(36).slice(2);
base44.entities.CollectedWork.filter = async (w) => WORKS.filter((x) => Object.entries(w).every(([k, v]) => x[k] === v));
base44.entities.CollectedWork.create = async (r) => { const x = { id: id(), ...r }; WORKS.push(x); return x; };
base44.entities.CollectedWork.delete = async (i) => { WORKS = WORKS.filter((x) => x.id !== i); };
base44.entities.CollectedWork.update = async (i, p) => { WORKS = WORKS.map((x) => (x.id === i ? { ...x, ...p } : x)); };
base44.entities.Collection.filter = async (w) => COLS.filter((x) => x.user_id === w.user_id);
base44.entities.Collection.create = async (r) => { const x = { id: id(), ...r }; COLS.push(x); return x; };
base44.entities.Collection.update = async (i, p) => { COLS = COLS.map((x) => (x.id === i ? { ...x, ...p } : x)); };
base44.entities.Collection.delete = async (i) => { COLS = COLS.filter((x) => x.id !== i); WORKS = WORKS.map((w) => (w.collection_id === i ? { ...w, collection_id: null } : w)); };

// ---- the Collect button: "Save to…"
{
  COLS = [{ id: "k1", user_id: "u", name: "Abstract" }];
  const root = createRoot(c);
  root.render(React.createElement(MemoryRouter, null, React.createElement(CollectButton, { userId: "u", artistId: "a1", artistName: "Ann", work: { title: "Blue", image_url: "/b.webp" }, workRef: "a1-work-0" })));
  await tick(150);
  check("button says Collect before anything is saved", /Collect$/.test(c.querySelector('[data-testid="collect-button"]').textContent.trim()));
  c.querySelector('[data-testid="collect-button"]').click();
  await waitFor(() => c.querySelector('[data-testid="collect-menu"]') && /Abstract/.test(c.textContent));
  check("opens 'Save to…' listing the member's collections and Unsorted", /Save to/.test(c.textContent) && /Abstract/.test(c.textContent) && /Unsorted/.test(c.textContent));
  btn(/^Abstract$/, c.querySelector('[data-testid="collect-menu"]')).click();
  await waitFor(() => WORKS.length === 1);
  check("ticking a collection saves the work into it", WORKS.length === 1 && WORKS[0].collection_id === "k1" && WORKS[0].work_title === "Blue");
  const box = c.querySelector('[data-testid="collect-menu"] input');
  setVal(box, "Wishlist");
  await tick();
  c.querySelector('[aria-label="Create collection and save"]').click();
  await waitFor(() => WORKS.length === 2);
  check("a new collection can be made from the menu, and the work saved into it", COLS.some((k) => k.name === "Wishlist") && WORKS.some((w) => w.collection_id === COLS.find((k) => k.name === "Wishlist").id));
  check("the button shows it is saved in 2 collections", /Collected \(2\)/.test(c.querySelector('[data-testid="collect-button"]').textContent));
  btn(/^Abstract/, c.querySelector('[data-testid="collect-menu"]')).click();
  await waitFor(() => WORKS.length === 1);
  check("unticking takes it out of that collection only", WORKS.length === 1 && WORKS[0].collection_id !== "k1");
  document.dispatchEvent(new window.KeyboardEvent("keydown", { key: "Escape" }));
  await tick();
  check("Escape closes the menu", !c.querySelector('[data-testid="collect-menu"]'));
  root.unmount();
}
{
  // signed out: sends to sign-in, no menu
  const root = createRoot(c);
  let went = "";
  root.render(React.createElement(MemoryRouter, { initialEntries: ["/x"] }, React.createElement(Routes, null,
    React.createElement(Route, { path: "/x", element: React.createElement(CollectButton, { userId: null, workRef: "w" }) }),
    React.createElement(Route, { path: "/login", element: React.createElement(() => { went = "login"; return null; }) }))));
  await tick(100);
  c.querySelector('[data-testid="collect-button"]').click();
  await tick(100);
  check("signed out: Collect goes to sign-in", went === "login");
  root.unmount();
}

// ---- the collections view
{
  COLS = [{ id: "k1", user_id: "u", name: "Abstract" }, { id: "k2", user_id: "u", name: "Prints" }];
  WORKS = [
    { id: "w1", user_id: "u", work_ref: "r1", work_title: "One", collection_id: "k1", artist_id: "a" },
    { id: "w2", user_id: "u", work_ref: "r1", work_title: "One", collection_id: "k2", artist_id: "a" },
    { id: "w3", user_id: "u", work_ref: "r2", work_title: "Two", collection_id: null, artist_id: "a" },
  ];
  const root = createRoot(c);
  root.render(React.createElement(MemoryRouter, null, React.createElement(MyCollection, { userId: "u", isOwner: true })));
  await waitFor(() => c.querySelector('[data-testid="collected-work"]'));
  const tabs = () => [...c.querySelectorAll('[role="tab"]')].map((t) => t.textContent.replace(/\s+/g, " ").trim());
  check("tabs: All, each collection with its count, and Unsorted", JSON.stringify(tabs()) === JSON.stringify(["All 2", "Abstract 1", "Prints 1", "Unsorted 1"]), tabs().join(" | "));
  check("'All' shows each work once, even if in two collections", c.querySelectorAll('[data-testid="collected-work"]').length === 2);
  [...c.querySelectorAll('[role="tab"]')][1].click(); await tick();
  check("a collection's tab shows only its works", c.querySelectorAll('[data-testid="collected-work"]').length === 1 && /One/.test(c.textContent));
  setVal(c.querySelector('[data-testid="collected-work"] select'), "unsorted"); await tick(150);
  check("a work can be moved to another collection", WORKS.find((w) => w.id === "w1").collection_id === null);
  btn(/^Rename$/).click(); await tick();
  setVal(c.querySelector('input[aria-label="Collection name"]'), "Abstracts"); await tick();
  c.querySelector('[aria-label="Save name"]').click(); await tick(150);
  check("a collection can be renamed", COLS.find((k) => k.id === "k1").name === "Abstracts");
  btn(/Delete collection/).click(); await tick(200);
  check("deleting a collection keeps its works (they go to Unsorted)", !COLS.some((k) => k.id === "k1") && WORKS.length === 3);
  setVal(c.querySelector('input[aria-label="New collection name"]'), "Sculpture"); await tick();
  btn(/Create/).click(); await tick(150);
  check("a new collection can be made from the collections view", COLS.some((k) => k.name === "Sculpture"));
  [...c.querySelectorAll('[role="tab"]')][0].click(); await tick();
  c.querySelectorAll('[data-testid="collected-work"] button[aria-label^="Remove One"]')[0]?.click();
  await tick(200);
  check("removing from 'All' takes the work out of every collection", !WORKS.some((w) => w.work_ref === "r1"));
  root.unmount();
}
{
  // a visitor (not the owner): no controls; nothing at all if nothing is visible
  WORKS = [{ id: "v1", user_id: "x", work_ref: "q", work_title: "Seen", collection_id: null, artist_id: "a" }]; COLS = [];
  const root = createRoot(c);
  root.render(React.createElement(MemoryRouter, null, React.createElement(MyCollection, { userId: "x", isOwner: false })));
  await waitFor(() => c.querySelector('[data-testid="collected-work"]'));
  check("a visitor sees the works but no controls", !btn(/Create|Rename|Delete/) && !c.querySelector('button[aria-label^="Remove"]'));
  root.unmount();
  WORKS = [];
  const root2 = createRoot(c);
  root2.render(React.createElement(MemoryRouter, null, React.createElement(MyCollection, { userId: "x", isOwner: false })));
  await tick(300);
  check("nothing visible (e.g. a private collector): the section is not shown", !c.querySelector('[data-testid="collections"]'));
  root2.unmount();
}

// ---- the members-only pages
const PEOPLE = [
  { id: "p1", slug: "jane", display_name: "Jane", type: "Collector", based_in: "London", user_id: "uj", interests: ["Painting"] },
  { id: "p2", slug: "carl", display_name: "Carl", type: "Curator", based_in: "Hong Kong", user_id: "uc" },
  { id: "g1", slug: "gal", display_name: "Gal", type: "Gallery", user_id: "ug" },
];
base44.entities.CollectorProfile.filter = async (w) => (w.type?.$in ? PEOPLE.filter((p) => w.type.$in.includes(p.type)) : PEOPLE.filter((p) => Object.entries(w).every(([k, v]) => p[k] === v)));
base44.auth.me = async () => ({ id: "viewer" });
async function renderAt(path, access) {
  base44.auth.canSeeCollectors = async () => access;
  const root = createRoot(c);
  root.render(React.createElement(MemoryRouter, { initialEntries: [path] }, React.createElement(Routes, null,
    React.createElement(Route, { path: "/collectors", element: React.createElement(Collectors) }),
    React.createElement(Route, { path: "/collectors/:id", element: React.createElement(CollectorPublic) }))));
  await waitFor(() => /Collectors|collectors|Jane|private|connection/.test(c.textContent) && !c.querySelector(".animate-spin"));
  await tick(150);
  return root;
}
{
  const root = await renderAt("/collectors", { allowed: false });
  check("not allowed: 'for collectors and premium members' with Upgrade, no list", !!c.querySelector('[data-testid="collectors-locked"]') && !!c.querySelector('a[href="/upgrade"]') && !/Jane/.test(c.textContent));
  check("…and never indexed by search engines", document.querySelector('meta[name="robots"]')?.getAttribute("content")?.includes("noindex"));
  root.unmount();
}
{
  const root = await renderAt("/collectors", { allowed: false, failed: true });
  check("check failed: says so with Try again, not 'members only'", !!c.querySelector('[data-testid="collectors-failed"]') && !c.querySelector('[data-testid="collectors-locked"]'));
  root.unmount();
}
{
  const root = await renderAt("/collectors", { allowed: true });
  const names = [...c.querySelectorAll('[data-testid="collector-card"] h3')].map((h) => h.textContent).sort();
  check("allowed: lists collectors and curators, never a gallery", JSON.stringify(names) === '["Carl","Jane"]', names.join());
  check("each card opens /collectors/…", !!c.querySelector('a[href="/collectors/jane"]'));
  const s = c.querySelector('input[placeholder^="Search"]');
  setVal(s, "painting"); await tick(150);
  check("search reaches interests", [...c.querySelectorAll('[data-testid="collector-card"] h3')].map((h) => h.textContent).join() === "Jane");
  root.unmount();
}
{
  WORKS = []; COLS = [];
  const root = await renderAt("/collectors/jane", { allowed: true });
  await waitFor(() => c.querySelector('[data-testid="collector-public"]'));
  check("a collector's page: name, type, city", /Jane/.test(c.textContent) && /Collector/.test(c.textContent) && /London/.test(c.textContent));
  root.unmount();
  const root2 = await renderAt("/collectors/gal", { allowed: true });
  await waitFor(() => c.querySelector('[data-testid="collector-unavailable"]'));
  check("a gallery is not shown as a collector", !!c.querySelector('[data-testid="collector-unavailable"]'));
  root2.unmount();
}

// ---- wiring
check("routes /collectors and /collectors/:id", /path="\/collectors" element=\{<Collectors \/>\}/.test(src("src/App.jsx")) && /path="\/collectors\/:id" element=\{<CollectorPublic \/>\}/.test(src("src/App.jsx")));
check("the menu shows 'Collectors' only to those allowed", /seesCollectors \? \[\.\.\.NAV\.slice\(0, -2\), \{ to: "\/collectors", label: "Collectors" \}/.test(src("src/components/SiteHeader.jsx")));
check("collector editor: 'Make my profile private' for people types only", /isPeopleType\(form\.type\) && \([\s\S]{0,700}Make my profile private/.test(src("src/pages/CollectorProfilePage.jsx")) && /is_private: !!p\.is_private/.test(src("src/pages/CollectorProfilePage.jsx")));
check("collector's own page shows the collections view with controls", /<MyCollection userId=\{user\?\.id\} isOwner \/>/.test(src("src/pages/CollectorProfileView.jsx")));
check("provider asks the database can_see_collectors, failure = locked", /rpc\("can_see_collectors"\)/.test(src("src/api/providers/supabase.js")) && /if \(error\) return \{ allowed: false, failed: true \}/.test(src("src/api/providers/supabase.js")));
check("collector pages are not in the sitemap", !/collectors/.test(src("api/sitemap.js")));

// ---- the database file
const mig = src("supabase/migrations/029_collectors.sql");
check("029: collectors visible only to admins, premium members and collectors", /create or replace function public\.can_see_collectors\(\)[\s\S]*public\.is_admin\(\)\s*or public\.has_premium_access\(\)[\s\S]*public\.is_people_type\(c\.type\)/.test(mig));
check("029: collector profiles — private never shown; galleries/venues unchanged", /create policy collector_read[\s\S]*?\(public\.is_moderated_space\(type\) and status = 'approved'\)\s*or \(public\.is_people_type\(type\) and not is_private and public\.can_see_collectors\(\)\)/.test(mig));
check("029: saved works — was readable by anyone; now by the rule", /drop policy if exists collected_read[\s\S]*?for select using \(public\.can_see_member_collection\(user_id\)\)/.test(mig));
check("029: an artist's or gallery's collection stays public", /can_see_member_collection[\s\S]*?else true/.test(mig));
check("029: a work can only be filed in one of your own collections", (mig.match(/exists \(select 1 from public\.collection k where k\.id = collection_id and k\.user_id = auth\.uid\(\)\)/g) || []).length === 2);
check("029: deleting a collection keeps its works", /references public\.collection\(id\) on delete set null/.test(mig));
check("029: no existing row changed", !/\b(update|delete from|insert into)\b/i.test(mig.replace(/--.*$/gm, "").replace(/for (insert|update|delete)/gi, "")));
const undo = src("supabase/migrations/029_collectors.revert.sql");
check("undo keeps members' collections and choices", !/drop table|drop column/i.test(undo.replace(/--.*$/gm, "")));

console.log(`verify:collectors — ${pass} passed, ${fails.length} failed`);
if (fails.length) { for (const f of fails) console.log("  ✗", f); process.exit(1); }
process.exit(0);
