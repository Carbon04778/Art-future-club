import React from "react";
import { Star } from "lucide-react";
import { DISCIPLINES } from "@/lib/disciplines";

/**
 * Tick any number of disciplines; one is the main one (A3).
 *
 * `value` is the list, main first. The first one ticked becomes the main
 * discipline; "Make main" on any other moves it to the front. Unticking the
 * main one hands the role to the next in the list.
 */
export default function DisciplinePicker({ value = [], onChange, required = false, size = "md" }) {
  const list = value.filter(Boolean);
  const toggle = (d) => onChange(list.includes(d) ? list.filter((x) => x !== d) : [...list, d]);
  const makeMain = (d) => onChange([d, ...list.filter((x) => x !== d)]);
  const chip = size === "sm" ? "px-2 py-1 text-[10px]" : "px-3 py-1.5 text-[11px]";

  return (
    <div data-testid="discipline-picker">
      <div className="flex flex-wrap gap-2" role="group" aria-label="Disciplines">
        {DISCIPLINES.map((d) => {
          const on = list.includes(d);
          const main = list[0] === d;
          return (
            <button key={d} type="button" onClick={() => toggle(d)} aria-pressed={on}
              className={`inline-flex items-center gap-1 font-mono-caps border transition-colors ${chip} ${on ? "border-primary bg-primary/10 text-primary" : "border-border text-muted-foreground hover:border-foreground"}`}>
              {main && <Star className="h-3 w-3 fill-current" aria-label="main discipline" />}
              {d}
            </button>
          );
        })}
      </div>

      {list.length > 0 && (
        <p className="mt-3 font-mono-caps text-[10px] text-muted-foreground">
          Main: <span className="text-primary">{list[0]}</span>
          {list.length > 1 && (
            <>
              {" "}· shown first on your profile. Make another main:{" "}
              {list.slice(1).map((d, i) => (
                <React.Fragment key={d}>
                  {i > 0 && ", "}
                  <button type="button" onClick={() => makeMain(d)} className="underline hover:text-primary">{d}</button>
                </React.Fragment>
              ))}
            </>
          )}
        </p>
      )}

      {/* Lets the browser's own "please fill in" stop a save with none ticked. */}
      {required && (
        <input tabIndex={-1} aria-hidden="true" className="sr-only" value={list.length ? "ok" : ""} onChange={() => {}} required
          ref={(el) => el?.setCustomValidity(list.length ? "" : "Choose at least one discipline.")} />
      )}
    </div>
  );
}
