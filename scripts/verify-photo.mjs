/**
 * Verifies the profile-photo picker (B14 in docs/CLIENT-REQUESTS.md):
 * every member form lets people adjust their photo, and re-adjust one
 * already uploaded.
 *
 * Run: npm run verify:photo
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
for (const k of ["HTMLElement", "Element", "Node", "Event", "MouseEvent", "SVGElement", "Image", "File", "Blob"]) globalThis[k] = window[k];
globalThis.requestAnimationFrame = (cb) => setTimeout(() => cb(Date.now()), 0);
globalThis.ResizeObserver = window.ResizeObserver = class { observe() {} unobserve() {} disconnect() {} };
globalThis.IntersectionObserver = window.IntersectionObserver = class { observe() {} unobserve() {} disconnect() {} takeRecords() { return []; } };
// jsdom has no object URLs; the picker only needs them for previews.
let urls = 0;
window.URL.createObjectURL = globalThis.URL.createObjectURL = () => `blob:test/${++urls}`;
window.URL.revokeObjectURL = globalThis.URL.revokeObjectURL = () => {};
globalThis.IS_REACT_ACT_ENVIRONMENT = false;

const React = (await import("react")).default;
const { createRoot } = await import("react-dom/client");
const ProfilePhotoPicker = (await import("../src/components/ProfilePhotoPicker.jsx")).default;

let pass = 0;
const fails = [];
const check = (n, c, d = "") => (c ? pass++ : fails.push(`${n}${d ? ` — ${d}` : ""}`));
const tick = (ms = 60) => new Promise((r) => setTimeout(r, ms));
const c = document.getElementById("root");
const btn = (re) => [...c.querySelectorAll("button")].find((b) => re.test(b.textContent));
const choose = async (input, file) => {
  Object.defineProperty(input, "files", { value: [file], configurable: true });
  input.dispatchEvent(new window.Event("change", { bubbles: true }));
  await tick();
};

// ---- with a photo already on the profile
{
  const got = [];
  const root = createRoot(c);
  root.render(React.createElement(ProfilePhotoPicker, { currentUrl: "https://example.com/me.webp", name: "Anna", onChange: (f) => got.push(f) }));
  await tick();
  check("shows the current photo in the round preview", !!c.querySelector(".rounded-full img[src='https://example.com/me.webp']"));
  check("offers 'Adjust current photo'", !!btn(/adjust current photo/i));
  check("no crop box until something is chosen", !c.querySelector("[style*='aspect-ratio']"));
  check("nothing to upload yet", got.length === 0);

  const input = c.querySelector("input[type=file]");
  check("has a file chooser for images", input?.accept === "image/*");
  const f = new window.File(["x"], "me.jpg", { type: "image/jpeg" });
  await choose(input, f);
  check("choosing a photo opens the adjuster", !!c.querySelector("[style*='aspect-ratio']"));
  check("tells people how to adjust it", /drag the photo/i.test(c.textContent) && /zoom/i.test(c.textContent));
  check("the photo as chosen is ready to upload straight away", got.at(-1) === f);
  check("'Adjust current photo' hidden while adjusting", !btn(/adjust current photo/i));
  check("the round preview now shows the new photo", !!c.querySelector(".rounded-full img[src^='blob:']"));

  btn(/cancel/i).click();
  await tick();
  check("Cancel closes the adjuster", !c.querySelector("[style*='aspect-ratio']"));
  check("Cancel means nothing is uploaded", got.at(-1) === null);
  check("Cancel shows the current photo again", !!c.querySelector(".rounded-full img[src='https://example.com/me.webp']"));

  // re-adjust the uploaded one: fetched, then opened in the adjuster
  const realFetch = globalThis.fetch;
  globalThis.fetch = async (u) => ({ ok: true, blob: async () => new window.Blob(["img"], { type: "image/webp" }), url: u });
  btn(/adjust current photo/i).click();
  await tick(120);
  check("'Adjust current photo' opens the uploaded photo in the adjuster", !!c.querySelector("[style*='aspect-ratio']"));
  check("…ready to upload once adjusted", got.at(-1) instanceof window.File && got.at(-1).type === "image/webp");
  btn(/cancel/i).click();
  await tick();

  // a photo that cannot be fetched: a message, nothing else changes
  globalThis.fetch = async () => { throw new Error("blocked"); };
  btn(/adjust current photo/i).click();
  await tick(120);
  check("a photo that can't be re-opened says so", /choose the file again/i.test(c.textContent));
  check("…and leaves the current photo alone", got.at(-1) === null && !c.querySelector("[style*='aspect-ratio']"));
  globalThis.fetch = realFetch;
  root.unmount();
}

// ---- no photo yet
{
  const root = createRoot(c);
  root.render(React.createElement(ProfilePhotoPicker, { currentUrl: "", name: "Bea", onChange: () => {} }));
  await tick();
  check("no photo: shows the initial", c.querySelector(".rounded-full")?.textContent.trim() === "B");
  check("no photo: no 'Adjust current photo'", !btn(/adjust current photo/i));
  root.unmount();
}

// ---- the forms use it
const src = (f) => readFileSync(join(ROOT, f), "utf8");
for (const f of ["src/pages/ArtistProfileEdit.jsx", "src/pages/GalleryProfile.jsx", "src/pages/CollectorProfilePage.jsx"]) {
  const s = src(f);
  check(`${f}: uses the profile photo picker`, /<ProfilePhotoPicker[\s\S]*?onChange=\{setAvatarFile\}/.test(s));
  check(`${f}: no bare profile-photo file input left`, !/onChange=\{\(e\) => setAvatarFile\(e\.target\.files/.test(s));
  check(`${f}: picker resets after a save (keyed on the saved photo)`, /<ProfilePhotoPicker[^>]*key=\{form\.avatar_url/.test(s));
}
check("admin forms still adjust (unchanged)", /<ImageCropBox/.test(src("src/components/AdminEditListingsPanel.jsx")) && /<ImageCropBox/.test(src("src/components/AdminCreatePanel.jsx")));
const crop = src("src/components/ImageCropBox.jsx");
check("ImageCropBox: the circle guide is opt-in (other callers unchanged)", /round = false/.test(crop) && /\{round && /.test(crop));

console.log(`verify:photo — ${pass} passed, ${fails.length} failed`);
if (fails.length) { for (const f of fails) console.log("  ✗", f); process.exit(1); }
process.exit(0);
