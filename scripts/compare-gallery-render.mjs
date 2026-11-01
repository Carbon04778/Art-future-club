/**
 * B5 regression proof, on every real published article: the gallery change
 * may move images into a slider, but must not lose a word or an image.
 * OLD = ArticleBody before B5 (git show <commit>:src/components/ArticleBody.jsx > .tmp/ArticleBody.b4.jsx)
 *   npx vite-node --mode test scripts/compare-gallery-render.mjs
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
globalThis.matchMedia = window.matchMedia = () => ({ matches: false, media: "", addListener() {}, removeListener() {}, addEventListener() {}, removeEventListener() {} });
globalThis.IntersectionObserver = window.IntersectionObserver = class { observe() {} unobserve() {} disconnect() {} takeRecords() { return []; } };
globalThis.MutationObserver = window.MutationObserver;
const React = (await import("react")).default;
const { createRoot } = await import("react-dom/client");
const OldBody = (await import("../.tmp/ArticleBody.b4.jsx")).default;
const NewBody = (await import("../src/components/ArticleBody.jsx")).default;
const E = Object.fromEntries(readFileSync(new URL("../.env", import.meta.url), "utf8").split(/\r?\n/).filter((l) => /^[A-Z_]+=/.test(l)).map((l) => [l.slice(0, l.indexOf("=")), l.slice(l.indexOf("=") + 1).trim()]));
const arts = await (await fetch(`${E.VITE_SUPABASE_URL}/rest/v1/article?select=*&published=eq.true&limit=2000`, { headers: { apikey: E.VITE_SUPABASE_ANON_KEY } })).json();
const c = document.getElementById("root");
async function look(Comp, article) {
  const root = createRoot(c);
  await new Promise((r) => { root.render(React.createElement(Comp, { article })); setTimeout(r, 40); });
  // words: the article's own text (paragraphs and headings), not gallery controls
  const words = [...c.querySelectorAll("p, h2")].filter((e) => !e.closest('[aria-roledescription="carousel"]') && !e.closest("figcaption")).map((e) => e.textContent.trim()).join("\n");
  const imgs = [...c.querySelectorAll("img")].map((i) => i.getAttribute("src")).sort();
  const slider = !!c.querySelector('[aria-roledescription="carousel"]');
  const html = c.innerHTML;
  root.unmount();
  return { words, imgs, slider, html };
}
const res = { articles: arts.length, sameWords: 0, sameImages: 0, unchanged: 0, nowSlider: 0, fullWidthFixed: 0, problems: [] };
for (const a of arts) {
  const o = await look(OldBody, a), n = await look(NewBody, a);
  const wordsOk = o.words === n.words;
  const imgsOk = JSON.stringify(o.imgs) === JSON.stringify(n.imgs);
  if (wordsOk) res.sameWords++; if (imgsOk) res.sameImages++;
  if (o.html === n.html) res.unchanged++;
  if (n.slider) res.nowSlider++;
  if ((a.images || []).some((i) => i && i.full === true)) res.fullWidthFixed++;
  if (!wordsOk || !imgsOk) res.problems.push({ title: a.title, wordsOk, imgsOk, lostImages: o.imgs.filter((u) => !n.imgs.includes(u)) });
}
writeFileSync(new URL("../reports/B5-regression.json", import.meta.url), JSON.stringify(res, null, 1));
console.log(`articles ${res.articles} | every word kept: ${res.sameWords} | every image kept: ${res.sameImages} | now have a slider: ${res.nowSlider} | otherwise unchanged: ${res.unchanged} | with full-width images now honoured: ${res.fullWidthFixed}`);
res.problems.slice(0, 5).forEach((p) => console.log("  PROBLEM:", JSON.stringify(p)));
window.close(); process.exit(res.problems.length ? 1 : 0);
