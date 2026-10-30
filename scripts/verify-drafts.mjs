/**
 * Verifies saving editorials as drafts (B6 in docs/CLIENT-REQUESTS.md),
 * driving the real ArticleForm with the database calls recorded.
 *
 * Run: npm run verify:drafts
 */
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { JSDOM } from "jsdom";

const ROOT = fileURLToPath(new URL("..", import.meta.url));
const dom = new JSDOM("<!doctype html><html><body><div id='root'></div></body></html>", { url: "http://localhost/editorial", pretendToBeVisual: true });
const { window } = dom;
globalThis.window = window; globalThis.document = window.document;
Object.defineProperty(globalThis, "navigator", { value: window.navigator, configurable: true });
for (const k of ["HTMLElement", "Element", "Node", "Event", "MouseEvent", "KeyboardEvent", "SVGElement", "Image", "HTMLInputElement", "HTMLTextAreaElement", "HTMLSelectElement", "File", "Blob"]) globalThis[k] = window[k];
globalThis.requestAnimationFrame = (cb) => setTimeout(() => cb(Date.now()), 0);
globalThis.ResizeObserver = window.ResizeObserver = class { observe() {} unobserve() {} disconnect() {} };
globalThis.IntersectionObserver = window.IntersectionObserver = class { observe() {} unobserve() {} disconnect() {} takeRecords() { return []; } };
globalThis.matchMedia = window.matchMedia = () => ({ matches: false, media: "", addListener() {}, removeListener() {}, addEventListener() {}, removeEventListener() {} });
globalThis.MutationObserver = window.MutationObserver;
window.URL.createObjectURL = globalThis.URL.createObjectURL = () => "blob:x";
window.URL.revokeObjectURL = globalThis.URL.revokeObjectURL = () => {};
globalThis.IS_REACT_ACT_ENVIRONMENT = false;

const React = (await import("react")).default;
const { createRoot } = await import("react-dom/client");
const { MemoryRouter } = await import("react-router-dom");
const { base44 } = await import("../src/api/base44Client.js");
const ArticleForm = (await import("../src/components/ArticleForm.jsx")).default;
const Editorial = (await import("../src/pages/Editorial.jsx")).default;

let pass = 0;
const fails = [];
const check = (n, c, d = "") => (c ? pass++ : fails.push(`${n}${d ? ` — ${d}` : ""}`));
const tick = (ms = 80) => new Promise((r) => setTimeout(r, ms));
const waitFor = async (fn) => { for (let i = 0; i < 60 && !fn(); i++) await tick(50); };
const c = document.getElementById("root");
const btn = (re) => [...c.querySelectorAll("button")].find((b) => re.test(b.textContent.trim()));
const setVal = (el, v) => {
  const proto = el.tagName === "TEXTAREA" ? window.HTMLTextAreaElement.prototype : window.HTMLInputElement.prototype;
  Object.getOwnPropertyDescriptor(proto, "value").set.call(el, v);
  el.dispatchEvent(new window.Event("input", { bubbles: true }));
};
const titleBox = () => c.querySelector("form input[required]");
const bodyBox = () => c.querySelector("form textarea[required]");
const submit = () => c.querySelector("form").dispatchEvent(new window.Event("submit", { bubbles: true, cancelable: true }));

// the database, recorded
let calls = [], failNext = null, nextId = 1;
base44.entities.Article.create = async (p) => { calls.push(["create", { ...p }]); if (failNext) { const e = failNext; failNext = null; throw e; } return { id: `art-${nextId++}`, ...p }; };
base44.entities.Article.update = async (id, p) => { calls.push(["update", id, { ...p }]); if (failNext) { const e = failNext; failNext = null; throw e; } return { id, ...p }; };
let confirmAnswer = true;
window.confirm = () => confirmAnswer;
const user = { id: "u1", full_name: "Ed Itor", role: "editor" };

// ---- a new article, saved as a draft and continued
{
  let created = 0, saved = 0;
  calls = [];
  const root = createRoot(c);
  root.render(React.createElement(MemoryRouter, null, React.createElement(ArticleForm, { user, onClose: () => {}, onCreated: () => created++, onSaved: () => saved++ })));
  await waitFor(() => titleBox());
  check("a new article shows 'Publish Article' and 'Save Draft'", !!btn(/^Publish Article$/) && !!btn(/^Save Draft$/));
  check("the old 'Publish immediately' tickbox is gone", !/publish immediately/i.test(c.textContent));
  check("status: not saved yet", /New article — not saved yet/.test(c.querySelector('[data-testid="article-status"]').textContent));

  btn(/^Save Draft$/).click(); await tick(150);
  check("a draft needs a title: says so, saves nothing", calls.length === 0 && /give the article a title/i.test(c.textContent));

  setVal(titleBox(), "Half-written piece"); await tick();
  btn(/^Save Draft$/).click();
  await waitFor(() => calls.length === 1 && c.querySelector('[data-testid="draft-saved"]'));
  check("a title alone is enough for a draft (no text yet)", calls[0]?.[0] === "create" && calls[0][1].body === "" && calls[0][1].title === "Half-written piece");
  check("a draft is saved hidden", calls[0]?.[1].published === false);
  check("the form stays open and says when it was saved, and where to find it", !!c.querySelector('[data-testid="draft-saved"]') && /under Drafts on the Editorial page/.test(c.textContent) && created === 0);
  check("open lists are told to refresh", saved === 1);
  check("status now: draft, hidden", /Draft — hidden from the site/.test(c.querySelector('[data-testid="article-status"]').textContent));
  check("Cancel becomes Close once saved", !!btn(/^Close$/));

  setVal(bodyBox(), "First paragraph."); await tick();
  btn(/^Save Draft$/).click();
  await waitFor(() => calls.length === 2);
  check("saving again UPDATES the same draft — never a second copy", calls[1]?.[0] === "update" && calls[1][1] === "art-1" && calls[1][2].published === false, JSON.stringify(calls.map((x) => x[0])));

  setVal(bodyBox(), "   "); await tick();
  submit(); await tick(150);
  check("publishing needs the text: says so, saves nothing", calls.length === 2 && /add the article text before publishing/i.test(c.textContent));

  setVal(bodyBox(), "The finished article."); await tick();
  submit();
  await waitFor(() => calls.length === 3);
  check("Publish updates the same article and makes it live", calls[2]?.[0] === "update" && calls[2][1] === "art-1" && calls[2][2].published === true);
  check("publishing closes the form", created === 1);
  root.unmount();
}

// ---- errors are shown, not a spinner forever; a taken address is handled
{
  calls = [];
  const root = createRoot(c);
  root.render(React.createElement(MemoryRouter, null, React.createElement(ArticleForm, { user, onClose: () => {}, onCreated: () => {} })));
  await waitFor(() => titleBox());
  setVal(titleBox(), "Same Title"); await tick();
  failNext = new Error('duplicate key value violates unique constraint "article_slug_key"');
  btn(/^Save Draft$/).click();
  await waitFor(() => calls.length === 2);
  check("a new article whose web address is taken gets a suffix and saves", calls[0][1].slug === "same-title" && /^same-title-[a-z0-9]{1,4}$/.test(calls[1][1].slug), calls.map((x) => x[1].slug).join(" → "));
  failNext = new Error("network down");
  btn(/^Save Draft$/).click();
  await waitFor(() => /network down/.test(c.textContent));
  check("a failed save says why", /network down/.test(c.textContent));
  check("…and the buttons work again", !btn(/^Save Draft$/).disabled);
  root.unmount();
}

// ---- editing an article that is already live
{
  calls = [];
  let created = 0;
  const live = { id: "live-1", title: "Live piece", body: "Text.", published: true, author_name: "A", slug: "live-piece" };
  const root = createRoot(c);
  root.render(React.createElement(MemoryRouter, null, React.createElement(ArticleForm, { user, article: live, onClose: () => {}, onCreated: () => created++, onSaved: () => {} })));
  await waitFor(() => titleBox());
  check("a live article: 'Save Changes' and 'Move to Drafts'", !!btn(/^Save Changes$/) && !!btn(/^Move to Drafts$/));
  check("status: published", /Published — live on the site/.test(c.querySelector('[data-testid="article-status"]').textContent));
  submit();
  await waitFor(() => calls.length === 1);
  check("Save Changes keeps it live", calls[0][0] === "update" && calls[0][1] === "live-1" && calls[0][2].published === true);
  confirmAnswer = false;
  btn(/^Move to Drafts$/).click(); await tick(150);
  check("Move to Drafts asks first — and 'no' changes nothing", calls.length === 1);
  confirmAnswer = true;
  btn(/^Move to Drafts$/).click();
  await waitFor(() => calls.length === 2);
  check("…'yes' hides it as a draft", calls[1][2].published === false);
  root.unmount();
}

// ---- the Drafts list on the Editorial page
{
  const ARTS = [
    { id: "d1", title: "Draft One", published: false, author_name: "Ed", updated_date: "2026-10-30T10:00:00Z", body: "x" },
    { id: "p1", title: "Live One", published: true, author_name: "Ed", created_date: "2026-10-01T10:00:00Z", body: "y", slug: "live-one" },
  ];
  base44.entities.Article.filter = async () => ARTS.filter((a) => a.published);
  base44.entities.Article.list = async () => ARTS;
  base44.auth.me = async () => user;
  const root = createRoot(c);
  root.render(React.createElement(MemoryRouter, null, React.createElement(Editorial)));
  await waitFor(() => c.querySelector('[data-testid="drafts"]'));
  check("an editor sees 'Drafts (1)' with the draft", /Drafts \(1\)/.test(c.textContent) && c.querySelectorAll('[data-testid="draft-row"]').length === 1 && /Draft One/.test(c.querySelector('[data-testid="draft-row"]').textContent));
  check("…with who and when it was last saved", /last saved/.test(c.querySelector('[data-testid="draft-row"]').textContent));
  btn(/^Continue editing$/).click();
  await waitFor(() => titleBox());
  check("'Continue editing' opens the draft in the form", titleBox()?.value === "Draft One" && /Draft — hidden from the site/.test(c.textContent));
  root.unmount();
  base44.auth.me = async () => { throw new Error("signed out"); };
  const root2 = createRoot(c);
  root2.render(React.createElement(MemoryRouter, null, React.createElement(Editorial)));
  await tick(400);
  check("a visitor never sees the Drafts list", !c.querySelector('[data-testid="drafts"]'));
  root2.unmount();
}

// ---- the source
const form = readFileSync(join(ROOT, "src/components/ArticleForm.jsx"), "utf8");
check("a picture uploaded by one save is not uploaded again by the next", /uploaded\.set\(entry\.id, url\)/.test(form) && /const settle = \(list\) => list\.map/.test(form) && /if \(coverFile\) \{ setCoverFile\(null\)/.test(form));
check("admin Editorial tab labels drafts DRAFT", /" · DRAFT"/.test(readFileSync(join(ROOT, "src/components/AdminArticlesPanel.jsx"), "utf8")));

console.log(`verify:drafts — ${pass} passed, ${fails.length} failed`);
if (fails.length) { for (const f of fails) console.log("  ✗", f); process.exit(1); }
process.exit(0);
