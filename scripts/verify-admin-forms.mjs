/**
 * Admin EDIT FORMS, opened with real data.
 *
 * verify-admin-tabs.mjs clicks each tab, but with empty lists — so a form that
 * crashes on a real record passes it. This seeds each panel with a realistic
 * row, clicks Edit, and fails if the form crashes or renders nothing.
 *
 * That gap is exactly how "the events page goes blank when I edit" could reach
 * a client with every other test green.
 *
 * Run: npm run verify:adminforms
 */

import { JSDOM } from "jsdom";
import { readFileSync, writeFileSync, mkdirSync, rmSync } from "node:fs";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";

const dom = new JSDOM("<!doctype html><html><body><div id='root'></div></body></html>", {
  url: "http://localhost/",
  pretendToBeVisual: true,
});
const { window } = dom;
globalThis.window = window;
globalThis.document = window.document;
Object.defineProperty(globalThis, "navigator", { value: window.navigator, configurable: true });
for (const k of ["HTMLElement","Element","Node","File","Blob","Event","MouseEvent","SVGElement","Image","PointerEvent","DOMRect"]) {
  globalThis[k] = window[k];
}
window.URL.createObjectURL = () => "blob:preview";
window.URL.revokeObjectURL = () => {};
globalThis.requestAnimationFrame = (cb) => setTimeout(() => cb(Date.now()), 0);
globalThis.ResizeObserver = window.ResizeObserver = class {
  observe() {} unobserve() {} disconnect() {}
};

const React = (await import("react")).default;
const { createRoot } = await import("react-dom/client");
const { MemoryRouter } = await import("react-router-dom");

let pass = 0;
const failures = [];
const check = (name, cond, detail = "") =>
  cond ? pass++ : failures.push(`${name}${detail ? ` — ${detail}` : ""}`);

const container = document.getElementById("root");
mkdirSync(".tmp-forms", { recursive: true });

/** Load a panel with the backend replaced by a stub. */
async function loadPanel(file, stub) {
  globalThis.__stub__ = stub;
  const name = `${file.split("/").pop()}.jsx`;
  writeFileSync(
    `.tmp-forms/${name}`,
    readFileSync(`src/components/${file}.jsx`, "utf8").replace(
      /import \{ base44 \} from "@\/api\/base44Client";/,
      "const base44 = globalThis.__stub__;"
    )
  );
    // Resolved from the working directory, not hardcoded — the test must run
  // wherever the project is checked out.
  const url = pathToFileURL(resolve(`.tmp-forms/${name}`)).href;
  return (await import(`${url}?t=${Date.now()}`)).default;
}

/**
 * Mount a panel, click Edit on the first row, and confirm the form appears.
 * `expect` is text that must be present once it is open — normally the
 * record's own name, proving it was prefilled rather than rendered blank.
 */
async function editOpens({ label, Component, props = {}, expect }) {
  container.innerHTML = "";
  const root = createRoot(container);

  let captured = null;
  const original = console.error;
  console.error = (...args) => {
    if (!captured) captured = args.map((a) => a?.message || String(a)).join(" ").slice(0, 250);
  };

  try {
    await new Promise((r) => {
      root.render(
        React.createElement(MemoryRouter, null, React.createElement(Component, props))
      );
      setTimeout(r, 500);
    });

    check(`${label}: the list loads`, !captured, captured || "");

    const button = [...container.querySelectorAll("button")].find(
      (b) => b.textContent.trim() === "Edit"
    );
    check(`${label}: an Edit button is offered`, !!button);

    if (button) {
      captured = null;
      button.dispatchEvent(new window.MouseEvent("click", { bubbles: true }));
      await new Promise((r) => setTimeout(r, 500));

      check(`${label}: the form opens without crashing`, !captured, captured || "");

      const text = (container.textContent || "").trim();
      check(`${label}: the form is not blank`, text.length > 400, `${text.length} chars`);
      if (expect) {
        check(`${label}: the form is prefilled`, text.includes(expect));
      }
    }
  } catch (err) {
    check(`${label}: the form opens without crashing`, false, err.message);
  } finally {
    console.error = original;
    root.unmount();
  }
}

/* ------------------------------------------------------------- fixtures */

const noop = { list: async () => [], filter: async () => [], update: async (i, p) => ({ id: i, ...p }), delete: async () => {}, create: async (o) => ({ id: "x", ...o }) };
const uploads = { Core: { UploadFile: async () => ({ file_url: "uploaded.jpg" }) } };

// An event as it actually exists: a past chapter of "Other", no end date, and
// in a second case no image at all — both have caused blank pages before.
const EVENTS = [
  { id: "e1", title: "City of Lights", chapter: "Other", event_type: "Exhibition",
    start_date: "2026-06-18T00:00:00Z", end_date: null, venue: "Blue Lotus Gallery",
    address: "Hong Kong", description: "A show.", external_link: "", image_url: "/x.jpg" },
  { id: "e2", title: "No Image Event", chapter: null, event_type: "Talk",
    start_date: "2026-09-01T00:00:00Z", venue: "", address: "", description: "",
    external_link: "", image_url: null },
];

const ARTISTS = [
  { id: "a1", display_name: "Yulia Shautsukova", discipline: "Painting",
    based_in: "Hong Kong", chapter: "Hong Kong", claim_email: "y@t.com",
    user_id: null, avatar_url: "/a.jpg", bio: "A bio.",
    portfolio_works: [
      { title: "Spilt Coffee", year: "2024", medium: "Mixed Media",
        dimensions: "71 x 140", description: "d", image_url: "/w.jpg",
        available_for_sale: true, price: "7000", currency: "USD" },
    ] },
];

const GALLERIES = [
  { id: "g1", display_name: "10 Chancery Lane Gallery", type: "Gallery",
    based_in: "Hong Kong", address: "HK", user_id: null, claim_email: "",
    avatar_url: "/g.jpg", cover_image_url: "/c.jpg", bio: "About." },
];

const ARTICLES = [
  { id: "ar1", title: "A Real Article", author_name: "Editor", category: "Feature",
    published: true, body: "Body text.", images: [] },
];

/* ---------------------------------------------------------------- tests */

const EventsPanel = await loadPanel("AdminEventsPanel", {
  entities: { Event: { ...noop, list: async () => EVENTS } },
  integrations: uploads,
});
await editOpens({ label: "Events", Component: EventsPanel, expect: "City of Lights" });

const ListingsPanel = await loadPanel("AdminEditListingsPanel", {
  entities: {
    ArtistProfile: { ...noop, list: async () => ARTISTS },
    CollectorProfile: { ...noop, list: async () => GALLERIES },
  },
  integrations: uploads,
});
await editOpens({ label: "Edit listings", Component: ListingsPanel, expect: "Yulia" });

const ArticlesPanel = await loadPanel("AdminArticlesPanel", {
  entities: { Article: { ...noop, list: async () => ARTICLES } },
  integrations: uploads,
  auth: { me: async () => ({ id: "u1", full_name: "Admin" }) },
});
await editOpens({
  label: "Editorial",
  Component: ArticlesPanel,
  props: { user: { id: "u1", full_name: "Admin" } },
  expect: "A Real Article",
});

rmSync(".tmp-forms", { recursive: true, force: true });

console.log(`\n  passed: ${pass}`);
if (failures.length) {
  console.log(`  FAILED: ${failures.length}\n`);
  failures.forEach((f) => console.log(`   ✗ ${f}`));
  window.close();
  process.exit(1);
}
console.log("  every admin edit form opens with real data\n");
window.close();
process.exit(0);
