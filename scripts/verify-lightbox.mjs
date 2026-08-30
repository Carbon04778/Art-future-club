import { JSDOM } from "jsdom";
const dom = new JSDOM("<!doctype html><html><body><div id='root'></div></body></html>", { url:"http://localhost/", pretendToBeVisual:true });
const { window } = dom;
globalThis.window=window; globalThis.document=window.document;
Object.defineProperty(globalThis,"navigator",{value:window.navigator,configurable:true});
for (const k of ["HTMLElement","Element","Node","Event","MouseEvent","SVGElement","Image"]) globalThis[k]=window[k];
globalThis.requestAnimationFrame=(cb)=>setTimeout(()=>cb(Date.now()),0);

const React=(await import("react")).default;
const { createRoot }=await import("react-dom/client");
const LB=(await import("../src/components/portfolio/PortfolioLightbox.jsx")).default;

let pass=0; const fails=[];
const check=(n,c,d="")=>c?pass++:fails.push(`${n}${d?` — ${d}`:""}`);
const c=document.getElementById("root"); const root=createRoot(c);

const work={ title:"Way of Life", medium:"Mixed Media", dimensions:"21 x 29.7 cm",
  year:"2023", available_for_sale:true, price:"200", currency:"USD",
  description:"Inspired by a simple photograph of a rain-dappled leaf." };

await new Promise(r=>{ root.render(React.createElement(LB,{
  images:["/x.jpg"], work,
  actions: React.createElement("span",{"data-testid":"actions"},"LIKE COLLECT SHARE"),
  comments: React.createElement("span",{"data-testid":"comments"},"COMMENT"),
  onClose(){},
})); setTimeout(r,400); });

check("the panel renders", /Way of Life/.test(c.textContent));
check("the description shows", /rain-dappled/.test(c.textContent));

const actions=c.querySelector('[data-testid="actions"]');
const comments=c.querySelector('[data-testid="comments"]');
check("actions render", !!actions);
check("comments render", !!comments);

// The footer block must be pushed to the bottom and aligned right.
const footer = actions?.closest("div")?.parentElement;
check("actions and comments share a footer block", !!footer && footer.contains(comments), footer?.className||"");
check("the footer is pushed to the bottom", /mt-auto/.test(footer?.className||""), footer?.className||"");

check("actions are aligned right", /justify-end/.test(actions?.closest("div")?.className||""),
  actions?.closest("div")?.className||"");
check("comments are aligned right", /justify-end/.test(comments?.closest("div")?.className||""),
  comments?.closest("div")?.className||"");

// Order: description, then actions, then comments.
const text=c.textContent;
check("description comes before the actions", text.indexOf("rain-dappled") < text.indexOf("LIKE"));
check("actions come before the comment", text.indexOf("LIKE") < text.indexOf("COMMENT"));

// The panel must be a column for mt-auto to work.
const panel=footer?.parentElement;
check("the panel is a flex column", /flex-col/.test(panel?.className||""), panel?.className||"");

root.unmount();
console.log(`\n  passed: ${pass}`);
if(fails.length){ console.log(`  FAILED: ${fails.length}`); fails.forEach(f=>console.log("   ✗ "+f)); window.close(); process.exit(1); }
console.log("  sharing and comments sit at the bottom right of the panel\n");
window.close(); process.exit(0);
