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
const { bumpDataRevision } = await import("../src/lib/dataRevision.js");

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
        /*
         * Checked on the form CONTROLS, not on container text. The row being
         * edited is still in the list behind the form, so its name is on the
         * page whether the form opened or not — a text check passes even when
         * the editor never rendered, which is exactly the regression this is
         * supposed to catch.
         */
        const filled = [...container.querySelectorAll("input, textarea")].some(
          (el) => (el.value || "").includes(expect)
        );
        check(`${label}: the form is prefilled`, filled, `no field holds "${expect}"`);
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


/**
 * Open the editor, type something unsaved, and (for artists) add a work — then
 * fire the data-revision signal, exactly as regaining window focus does.
 *
 * WHY: choosing an image opens the OS file dialog, which takes focus off the
 * window. On return, dataRevision bumps and the panel refetches its list. If
 * the refetch swaps the list for a spinner, the open editor is unmounted and
 * everything typed — and the new work — is thrown away. The panel then
 * remounts the editor from the saved row, so it looks as though "it reloaded
 * and added nothing". dataRevision.js says not to wire it into editable form
 * state for precisely this reason.
 */
async function editSurvivesRefresh({ label, Component, props = {}, addWork = false }) {
  container.innerHTML = "";
  const root = createRoot(container);
  try {
    await new Promise((r) => {
      root.render(React.createElement(MemoryRouter, null, React.createElement(Component, props)));
      setTimeout(r, 500);
    });
    const edit = [...container.querySelectorAll("button")].find((b) => b.textContent.trim() === "Edit");
    edit.dispatchEvent(new window.MouseEvent("click", { bubbles: true }));
    await new Promise((r) => setTimeout(r, 500));

    // Type into the first ordinary text field of the form — an unsaved edit.
    const input = container.querySelector("form input:not([type=file]):not([type=checkbox]):not([type=range])");
    check(`${label}: the open form has a text field`, !!input);
    const setValue = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, "value").set;
    setValue.call(input, "UNSAVED-TYPING");
    input.dispatchEvent(new window.Event("input", { bubbles: true }));

    const removeButtons = () =>
      [...container.querySelectorAll("button")].filter((b) =>
        /remove work/i.test(b.getAttribute("aria-label") || b.textContent)
      ).length;
    let before = 0;
    if (addWork) {
      before = removeButtons();
      const add = [...container.querySelectorAll("button")].find((b) => /add work/i.test(b.textContent));
      check(`${label}: an Add work button is offered`, !!add);
      add?.dispatchEvent(new window.MouseEvent("click", { bubbles: true }));
      await new Promise((r) => setTimeout(r, 100));
      check(`${label}: Add work adds a work`, removeButtons() === before + 1, `${before} -> ${removeButtons()}`);
    }

    // What regaining focus does. (The focus listener itself is throttled to
    // once per ten seconds, so it is called directly here.)
    bumpDataRevision();
    await new Promise((r) => setTimeout(r, 900));

    const stillTyped = [...container.querySelectorAll("input")].some((el) => el.value === "UNSAVED-TYPING");
    check(`${label}: unsaved typing survives a list refresh`, stillTyped, "the editor was unmounted and remounted from the saved row");
    if (addWork) {
      check(`${label}: the added work survives a list refresh`, removeButtons() === before + 1, `${before + 1} expected, ${removeButtons()} present`);
    }
  } catch (err) {
    check(`${label}: survives refresh without crashing`, false, err.message);
  } finally {
    root.unmount();
  }
}

/* ---------------------------------------------------------------- tests */

const EventsPanel = await loadPanel("AdminEventsPanel", {
  entities: { Event: { ...noop, list: async () => EVENTS } },
  integrations: uploads,
});
// "A show." is the description — a textarea, not the title the list row shows.
await editOpens({ label: "Events", Component: EventsPanel, expect: "A show." });
await editSurvivesRefresh({ label: "Events", Component: EventsPanel });

/*
 * get() matters here: the panel lists summary rows (admin_listings carries only
 * the columns the list renders) and fetches the full row when the editor opens.
 * Without it the form would open empty, which the prefilled check above now
 * notices.
 */
const byId = (rows) => async (id) => {
  const row = rows.find((r) => r.id === id);
  if (!row) throw new Error(`not found: ${id}`);
  return row;
};

/*
 * The real panel reads admin_listings (migration 021), which carries ONLY the
 * columns the list renders — no bio, no works, no chapter. The editor must
 * therefore open on the full row from get(), not on the list row. Mocking the
 * view with exactly that narrow shape is what makes this test able to tell
 * the difference: without it the panel fell back to list() with full rows and
 * the bug — form rendered from the list row — was invisible.
 */
const LIST_COLUMNS = ["kind", "id", "display_name", "type", "discipline", "based_in",
  "claim_email", "user_id", "status", "created_date"];
const narrow = (rows, kind) => rows.map((r) => {
  const out = { kind };
  for (const c of LIST_COLUMNS) if (c !== "kind") out[c] = c in r ? r[c] : null;
  return out;
});
const listingRows = [...narrow(ARTISTS, "artist"), ...narrow(GALLERIES, "collector")];

const ListingsPanel = await loadPanel("AdminEditListingsPanel", {
  entities: {
    ArtistProfile: { ...noop, list: async () => ARTISTS, get: byId(ARTISTS) },
    CollectorProfile: { ...noop, list: async () => GALLERIES, get: byId(GALLERIES) },
    AdminListing: {
      ...noop,
      page: async ({ limit = 50, offset = 0 } = {}) =>
        ({ rows: listingRows.slice(offset, offset + limit), count: listingRows.length }),
    },
  },
  integrations: uploads,
});
// "Spilt Coffee" is a portfolio work title. It exists only on the full row, so
// finding it in a form field proves the editor opened on get(), not the list.
await editOpens({ label: "Edit listings", Component: ListingsPanel, expect: "Spilt Coffee" });
await editSurvivesRefresh({ label: "Edit listings", Component: ListingsPanel, addWork: true });

const ArticlesPanel = await loadPanel("AdminArticlesPanel", {
  entities: { Article: { ...noop, list: async () => ARTICLES } },
  integrations: uploads,
  auth: { me: async () => ({ id: "u1", full_name: "Admin" }) },
});
await editOpens({
  label: "Editorial",
  Component: ArticlesPanel,
  props: { user: { id: "u1", full_name: "Admin" } },
  // The body, not the title: proves the editor opened on the full article.
  expect: "Body text.",
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
