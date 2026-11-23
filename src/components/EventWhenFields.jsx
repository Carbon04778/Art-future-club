import React from "react";
import { CHAPTER_ZONES } from "@/lib/aiEvents";
import { zoneLabel } from "@/lib/eventDates";

const ZONES = [...new Set([...Object.values(CHAPTER_ZONES), "Europe/Paris", "Asia/Tokyo", "Asia/Singapore", "UTC"])];

/**
 * Start, end, time zone and "no specific time" — the same fields in every
 * event form (C10). `value` is whenFromEvent(); save with whenToEvent().
 */
export default function EventWhenFields({ value, onChange, inputClass = "", labelClass = "font-mono-caps text-[11px] text-muted-foreground" }) {
  const set = (patch) => onChange({ ...value, ...patch });
  const type = value.date_only ? "date" : "datetime-local";
  const zones = value.timezone && !ZONES.includes(value.timezone) ? [value.timezone, ...ZONES] : ZONES;
  const toggle = (only) => set({
    date_only: only,
    // Keep the dates already typed; a time must be chosen, never assumed.
    start: only ? value.start.slice(0, 10) : "",
    end: only ? value.end.slice(0, 10) : "",
  });
  return (
    <>
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <div>
          <label className={labelClass}>{value.date_only ? "Start date *" : "Start date & time *"}</label>
          <input type={type} aria-label="Start" className={`${inputClass} mt-2`} value={value.start} onChange={(e) => set({ start: e.target.value })} required />
        </div>
        <div>
          <label className={labelClass}>{value.date_only ? "End date" : "End date & time"}</label>
          <input type={type} aria-label="End" min={value.start || undefined} className={`${inputClass} mt-2`} value={value.end} onChange={(e) => set({ end: e.target.value })} />
        </div>
      </div>
      <label className="flex cursor-pointer items-center gap-2">
        <input type="checkbox" checked={value.date_only} onChange={(e) => toggle(e.target.checked)} className="h-4 w-4 accent-primary" />
        <span className={labelClass}>No specific time (show the dates only)</span>
      </label>
      {!value.date_only && (
        <div>
          <label className={labelClass}>Time zone of these times</label>
          <select aria-label="Time zone" className={`${inputClass} mt-2 bg-background text-foreground`} value={value.timezone} onChange={(e) => set({ timezone: e.target.value })}>
            <option value="">Not set (each visitor sees their own time)</option>
            {zones.map((z) => <option key={z} value={z}>{zoneLabel(z)}</option>)}
          </select>
        </div>
      )}
    </>
  );
}
