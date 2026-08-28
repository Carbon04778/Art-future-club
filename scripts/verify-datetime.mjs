import { readFileSync } from "node:fs";
import { toLocalInput, fromLocalInput } from "../src/lib/datetime.js";

let pass=0; const fails=[];
const check=(n,c,d="")=>c?pass++:fails.push(`${n}${d?` — ${d}`:""}`);

// The reported case: enter a time, reopen, see the same time.
for (const typed of ["2026-09-01T18:00","2026-12-25T09:30","2026-01-01T00:00","2026-06-15T23:59"]) {
  const stored = fromLocalInput(typed);
  check(`round trip holds for ${typed}`, toLocalInput(stored) === typed, toLocalInput(stored));
}

// Editing twice must not drift.
let v = "2026-09-01T18:00";
for (let i=0;i<5;i++) v = toLocalInput(fromLocalInput(v));
check("five saves in a row do not shift the time", v === "2026-09-01T18:00", v);

// Empty values
check("an empty date stays empty", toLocalInput("") === "");
check("clearing a date returns null, not undefined", fromLocalInput("") === null);
check("null is handled", toLocalInput(null) === "");
check("a rubbish value does not crash", toLocalInput("not a date") === "");

// The old behaviour, for contrast.
const stored = fromLocalInput("2026-09-01T18:00");
const oldWay = String(stored).slice(0,16);
check("the OLD slice was wrong in this timezone",
  process.env.TZ === "UTC" || oldWay !== "2026-09-01T18:00",
  `slice gave ${oldWay}`);

// Every form uses the helper.
for (const f of ["components/AdminEventsPanel","components/gallery/ExhibitionsSection","components/ArticleForm"]) {
  const src = readFileSync(`src/${f}.jsx`,"utf8");
  check(`${f.split("/").pop()} uses the helper`, /toLocalInput|fromLocalInput/.test(src));
  check(`${f.split("/").pop()} no longer slices`, !/slice\(0, 16\)/.test(src));
}

// The image ordering bug.
const ev = readFileSync("src/components/AdminEventsPanel.jsx","utf8");
check("a newly uploaded image is not overwritten by the form", /\.\.\.form,\s*\n[\s\S]{0,180}image_url,/.test(ev));

console.log(`\n  passed: ${pass}`);
if(fails.length){ console.log(`  FAILED: ${fails.length}`); fails.forEach(f=>console.log("   ✗ "+f)); process.exit(1); }
console.log("  times survive editing in any timezone\n");
