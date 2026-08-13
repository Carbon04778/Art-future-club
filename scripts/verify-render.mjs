/**
 * Render smoke test — mounts every route in a real DOM and fails on any
 * React error, unhandled rejection, or empty render.
 *
 * Run: npm run verify:render
 *
 * This test ALWAYS runs against the demo provider, never a real database.
 * It seeds signed-in states by writing the demo session key, and its routes
 * use demo ids like "artist_lin" — against Supabase those are rejected as
 * malformed uuids, and the signed-in checks silently test nothing.
 *
 * Forcing mock mode here means the test behaves identically whether or not a
 * developer has a .env file present.
 */
import { JSDOM } from "jsdom";
import { BACKEND } from "../src/api/base44Client.js";

// Guard: this test seeds demo sessions and uses demo ids like "artist_lin".
// Against a real database those are rejected as malformed uuids and the
// signed-in checks silently pass while testing nothing.
if (BACKEND !== "mock") {
  console.error(`\n  This test must run against the demo provider (got "${BACKEND}").`);
  console.error("  It is normally run via:  npm run verify:render");
  console.error("  which sets --mode test so .env.test forces mock mode.\n");
  process.exit(1);
}

const ROUTES = [
  "/", "/artists", "/artists/artist_lin", "/gallery", "/gallery/gallery_vetiva",
  "/venues", "/venues/venue_kunsthalle", "/events", "/events/ev_basel",
  "/open-calls", "/editorial", "/editorial/julie-chan-painting-the-city",
  "/map", "/gallery-map", "/about", "/terms", "/privacy", "/cookies",
  "/membership-policy", "/partnership", "/chapter/hong-kong", "/upgrade",
  "/login", "/register", "/forgot-password", "/reset-password",
  "/community", "/messages", "/notifications", "/profile/edit",
  "/collector-profile", "/onboarding", "/admin", "/no-such-page",
];

const dom = new JSDOM("<!doctype html><html><body><div id='root'></div></body></html>", {
  url: "http://localhost:5173/",
  pretendToBeVisual: true,
});

const { window } = dom;
globalThis.window = window;
globalThis.document = window.document;
Object.defineProperty(globalThis, "navigator", { value: window.navigator, configurable: true });
globalThis.HTMLElement = window.HTMLElement;
globalThis.SVGElement = window.SVGElement;
globalThis.SVGSVGElement = window.SVGSVGElement;
globalThis.Element = window.Element;
globalThis.Node = window.Node;
globalThis.DOMRect = window.DOMRect;
globalThis.MutationObserver = window.MutationObserver;
globalThis.CustomEvent = window.CustomEvent;
globalThis.Event = window.Event;
globalThis.MouseEvent = window.MouseEvent;
globalThis.KeyboardEvent = window.KeyboardEvent;
globalThis.File = window.File;
globalThis.Blob = window.Blob;
globalThis.URL = window.URL;
globalThis.Image = window.Image;
globalThis.FileReader = window.FileReader;
globalThis.getComputedStyle = window.getComputedStyle;
globalThis.requestAnimationFrame = (cb) => setTimeout(() => cb(Date.now()), 0);
globalThis.cancelAnimationFrame = clearTimeout;
globalThis.matchMedia =
  window.matchMedia ||
  (() => ({ matches: false, addEventListener() {}, removeEventListener() {}, addListener() {}, removeListener() {} }));
window.matchMedia = globalThis.matchMedia;
window.scrollTo = () => {};
window.Element.prototype.scrollIntoView = function () {};
window.HTMLElement.prototype.scrollIntoView = function () {};
window.HTMLCanvasElement.prototype.getContext = () => null;
globalThis.ResizeObserver = window.ResizeObserver = class {
  observe() {} unobserve() {} disconnect() {}
};
globalThis.IntersectionObserver = window.IntersectionObserver = class {
  observe() {} unobserve() {} disconnect() {} takeRecords() { return []; }
};

const errors = [];
const origError = console.error;
console.error = (...args) => {
  const msg = args.map((a) => (a?.message ? a.message : String(a))).join(" ");
  // React's act() advice and jsdom CSS/canvas noise are not app failures.
  if (/not wrapped in act|Could not parse CSS|not implemented: HTMLCanvas|useLayoutEffect does nothing on the server/i.test(msg)) return;
  errors.push(msg.slice(0, 300));
  origError(...args);
};
process.on("unhandledRejection", (e) => errors.push(`unhandledRejection: ${e?.message || e}`));

const React = (await import("react")).default;
const { createRoot } = await import("react-dom/client");
const App = (await import("../src/App.jsx")).default;

const results = [];

for (const route of ROUTES) {
  window.history.pushState({}, "", route);
  const container = document.getElementById("root");
  container.innerHTML = "";
  const before = errors.length;

  const root = createRoot(container);
  await new Promise((resolve) => {
    root.render(React.createElement(App));
    // let effects + the provider's simulated latency settle
    setTimeout(resolve, 450);
  });

  const text = (container.textContent || "").replace(/\s+/g, " ").trim();
  const newErrors = errors.slice(before);
  results.push({ route, chars: text.length, errors: newErrors });

  root.unmount();
}

/* ---- second pass: signed in as admin, to exercise the protected routes ---- */

window.localStorage.setItem(
  "afc_mock_session_v1",
  JSON.stringify({
    id: "user_lin",
    email: "admin@artfuture.club",
    full_name: "Lin Yuk Shan",
    role: "admin",
  })
);

const AUTHED = [
  "/community", "/community/post/fp_shipping", "/messages", "/notifications",
  "/profile/edit", "/collector-profile", "/collector-profile/view",
  "/onboarding", "/admin", "/editorial", "/upgrade", "/",
];

for (const route of AUTHED) {
  window.history.pushState({}, "", route);
  const container = document.getElementById("root");
  container.innerHTML = "";
  const before = errors.length;
  const root = createRoot(container);
  await new Promise((resolve) => {
    root.render(React.createElement(App));
    setTimeout(resolve, 500);
  });
  const text = (container.textContent || "").replace(/\s+/g, " ").trim();
  results.push({
    route: `${route}  [signed in]`,
    chars: text.length,
    errors: errors.slice(before),
  });
  root.unmount();
}

/* ---- third pass: signed in as a NORMAL user (admin link must be hidden) ---- */

window.localStorage.setItem(
  "afc_mock_session_v1",
  JSON.stringify({ id: "user_sara", email: "sara@example.com", full_name: "Sara Wu", role: "user" })
);

async function renderAndGetText(route) {
  window.history.pushState({}, "", route);
  const container = document.getElementById("root");
  container.innerHTML = "";
  const root = createRoot(container);
  await new Promise((resolve) => {
    root.render(React.createElement(App));
    setTimeout(resolve, 500);
  });
  const html = container.innerHTML;
  root.unmount();
  return html;
}

const memberHtml = await renderAndGetText("/");
const memberSeesAdmin = /href="\/admin"/.test(memberHtml);

window.localStorage.setItem(
  "afc_mock_session_v1",
  JSON.stringify({ id: "user_lin", email: "admin@artfuture.club", full_name: "Lin", role: "admin" })
);
const adminHtml = await renderAndGetText("/");
const adminSeesAdmin = /href="\/admin"/.test(adminHtml);

console.log("\n  ADMIN LINK GATING");
console.log(`    normal member sees Admin link : ${memberSeesAdmin ? "YES  <-- BUG" : "no   (correct)"}`);
console.log(`    admin sees Admin link         : ${adminSeesAdmin ? "yes  (correct)" : "NO   <-- BUG"}`);
if (memberSeesAdmin || !adminSeesAdmin) {
  errors.push("Admin link gating is wrong");
  results.push({ route: "ADMIN LINK GATING", chars: 0, errors: ["gating incorrect"] });
}

let failed = 0;
console.log("\n  route                                    chars   status");
console.log("  " + "-".repeat(62));
for (const r of results) {
  const bad = r.errors.length > 0;
  const empty = r.chars < 20;
  if (bad || empty) failed++;
  const status = bad ? "ERROR" : empty ? "EMPTY" : "ok";
  console.log(`  ${r.route.padEnd(40)} ${String(r.chars).padStart(5)}   ${status}`);
  r.errors.slice(0, 2).forEach((e) => console.log(`      ↳ ${e}`));
}

console.log(`\n  ${results.length - failed}/${results.length} routes rendered clean\n`);
process.exit(failed > 0 ? 1 : 0);
