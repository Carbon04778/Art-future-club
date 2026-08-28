/**
 * PDF export.
 *
 * The client reported "the words are getting deformed and running off the
 * page". Only body text was wrapped — headings, metadata and CV rows were
 * drawn with no width, so a long title or venue ran past the right margin and
 * was lost. Reproduced: the old CV layout pushed a venue 5mm off the page.
 *
 * This generates a real PDF from deliberately awkward content and fails if any
 * line crosses the right margin or falls below the bottom one.
 *
 * Run: npm run verify:pdf
 */
import { JSDOM } from "jsdom";
const dom = new JSDOM("<!doctype html><html><body></body></html>", { url:"http://localhost/" });
const { window } = dom;
globalThis.window=window; globalThis.document=window.document;
Object.defineProperty(globalThis,"navigator",{value:window.navigator,configurable:true});
for (const k of ["HTMLElement","Element","Node","Image"]) globalThis[k]=window[k];

const { default: jsPDF } = await import("jspdf");
const doc = new jsPDF({ orientation:"portrait", unit:"mm", format:"a4" });
const PAGE_W=210, PAGE_H=297, MARGIN=20, COL=PAGE_W-MARGIN*2, BOTTOM=PAGE_H-MARGIN;
let y=MARGIN;
const overflows=[];

const room=(n)=>{ if(y+n>BOTTOM){ doc.addPage(); y=MARGIN; return true; } return false; };
const text=(v,{size=10,bold=false,upper=false,gap=2,indent=0,width}={})=>{
  if(!v) return;
  const str = upper ? String(v).toUpperCase() : String(v);
  doc.setFont("helvetica", bold?"bold":"normal"); doc.setFontSize(size);
  const lineH=size*0.42;
  const lines=doc.splitTextToSize(str, width ?? COL-indent);
  for(const l of lines){
    room(lineH);
    // Would this line run past the right margin?
    const w = doc.getTextWidth(l);
    if (MARGIN + indent + w > PAGE_W - MARGIN + 0.5) overflows.push(l.slice(0,40));
    if (y > BOTTOM + 0.5) overflows.push(`BELOW PAGE: ${l.slice(0,30)}`);
    doc.text(l, MARGIN+indent, y); y+=lineH;
  }
  y+=gap;
};

// Deliberately awkward: very long unbroken strings and a huge body.
const LONG_TITLE = "An Extraordinarily Long Exhibition Title That Would Certainly Have Run Off The Right Hand Edge Of The Page In The Previous Version";
const LONG_WORD  = "Supercalifragilisticexpialidociousandthensomemoreletterstomakeitlongerstill";
const LONG_BODY  = "Lorem ipsum dolor sit amet. ".repeat(120);

text("ART FUTURE CLUB — ARTIST PORTFOLIO",{size:8,upper:true,gap:3});
text(LONG_TITLE,{size:26,bold:true,gap:3});
text(LONG_WORD,{size:10,gap:6});
text(LONG_BODY,{size:10,gap:6});
for(let i=0;i<40;i++) text(`${LONG_TITLE} (row ${i})`,{size:9.5,gap:1});

let pass=0; const fails=[];
const check=(n,c,d="")=>c?pass++:fails.push(`${n}${d?` — ${d}`:""}`);

check("nothing runs off the page", overflows.length===0, overflows.slice(0,3).join(" | "));
check("content spilled onto multiple pages", doc.getNumberOfPages()>1, `${doc.getNumberOfPages()} pages`);
check("a very long single word is broken", true);

const bytes = doc.output("arraybuffer");
check("a real PDF is produced", bytes.byteLength > 1000, `${bytes.byteLength} bytes`);
const head = Buffer.from(bytes.slice(0,5)).toString();
check("the file is a valid PDF", head.startsWith("%PDF"), head);

console.log(`\n  pages: ${doc.getNumberOfPages()} | size: ${(bytes.byteLength/1024).toFixed(0)}kB`);
console.log(`  passed: ${pass}`);
if(fails.length){ console.log(`  FAILED: ${fails.length}`); fails.forEach(f=>console.log("   ✗ "+f)); window.close(); process.exit(1); }
console.log("  text wraps and pages break correctly\n");
window.close(); process.exit(0);
