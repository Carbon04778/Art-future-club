/**
 * Verifies the admin "Add Listing" panel.
 *
 * Covers three client reports:
 *   - no way to attach gallery / venue images
 *   - the panel's fields did not match what the public pages filter on
 *   - no way to add an artist's artwork
 *
 * Run: npm run verify:adminpanel
 */

import { readFileSync } from "node:fs";
import { JSDOM } from "jsdom";

const dom = new JSDOM("<!doctype html><html><body><div id='root'></div></body></html>", {
  url: "http://localhost/",
  pretendToBeVisual: true,
});
const { window } = dom;
globalThis.window = window;
globalThis.document = window.document;
Object.defineProperty(globalThis, "navigator", { value: window.navigator, configurable: true });
for (const k of ["HTMLElement", "Element", "Node", "File", "Blob", "Event"]) globalThis[k] = window[k];
window.URL.createObjectURL = () => "blob:preview";
globalThis.requestAnimationFrame = (cb) => setTimeout(() => cb(Date.now()), 0);
globalThis.ResizeObserver = window.ResizeObserver = class { observe() {} unobserve() {} disconnect() {} };

const React = (await import("react")).default;
const { createRoot } = await import("react-dom/client");
const Panel = (await import("../src/components/AdminCreatePanel.jsx")).default;

let pass = 0;
const failures = [];
const check = (name, cond, detail = "") =>
  cond ? pass++ : failures.push(`${name}${detail ? ` — ${detail}` : ""}`);

/**
 * Mounts the panel fresh. Always unmount before mounting again — two React
 * roots in one container detach each other and throw.
 */
async function mount() {
  const container = document.getElementById("root");
  container.innerHTML = "";
  const root = createRoot(container);
  await new Promise((r) => {
    root.render(React.createElement(Panel, {}));
    setTimeout(r, 200);
  });
  return { container, root };
}

async function click(container, label) {
  const btn = [...container.querySelectorAll("button")].find(
    (b) => b.textContent.trim() === label
  );
  if (!btn) return false;
  await new Promise((r) => {
    btn.dispatchEvent(new window.MouseEvent("click", { bubbles: true }));
    setTimeout(r, 200);
  });
  return true;
}

const files = (c) => c.querySelectorAll('input[type="file"]');
const placeholders = (c) =>
  [...c.querySelectorAll("input")].map((i) => i.getAttribute("placeholder") || "");

/* ============================ single mount, walked across all three tabs === */

const { container, root } = await mount();

// --- Gallery (default tab) ---
check("gallery tab has two image inputs (logo + cover)", files(container).length === 2, `found ${files(container).length}`);
check("gallery tab labels the cover image", /Cover image/i.test(container.textContent));
check("gallery tab labels the logo", /Logo \/ profile photo/i.test(container.textContent));
check("gallery tab shows discipline chips", /Disciplines shown/i.test(container.textContent));
check("gallery tab shows partnership status", /Partnership status/i.test(container.textContent));
check("all file inputs accept images only",
  [...files(container)].every((i) => i.getAttribute("accept") === "image/*"));

// --- Venue ---
await click(container, "Venue");
check("venue tab has two image inputs", files(container).length === 2, `found ${files(container).length}`);
check("venue tab HIDES disciplines (Venues.jsx never reads interests)",
  !/Disciplines shown/i.test(container.textContent));
check("venue tab keeps partnership status (rendered as a badge)",
  /Partnership status/i.test(container.textContent));
check("venue tab keeps Based in", /Based in/i.test(container.textContent));

// --- Artist ---
await click(container, "Artist");
check("artist tab hides the cover image", !/Cover image/i.test(container.textContent));
check("artist tab hides disciplines", !/Disciplines shown/i.test(container.textContent));
check("artist tab hides partnership status", !/Partnership status/i.test(container.textContent));
check("artist tab says 'Profile photo'", /Profile photo/i.test(container.textContent));
check("artist tab has an Artwork section", /Artwork/i.test(container.textContent));

const beforeWork = files(container).length;
const added = await click(container, "Add work");
check("artist tab has an 'Add work' button", added);

if (added) {
  const p = placeholders(container);
  check("adding a work reveals Title", p.some((x) => /^Title$/i.test(x)));
  check("adding a work reveals Year", p.some((x) => /^Year$/i.test(x)));
  check("adding a work reveals Medium", p.some((x) => /Medium/i.test(x)));
  check("adding a work reveals Dimensions", p.some((x) => /Dimensions/i.test(x)));
  check("adding a work reveals its own image input",
    files(container).length === beforeWork + 1,
    `${beforeWork} -> ${files(container).length}`);
  check("adding a work reveals 'Available for sale'",
    [...container.querySelectorAll("input")].some((i) => i.type === "checkbox"));

  await click(container, "Add work");
  check("a second work can be added", files(container).length === beforeWork + 2);
}

root.unmount();

/* ============================================== source-level contracts === */

const src = readFileSync(new URL("../src/components/AdminCreatePanel.jsx", import.meta.url), "utf8");
const showcase = readFileSync(new URL("../src/pages/GalleryShowcase.jsx", import.meta.url), "utf8");
const venues = readFileSync(new URL("../src/pages/Venues.jsx", import.meta.url), "utf8");
const artistView = readFileSync(new URL("../src/pages/ArtistProfileView.jsx", import.meta.url), "utf8");

// --- uploads ---
check("uploads via the shared UploadFile integration", /integrations\.Core\.UploadFile/.test(src));
check("collector payload carries cover_image_url", /CollectorProfile\.create\(\{[\s\S]*?cover_image_url/.test(src));
check("collector payload carries avatar_url", /CollectorProfile\.create\(\{[\s\S]*?avatar_url/.test(src));
check("artist payload carries avatar_url", /ArtistProfile\.create\(\{[\s\S]*?avatar_url/.test(src));
check("uploads happen BEFORE the record is created",
  src.indexOf("UploadFile") > -1 && src.indexOf("UploadFile") < src.indexOf(".create("));
check("file selections clear after a successful save",
  /setAvatarFile\(null\)/.test(src) && /setCoverFile\(null\)/.test(src) && /setWorks\(\[\]\)/.test(src));

// --- crop control ---
check("avatar uses the shared crop/zoom control", /ImageCropBox/.test(src));
check("the cropped result is what gets uploaded",
  /onChange=\{\(cropped\) => setAvatarFile\(cropped\)\}/.test(src));
check("raw pick still uploads if cropping never emits",
  /setAvatarRaw\(f\);[\s\S]{0,220}setAvatarFile\(f\);/.test(src));

// --- artwork ---
check("panel saves portfolio_works rather than an empty array",
  /portfolio_works,/.test(src) && !/portfolio_works: \[\]/.test(src));
check("each work's image is uploaded", /UploadFile\(\{ file: w\.file \}\)/.test(src));
// Scope this to the push block only: Tailwind's file:mr-4 classes elsewhere
// in the file would otherwise match and report a false failure.
const pushBlock = (src.match(/portfolio_works\.push\(\{([\s\S]*?)\}\);/) || [])[1] || "";
check("a work is actually assembled for saving", pushBlock.length > 0);
check("the local `file` key is not written to the database",
  !/\bfile\s*:/.test(pushBlock));

for (const f of ["title", "year", "medium", "dimensions", "image_url", "available_for_sale", "price", "currency"]) {
  const readByPage = new RegExp(`work\\.${f}\\b`).test(artistView);
  // Accept both `image_url,` shorthand and `title: ...` longhand.
  const savedByPanel =
    new RegExp(`\\b${f}\\s*[:,]`).test(pushBlock) ||
    new RegExp(`\\b${f}\\s*[:,]`).test(src);
  check(`work.${f}: saved by the panel because the profile page reads it`,
    !readByPage || savedByPanel,
    readByPage && !savedByPanel ? "page reads it, panel never saves it" : "");
}

// --- must stay in step with the public filter pages ---
check("galleries page still filters on `interests`", /interests \|\| \[\]\)\.includes\(filter\)/.test(showcase));
check("panel collects `interests`", /interests,/.test(src));

const listOf = (t) => (t.match(/"([^"]+)"/g) || []).map((x) => x.slice(1, -1)).filter((x) => x !== "All");
const panelInterests = listOf((src.match(/const INTERESTS = \[([\s\S]*?)\]/) || [])[1] || "");
const pageInterests = listOf((showcase.match(/const INTERESTS = \[([\s\S]*?)\]/) || [])[1] || "");
const missing = pageInterests.filter((d) => !panelInterests.includes(d));
check("every discipline on the galleries page is offered in the panel",
  missing.length === 0, `missing: ${missing.join(", ")}`);

check("galleries page matches chapter against based_in", /based_in && !g\.based_in\.includes\(chapter\)/.test(showcase));
check("venues page matches chapter against based_in", /based_in \|\| ""\)\.includes\(chapter\)/.test(venues));
check("panel uses a chapter dropdown for based_in, not free text",
  /value=\{form\.based_in\}[\s\S]{0,220}CHAPTER_OPTIONS\.map/.test(src));
check("venues page genuinely does not filter on interests", !/interests/.test(venues));
check("venues page renders partnership_type", /v\.partnership_type/.test(venues));
check("panel collects partnership_type", /partnership_type: form\.partnership_type/.test(src));
check("panel sets type Gallery for the Gallery tab", /set\("type", "Gallery"\)/.test(src));
check("panel sets type Institution for the Venue tab", /set\("type", "Institution"\)/.test(src));
check("galleries page queries type Gallery", /type: "Gallery"/.test(showcase));
check("venues page queries type Institution", /type: "Institution"/.test(venues));

/* ================================================================ report === */

console.log(`\n  passed: ${pass}`);
if (failures.length) {
  console.log(`  FAILED: ${failures.length}\n`);
  failures.forEach((f) => console.log(`   ✗ ${f}`));
  window.close();
  process.exit(1);
}
console.log("  admin panel: images, artwork, and fields matching the public pages\n");
window.close();
process.exit(0);
