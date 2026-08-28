// Mounts the admin dashboard and clicks through EVERY tab, so a panel that
// crashes only when opened is caught. The route test mounts the page once and
// sees only the default tab.
import { JSDOM } from "jsdom";
const dom = new JSDOM("<!doctype html><html><body><div id='root'></div></body></html>", { url:"http://localhost/admin", pretendToBeVisual:true });
const { window } = dom;
globalThis.window = window; globalThis.document = window.document;
Object.defineProperty(globalThis,"navigator",{value:window.navigator,configurable:true});
for (const k of ["HTMLElement","Element","Node","File","Blob","Event","MouseEvent","SVGElement","Image"]) globalThis[k]=window[k];
window.URL.createObjectURL = () => "blob:x";
window.URL.revokeObjectURL = () => {};
globalThis.requestAnimationFrame=(cb)=>setTimeout(()=>cb(Date.now()),0);
globalThis.ResizeObserver = window.ResizeObserver = class { observe(){} unobserve(){} disconnect(){} };

const React=(await import("react")).default;
const { createRoot }=await import("react-dom/client");
const { MemoryRouter }=await import("react-router-dom");
// Stub the backend: an admin user, and empty lists for everything else.
import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
mkdirSync(".tmp",{recursive:true});
const entity = { list: async()=>[], filter: async()=>[], update: async(i,p)=>({id:i,...p}), delete: async()=>{}, create: async(o)=>({id:"x",...o}) };
globalThis.__stub__ = {
  auth: { me: async()=>({ id:"admin1", email:"a@t.com", full_name:"Admin", role:"admin" }) },
  entities: new Proxy({}, { get: () => entity }),
  integrations: { Core: { UploadFile: async()=>({file_url:"u"}) } },
  functions: { invoke: async()=>({ ok:true }) },
};
writeFileSync(".tmp/Dash.jsx",
  readFileSync("src/pages/AdminDashboard.jsx","utf8")
    .replace(/import \{ base44 \} from "@\/api\/base44Client";/, "const base44 = globalThis.__stub__;"));
const Dash=(await import("./.tmp/Dash.jsx")).default;

let pass=0; const fails=[];
const check=(n,c,d="")=>c?pass++:fails.push(`${n}${d?` — ${d}`:""}`);

const c=document.getElementById("root");
const root=createRoot(c);

let captured=[];
const realErr=console.error;
console.error=(...a)=>{ captured.push(a.map(x=>x?.message||String(x)).join(" ").slice(0,200)); };

await new Promise(r=>{ root.render(React.createElement(MemoryRouter,null,React.createElement(Dash))); setTimeout(r,600); });

const TABS = ["Add Listing","Edit Listings","Events","Members","Editorial","Artists","Inquiries","Forum","Open Calls","Newsletter","Subscriptions"];

for (const tab of TABS) {
  captured = [];
  const btn = [...c.querySelectorAll("button")].find(b => b.textContent.trim() === tab);
  if (!btn) { check(`tab "${tab}" exists`, false); continue; }
  check(`tab "${tab}" exists`, true);

  btn.dispatchEvent(new window.MouseEvent("click",{bubbles:true}));
  await new Promise(r=>setTimeout(r,350));

  const text = (c.textContent||"").trim();
  check(`"${tab}" opens without crashing`, captured.length === 0, captured[0] || "");
  check(`"${tab}" renders content`, text.length > 300, `${text.length} chars`);
}

console.error=realErr;
root.unmount();
console.log(`\n  passed: ${pass}`);
if(fails.length){ console.log(`  FAILED: ${fails.length}\n`); fails.forEach(f=>console.log("   ✗ "+f)); window.close(); process.exit(1); }
console.log("  every admin tab opens and renders\n");
window.close(); process.exit(0);
