/**
 * B4 regression proof: render every real published article with the OLD
 * ArticleBody (from git HEAD, written to .tmp/ArticleBody.old.jsx) and the NEW
 * one, and compare the HTML. Read-only.
 *   git show HEAD:src/components/ArticleBody.jsx > .tmp/ArticleBody.old.jsx
 *   npx vite-node --mode test scripts/compare-article-render.mjs
 */
import { readFileSync, writeFileSync } from "node:fs";
import { JSDOM } from "jsdom";
const dom = new JSDOM("<!doctype html><html><body><div id='root'></div></body></html>", { url: "http://localhost/", pretendToBeVisual: true });
const { window } = dom;
globalThis.window = window; globalThis.document = window.document;
Object.defineProperty(globalThis, "navigator", { value: window.navigator, configurable: true });
for (const k of ["HTMLElement", "Element", "Node", "Event", "MouseEvent", "SVGElement", "Image"]) globalThis[k] = window[k];
globalThis.requestAnimationFrame = (cb) => setTimeout(() => cb(Date.now()), 0);
globalThis.ResizeObserver = window.ResizeObserver = class { observe() {} unobserve() {} disconnect() {} };
// Real browsers have these; jsdom does not. The article gallery's carousel (B5) asks for them.
globalThis.matchMedia = window.matchMedia = () => ({ matches: false, media: "", addListener() {}, removeListener() {}, addEventListener() {}, removeEventListener() {} });
globalThis.IntersectionObserver = window.IntersectionObserver = class { observe() {} unobserve() {} disconnect() {} takeRecords() { return []; } };
globalThis.MutationObserver = window.MutationObserver;
const React = (await import("react")).default;
const { createRoot } = await import("react-dom/client");
const OldBody = (await import("../.tmp/ArticleBody.old.jsx")).default;
const NewBody = (await import("../src/components/ArticleBody.jsx")).default;
const E = Object.fromEntries(readFileSync(new URL("../.env", import.meta.url), "utf8").split(/\r?\n/).filter((l) => /^[A-Z_]+=/.test(l)).map((l) => [l.slice(0, l.indexOf("=")), l.slice(l.indexOf("=") + 1).trim()]));
const arts = await (await fetch(`${E.VITE_SUPABASE_URL}/rest/v1/article?select=*&published=eq.true&limit=2000`, { headers: { apikey: E.VITE_SUPABASE_ANON_KEY } })).json();
const c = document.getElementById("root");
async function html(Comp, article) {
  const root = createRoot(c);
  await new Promise((r) => { root.render(React.createElement(Comp, { article })); setTimeout(r, 30); });
  const h = c.innerHTML; root.unmount(); return h;
}
let same = 0; const diff = [];
for (const a of arts) {
  const [o, n] = [await html(OldBody, a), await html(NewBody, a)];
  if (o === n) same++; else diff.push(a.title);
}
const out = { articles: arts.length, identical: same, different: diff.length, differentTitles: diff };
writeFileSync(new URL("../reports/B4-regression.json", import.meta.url), JSON.stringify(out, null, 1));
console.log(`published articles: ${arts.length} | rendered identically old vs new: ${same} | different: ${diff.length}`);
diff.slice(0, 5).forEach((t) => console.log("  DIFFERENT:", t));
window.close(); process.exit(diff.length ? 1 : 0);
