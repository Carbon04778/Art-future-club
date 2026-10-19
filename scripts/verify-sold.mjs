/**
 * Verifies sold works (B2 in docs/CLIENT-REQUESTS.md): a sold work stays on
 * the artist page labelled Sold, with no price and no Enquire button — and a
 * work saved before this feature looks exactly as it did.
 *
 * Run: npm run verify:sold
 */

import { readFileSync } from "node:fs";
import { JSDOM } from "jsdom";

const dom = new JSDOM("<!doctype html><html><body><div id='root'></div></body></html>", { url: "http://localhost/", pretendToBeVisual: true });
const { window } = dom;
globalThis.window = window; globalThis.document = window.document;
Object.defineProperty(globalThis, "navigator", { value: window.navigator, configurable: true });
for (const k of ["HTMLElement", "Element", "Node", "Event", "MouseEvent", "SVGElement", "Image"]) globalThis[k] = window[k];
globalThis.requestAnimationFrame = (cb) => setTimeout(() => cb(Date.now()), 0);

const React = (await import("react")).default;
const { createRoot } = await import("react-dom/client");
const { isSold, isForSale, priceLabel, SOLD_LABEL } = await import("../src/lib/workSale.js");
const LB = (await import("../src/components/portfolio/PortfolioLightbox.jsx")).default;

let pass = 0;
const fails = [];
const check = (n, c, d = "") => (c ? pass++ : fails.push(`${n}${d ? ` — ${d}` : ""}`));

// --- the rules ----------------------------------------------------------------
const old = { title: "Harbour Study", available_for_sale: true, price: "200", currency: "USD" }; // saved before B2: no `sold`
const sold = { ...old, sold: true };
const notForSale = { title: "NFS", available_for_sale: false, price: "" };
const soldNotForSale = { title: "Gone", available_for_sale: false, sold: true };

check("a work saved before B2 is not sold", !isSold(old));
check("a work saved before B2 is still for sale", isForSale(old));
check("a work saved before B2 keeps its price", priceLabel(old) === "USD 200", priceLabel(old));
check("sold is sold", isSold(sold));
check("a sold work is not for sale", !isForSale(sold));
check("a sold work shows no price", priceLabel(sold) === "", priceLabel(sold));
check("a work never for sale shows no price", priceLabel(notForSale) === "");
check("sold works even if 'available' was never ticked", isSold(soldNotForSale) && !isForSale(soldNotForSale));
check("only a real true counts as sold", !isSold({ sold: "false" }) && !isSold({ sold: 1 }) && !isSold(null));
check("currency defaults to USD", priceLabel({ available_for_sale: true, price: "5" }) === "USD 5");
check("the label reads Sold", SOLD_LABEL === "Sold");

// --- the lightbox, rendered ------------------------------------------------------
const c = document.getElementById("root");
async function render(work) {
  const root = createRoot(c);
  await new Promise((r) => { root.render(React.createElement(LB, { images: ["/x.jpg"], work, onClose() {} })); setTimeout(r, 300); });
  const text = c.textContent;
  root.unmount();
  return text;
}
const tOld = await render(old);
check("lightbox: unsold work shows its price", /USD 200/.test(tOld));
// Plain "contains": the title runs straight into the label ("Harbour StudySold"),
// so a whole-word match never fires.
check("lightbox: unsold work does not say Sold", !tOld.includes("Sold"), tOld);
const tSold = await render(sold);
check("lightbox: sold work says Sold", tSold.includes("Sold"), tSold);
check("lightbox: sold work shows no price", !/USD 200/.test(tSold));

// --- wiring: every place that edits or shows a work ----------------------------
const read = (p) => readFileSync(new URL(p, import.meta.url), "utf8");
const view = read("../src/pages/ArtistProfileView.jsx");
const edit = read("../src/pages/ArtistProfileEdit.jsx");
const create = read("../src/components/AdminCreatePanel.jsx");
const listings = read("../src/components/AdminEditListingsPanel.jsx");
const pdf = read("../src/lib/portfolioPdf.js");
const dir = read("../src/pages/ArtistsDirectory.jsx");

check("artist page: Enquire only for works still for sale", /\{isForSale\(work\) && \(\s*<div className="shrink-0 text-right">/.test(view));
check("artist page: sold works are labelled", /\{isSold\(work\) && \(/.test(view) && /\{SOLD_LABEL\}/.test(view));
check("artist edit: has a Sold tick box", /updateWork\(i, "sold", e\.target\.checked\)/.test(edit));
check("artist edit: price hides once sold", /work\.available_for_sale && !isSold\(work\)/.test(edit));
check("add listing: has a Sold tick box", /updateWork\(i, "sold", e\.target\.checked\)/.test(create));
check("add listing: new works start unsold", /sold: false,/.test(create));
check("add listing: saves sold", /sold: !!w\.sold,/.test(create));
check("edit listings: has a Sold tick box", /updateWork\(i, "sold", e\.target\.checked\)/.test(listings));
check("edit listings: loads sold", /sold: w\.sold === true,/.test(listings));
check("edit listings: saves sold", /sold: !!w\.sold,/.test(listings));
check("edit listings: keeps fields it does not edit (added_date etc.)",
  /stored: w,/.test(listings) && /\.\.\.\(w\.stored \|\| \{\}\),\s*\n\s*title: w\.title\.trim\(\)/.test(listings));
check("PDF: sold says Sold, not the price", /const price = isSold\(work\) \? SOLD_LABEL : priceLabel\(work\);/.test(pdf));
check("directory: 'for sale' skips sold works", /portfolio_works\?\.some\(isForSale\)/.test(dir));
check("no display still reads the raw flag for a price",
  !/available_for_sale && work\.price/.test(read("../src/components/portfolio/PortfolioLightbox.jsx") + pdf));

console.log(`\n  passed: ${pass}`);
if (fails.length) { console.log(`  FAILED: ${fails.length}`); fails.forEach((f) => console.log("   ✗ " + f)); window.close(); process.exit(1); }
console.log("  sold works stay on the page, labelled Sold\n");
window.close(); process.exit(0);
