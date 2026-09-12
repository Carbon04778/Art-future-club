/**
 * Editing and removing a gallery's works.
 *
 * GalleryWork.update and GalleryWork.delete had never been called anywhere in
 * the app — confirmed against every commit in the repository. A gallery could
 * add a piece and then never touch it again: the wrong image, a typo in the
 * price, or a work that had since sold were all permanent.
 *
 * This drives the real page: open a gallery as its owner, edit a work, remove
 * a work, and confirm a visitor can do neither.
 *
 * Run: npm run verify:gallery-works
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
for (const k of ["HTMLElement","Element","Node","File","Blob","Event","MouseEvent","SVGElement","DOMRect"]) globalThis[k] = window[k];
window.URL.createObjectURL = () => "blob:x";
window.URL.revokeObjectURL = () => {};
globalThis.URL.createObjectURL = () => "blob:x";
globalThis.URL.revokeObjectURL = () => {};
globalThis.requestAnimationFrame = (cb) => setTimeout(() => cb(Date.now()), 0);
globalThis.ResizeObserver = window.ResizeObserver = class { observe() {} unobserve() {} disconnect() {} };
globalThis.IntersectionObserver = window.IntersectionObserver = class {
  constructor(cb) { this.cb = cb; }
  observe(el) { this.cb([{ target: el, isIntersecting: true, intersectionRatio: 1 }], this); }
  unobserve() {} disconnect() {} takeRecords() { return []; }
};
window.scrollTo = () => {};

const React = (await import("react")).default;
const { createRoot } = await import("react-dom/client");
const { MemoryRouter, Routes, Route } = await import("react-router-dom");
const { auth, entities } = await import("../src/api/providers/mock.js");
const GalleryProfile = (await import("../src/pages/GalleryProfile.jsx")).default;

let pass = 0;
const failures = [];
const check = (n, c, d = "") => (c ? pass++ : failures.push(`${n}${d ? ` — ${d}` : ""}`));
const settle = (ms) => new Promise((r) => setTimeout(r, ms));

/* ------------------------------------------------------------- fixtures */
await auth.loginViaEmailPassword("admin@artfutureclub.com", "password123");
const gallery = await entities.CollectorProfile.create({
  display_name: "Editable Gallery", type: "Gallery", user_id: "user_gowner",
  based_in: "Hong Kong", bio: "b", avatar_url: "/images/placeholder.webp",
  status: "approved",
});
const work = await entities.GalleryWork.create({
  gallery_id: gallery.id, artist_id: "user_gowner", artist_name: "Someone",
  title: "Wrong Title", year: "2024", medium: "Oil", dimensions: "50 x 40 cm",
  description: "d", image_url: "/images/placeholder.webp",
  available_for_sale: true, price: "1,000", currency: "USD", tags: [],
});
const keeper = await entities.GalleryWork.create({
  gallery_id: gallery.id, artist_id: "user_gowner", artist_name: "Someone",
  title: "Keep This One", image_url: "/images/placeholder.webp",
});

let container;
async function open(as) {
  window.localStorage.removeItem("afc_mock_session_v1");
  if (as) await auth.loginViaEmailPassword(as, "password123");
  document.body.innerHTML = "<div id='root'></div>";
  container = document.getElementById("root");
  const root = createRoot(container);
  let cap = null;
  const orig = console.error;
  console.error = (...a) => { if (!cap) cap = a.map((x) => x?.message || String(x)).join(" ").slice(0, 300); };
  root.render(
    React.createElement(MemoryRouter, { initialEntries: [`/gallery/${gallery.id}`] },
      React.createElement(Routes, null,
        React.createElement(Route, { path: "/gallery/:id", element: React.createElement(GalleryProfile) })))
  );
  await settle(1400);
  console.error = orig;
  return cap;
}
const text = () => container.textContent || "";
const buttons = (label) => [...container.querySelectorAll("button")].filter((b) => b.textContent.trim() === label);
const click = (el) => el?.dispatchEvent(new window.MouseEvent("click", { bubbles: true }));
const setInput = (el, v) => {
  const setter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, "value").set;
  setter.call(el, v);
  el.dispatchEvent(new window.Event("input", { bubbles: true }));
};

/* ------------------------------------------------- a visitor may do neither */
let cap = await open(null);
check("the gallery page opens for a visitor", !cap, cap || "");
check("the works are listed", text().includes("Wrong Title"));
check("a visitor sees no Edit control", buttons("Edit").length === 0, `${buttons("Edit").length} found`);
check("a visitor sees no Delete control", buttons("Delete").length === 0, `${buttons("Delete").length} found`);

/* ------------------------------------------------------ the owner may edit */
cap = await open("gowner@example.com");
check("the gallery page opens for its owner", !cap, cap || "");
// The mock derives the user id from the email, so this must match user_gowner.
check("the owner is recognised", buttons("Edit").length > 0,
  `${buttons("Edit").length} Edit controls`);

if (buttons("Edit").length) {
  click(buttons("Edit")[0]);
  await settle(600);
  check("the Edit Work modal opens", text().includes("Edit Work"), text().slice(0, 160));
  check("it is pre-filled with the existing work",
    [...container.querySelectorAll("input")].some((i) => i.value === "Wrong Title"));
  check("the image is NOT required when editing",
    [...container.querySelectorAll('input[type="file"]')].every((i) => !i.required));

  const titleBox = [...container.querySelectorAll("input")].find((i) => i.value === "Wrong Title");
  setInput(titleBox, "Corrected Title");
  await settle(200);
  const save = [...container.querySelectorAll("button")].find((b) => /Save Changes/i.test(b.textContent));
  check("there is a Save Changes button", !!save);
  click(save);
  await settle(1200);

  const saved = await entities.GalleryWork.get(work.id);
  check("the edit was written to the record", saved.title === "Corrected Title", saved.title);
  check("the existing image was kept, not blanked",
    saved.image_url === "/images/placeholder.webp", String(saved.image_url));
  check("the price survived the edit", saved.price === "1,000", String(saved.price));
}

/* ---------------------------------------------------- and may delete, twice */
cap = await open("gowner@example.com");
const del = buttons("Delete");
check("a Delete control is present for the owner", del.length > 0, `${del.length}`);
if (del.length) {
  click(del[0]);
  await settle(400);
  check("one click only ARMS the delete", text().includes("Confirm delete"), text().slice(0, 140));
  const stillThere = await entities.GalleryWork.filter({ gallery_id: gallery.id });
  check("nothing was removed by the first click", stillThere.length === 2, `${stillThere.length} works`);

  const confirm = [...container.querySelectorAll("button")].find((b) => /Confirm delete/i.test(b.textContent));
  click(confirm);
  await settle(1200);
  const after = await entities.GalleryWork.filter({ gallery_id: gallery.id });
  check("the second click removed exactly one work", after.length === 1, `${after.length} works left`);
  check("it removed the right one", after[0]?.title === "Keep This One" || after[0]?.id === keeper.id,
    after.map((w) => w.title).join(", "));
}

/* ------------------------------------------------------------------ report */

console.log("");
if (failures.length) {
  console.log(`  passed: ${pass}`);
  console.log(`  FAILED: ${failures.length}\n`);
  for (const f of failures) console.log(`   ✗ ${f}`);
  console.log("");
  process.exit(1);
}
console.log(`  passed: ${pass}`);
console.log("  a gallery can correct and remove its own works\n");
process.exit(0);
