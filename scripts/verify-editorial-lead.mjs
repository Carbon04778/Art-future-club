/**
 * Verifies the Editorial page's lead article (A4 in docs/CLIENT-REQUESTS.md):
 * the newest live article is shown large first, featured articles follow,
 * and the large lead is only on the main page — not while a category or a
 * search narrows the list.
 *
 * Run: npm run verify:editorial
 */
import { JSDOM } from "jsdom";

const dom = new JSDOM("<!doctype html><html><body><div id='root'></div></body></html>", { url: "http://localhost/editorial", pretendToBeVisual: true });
const { window } = dom;
globalThis.window = window; globalThis.document = window.document;
Object.defineProperty(globalThis, "navigator", { value: window.navigator, configurable: true });
for (const k of ["HTMLElement", "Element", "Node", "Event", "MouseEvent", "SVGElement", "Image", "HTMLInputElement"]) globalThis[k] = window[k];
globalThis.requestAnimationFrame = (cb) => setTimeout(() => cb(Date.now()), 0);
globalThis.ResizeObserver = window.ResizeObserver = class { observe() {} unobserve() {} disconnect() {} };
globalThis.matchMedia = window.matchMedia = () => ({ matches: false, media: "", addListener() {}, removeListener() {}, addEventListener() {}, removeEventListener() {} });
globalThis.IntersectionObserver = window.IntersectionObserver = class { observe() {} unobserve() {} disconnect() {} takeRecords() { return []; } };
globalThis.MutationObserver = window.MutationObserver;
globalThis.IS_REACT_ACT_ENVIRONMENT = false;

const React = (await import("react")).default;
const { createRoot } = await import("react-dom/client");
const { MemoryRouter } = await import("react-router-dom");
const { base44 } = await import("../src/api/base44Client.js");
const Editorial = (await import("../src/pages/Editorial.jsx")).default;

let pass = 0;
const fails = [];
const check = (n, c, d = "") => (c ? pass++ : fails.push(`${n}${d ? ` — ${d}` : ""}`));
const tick = (ms = 150) => new Promise((r) => setTimeout(r, ms));
const day = (n) => new Date(Date.now() - n * 864e5).toISOString();

// The page's own data calls, answered with a fixed set of articles.
let ARTICLES = [];
let USER = null;
base44.entities.Article.filter = async () => ARTICLES.filter((a) => a.published);
base44.entities.Article.list = async () => ARTICLES;
base44.auth.me = async () => { if (!USER) throw new Error("signed out"); return USER; };

const art = (id, o = {}) => ({ id, slug: id, title: `Title ${id}`, subtitle: `Subtitle ${id}`, category: "Essay", published: true, cover_image_url: `/${id}.webp`, author_name: "A. Writer", created_date: day(30), ...o });

const c = document.getElementById("root");
const read = () => ({
  lead: [...c.querySelectorAll('[data-testid="editorial-lead"] h2')].map((h) => h.textContent),
  featured: [...c.querySelectorAll('[data-testid="editorial-featured"] h2')].map((h) => h.textContent),
  grid: [...c.querySelectorAll("h3")].map((h) => h.textContent),
});
async function page() {
  const root = createRoot(c);
  root.render(React.createElement(MemoryRouter, null, React.createElement(Editorial)));
  // wait for the articles to arrive (or the empty message), not a fixed time
  for (let i = 0; i < 60 && !c.querySelector("h2 + *, h3") && !/no articles match/i.test(c.textContent); i++) await tick(50);
  await tick(150);
  return { root, ...read(), leadText: c.querySelector('[data-testid="editorial-lead"]')?.textContent || "" };
}
const click = async (label) => {
  [...c.querySelectorAll("button")].find((b) => b.textContent.trim() === label)?.click();
  await tick();
};
const type = async (v) => {
  const i = c.querySelector('input[placeholder^="Search articles"]');
  Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, "value").set.call(i, v);
  i.dispatchEvent(new window.Event("input", { bubbles: true }));
  await tick();
};

// ---- 1. newest leads, featured follows, the rest in the grid
ARTICLES = [
  art("old", { publish_date: day(20) }),
  art("feat", { publish_date: day(10), featured: true }),
  art("new", { publish_date: day(2), category: "Review" }),
  art("mid", { publish_date: day(5) }),
];
{
  const p = await page();
  check("the newest article leads, large", p.lead.join() === "Title new", p.lead.join());
  check("the lead shows its subtitle", p.leadText.includes("Subtitle new"));
  check("the lead has a 'Continue reading' prompt", /continue reading/i.test(p.leadText));
  check("the lead links to the article", !!c.querySelector('[data-testid="editorial-lead"] a[href="/editorial/new"]'));
  check("featured follows the lead, still large", p.featured.join() === "Title feat", p.featured.join());
  const order = [...c.querySelectorAll("[data-testid]")].map((e) => e.dataset.testid);
  check("lead comes before featured on the page", order[0] === "editorial-lead" && order[1] === "editorial-featured", order.join());
  check("the rest stay in the grid, newest first, lead not repeated", p.grid.join() === "Title mid,Title old", p.grid.join());

  // ---- 2. filtering or searching: no large lead (Julie: "Only on the main page")
  await click("Review");
  let r = read();
  check("category filter: no large lead", r.lead.length === 0, r.lead.join());
  check("category filter: the newest is a normal card in the results", r.grid.join() === "Title new", r.grid.join());
  await click("Essay");
  r = read();
  check("category filter: featured keeps its large card as before", r.featured.join() === "Title feat" && r.lead.length === 0, JSON.stringify(r));
  await click("All");
  r = read();
  check("back to All: the lead returns", r.lead.join() === "Title new");
  await type("Title");
  r = read();
  check("search: no large lead", r.lead.length === 0 && r.grid.includes("Title new"), JSON.stringify(r));
  await type("");
  r = read();
  check("search cleared: the lead returns", r.lead.join() === "Title new");
  p.root.unmount();
}

// ---- 3. the newest is itself featured: shown once, as the lead
ARTICLES = [art("a", { publish_date: day(1), featured: true }), art("b", { publish_date: day(3) })];
{
  const p = await page();
  check("newest + featured: it leads", p.lead.join() === "Title a");
  check("newest + featured: not shown a second time", p.featured.length === 0 && !p.grid.includes("Title a"), JSON.stringify(read()));
  p.root.unmount();
}

// ---- 4. an editor: their draft or scheduled piece never takes the lead
ARTICLES = [
  art("draft", { published: false, created_date: day(0) }),
  art("later", { publish_date: new Date(Date.now() + 5 * 864e5).toISOString() }),
  art("live", { publish_date: day(4) }),
];
USER = { id: "u1", role: "editor" };
{
  const p = await page();
  check("editor: the lead is the newest LIVE article, not a draft or scheduled one", p.lead.join() === "Title live", p.lead.join());
  check("editor: drafts still listed for them in the grid", p.grid.includes("Title draft") && p.grid.includes("Title later"), p.grid.join());
  p.root.unmount();
}
USER = null;

// ---- 5. no articles
ARTICLES = [];
{
  const p = await page();
  check("no articles: no lead, the empty message shows", p.lead.length === 0 && /no articles match/i.test(c.textContent));
  p.root.unmount();
}

console.log(`verify:editorial — ${pass} passed, ${fails.length} failed`);
if (fails.length) { for (const f of fails) console.log("  ✗", f); process.exit(1); }
process.exit(0);
