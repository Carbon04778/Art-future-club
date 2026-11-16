import React, { useMemo, useRef, useState } from "react";
import { Link } from "react-router-dom";
import { base44 } from "@/api/base44Client";
import { loadAll } from "@/lib/loadAll";
import { spacePath } from "@/lib/slugs";
import { isVenueType } from "@/lib/venueTypes";
import { STATUS } from "@/lib/profileReadiness";
import {
  COLUMNS, LISTING_TYPES, EXISTING_COLUMNS, parseCsv, readSheet, checkRows,
  recordFor, patchFor, templateCsv, toCsv,
} from "@/lib/listingCsv";
import { Download, Upload, Loader2, Check, AlertTriangle, Undo2, X } from "lucide-react";

const MAX_BYTES = 5 * 1024 * 1024;
// Tests set globalThis.__AFC_PIN_GAP_MS = 0 to skip the wait.
const pinGap = () => globalThis.__AFC_PIN_GAP_MS ?? 1100;

function download(name, text) {
  const url = URL.createObjectURL(new Blob([text], { type: "text/csv;charset=utf-8" }));
  const a = document.createElement("a");
  a.href = url;
  a.download = name;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

const today = () => new Date().toISOString().slice(0, 10);

/*
 * The last import is remembered in this browser, so "Undo this import"
 * survives opening Approvals to look at the drafts, or a page refresh. Only
 * ids and the old values of updated fields are kept — the next import
 * replaces it. Storage can be blocked (private windows): then Undo works
 * until the admin leaves this tab, as before.
 */
const LAST = "afc-last-csv-import";
const remember = (r) => { try { localStorage.setItem(LAST, JSON.stringify({ at: new Date().toISOString(), asDraft: r.asDraft, created: r.created.map(({ line, name, id }) => ({ line, name, id })), updated: r.updated.map(({ line, name, id, before, changed }) => ({ line, name, id, before, changed })) })); } catch { /* storage blocked */ } };
const recall = () => { try { const v = JSON.parse(localStorage.getItem(LAST) || "null"); return v && (v.created?.length || v.updated?.length) ? v : null; } catch { return null; } };
const forget = () => { try { localStorage.removeItem(LAST); } catch { /* storage blocked */ } };

/**
 * Admin → Import CSV (C12 / B8 in docs/CLIENT-REQUESTS.md).
 *
 * Create many gallery, venue and Directory listings from one spreadsheet.
 * Nothing is saved until the preview has been seen and "Import" pressed;
 * rows with problems are never imported; a listing already on the site is
 * skipped unless the admin chooses to update it — and one a member owns is
 * never changed. New listings wait in Approvals by default. "Undo this
 * import" deletes what it created and puts back what it changed.
 *
 * Text only. Uses the admin's own sign-in (the same permissions as Add
 * Listing); no database change was needed.
 */
export default function AdminImportPanel() {
  const [fileName, setFileName] = useState("");
  const [sheet, setSheet] = useState(null);      // readSheet() result
  const [checked, setChecked] = useState([]);    // checkRows() result
  const [choice, setChoice] = useState({});      // line → "skip" | "update"
  const [onSite, setOnSite] = useState([]);      // every listing already on the site
  const [defaultType, setDefaultType] = useState(""); // for a file with no listing_type column
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [asDraft, setAsDraft] = useState(true);
  const [lookUpPins, setLookUpPins] = useState(true);
  const [filter, setFilter] = useState("all");
  const [progress, setProgress] = useState(null); // { done, total, label }
  const [result, setResult] = useState(null);
  const [last, setLast] = useState(recall);      // an earlier import that can still be undone
  const [undoing, setUndoing] = useState(false);
  const [undone, setUndone] = useState("");
  const stop = useRef(false);
  const input = useRef(null);

  // keepFile: when a new file was just picked, leave it showing in the box.
  const reset = (keepFile = false) => {
    setFileName(""); setSheet(null); setChecked([]); setChoice({}); setError(""); setOnSite([]); setDefaultType("");
    setFilter("all"); setProgress(null); setResult(null); setUndone("");
    if (!keepFile && input.current) input.current.value = "";
  };

  const choose = async (file) => {
    reset(true);
    if (!file) return;
    setFileName(file.name);
    if (file.size > MAX_BYTES) { setError("The file is larger than 5 MB. Split it into smaller files."); return; }
    setLoading(true);
    try {
      const s = readSheet(parseCsv(await file.text()));
      setSheet(s);
      if (s.problems.length) return;
      const existing = await loadAll(base44.entities.CollectorProfile, { columns: EXISTING_COLUMNS });
      setOnSite(existing);
      setChecked(checkRows(s.rows, existing, { defaultType }));
    } catch (e) {
      setError(`Could not read the file: ${e?.message || e}`);
    } finally {
      setLoading(false);
    }
  };

  const owned = (r) => !!r.match?.user_id;
  const actionOf = (r) => {
    if (r.state === "ready") return "create";
    if (r.state === "duplicate") return !owned(r) && choice[r.line] === "update" ? "update" : "skip";
    return "problem";
  };
  const counts = useMemo(() => {
    // Row states (ready / duplicate / problem) and what will happen to each
    // (create / update / skip) are counted separately: "problem" is both a
    // state and an action, and one tally counted those rows twice.
    const c = { ready: 0, duplicate: 0, problem: 0, create: 0, update: 0, skip: 0 };
    for (const r of checked) {
      c[r.state]++;
      const a = actionOf(r);
      if (a !== "problem") c[a]++;
    }
    return c;
  }, [checked, choice]);

  const setAllDuplicates = (v) =>
    setChoice(Object.fromEntries(checked.filter((r) => r.state === "duplicate" && !owned(r)).map((r) => [r.line, v])));

  // The free address lookup (OpenStreetMap) allows about one request a
  // second; a pause between listings keeps a long import within that.
  const pinFor = async (address) => {
    await new Promise((r) => setTimeout(r, pinGap()));
    try {
      const res = await base44.functions.invoke("geocodeAddress", { address });
      const hit = res?.data || res;
      if (!hit || res?.error || hit.lat == null) return null;
      return { geo_lat: Number(hit.lat), geo_lng: Number(hit.lng), geo_placename: hit.placename || address, geo_region: hit.region || "" };
    } catch {
      return null;
    }
  };

  const run = async () => {
    const todo = checked.filter((r) => ["create", "update"].includes(actionOf(r)));
    if (!todo.length) return;
    const nCreate = todo.filter((r) => actionOf(r) === "create").length;
    const nUpdate = todo.length - nCreate;
    const msg = [
      nCreate && `create ${nCreate} new listing${nCreate === 1 ? "" : "s"} (${asDraft ? "as drafts, waiting in Approvals" : "live on the site straight away"})`,
      nUpdate && `update ${nUpdate} existing listing${nUpdate === 1 ? "" : "s"}`,
    ].filter(Boolean).join(" and ");
    if (!window.confirm(`This will ${msg}. Continue?`)) return;

    stop.current = false;
    const out = { created: [], updated: [], skipped: [], failed: [], noPin: [], stopped: false };
    for (const r of checked) {
      const a = actionOf(r);
      if (a === "skip") out.skipped.push({ line: r.line, name: r.values.name, reason: owned(r) ? "already on the site, owned by a member" : "already on the site" });
      if (a === "problem") out.failed.push({ line: r.line, name: r.values.name || "(no name)", reason: r.errors.join(" ") });
    }
    let i = 0;
    for (const r of todo) {
      if (stop.current) { out.stopped = true; break; }
      i++;
      setProgress({ done: i - 1, total: todo.length, label: r.values.name });
      try {
        if (actionOf(r) === "create") {
          const rec = recordFor(r, asDraft ? STATUS.PENDING : STATUS.APPROVED);
          if (!r.coords && lookUpPins && rec.address) {
            const pin = await pinFor(rec.address);
            if (pin) Object.assign(rec, pin); else out.noPin.push({ line: r.line, name: r.values.name });
          }
          const saved = await base44.entities.CollectorProfile.create(rec);
          out.created.push({ line: r.line, name: r.values.name, id: saved.id, record: saved });
        } else {
          const { patch, before } = patchFor(r, r.match);
          if (!r.coords && lookUpPins && patch.address && r.match.geo_lat == null) {
            const pin = await pinFor(patch.address);
            if (pin) { Object.assign(patch, pin); for (const k of Object.keys(pin)) before[k] = r.match[k] ?? null; }
          }
          if (Object.keys(patch).length) {
            const saved = await base44.entities.CollectorProfile.update(r.match.id, patch);
            out.updated.push({ line: r.line, name: r.values.name, id: r.match.id, before, changed: Object.keys(patch), record: saved });
          } else {
            out.skipped.push({ line: r.line, name: r.values.name, reason: "already on the site with the same details" });
          }
        }
      } catch (e) {
        out.failed.push({ line: r.line, name: r.values.name, reason: String(e?.message || e).slice(0, 300) });
      }
    }
    setProgress(null);
    setResult(out);
    out.asDraft = asDraft;
    remember(out);
    setLast(null);
  };

  const resultsCsv = () => {
    const rows = [["row", "name", "result", "detail", "listing id"]];
    for (const x of result.created) rows.push([x.line, x.name, asDraft ? "created (draft, in Approvals)" : "created (live)", result.noPin.some((p) => p.line === x.line) ? "map pin not found from the address" : "", x.id]);
    for (const x of result.updated) rows.push([x.line, x.name, "updated", `changed: ${x.changed.join(", ")}`, x.id]);
    for (const x of result.skipped) rows.push([x.line, x.name, "skipped", x.reason, ""]);
    for (const x of result.failed) rows.push([x.line, x.name, "failed", x.reason, ""]);
    rows.sort((a, b) => (a[0] === "row" ? -1 : b[0] === "row" ? 1 : a[0] - b[0]));
    download(`afc-import-results-${today()}.csv`, "﻿" + toCsv(rows));
  };

  // Undo the import on screen, or the remembered earlier one.
  const undo = async (src = result) => {
    const n = src.created.length;
    const u = src.updated.length;
    if (!window.confirm(`Undo this import? This deletes the ${n} listing${n === 1 ? "" : "s"} it created and puts back the old details of the ${u} it updated. Any changes made to those listings since the import are lost.`)) return;
    setUndoing(true);
    const problems = [];
    for (const x of src.created) {
      try { await base44.entities.CollectorProfile.delete(x.id); } catch (e) { problems.push(`${x.name}: ${e?.message || e}`); }
    }
    for (const x of src.updated) {
      try { await base44.entities.CollectorProfile.update(x.id, x.before); } catch (e) { problems.push(`${x.name}: ${e?.message || e}`); }
    }
    setUndoing(false);
    setUndone(problems.length ? `Undone, except: ${problems.join("; ")}` : `Undone: ${n} deleted, ${u} put back.`);
    forget();
    setLast(null);
    if (src === result) setResult((r) => ({ ...r, created: [], updated: [] }));
  };

  const field = "w-full border border-border bg-background px-4 py-3 text-base outline-none focus:border-primary";
  const chip = (on) => `px-3 py-1.5 font-mono-caps text-[10px] border transition-colors ${on ? "border-primary text-primary" : "border-border text-muted-foreground hover:text-foreground"}`;
  const shown = checked.filter((r) => filter === "all" || r.state === filter);

  return (
    <div className="border border-border bg-card p-6" data-testid="import-panel">
      <h3 className="font-heading text-2xl tracking-[-0.01em]">Import listings from a CSV file</h3>
      <p className="mt-2 max-w-2xl text-sm text-muted-foreground">
        Create many galleries, venues and Directory listings at once. Text only — add photos on each
        listing afterwards. Nothing is saved until you have checked the preview and pressed Import.
      </p>

      {/* 1. Template */}
      <div className="mt-6 flex flex-wrap items-center gap-3">
        <button type="button" data-testid="import-template" onClick={() => download("afc-listings-template.csv", templateCsv())}
          className="inline-flex items-center gap-2 border border-border px-4 py-2 font-mono-caps text-[11px] text-muted-foreground transition-colors hover:border-primary hover:text-primary">
          <Download className="h-3 w-3" /> Download the template
        </button>
        <details className="text-sm">
          <summary className="cursor-pointer font-mono-caps text-[11px] text-muted-foreground hover:text-foreground">What goes in each column</summary>
          <ul className="mt-3 space-y-1 text-xs text-muted-foreground">
            {COLUMNS.map((c) => (
              <li key={c.key}><strong className="text-foreground">{c.label}</strong>{c.required ? " (required)" : ""}{c.help ? ` — ${c.help}` : ""}</li>
            ))}
            <li className="pt-2">Your own headings also work — e.g. display_name, based_in, bio and geo from the earlier sheet. Columns the site has no field for are ignored and listed in the preview.</li>
          </ul>
        </details>
      </div>

      {/* An earlier import that can still be undone */}
      {last && !result && !checked.length && (
        <div className="mt-6 flex flex-wrap items-center gap-3 border border-border p-4 text-sm" data-testid="last-import">
          <span>Last import, {new Date(last.at).toLocaleString("en-GB", { dateStyle: "medium", timeStyle: "short" })}: {last.created.length} created, {last.updated.length} updated.</span>
          <button type="button" onClick={() => undo(last)} disabled={undoing} data-testid="last-import-undo"
            className="inline-flex items-center gap-2 border border-destructive px-3 py-1.5 font-mono-caps text-[10px] text-destructive transition-colors hover:bg-destructive hover:text-background disabled:opacity-50">
            {undoing ? <Loader2 className="h-3 w-3 animate-spin" /> : <Undo2 className="h-3 w-3" />} Undo that import
          </button>
        </div>
      )}
      {undone && !result && <p className="mt-4 flex items-center gap-2 text-sm text-primary" data-testid="import-undone"><Check className="h-4 w-4" /> {undone}</p>}

      {/* 2. File */}
      {!result && (
        <div className="mt-6">
          <label className="font-mono-caps text-[11px] text-muted-foreground">CSV file (from Google Sheets: File → Download → .csv)</label>
          <input ref={input} type="file" accept=".csv,.tsv,text/csv,text/tab-separated-values" data-testid="import-file"
            disabled={!!progress}
            onChange={(e) => choose(e.target.files?.[0] || null)}
            className={`${field} mt-2 file:mr-4 file:border-0 file:bg-muted file:px-3 file:py-1 file:font-mono-caps file:text-[11px]`} />
        </div>
      )}

      {loading && <p className="mt-4 flex items-center gap-2 text-sm text-muted-foreground"><Loader2 className="h-4 w-4 animate-spin" /> Reading {fileName} and checking it against the site…</p>}

      {error && <div className="mt-4 border border-destructive bg-destructive/10 p-4 text-sm text-destructive" data-testid="import-error">{error}</div>}

      {sheet?.problems?.length > 0 && (
        <div className="mt-4 border border-destructive bg-destructive/10 p-4" data-testid="import-file-problems">
          <p className="font-mono-caps text-[11px] text-destructive">This file cannot be imported yet</p>
          <ul className="mt-2 list-disc pl-5 text-sm text-destructive">{sheet.problems.map((p) => <li key={p}>{p}</li>)}</ul>
        </div>
      )}

      {/* 3. Preview */}
      {checked.length > 0 && !result && (
        <div className="mt-8" data-testid="import-preview">
          <p className="mb-3 font-mono-caps text-[11px] text-muted-foreground break-words [overflow-wrap:anywhere]">Preview of {fileName} — {checked.length} listing{checked.length === 1 ? "" : "s"}</p>
          {sheet.notes.map((n) => <p key={n} className="mb-3 text-xs text-muted-foreground">{n}</p>)}
          {sheet.needsType && (
            <div className="mb-4 border border-border p-4">
              <label className="font-mono-caps text-[11px] text-muted-foreground" htmlFor="import-default-type">
                This file has no listing_type column. Every row is a:
              </label>
              <select id="import-default-type" data-testid="default-type" className="mt-2 block border border-border bg-background px-3 py-2 text-sm"
                value={defaultType}
                onChange={(e) => { setDefaultType(e.target.value); setChoice({}); setChecked(checkRows(sheet.rows, onSite, { defaultType: e.target.value })); }}>
                <option value="">Choose…</option>
                {LISTING_TYPES.map((t) => <option key={t} value={t}>{t}</option>)}
              </select>
            </div>
          )}
          <div className="flex flex-wrap gap-2">
            <button type="button" className={chip(filter === "all")} onClick={() => setFilter("all")}>All {checked.length}</button>
            <button type="button" className={chip(filter === "ready")} onClick={() => setFilter("ready")} data-testid="count-ready">Ready {counts.ready}</button>
            <button type="button" className={chip(filter === "duplicate")} onClick={() => setFilter("duplicate")} data-testid="count-duplicate">Already on the site {counts.duplicate}</button>
            <button type="button" className={chip(filter === "problem")} onClick={() => setFilter("problem")} data-testid="count-problem">Problems {counts.problem}</button>
          </div>

          {counts.problem > 0 && (
            <p className="mt-3 flex items-start gap-2 text-sm text-destructive">
              <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
              {counts.problem} row{counts.problem === 1 ? " has" : "s have"} a problem and will not be imported. Fix {counts.problem === 1 ? "it" : "them"} in the spreadsheet and upload it again, or import the rest now.
            </p>
          )}
          {counts.duplicate > 0 && (
            <div className="mt-3 flex flex-wrap items-center gap-3 text-sm">
              <span className="text-muted-foreground">Listings already on the site:</span>
              <button type="button" className={chip(false)} onClick={() => setAllDuplicates("skip")} data-testid="skip-all">Skip all</button>
              <button type="button" className={chip(false)} onClick={() => setAllDuplicates("update")} data-testid="update-all">Update all</button>
              <span className="text-xs text-muted-foreground">Update fills in only the cells that have something in them; it never empties a field, renames, or changes who owns a listing.</span>
            </div>
          )}

          {/* A readable minimum width: on a phone the table scrolls sideways
              inside this box instead of squeezing names into single letters. */}
          <div className="mt-4 max-h-[60vh] overflow-auto border border-border">
            <table className="w-full min-w-[640px] text-sm">
              <thead className="sticky top-0 bg-card">
                <tr className="border-b border-border text-left font-mono-caps text-[10px] text-muted-foreground">
                  <th className="px-3 py-2">Row</th><th className="px-3 py-2">Name</th><th className="px-3 py-2">Type</th><th className="px-3 py-2">City</th><th className="px-3 py-2">Result</th>
                </tr>
              </thead>
              <tbody>
                {shown.map((r) => (
                  <tr key={r.line} className="border-b border-border align-top" data-testid="import-row" data-state={r.state} data-line={r.line}>
                    <td className="px-3 py-2 text-muted-foreground">{r.line}</td>
                    <td className="min-w-[160px] px-3 py-2 break-words [overflow-wrap:anywhere]">{r.values.name || <em className="text-muted-foreground">no name</em>}</td>
                    <td className="px-3 py-2">{r.type || r.values.listing_type || "—"}</td>
                    <td className="px-3 py-2">{r.values.city || "—"}</td>
                    <td className="px-3 py-2">
                      {r.state === "ready" && <span className="text-primary">Ready</span>}
                      {r.state === "problem" && (
                        <ul className="list-disc pl-4 text-destructive">{r.errors.map((e) => <li key={e}>{e}</li>)}</ul>
                      )}
                      {r.state === "duplicate" && (
                        <div>
                          <span>Already on the site ({r.matchedBy}): </span>
                          <Link to={spacePath(r.match, isVenueType(r.match.type))} target="_blank" className="underline">{r.match.display_name}</Link>
                          {r.match.based_in ? ` · ${r.match.based_in}` : ""}
                          {owned(r) ? (
                            <p className="mt-1 text-xs text-muted-foreground">Owned by a member — skipped, so their own details are kept.</p>
                          ) : (
                            <select className="mt-2 block border border-border bg-background px-2 py-1 text-sm" data-testid="dup-choice"
                              value={choice[r.line] || "skip"} onChange={(e) => setChoice((c) => ({ ...c, [r.line]: e.target.value }))}>
                              <option value="skip">Skip</option>
                              <option value="update">Update it with this row</option>
                            </select>
                          )}
                        </div>
                      )}
                      {r.warnings.length > 0 && (
                        <ul className="mt-1 list-disc pl-4 text-xs text-yellow-700 dark:text-yellow-500">{r.warnings.map((w) => <li key={w}>{w}</li>)}</ul>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <fieldset className="mt-6 space-y-2 text-sm">
            <legend className="font-mono-caps text-[11px] text-muted-foreground">New listings</legend>
            <label className="flex items-start gap-2"><input type="radio" name="import-status" checked={asDraft} onChange={() => setAsDraft(true)} data-testid="as-draft" className="mt-1" />
              <span>Import as drafts — they wait in <strong>Approvals</strong> and go live when you approve each one (recommended)</span></label>
            <label className="flex items-start gap-2"><input type="radio" name="import-status" checked={!asDraft} onChange={() => setAsDraft(false)} data-testid="as-live" className="mt-1" />
              <span>Publish straight away</span></label>
            <label className="flex items-start gap-2 pt-2"><input type="checkbox" checked={lookUpPins} onChange={(e) => setLookUpPins(e.target.checked)} data-testid="look-up-pins" className="mt-1" />
              <span>Find map pins from the address for rows without coordinates (takes 1–3 seconds a listing)</span></label>
          </fieldset>

          {progress ? (
            <div className="mt-6" data-testid="import-progress">
              <p className="flex items-center gap-2 text-sm"><Loader2 className="h-4 w-4 animate-spin" /> {progress.done} of {progress.total} — {progress.label}</p>
              <div className="mt-2 h-1 w-full bg-border"><div className="h-1 bg-primary transition-all" style={{ width: `${(progress.done / progress.total) * 100}%` }} /></div>
              <button type="button" onClick={() => { stop.current = true; }} className="mt-3 inline-flex items-center gap-2 font-mono-caps text-[11px] text-muted-foreground hover:text-foreground"><X className="h-3 w-3" /> Stop after this one</button>
            </div>
          ) : (
            <div className="mt-6 flex flex-wrap items-center gap-3">
              <button type="button" onClick={run} disabled={counts.create + counts.update === 0} data-testid="import-run"
                className="inline-flex items-center gap-2 border border-primary px-6 py-3 font-mono-caps text-[11px] text-primary transition-colors hover:bg-primary hover:text-background disabled:opacity-50">
                <Upload className="h-3 w-3" />
                Import — {counts.create} new{counts.update ? `, ${counts.update} update${counts.update === 1 ? "" : "s"}` : ""}
              </button>
              <button type="button" onClick={() => reset()} className="font-mono-caps text-[11px] text-muted-foreground hover:text-foreground">Cancel</button>
            </div>
          )}
        </div>
      )}

      {/* 4. Summary */}
      {result && (
        <div className="mt-8" data-testid="import-summary">
          <p className="font-mono-caps text-[11px] text-muted-foreground">Import finished{result.stopped ? " (stopped early)" : ""}</p>
          <div className="mt-3 grid grid-cols-2 gap-px border border-border bg-border sm:grid-cols-4">
            {[["Created", result.created.length, "sum-created"], ["Updated", result.updated.length, "sum-updated"], ["Skipped", result.skipped.length, "sum-skipped"], ["Unsuccessful", result.failed.length, "sum-failed"]].map(([k, n, id]) => (
              <div key={k} className="bg-card p-4"><p className="font-heading text-3xl" data-testid={id}>{n}</p><p className="font-mono-caps text-[10px] text-muted-foreground">{k}</p></div>
            ))}
          </div>
          {result.created.length > 0 && asDraft && (
            <p className="mt-4 text-sm">The new listings are drafts. Open <strong>Approvals</strong> to check and publish them.</p>
          )}
          {result.noPin.length > 0 && (
            <p className="mt-3 text-sm text-muted-foreground">No map pin found for {result.noPin.length} address{result.noPin.length === 1 ? "" : "es"} — set it on the listing's edit page: {result.noPin.map((x) => x.name).join(", ")}.</p>
          )}
          {result.failed.length > 0 && (
            <div className="mt-4 border border-destructive bg-destructive/10 p-4 text-sm text-destructive">
              <p className="font-mono-caps text-[11px]">Not saved</p>
              <ul className="mt-2 list-disc pl-5">{result.failed.map((x) => <li key={x.line}>Row {x.line}, {x.name}: {x.reason}</li>)}</ul>
            </div>
          )}
          {undone && <p className="mt-4 flex items-center gap-2 text-sm text-primary" data-testid="import-undone"><Check className="h-4 w-4" /> {undone}</p>}
          <div className="mt-6 flex flex-wrap items-center gap-3">
            <button type="button" onClick={resultsCsv} data-testid="import-results"
              className="inline-flex items-center gap-2 border border-border px-4 py-2 font-mono-caps text-[11px] text-muted-foreground transition-colors hover:border-primary hover:text-primary">
              <Download className="h-3 w-3" /> Download the results
            </button>
            {(result.created.length > 0 || result.updated.length > 0) && (
              <button type="button" onClick={() => undo()} disabled={undoing} data-testid="import-undo"
                className="inline-flex items-center gap-2 border border-destructive px-4 py-2 font-mono-caps text-[11px] text-destructive transition-colors hover:bg-destructive hover:text-background disabled:opacity-50">
                {undoing ? <Loader2 className="h-3 w-3 animate-spin" /> : <Undo2 className="h-3 w-3" />} Undo this import
              </button>
            )}
            <button type="button" onClick={() => reset()} data-testid="import-again" className="font-mono-caps text-[11px] text-muted-foreground hover:text-foreground">Import another file</button>
          </div>
          <p className="mt-3 text-xs text-muted-foreground">You can undo this import later from this tab, until you start another import.</p>
        </div>
      )}
    </div>
  );
}
