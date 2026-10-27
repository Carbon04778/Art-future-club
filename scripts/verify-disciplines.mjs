/**
 * Verifies several disciplines per artist (A3 in docs/CLIENT-REQUESTS.md):
 * the rules, the picker, the forms that use it, and that the Artists page
 * finds an artist by any of their disciplines.
 *
 * Run: npm run verify:disciplines
 */
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { JSDOM } from "jsdom";

const ROOT = fileURLToPath(new URL("..", import.meta.url));
const dom = new JSDOM("<!doctype html><html><body><form id='f'><div id='root'></div></form></body></html>", { url: "http://localhost/artists", pretendToBeVisual: true });
const { window } = dom;
globalThis.window = window; globalThis.document = window.document;
Object.defineProperty(globalThis, "navigator", { value: window.navigator, configurable: true });
for (const k of ["HTMLElement", "Element", "Node", "Event", "MouseEvent", "SVGElement", "Image", "HTMLInputElement"]) globalThis[k] = window[k];
globalThis.requestAnimationFrame = (cb) => setTimeout(() => cb(Date.now()), 0);
globalThis.ResizeObserver = window.ResizeObserver = class { observe() {} unobserve() {} disconnect() {} };
globalThis.matchMedia = window.matchMedia = () => ({ matches: false, media: "", addListener() {}, removeListener() {}, addEventListener() {}, removeEventListener() {} });
globalThis.IntersectionObserver = window.IntersectionObserver = class { observe() {} unobserve() {} disconnect() {} takeRecords() { return []; } };
globalThis.MutationObserver = window.MutationObserver;
globalThis.IS_REACT_ACT_ENVIRONMENT = false;

const React = (await import("react")).default;
const { createRoot } = await import("react-dom/client");
const { MemoryRouter } = await import("react-router-dom");
const D = await import("../src/lib/disciplines.js");
const DisciplinePicker = (await import("../src/components/DisciplinePicker.jsx")).default;
const { base44 } = await import("../src/api/base44Client.js");
const ArtistsDirectory = (await import("../src/pages/ArtistsDirectory.jsx")).default;

let pass = 0;
const fails = [];
const check = (n, c, d = "") => (c ? pass++ : fails.push(`${n}${d ? ` — ${d}` : ""}`));
const tick = (ms = 80) => new Promise((r) => setTimeout(r, ms));
const eq = (a, b) => JSON.stringify(a) === JSON.stringify(b);

// ---- the rules
check("the list is unchanged (13, Julie: 'ok for now')", D.DISCIPLINES.length === 13 && D.DISCIPLINES.includes("Printmaking"));
check("an old profile (main only) reads as one discipline", eq(D.disciplinesOf({ discipline: "Painting" }), ["Painting"]));
check("main first, then the rest", eq(D.disciplinesOf({ discipline: "Drawing", disciplines: ["Painting", "Drawing", "Ceramics"] }), ["Drawing", "Painting", "Ceramics"]));
check("blanks and repeats dropped", eq(D.disciplinesOf({ discipline: " ", disciplines: ["", "Painting", "Painting", null] }), ["Painting"]));
check("no discipline at all → empty", eq(D.disciplinesOf({}), []) && eq(D.disciplinesOf(null), []));
check("found by a non-main discipline", D.hasDiscipline({ discipline: "Painting", disciplines: ["Painting", "Sculpture"] }, "Sculpture"));
check("label joins them, main first", D.disciplineLabel({ discipline: "Sculpture", disciplines: ["Painting", "Sculpture"] }) === "Sculpture · Painting");
check("save fields: main = first", eq(D.disciplineFields(["Ceramics", "Drawing"]), { discipline: "Ceramics", disciplines: ["Ceramics", "Drawing"] }));
check("save fields: none ticked", eq(D.disciplineFields([]), { discipline: "", disciplines: [] }));
check("unlimited: all 13 can be ticked", D.disciplineFields(D.DISCIPLINES).disciplines.length === 13);

// ---- the picker
const c = document.getElementById("root");
{
  let value = [];
  const root = createRoot(c);
  const draw = async () => { root.render(React.createElement(DisciplinePicker, { value, required: true, onChange: (v) => { value = v; draw(); } })); await tick(); };
  await draw();
  const btn = (t) => [...c.querySelectorAll("button")].find((b) => b.textContent.trim() === t);
  const pressed = () => [...c.querySelectorAll("button[aria-pressed=true]")].map((b) => b.textContent.trim());
  const form = document.getElementById("f");
  check("picker shows all 13 disciplines", c.querySelectorAll("[role=group] button").length === 13);
  check("with none ticked the form will not submit", form.checkValidity() === false);
  btn("Painting").click(); await tick();
  check("first ticked becomes main", eq(value, ["Painting"]) && /Main: Painting/.test(c.textContent));
  check("…and the form can now submit", form.checkValidity() === true);
  btn("Sculpture").click(); await tick();
  btn("Drawing").click(); await tick();
  check("more can be ticked, order kept", eq(value, ["Painting", "Sculpture", "Drawing"]), JSON.stringify(value));
  check("ticked ones show as pressed", eq(pressed().sort(), ["Drawing", "Painting", "Sculpture"]), pressed().join());
  check("the main one is starred", !!btn("Painting").querySelector("svg"));
  [...c.querySelectorAll("p button")].find((b) => b.textContent === "Drawing").click(); await tick();
  check("'Make main' moves it to the front", eq(value, ["Drawing", "Painting", "Sculpture"]), JSON.stringify(value));
  btn("Drawing").click(); await tick();
  check("unticking the main hands it to the next", eq(value, ["Painting", "Sculpture"]), JSON.stringify(value));
  btn("Painting").click(); await tick();
  btn("Sculpture").click(); await tick();
  check("unticking all → nothing, and the form will not submit again", value.length === 0 && form.checkValidity() === false);
  root.unmount();
}

// ---- the Artists page filter, with a fixed set of artists
const A = (id, discipline, disciplines) => ({ id, slug: id, display_name: `Artist ${id}`, discipline, disciplines, status: "approved", based_in: "Hong Kong", chapter: "Hong Kong", portfolio_works: [] });
const ARTISTS = [A("p", "Painting", ["Painting", "Sculpture"]), A("s", "Sculpture", ["Sculpture"]), A("old", "Printmaking", undefined), A("d", "Drawing", ["Drawing"])];
let asked = "";
base44.entities.ArtistProfile.list = async (_s, _n, cols) => { asked = cols || ""; return ARTISTS; };
base44.auth.me = async () => { throw new Error("signed out"); };
{
  const root = createRoot(c);
  root.render(React.createElement(MemoryRouter, null, React.createElement(ArtistsDirectory)));
  for (let i = 0; i < 40 && !/Artist p/.test(c.textContent); i++) await tick(50);
  // the artist names as shown, one element each (textContent runs words together)
  const names = () => [...new Set([...c.querySelectorAll("*")].filter((e) => !e.children.length && /^Artist (p|s|old|d)$/.test(e.textContent.trim())).map((e) => e.textContent.trim()))].sort();
  const pick = async (t) => { [...c.querySelectorAll("button")].find((b) => b.textContent.trim() === t)?.click(); await tick(150); };
  check("the page asks for the disciplines list", /\bdisciplines\b/.test(asked), asked);
  check("all four artists listed", names().length === 4, names().join());
  await pick("Sculpture");
  check("Sculpture filter finds the main AND the secondary sculptor", eq(names(), ["Artist p", "Artist s"]), names().join());
  await pick("Printmaking");
  check("Printmaking is in the filter now, and finds an old single-discipline profile", eq(names(), ["Artist old"]), names().join());
  await pick("Painting");
  check("Painting filter: only the painter", eq(names(), ["Artist p"]), names().join());
  await pick("All");
  check("card shows main + others", /Painting · Sculpture/.test(c.textContent));
  root.unmount();
}

// ---- the forms use the picker and save both columns
const src = (f) => readFileSync(join(ROOT, f), "utf8");
for (const f of ["src/pages/ArtistProfileEdit.jsx", "src/pages/Onboarding.jsx", "src/components/AdminCreatePanel.jsx", "src/components/AdminEditListingsPanel.jsx"]) {
  const s = src(f);
  check(`${f}: uses the discipline picker`, /<DisciplinePicker\b/.test(s));
  check(`${f}: saves main + list together`, /disciplineFields\(/.test(s));
  check(`${f}: no single discipline <select> left`, !/value=\{form\.discipline\}/.test(s));
}
check("artist profile form requires at least one", /<DisciplinePicker required/.test(src("src/pages/ArtistProfileEdit.jsx")));
check("profile page shows every discipline", /disciplineLabel\(profile\)/.test(src("src/pages/ArtistProfileView.jsx")));
check("map search covers every discipline", /disciplineLabel\(a, " "\)/.test(src("src/components/SpacesMap.jsx")));
const mig = src("supabase/migrations/025_artist_disciplines.sql");
check("migration only adds a column and fills it", /add column if not exists disciplines text\[\]/.test(mig) && !/drop |alter column|delete /i.test(mig));
check("migration pauses set_updated_date around the fill", /disable trigger set_updated_date[\s\S]*update[\s\S]*enable trigger set_updated_date/.test(mig));

console.log(`verify:disciplines — ${pass} passed, ${fails.length} failed`);
if (fails.length) { for (const f of fails) console.log("  ✗", f); process.exit(1); }
process.exit(0);
