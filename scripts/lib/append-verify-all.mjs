/**
 * Add a verify:all log to an owner report: one row per test script, exit code
 * and build result.   node scripts/lib/append-verify-all.mjs <report-name> <log> <exit-code>
 */
import { readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { REPORTS } from "./report.mjs";
const [name, logFile, code] = process.argv.slice(2);
const log = readFileSync(logFile, "utf8");
const runs = [...log.matchAll(/> (?:vite-node --mode test |node )scripts\/(verify-[a-z-]+)\.mjs[\s\S]*?(?=\n> |\n*$)/g)].map((m) => {
  const b = m[0];
  const passed = (b.match(/passed:?\s*(\d+)/) || b.match(/(\d+) passed/) || [])[1] || (b.match(/(\d+\/\d+) routes rendered clean/) || [])[1] || "ok";
  const failed = (b.match(/FAILED:?\s*(\d+)/) || b.match(/(\d+) failed/) || [])[1] || "0";
  return { script: m[1], passed, failed };
});
const built = /✓ built in/.test(log);
const rows = runs.map((r) => `<tr class="${r.failed === "0" ? "ok" : "bad"}"><td>${r.script}</td><td>${r.passed}</td><td class="r">${r.failed === "0" ? "PASS" : "FAIL " + r.failed}</td></tr>`).join("");
const section = `<h2>Automated checks (npm run verify:all)</h2><p>Exit code <b>${code}</b> · ${runs.length} test scripts · production build ${built ? "<b>succeeded</b>" : "<b>FAILED</b>"}</p><table><tr><th>Script</th><th>Checks passed</th><th>Result</th></tr>${rows}</table>`;
const file = join(REPORTS, `${name}.html`);
writeFileSync(file, readFileSync(file, "utf8").replace("</body>", `${section}</body>`));
console.log(`scripts: ${runs.length} | failed: ${runs.filter((r) => r.failed !== "0").map((r) => r.script).join(",") || "none"} | build: ${built} | exit: ${code}`);
