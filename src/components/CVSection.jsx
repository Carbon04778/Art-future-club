import React from "react";
import { Plus, Trash2 } from "lucide-react";

const input = "w-full border border-border bg-transparent px-3 py-2 text-sm outline-none focus:border-foreground";

function CVGroup({ label, dataKey, items, onAdd, onUpdate, onRemove, venuePlaceholder }) {
  return (
    <div>
      <div className="flex items-center justify-between mb-3">
        <p className="font-mono-caps text-[11px] text-muted-foreground">{label}</p>
        <button type="button" onClick={onAdd} className="flex items-center gap-1 font-mono-caps text-[11px] text-primary hover:opacity-70">
          <Plus className="h-3 w-3" /> Add
        </button>
      </div>
      {items.length === 0 && (
        <p className="text-sm text-muted-foreground">No entries yet.</p>
      )}
      <div className="space-y-3">
        {items.map((item, i) => (
          <div key={i} className="grid grid-cols-1 gap-2 md:grid-cols-[80px_1fr_1fr_auto] items-center">
            <input className={input} value={item.year || ""} onChange={(e) => onUpdate(i, "year", e.target.value)} placeholder="Year" />
            <input className={input} value={item.title || ""} onChange={(e) => onUpdate(i, "title", e.target.value)} placeholder="Title / Degree / Award" />
            <input className={input} value={item.venue || ""} onChange={(e) => onUpdate(i, "venue", e.target.value)} placeholder={venuePlaceholder} />
            <button type="button" onClick={() => onRemove(i)}><Trash2 className="h-4 w-4 text-muted-foreground hover:text-destructive" /></button>
          </div>
        ))}
      </div>
    </div>
  );
}

export default function CVSection({ cv, onChange }) {
  const data = cv || { statement: "", exhibitions: [], education: [], awards: [] };
  const set = (key, val) => onChange({ ...data, [key]: val });

  const addItems = (key) => set(key, [...(data[key] || []), { year: "", title: "", venue: "" }]);
  const updateItem = (key) => (i, field, val) => {
    const arr = [...(data[key] || [])];
    arr[i] = { ...arr[i], [field]: val };
    set(key, arr);
  };
  const removeItem = (key) => (i) => set(key, (data[key] || []).filter((_, idx) => idx !== i));

  return (
    <div className="space-y-10">
      <p className="font-mono-caps text-[11px] text-muted-foreground border-b border-border pb-3">05 — CV & Artist Statement</p>

      <div>
        <label className="font-mono-caps text-[11px] text-muted-foreground">Artist Statement</label>
        <textarea
          className="w-full border border-border bg-transparent px-4 py-3 text-base outline-none focus:border-foreground mt-2 resize-none"
          rows={5}
          value={data.statement || ""}
          onChange={(e) => set("statement", e.target.value)}
          placeholder="A considered statement about your practice, influences, and intentions…"
        />
      </div>

      <CVGroup
        label="Exhibitions"
        dataKey="exhibitions"
        items={data.exhibitions || []}
        onAdd={() => addItems("exhibitions")}
        onUpdate={updateItem("exhibitions")}
        onRemove={removeItem("exhibitions")}
        venuePlaceholder="Gallery / Venue"
      />
      <CVGroup
        label="Education"
        dataKey="education"
        items={data.education || []}
        onAdd={() => addItems("education")}
        onUpdate={updateItem("education")}
        onRemove={removeItem("education")}
        venuePlaceholder="Institution"
      />
      <CVGroup
        label="Awards & Residencies"
        dataKey="awards"
        items={data.awards || []}
        onAdd={() => addItems("awards")}
        onUpdate={updateItem("awards")}
        onRemove={removeItem("awards")}
        venuePlaceholder="Organisation / Location"
      />
    </div>
  );
}