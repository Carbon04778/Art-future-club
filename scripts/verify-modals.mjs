/**
 * Modal render test.
 *
 * verify-render.mjs mounts every ROUTE, but a modal only exists after a click.
 * Two blank-screen bugs have now reached the client this way — a component
 * that lint accepted, the build accepted, and every route test passed, because
 * nothing ever opened it.
 *
 * This opens each one and fails if it crashes or renders nothing.
 *
 * Run: npm run verify:modals
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
for (const k of ["HTMLElement", "Element", "Node", "File", "Blob", "Event", "MouseEvent", "SVGElement", "DOMRect"]) {
  globalThis[k] = window[k];
}
window.URL.createObjectURL = () => "blob:preview";
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

/**
 * Mount a component, click the button matching `openLabel`, and confirm the
 * result renders. Any React error is captured rather than printed, so a
 * failure is reported as a clean assertion.
 */
async function openAndCheck({ name, Component, props, openLabel, expect }) {
  container.innerHTML = "";
  const root = createRoot(container);

  let captured = null;
  const originalError = console.error;
  console.error = (...args) => {
    if (!captured) captured = args.map((a) => a?.message || String(a)).join(" ").slice(0, 300);
  };

  try {
    await new Promise((r) => {
      root.render(
        React.createElement(MemoryRouter, null, React.createElement(Component, props))
      );
      setTimeout(r, 400);
    });

    const button = [...container.querySelectorAll("button")].find((b) =>
      new RegExp(openLabel, "i").test(b.textContent)
    );
    check(`${name}: the button that opens it exists`, !!button);

    if (button) {
      button.dispatchEvent(new window.MouseEvent("click", { bubbles: true }));
      await new Promise((r) => setTimeout(r, 400));
    }

    const text = (container.textContent || "").trim();
    check(`${name}: opens without crashing`, !captured, captured || "");
    check(`${name}: renders content`, text.length > 200, `${text.length} chars`);
    if (expect) {
      check(`${name}: shows ${expect}`, new RegExp(expect, "i").test(text));
    }
  } catch (err) {
    check(`${name}: opens without crashing`, false, err.message);
  } finally {
    console.error = originalError;
    root.unmount();
  }
}

/* ------------------------------------------------------------------ tests */

const galleryProfile = {
  id: "g1",
  user_id: "u1",
  display_name: "Test Gallery",
  based_in: "Hong Kong",
  address: "Central, Hong Kong",
  type: "Gallery",
};

const ExhibitionsSection = (await import("../src/components/gallery/ExhibitionsSection.jsx")).default;

await openAndCheck({
  name: "Post Exhibition",
  Component: ExhibitionsSection,
  props: { profile: galleryProfile, isOwner: true, events: [], onReload() {} },
  openLabel: "Post",
  expect: "Chapter",
});

// Editing an existing exhibition follows a different path: the form prefills.
await openAndCheck({
  name: "Edit Exhibition",
  Component: ExhibitionsSection,
  props: {
    profile: galleryProfile,
    isOwner: true,
    events: [
      {
        id: "e1",
        title: "Material Traces",
        start_date: new Date(Date.now() + 86400000).toISOString(),
        chapter: "Hong Kong",
        event_type: "Exhibition",
      },
    ],
    onReload() {},
  },
  openLabel: "Edit",
  expect: "Material Traces",
});

console.log(`\n  passed: ${pass}`);
if (failures.length) {
  console.log(`  FAILED: ${failures.length}\n`);
  failures.forEach((f) => console.log(`   ✗ ${f}`));
  window.close();
  process.exit(1);
}
console.log("  click-opened modals render without crashing\n");
window.close();
process.exit(0);
