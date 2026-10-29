/**
 * Verifies "Change profile type" (A1 in docs/CLIENT-REQUESTS.md): what
 * moves across, the member's request panel, the admin's review list, the
 * pages that host them, and the database rules (migration 027).
 *
 * Run: npm run verify:switch
 */
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { JSDOM } from "jsdom";

const ROOT = fileURLToPath(new URL("..", import.meta.url));
const dom = new JSDOM("<!doctype html><html><body><div id='root'></div></body></html>", { url: "http://localhost/", pretendToBeVisual: true });
const { window } = dom;
globalThis.window = window; globalThis.document = window.document;
Object.defineProperty(globalThis, "navigator", { value: window.navigator, configurable: true });
for (const k of ["HTMLElement", "Element", "Node", "Event", "MouseEvent", "SVGElement", "Image", "HTMLInputElement", "HTMLSelectElement", "HTMLTextAreaElement"]) globalThis[k] = window[k];
globalThis.requestAnimationFrame = (cb) => setTimeout(() => cb(Date.now()), 0);
globalThis.ResizeObserver = window.ResizeObserver = class { observe() {} unobserve() {} disconnect() {} };
globalThis.IS_REACT_ACT_ENVIRONMENT = false;

const React = (await import("react")).default;
const { createRoot } = await import("react-dom/client");
const { base44 } = await import("../src/api/base44Client.js");
const Panel = await import("../src/components/ProfileSwitchPanel.jsx");
const ProfileSwitchPanel = Panel.default;
const AdminSwitchRequests = (await import("../src/components/AdminSwitchRequests.jsx")).default;

let pass = 0;
const fails = [];
const check = (n, c, d = "") => (c ? pass++ : fails.push(`${n}${d ? ` — ${d}` : ""}`));
const tick = (ms = 80) => new Promise((r) => setTimeout(r, ms));
const c = document.getElementById("root");
const btn = (re) => [...c.querySelectorAll("button")].find((b) => re.test(b.textContent));
const setVal = (el, v) => {
  const proto = el.tagName === "SELECT" ? window.HTMLSelectElement.prototype : el.tagName === "TEXTAREA" ? window.HTMLTextAreaElement.prototype : window.HTMLInputElement.prototype;
  Object.getOwnPropertyDescriptor(proto, "value").set.call(el, v);
  el.dispatchEvent(new window.Event(el.tagName === "SELECT" ? "change" : "input", { bubbles: true }));
};
const waitFor = async (fn) => { for (let i = 0; i < 40 && !fn(); i++) await tick(50); };

// ---- what moves across
const sc = Panel.switchConsequences;
check("artist → gallery: name, photo, bio, location, links, followers move", ["Name", "Profile photo", "Bio", "Location", "Website and social links", "Followers"].every((x) => sc("Artist", "Gallery").moves.includes(x)));
check("artist → gallery: artworks, CV, disciplines do NOT move", ["Artworks", "Disciplines"].every((x) => sc("Artist", "Gallery").stays.includes(x)) && sc("Artist", "Gallery").stays.some((s) => /CV/.test(s)));
check("gallery → artist: address/hours, gallery works do NOT move", sc("Gallery", "Artist").stays.some((s) => /address/i.test(s)) && sc("Gallery", "Artist").stays.some((s) => /gallery works/i.test(s)));
check("collector → gallery (same kind of profile): everything moves", sc("Collector", "Gallery").stays.length === 0);
check("the type list is Artist plus every space type", Panel.SWITCH_TYPES[0] === "Artist" && Panel.SWITCH_TYPES.includes("Gallery") && Panel.SWITCH_TYPES.includes("Collector") && Panel.SWITCH_TYPES.includes("Museum"));

// ---- the member's panel
let REQS = [], calls = [], failNext = null;
base44.entities.ProfileSwitchRequest.filter = async () => REQS;
base44.auth.requestProfileSwitch = async (a) => { calls.push(["request", a]); if (failNext) { const e = failNext; failNext = null; throw e; } REQS = [{ id: "r1", status: "pending", from_type: "Artist", to_type: a.toType, created_date: new Date().toISOString() }]; return "r1"; };
base44.auth.cancelProfileSwitch = async () => { calls.push(["cancel"]); REQS = REQS.map((r) => ({ ...r, status: "cancelled" })); return 1; };
{
  const root = createRoot(c);
  root.render(React.createElement(ProfileSwitchPanel, { userId: "u1", currentType: "Artist" }));
  await waitFor(() => btn(/change profile type/i));
  check("panel says what the profile is now", /Your profile is Artist/.test(c.textContent));
  btn(/change profile type/i).click(); await tick();
  const sel = c.querySelector('[data-testid="switch-form"] select');
  check("its own type is not offered", ![...sel.options].some((o) => o.value === "Artist"));
  setVal(sel, "Gallery"); await tick();
  check("choosing a type shows what does NOT move across", /Does NOT move across/i.test(c.textContent) && /Artworks/.test(c.textContent));
  check("…and promises nothing is deleted", /nothing is deleted/i.test(c.textContent));
  failNext = new Error("You already have a request waiting for approval.");
  c.querySelector('[data-testid="switch-form"]').dispatchEvent(new window.Event("submit", { bubbles: true, cancelable: true }));
  await tick(150);
  check("a refused request shows the reason", /already have a request waiting/i.test(c.textContent));
  c.querySelector('[data-testid="switch-form"]').dispatchEvent(new window.Event("submit", { bubbles: true, cancelable: true }));
  await waitFor(() => c.querySelector('[data-testid="switch-pending"]'));
  check("sending: the request goes in with the chosen type", calls.some(([k, a]) => k === "request" && a.toType === "Gallery" && a.discipline === null));
  check("then shows 'waiting for approval', profile unchanged until then", /waiting for\s+the AFC team to approve/i.test(c.textContent) && /stays exactly as it is/i.test(c.textContent));
  check("no second request while one is waiting", !btn(/change profile type/i));
  btn(/cancel request/i).click();
  await waitFor(() => btn(/change profile type/i));
  check("Cancel request withdraws it", calls.some(([k]) => k === "cancel") && !!btn(/change profile type/i));
  root.unmount();
}
{
  // gallery → artist: the main discipline is required
  REQS = []; calls = [];
  const root = createRoot(c);
  root.render(React.createElement(ProfileSwitchPanel, { userId: "u2", currentType: "Gallery" }));
  await waitFor(() => btn(/change profile type/i));
  btn(/change profile type/i).click(); await tick();
  setVal(c.querySelector('[data-testid="switch-form"] select'), "Artist"); await tick();
  const selects = c.querySelectorAll('[data-testid="switch-form"] select');
  check("becoming an artist asks for the main discipline (required)", selects.length === 2 && selects[1].required);
  setVal(selects[1], "Sculpture"); await tick();
  c.querySelector('[data-testid="switch-form"]').dispatchEvent(new window.Event("submit", { bubbles: true, cancelable: true }));
  await waitFor(() => calls.length);
  check("…and sends it", calls[0]?.[1]?.toType === "Artist" && calls[0]?.[1]?.discipline === "Sculpture");
  root.unmount();
}
{
  // a declined request shows the admin's note
  REQS = [{ id: "r9", status: "rejected", from_type: "Collector", to_type: "Gallery", review_note: "Please add your gallery address first." }];
  const root = createRoot(c);
  root.render(React.createElement(ProfileSwitchPanel, { userId: "u3", currentType: "Collector" }));
  await waitFor(() => c.querySelector('[data-testid="switch-rejected"]'));
  check("a declined request shows the team's note, and can be asked again", /add your gallery address/.test(c.textContent) && !!btn(/change profile type/i));
  root.unmount();
}

// ---- the admin's review list
let PENDING = [], RECENT = [], reviews = [], restores = [];
base44.entities.ProfileSwitchRequest.filter = async (w) => (w.status === "pending" ? PENDING : RECENT);
base44.entities.ArtistProfile.filter = async () => [{ id: "a1", portfolio_works: [{}, {}, {}], cv: { statement: "x", exhibitions: [{}] }, disciplines: ["Painting", "Drawing"] }];
base44.entities.CollectorProfile.filter = async () => [{ id: "g1", address: "1 Road", cover_image_url: "/c.webp" }];
base44.entities.GalleryWork.filter = async () => [{}, {}];
base44.auth.reviewProfileSwitch = async (a) => { reviews.push(a); PENDING = PENDING.filter((p) => p.id !== a.requestId); return "x"; };
base44.auth.restoreProfileArchive = async (id) => { restores.push(id); return "x"; };
window.confirm = () => true;
{
  PENDING = [
    { id: "p1", from_kind: "artist", from_id: "a1", from_type: "Artist", to_type: "Gallery", display_name: "Ann", reason: "I run a gallery", created_date: new Date().toISOString() },
    { id: "p2", from_kind: "space", from_id: "g1", from_type: "Gallery", to_type: "Artist", to_discipline: "Sculpture", display_name: "Gee", created_date: new Date().toISOString() },
    { id: "p3", from_kind: "space", from_id: "c1", from_type: "Collector", to_type: "Museum", display_name: "Cee", created_date: new Date().toISOString() },
  ];
  RECENT = [{ id: "d1", status: "approved", archive_id: "arch1", from_type: "Artist", to_type: "Collector", display_name: "Dee" }];
  const root = createRoot(c);
  root.render(React.createElement(AdminSwitchRequests));
  await waitFor(() => c.querySelectorAll('[data-testid="switch-request"]').length === 3);
  const items = [...c.querySelectorAll('[data-testid="switch-request"]')].map((x) => x.textContent);
  check("each request shows who, from → to, and their note", /Ann.*Artist → Gallery/.test(items[0]) && /I run a gallery/.test(items[0]));
  check("artist → gallery warns with REAL counts: 3 artworks, a CV, 2 disciplines", /3 artworks/.test(items[0]) && /a CV/.test(items[0]) && /2 disciplines/.test(items[0]), items[0]);
  check("gallery → artist warns: 2 gallery works, address, cover photo; shows the chosen discipline", /2 gallery works/.test(items[1]) && /address and opening hours/.test(items[1]) && /cover photo/.test(items[1]) && /Sculpture/.test(items[1]), items[1]);
  check("collector → museum (same kind): no warning", !c.querySelectorAll('[data-testid="switch-request"]')[2].querySelector('[data-testid="switch-warning"]'));
  c.querySelectorAll('[data-testid="switch-request"]')[0].querySelector("button").click();
  await waitFor(() => reviews.length);
  check("Approve runs the review with approve = true", reviews[0]?.requestId === "p1" && reviews[0]?.approve === true);
  await waitFor(() => c.querySelectorAll('[data-testid="switch-request"]').length === 2);
  const second = c.querySelectorAll('[data-testid="switch-request"]')[0];
  [...second.querySelectorAll("button")].find((b) => /decline/i.test(b.textContent)).click(); await tick();
  setVal(c.querySelector('[data-testid="switch-request"] textarea'), "Not a gallery");
  await tick();
  [...c.querySelectorAll('[data-testid="switch-request"] button')].find((b) => /^decline$/i.test(b.textContent.trim())).click();
  await waitFor(() => reviews.length === 2);
  check("Decline sends approve = false with the note", reviews[1]?.approve === false && reviews[1]?.note === "Not a gallery", JSON.stringify(reviews[1]));
  check("recently changed profiles offer Undo", /Undo — restore the Artist profile/.test(c.textContent));
  [...c.querySelectorAll('[data-testid="switch-recent"] button')][0].click();
  await waitFor(() => restores.length);
  check("Undo restores from the archive", restores[0] === "arch1");
  root.unmount();
}
{
  // before migration 027 is installed: nothing shown, no error
  base44.entities.ProfileSwitchRequest.filter = async () => { throw new Error('relation "profile_switch_request" does not exist'); };
  const root = createRoot(c);
  root.render(React.createElement(AdminSwitchRequests));
  await tick(200);
  check("if the requests table is missing, the Approvals tab is unaffected", !c.querySelector('[data-testid="switch-requests"]') && !/does not exist/.test(c.textContent));
  root.unmount();
}

// ---- pages and providers
const src = (f) => readFileSync(join(ROOT, f), "utf8");
check("the four calls clear the data cache and refresh open pages after a success",
  /const DATA_CHANGING = \[\s*"requestProfileSwitch",\s*"cancelProfileSwitch",\s*"reviewProfileSwitch",\s*"restoreProfileArchive",\s*\];[\s\S]{0,300}await auth\[method\]\(\.\.\.args\);\s*invalidateEntityCache\(\);\s*bumpDataRevision\(\);/.test(src("src/api/base44Client.js")));
check("artist editor hosts the panel", /<ProfileSwitchPanel userId=\{user\.id\} currentType="Artist"/.test(src("src/pages/ArtistProfileEdit.jsx")));
check("collector editor hosts the panel", /<ProfileSwitchPanel userId=\{user\.id\} currentType=\{form\.type\}/.test(src("src/pages/CollectorProfilePage.jsx")));
check("gallery/venue page hosts it for the real owner only", /\{isActualOwner && \([\s\S]{0,200}<ProfileSwitchPanel userId=\{user\.id\} currentType=\{profile\.type\}/.test(src("src/pages/GalleryProfile.jsx")));
check("collector editor: the type can no longer be changed directly once the profile exists", /disabled=\{!!profileId\}/.test(src("src/pages/CollectorProfilePage.jsx")));
check("artist editor sends a member who is now a gallery/venue/collector to their editor", /CollectorProfile\.filter\(\{ user_id: u\.id \}\)[\s\S]{0,300}navigate\(/.test(src("src/pages/ArtistProfileEdit.jsx")));
check("collector editor sends a member who is now an artist to the artist editor", /navigate\("\/profile\/edit", \{ replace: true \}\)/.test(src("src/pages/CollectorProfilePage.jsx")));
check("Approvals tab shows the requests", /<AdminSwitchRequests \/>/.test(src("src/components/AdminApprovalsPanel.jsx")));
const prov = src("src/api/providers/supabase.js");
check("provider: the four database functions, by name", ["request_profile_switch", "cancel_profile_switch", "review_profile_switch", "restore_profile_archive"].every((f) => prov.includes(`rpc("${f}"`)));
check("provider: the two tables", /ProfileSwitchRequest: "profile_switch_request"/.test(prov) && /ProfileArchive: "profile_archive"/.test(prov));

// ---- the database file
const mig = src("supabase/migrations/027_profile_switch.sql");
check("027: one waiting request per member", /create unique index if not exists idx_switch_one_pending[\s\S]*where status = 'pending'/.test(mig));
check("027: requests readable only by their member and admins; no direct writes", /create policy switch_read[\s\S]*user_id = auth\.uid\(\) or public\.is_admin\(\)/.test(mig) && !/create policy \w+ on public\.profile_switch_request\s+for (insert|update|delete)/.test(mig));
check("027: the archive is admins-only", /create policy archive_read on public\.profile_archive\s+for select using \(public\.is_admin\(\)\)/.test(mig));
check("027: review is admin-only", /review_profile_switch[\s\S]*?if not public\.is_admin\(\) then\s+raise exception 'Only an administrator can review/.test(mig));
check("027: the old profile is archived WHOLE before it is replaced", /insert into profile_archive[\s\S]*to_jsonb\(ap\) else to_jsonb\(cp\)[\s\S]*?gallery_work w where w\.gallery_id[\s\S]*?collected_work c where c\.collector_profile_id[\s\S]*?delete from artist_profile where id = r\.from_id/.test(mig));
check("027: the new profile keeps the SAME id (followers follow it)", /values\s*\(ap\.id, ap\.user_id/.test(mig) && /values\s*\(cp\.id, cp\.user_id/.test(mig));
check("027: same kind (e.g. collector → gallery) just changes type, nothing archived", /if r\.from_kind = 'space' and r\.to_type <> 'Artist' then\s+-- Same table[\s\S]*?update collector_profile\s+set type = r\.to_type/.test(mig));
check("027: the profile must still be the one asked about", /The member''s profile has changed since they asked/.test(mig));
check("027: restore puts the archived profile back, archiving its replacement first", /restore_profile_archive[\s\S]*Replaced when an earlier profile was restored[\s\S]*jsonb_populate_record\(null::artist_profile/.test(mig));
check("027: members can no longer change type directly (the review queue only)", /create trigger trg_protect_collector_type\s+before update of type on public\.collector_profile/.test(mig) && /if new\.type is distinct from old\.type then\s+raise exception/.test(mig));
check("027: anon cannot call any of it", ["request_profile_switch(text, text, text)", "cancel_profile_switch()", "review_profile_switch(uuid, boolean, text)", "restore_profile_archive(uuid)"].every((f) => mig.includes(`revoke execute on function public.${f}`)));
check("027: the type list matches the site's", (() => {
  const sql = mig.match(/select array\[([\s\S]*?)\];/)[1].match(/'([^']+)'/g).map((s) => s.slice(1, -1)).sort();
  return JSON.stringify(sql) === JSON.stringify([...Panel.SWITCH_TYPES].sort());
})());
const undo = src("supabase/migrations/027_profile_switch.revert.sql");
check("undo never drops the archive (the only copy of replaced profiles)", !/drop table/i.test(undo.replace(/--.*$/gm, "")));

console.log(`verify:switch — ${pass} passed, ${fails.length} failed`);
if (fails.length) { for (const f of fails) console.log("  ✗", f); process.exit(1); }
process.exit(0);
