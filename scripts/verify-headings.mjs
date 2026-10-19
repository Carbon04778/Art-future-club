/**
 * Verifies headings in article text (B4 in docs/CLIENT-REQUESTS.md).
 *
 * Run: npm run verify:headings
 */

import { readFileSync } from "node:fs";
import { JSDOM } from "jsdom";

const dom = new JSDOM("<!doctype html><html><body><div id='root'></div></body></html>", { url: "http://localhost/", pretendToBeVisual: true });
const { window } = dom;
globalThis.window = window; globalThis.document = window.document;
Object.defineProperty(globalThis, "navigator", { value: window.navigator, configurable: true });
for (const k of ["HTMLElement", "Element", "Node", "Event", "MouseEvent", "SVGElement", "Image"]) globalThis[k] = window[k];
globalThis.requestAnimationFrame = (cb) => setTimeout(() => cb(Date.now()), 0);
globalThis.ResizeObserver = window.ResizeObserver = class { observe() {} unobserve() {} disconnect() {} };

const React = (await import("react")).default;
const { createRoot } = await import("react-dom/client");
const { parseArticleText, plainArticleText, isHeading } = await import("../src/lib/articleText.js");
const ArticleBody = (await import("../src/components/ArticleBody.jsx")).default;

let pass = 0;
const fails = [];
const check = (n, c, d = "") => (c ? pass++ : fails.push(`${n}${d ? ` — ${d}` : ""}`));

// --- reading the text -----------------------------------------------------------
const kinds = (body) => parseArticleText(body).map((b) => `${b.kind}:${b.text}`).join(" | ");
check("'## ' starts a heading", kinds("## Early years\n\nShe began painting.") === "heading:Early years | para:She began painting.");
check("a heading typed without a blank line after it still splits", kinds("## Early years\nShe began painting.") === "heading:Early years | para:She began painting.");
check("a paragraph without the marker is a paragraph", kinds("Just text.") === "para:Just text.");
check("'#hashtag' is not a heading", !isHeading("#hashtag in a sentence"));
check("'##' with no space is not a heading", !isHeading("##notaheading"));
check("an address line stays a paragraph", kinds("800 Castle Peak Road, Mei Foo, Kowloon") === "para:800 Castle Peak Road, Mei Foo, Kowloon");
check("a date line stays a paragraph", kinds("7.02.2026-9.08.2026") === "para:7.02.2026-9.08.2026");
check("an empty heading is dropped", kinds("## \n\nText") === "para:Text", kinds("## \n\nText"));
check("plain text drops the markers (word count, crawlers)", plainArticleText("## Title\n\nBody text") === "Title\n\nBody text");
check("plain text leaves ordinary text alone", plainArticleText("A #1 hit\n\n## not\nx") === "A #1 hit\n\nnot\nx");

// --- rendered ------------------------------------------------------------------------
const c = document.getElementById("root");
async function render(article) {
  const root = createRoot(c);
  await new Promise((r) => { root.render(React.createElement(ArticleBody, { article: { title: "T", ...article } })); setTimeout(r, 120); });
  const seq = [...c.querySelectorAll("h2, p, img, figure")].filter((e) => !(e.tagName === "P" && e.closest("figure")))
    .map((e) => (e.tagName === "H2" ? `H:${e.textContent}` : e.tagName === "P" ? `P:${e.textContent}` : "IMG"));
  const out = { html: c.innerHTML, seq, h2: [...c.querySelectorAll("h2")].map((h) => h.textContent), cls: c.querySelector("h2")?.className || "" };
  root.unmount();
  return out;
}
// collapse consecutive IMG markers (a figure contains an img)
const flat = (seq) => seq.filter((x, i) => !(x === "IMG" && seq[i - 1] === "IMG"));

const r1 = await render({ body: "Intro.\n\n## Early years\n\nShe began painting.", layout: "cover_top" });
check("heading renders as a heading element", r1.h2.join() === "Early years", r1.h2.join());
check("the '##' marker never shows", !r1.html.includes("##"));
check("heading is larger and bold", /text-2xl/.test(r1.cls) && /font-semibold/.test(r1.cls), r1.cls);
check("order is kept", flat(r1.seq).join(" ") === "P:Intro. H:Early years P:She began painting.", flat(r1.seq).join(" "));

// closing image must go ABOVE a heading, never between it and its paragraph
const r2 = await render({ body: "One.\n\nTwo.\n\n## Last thoughts\n\nThe final paragraph of prose here.", closing_image_url: "/c.jpg", layout: "cover_top" });
const s2 = flat(r2.seq);
check("closing image goes above the last heading, not after it",
  s2.indexOf("IMG") === s2.indexOf("H:Last thoughts") - 1 && s2[s2.indexOf("H:Last thoughts") + 1] === "P:The final paragraph of prose here.", s2.join(" "));

// intro image after the first PARAGRAPH, even if the article opens with a heading
const r3 = await render({ body: "## Opening\n\nFirst paragraph.\n\nSecond paragraph.", images: ["/i.jpg"], layout: "image_after_intro" });
const s3 = flat(r3.seq);
check("intro image goes after the first paragraph, not after a heading",
  s3.join(" ").startsWith("H:Opening P:First paragraph. IMG"), s3.join(" "));

// a mid-article gallery never sits directly after a heading
const r4 = await render({ body: "A.\n\n## Section\n\nB.\n\nC.\n\nD.", images: ["/1.jpg", "/2.jpg"], layout: "gallery_middle" });
const s4 = flat(r4.seq);
const after = s4.map((x, i) => (x === "IMG" ? s4[i - 1] : null)).filter(Boolean);
check("no image directly after a heading", after.every((x) => !x.startsWith("H:")), s4.join(" "));

// legacy layout: the last paragraph keeps its heading
const r5 = await render({ body: "A.\n\n## Coda\n\nB.", images: ["/1.jpg", "/2.jpg"], layout: "image_before_close" });
const s5 = flat(r5.seq);
check("legacy layout keeps a heading with its last paragraph", s5.join(" ").endsWith("IMG H:Coda P:B."), s5.join(" "));

// existing articles (no marker) render exactly as plain paragraphs
const r6 = await render({ body: "Para one.\n\nJao Tsung-I Academy\n\n800 Castle Peak Road, Kowloon\n\n7.02.2026-9.08.2026", layout: "cover_top" });
check("existing text: no headings appear", r6.h2.length === 0);
check("existing text: every paragraph still a paragraph", flat(r6.seq).filter((x) => x.startsWith("P:")).length === 4, flat(r6.seq).join(" "));

// --- wiring --------------------------------------------------------------------------
const read = (p) => readFileSync(new URL(p, import.meta.url), "utf8");
const form = read("../src/components/ArticleForm.jsx");
check("editor has an 'Add heading' button", /onClick=\{addHeading\}/.test(form) && /\+ Add heading/.test(form));
check("editor explains the marker", /starts with <code className="font-mono">## <\/code> shows as a heading/.test(form));
check("reading time ignores the markers", /plainArticleText\(form\.body\)/.test(form));
check("crawlers never see the marker", read("../api/prerender.js").includes('.replace(/^##(?=[ \\t]|$)[ \\t]*/gm, "")'));
// The crawler copy must use the same rule as the page (src/lib/articleText.js).
check("crawler rule matches the page's rule", read("../src/lib/articleText.js").includes("const HEADING_RE = /^##(?=[ \\t]|$)[ \\t]*/;"));
check("the article page reads text through the parser", /parseArticleText\(article\.body\)/.test(read("../src/components/ArticleBody.jsx")));

console.log(`\n  passed: ${pass}`);
if (fails.length) { console.log(`  FAILED: ${fails.length}`); fails.forEach((f) => console.log("   ✗ " + f)); window.close(); process.exit(1); }
console.log("  headings show as headings; images never split a heading from its text\n");
window.close(); process.exit(0);
