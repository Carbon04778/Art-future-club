/**
 * Verifies the article gallery slider (B5 in docs/CLIENT-REQUESTS.md).
 * Sliding itself needs real layout, so it is tested in a real browser
 * (scripts/ui-test-gallery.mjs); this checks structure and the rules.
 *
 * Run: npm run verify:gallery
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
// Real browsers have these; jsdom does not.
globalThis.matchMedia = window.matchMedia = () => ({ matches: false, media: "", addListener() {}, removeListener() {}, addEventListener() {}, removeEventListener() {} });
globalThis.IntersectionObserver = window.IntersectionObserver = class { observe() {} unobserve() {} disconnect() {} takeRecords() { return []; } };
globalThis.MutationObserver = window.MutationObserver;

const React = (await import("react")).default;
const { createRoot } = await import("react-dom/client");
const ArticleBody = (await import("../src/components/ArticleBody.jsx")).default;

let pass = 0;
const fails = [];
const check = (n, c, d = "") => (c ? pass++ : fails.push(`${n}${d ? ` — ${d}` : ""}`));

const c = document.getElementById("root");
async function render(article) {
  const root = createRoot(c);
  await new Promise((r) => { root.render(React.createElement(ArticleBody, { article: { title: "T", body: "One.\n\nTwo.\n\nThree.\n\nFour.", ...article } })); setTimeout(r, 200); });
  const car = c.querySelector('[aria-roledescription="carousel"]')?.closest("figure");
  const out = {
    carousels: c.querySelectorAll('[aria-roledescription="carousel"]').length,
    slides: car ? car.querySelectorAll('[aria-roledescription="slide"]').length : 0,
    imgs: [...c.querySelectorAll("img")].map((i) => i.getAttribute("src")),
    counter: car?.querySelector('[aria-live="polite"]')?.textContent || "",
    dots: car ? car.querySelectorAll('button[aria-label^="Show image"]').length : 0,
    arrows: car ? [...car.querySelectorAll("button")].filter((b) => /previous slide|next slide/i.test(b.textContent)).length : 0,
    caption: car?.querySelector("figcaption")?.textContent || "",
    grids: c.querySelectorAll(".grid").length,
  };
  root.unmount();
  return out;
}

// 3 gallery images, gallery in the middle
const three = [{ url: "/a.jpg", caption: "First caption" }, { url: "/b.jpg", caption: "Second" }, { url: "/c.jpg" }];
const r1 = await render({ images: three, layout: "gallery_middle" });
check("a gallery of 3 is one slider", r1.carousels === 1, `${r1.carousels}`);
check("with 3 slides", r1.slides === 3, `${r1.slides}`);
check("every image is still there", ["/a.jpg", "/b.jpg", "/c.jpg"].every((u) => r1.imgs.includes(u)), r1.imgs.join(","));
check("starts at '1 / 3'", r1.counter.trim() === "1 / 3", JSON.stringify(r1.counter));
check("one dot per image", r1.dots === 3, `${r1.dots}`);
check("previous and next arrows", r1.arrows === 2, `${r1.arrows}`);
check("shows the first image's caption", r1.caption.includes("First caption"), r1.caption);
check("no leftover grid of tiles", r1.grids === 0, `${r1.grids}`);

// the common layout: intro image, then the rest as a slider
const r2 = await render({ images: ["/intro.jpg", "/x.jpg", "/y.jpg"], layout: "intro_middle" });
check("intro image stays outside the slider", r2.carousels === 1 && r2.slides === 2 && r2.imgs.includes("/intro.jpg"), `${r2.slides} slides`);

// one gallery image: unchanged (no slider)
const r3 = await render({ images: ["/only.jpg"], layout: "gallery_middle" });
check("a single image is not a slider", r3.carousels === 0);
check("a single image keeps its old layout", r3.grids === 1 && r3.imgs.includes("/only.jpg"));

// full-width images are never put in the slider
const r4 = await render({ images: [{ url: "/1.jpg" }, { url: "/2.jpg" }, { url: "/wide.jpg", full: true }, { url: "/3.jpg" }], layout: "gallery_middle" });
check("a full-width image stays full width, outside the slider",
  r4.imgs.includes("/wide.jpg") && r4.slides === 2, `${r4.carousels} carousels, ${r4.slides} slides`);

// legacy layout: gallery before the closing image
const r5 = await render({ images: ["/g1.jpg", "/g2.jpg", "/g3.jpg", "/close.jpg"], layout: "image_before_close" });
check("old 'image before close' layout: gallery is a slider too", r5.carousels === 1 && r5.slides === 3 && r5.imgs.includes("/close.jpg"), `${r5.slides}`);

// no images, no gallery
const r6 = await render({ images: [], layout: "gallery_middle" });
check("no images, no slider", r6.carousels === 0 && r6.imgs.length === 0);

// --- wiring
const read = (p) => readFileSync(new URL(p, import.meta.url), "utf8");
const body = read("../src/components/ArticleBody.jsx");
const gal = read("../src/components/ArticleGallery.jsx");
check("slider only from 2 images", /b\.images\.length >= 2\) return <ArticleGallery/.test(body) && /galleryImages\.length >= 2 && <ArticleGallery/.test(body));
check("arrows sit on the image (visible on a phone)", /CarouselPrevious className="left-3/.test(gal) && /CarouselNext className="right-3/.test(gal));
check("images are shown whole, not cropped", /<ArticleImage[^>]*aspect-\[4\/3\]/.test(gal) && /object-contain/.test(read("../src/components/ArticleImage.jsx")));
check("built on the carousel the project already has", /from "@\/components\/ui\/carousel"/.test(gal));

console.log(`\n  passed: ${pass}`);
if (fails.length) { console.log(`  FAILED: ${fails.length}`); fails.forEach((f) => console.log("   ✗ " + f)); window.close(); process.exit(1); }
console.log("  galleries are one image at a time\n");
window.close(); process.exit(0);
