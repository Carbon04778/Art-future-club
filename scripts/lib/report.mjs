/**
 * Test reports the owner can open in a browser: reports/<name>.html.
 *
 * One table of checks (pass/fail, detail, screenshot), any extra sections,
 * written to reports/ — git-ignored and cleaned by nothing (not .tmp/, which
 * test scripts once deleted wholesale).
 */
import { mkdirSync, writeFileSync, existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

export const REPORTS = join(fileURLToPath(new URL("../..", import.meta.url)), "reports");

const esc = (s) => String(s ?? "").replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));
const STYLE = `body{font:14px system-ui,sans-serif;margin:24px;color:#111;max-width:1300px}h1{margin:0 0 4px}h2{margin-top:36px}
p.sum{font-size:16px}table{border-collapse:collapse;width:100%}td,th{border:1px solid #ddd;padding:6px 8px;text-align:left;vertical-align:top}
tr.ok td.r{color:#0a7d2c;font-weight:700}tr.bad td.r{color:#c0182b;font-weight:700}tr.bad{background:#fff3f4}img{width:220px;border:1px solid #ccc}`;

/** Collects checks; `shotDir` is where screenshots go, relative to reports/. */
export function createReport(name, title, intro) {
  const shotDir = `${name}-shots`;
  mkdirSync(join(REPORTS, shotDir), { recursive: true });
  const results = [];
  return {
    shotDir,
    results,
    shotPath: (file) => join(REPORTS, shotDir, file),
    ok(area, check, pass, detail = "", shot = "") {
      results.push({ area, check, pass: !!pass, detail: String(detail ?? "").slice(0, 200), shot: shot ? `${shotDir}/${shot}` : "" });
    },
    /** Write (or append a section to) reports/<name>.html. */
    write({ heading = "Checks", note = "" } = {}) {
      const file = join(REPORTS, `${name}.html`);
      const passed = results.filter((r) => r.pass).length;
      const rows = results.map((r) => `<tr class="${r.pass ? "ok" : "bad"}"><td>${esc(r.area)}</td><td>${esc(r.check)}</td><td class="r">${r.pass ? "PASS" : "FAIL"}</td><td>${esc(r.detail)}</td><td>${r.shot ? `<a href="${r.shot}"><img src="${r.shot}"></a>` : ""}</td></tr>`).join("\n");
      const section = `<h2>${esc(heading)}</h2>${note ? `<p>${esc(note)}</p>` : ""}<p class="sum"><b>${passed} / ${results.length} checks passed</b> — ${new Date().toISOString()}</p>
<table><tr><th>Area</th><th>Check</th><th>Result</th><th>Detail</th><th>Screenshot</th></tr>${rows}</table>`;
      const html = existsSync(file)
        ? readFileSync(file, "utf8").replace("</body>", `${section}</body>`)
        : `<!doctype html><html><head><meta charset="utf-8"><title>${esc(title)}</title><style>${STYLE}</style></head><body><h1>${esc(title)}</h1><p>${esc(intro)}</p>${section}</body></html>`;
      writeFileSync(file, html);
      return { passed, total: results.length, file };
    },
  };
}
