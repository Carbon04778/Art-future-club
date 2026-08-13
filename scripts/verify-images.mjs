/**
 * Verifies the Image component crops rather than stretches, for both CDN and
 * locally hosted sources.
 *
 * Item 2 of the client report: "On all images, they cannot stretch to fit.
 * They need to crop to fit and have an option to scale the image if needed."
 *
 * Run: npm run verify:images
 */

import { JSDOM } from "jsdom";

const dom = new JSDOM("<!doctype html><html><body><div id='root'></div></body></html>", {
  url: "http://localhost/",
  pretendToBeVisual: true,
});
const { window } = dom;
globalThis.window = window;
globalThis.document = window.document;
Object.defineProperty(globalThis, "navigator", { value: window.navigator, configurable: true });
globalThis.HTMLElement = window.HTMLElement;
globalThis.Element = window.Element;
globalThis.Node = window.Node;
globalThis.requestAnimationFrame = (cb) => setTimeout(() => cb(Date.now()), 0);
globalThis.ResizeObserver = window.ResizeObserver = class { observe(){} unobserve(){} disconnect(){} };

const React = (await import("react")).default;
const { createRoot } = await import("react-dom/client");
const { Image } = await import("../src/components/ui/image.jsx");

let pass = 0;
const failures = [];
const check = (name, cond, detail = "") =>
  cond ? pass++ : failures.push(`${name}${detail ? ` — ${detail}` : ""}`);

async function render(props) {
  const container = document.getElementById("root");
  container.innerHTML = "";
  const root = createRoot(container);
  await new Promise((resolve) => {
    root.render(React.createElement(Image, props));
    setTimeout(resolve, 80);
  });
  const img = container.querySelector("img");
  const result = {
    html: container.innerHTML,
    objectFit: img?.style?.objectFit || "",
    objectPosition: img?.style?.objectPosition || "",
    transform: img?.style?.transform || "",
    src: img?.getAttribute("src") || "",
  };
  root.unmount();
  return result;
}

const LOCAL = "/images/AdobeStock_528827486.jpg";
const SUPABASE = "https://xyz.supabase.co/storage/v1/object/public/uploads/a/b.webp";

// --- the core failure the client reported ---------------------------------
const a = await render({ src: LOCAL, fittingType: "fill", className: "h-full w-full" });
check("local image crops instead of stretching", a.objectFit === "cover", `objectFit="${a.objectFit}"`);

const b = await render({ src: SUPABASE, fittingType: "fill", className: "h-full w-full" });
check("uploaded (Supabase) image crops", b.objectFit === "cover", `objectFit="${b.objectFit}"`);

// --- artwork must NOT be cropped ------------------------------------------
const c = await render({ src: LOCAL, fittingType: "fit", className: "h-full w-full" });
check("fittingType='fit' shows whole image (contain)", c.objectFit === "contain", `objectFit="${c.objectFit}"`);

// --- scale / focal point --------------------------------------------------
const d = await render({ src: LOCAL, focalPointX: 50, focalPointY: 20 });
check("focal point becomes objectPosition", d.objectPosition === "50% 20%", `"${d.objectPosition}"`);

const e = await render({ src: LOCAL, scale: 1.4 });
check("scale applies a transform", /scale\(1\.4\)/.test(e.transform), `"${e.transform}"`);

const f = await render({ src: LOCAL, scale: 1 });
check("scale of 1 adds no transform", f.transform === "", `"${f.transform}"`);

const g = await render({ src: LOCAL });
check("no focal point leaves objectPosition unset", g.objectPosition === "");

// --- caller overrides still win -------------------------------------------
const h = await render({ src: LOCAL, style: { objectFit: "none" } });
check("explicit style overrides the default", h.objectFit === "none", `"${h.objectFit}"`);

// --- empty / broken sources ----------------------------------------------
const i = await render({ src: "" });
check("empty src renders a placeholder, not a crash", i.html.includes("<img"));

console.log(`\n  passed: ${pass}`);
if (failures.length) {
  console.log(`  FAILED: ${failures.length}\n`);
  failures.forEach((x) => console.log(`   ✗ ${x}`));
  process.exit(1);
}
console.log("  images crop to fit and support focal point + scale\n");
