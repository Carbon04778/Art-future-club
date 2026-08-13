import React, { useState, useEffect } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { base44 } from "@/api/base44Client";
import { Image } from "@/components/ui/image";
import { MapPin, ExternalLink, Plus, X, Loader2 } from "lucide-react";
import SlimFooter from "@/components/SlimFooter";
import { motion } from "framer-motion";
import { chapterFilterOptions } from "@/lib/chaptersData";

const CHAPTERS = chapterFilterOptions("All");
const EVENT_TYPES = ["All", "Exhibition", "Opening", "Talk", "Workshop", "Screening", "Performance", "Social", "Other"];

const TYPE_COLORS = {
  Exhibition: "bg-primary/10 text-primary",
  Opening: "bg-yellow-100 text-yellow-700",
  Talk: "bg-purple-100 text-purple-700",
  Workshop: "bg-green-100 text-green-700",
  Screening: "bg-blue-100 text-blue-700",
  Performance: "bg-pink-100 text-pink-700",
  Social: "bg-orange-100 text-orange-700",
  Other: "bg-muted text-muted-foreground",
};

function formatDate(dateStr) {
  const d = new Date(dateStr);
  return d.toLocaleDateString("en-GB", { day: "numeric", month: "long", year: "numeric" });
}

function formatTime(dateStr) {
  const d = new Date(dateStr);
  return d.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
}

export default function EventCalendar() {
  const navigate = useNavigate();
  const [events, setEvents] = useState([]);
  const [searchParams] = useSearchParams();
  // Honour ?chapter= so "See all gatherings" from a chapter page lands filtered.
  const [chapter, setChapter] = useState(searchParams.get("chapter") || "All");
  const [typeFilter, setTypeFilter] = useState("All");
  const [user, setUser] = useState(null);
  const [showAdd, setShowAdd] = useState(false);

  useEffect(() => {
    loadEvents();
    base44.auth.me().then(setUser).catch(() => {});
  }, []);

  const loadEvents = () =>
    base44.entities.Event.list("start_date", 200).then((evs) => {
      // show upcoming first
      const now = new Date();
      const upcoming = evs.filter((e) => new Date(e.start_date) >= now);
      const past = evs.filter((e) => new Date(e.start_date) < now);
      setEvents([...upcoming, ...past]);
    });

  const filtered = events
    .filter((e) => chapter === "All" || e.chapter === chapter)
    .filter((e) => typeFilter === "All" || e.event_type === typeFilter);

  // group by month
  const grouped = filtered.reduce((acc, ev) => {
    const key = new Date(ev.start_date).toLocaleDateString("en-GB", { month: "long", year: "numeric" });
    if (!acc[key]) acc[key] = [];
    acc[key].push(ev);
    return acc;
  }, {});

  return (
    <>
      {user && (
        <div className="flex justify-end px-6 py-3 md:px-10 border-b border-border">
          <button
            onClick={() => setShowAdd(true)}
            className="flex items-center gap-2 bg-primary px-4 py-2 font-mono-caps text-[11px] text-primary-foreground hover:opacity-80"
          >
            <Plus className="h-3 w-3" /> Add Event
          </button>
        </div>
      )}

      <div className="px-6 py-16 md:px-10">
        <p className="font-mono-caps text-[11px] text-muted-foreground">AFC — Programme</p>
        <h1 className="mt-3 font-heading text-5xl font-medium tracking-[-0.02em] md:text-7xl">Events</h1>
        <p className="mt-4 text-lg text-muted-foreground">
          <span className="text-primary">Gatherings</span>, <span className="text-accent">exhibitions</span>, and <span className="text-highlight">happenings</span> across all chapters.
        </p>

        {/* filters */}
        <div className="mt-10 space-y-3">
          <div className="flex flex-wrap gap-2">
            <span className="font-mono-caps text-[11px] text-muted-foreground self-center mr-1">Chapter:</span>
            {CHAPTERS.map((c) => (
              <button
                key={c}
                onClick={() => setChapter(c)}
                className={`font-mono-caps text-[11px] px-3 py-1.5 border transition-colors ${chapter === c ? "border-foreground bg-foreground text-background" : "border-border text-muted-foreground hover:border-foreground"}`}
              >
                {c}
              </button>
            ))}
          </div>
          <div className="flex flex-wrap gap-2">
            <span className="font-mono-caps text-[11px] text-muted-foreground self-center mr-1">Type:</span>
            {EVENT_TYPES.map((t) => (
              <button
                key={t}
                onClick={() => setTypeFilter(t)}
                className={`font-mono-caps text-[11px] px-3 py-1.5 border transition-colors ${typeFilter === t ? "border-primary bg-primary text-primary-foreground" : "border-border text-muted-foreground hover:border-primary"}`}
              >
                {t}
              </button>
            ))}
          </div>
        </div>

        {/* event list */}
        <div className="mt-14 space-y-14">
          {Object.keys(grouped).length === 0 && (
            <div className="border border-border py-16 text-center">
              <p className="font-mono-caps text-[11px] text-muted-foreground">No events found.</p>
              {user && (
                <button onClick={() => setShowAdd(true)} className="mt-4 font-mono-caps text-[11px] text-primary hover:underline">Add the first event →</button>
              )}
            </div>
          )}
          {Object.entries(grouped).map(([month, evs]) => (
            <div key={month}>
              <p className="font-mono-caps text-[11px] text-muted-foreground border-b border-border pb-3 mb-8">{month}</p>
              <div className="space-y-0 divide-y divide-border">
                {evs.map((ev, i) => {
                  const isPast = new Date(ev.start_date) < new Date();
                  return (
                    <motion.div
                      key={ev.id}
                      initial={{ opacity: 0, y: 8 }}
                      whileInView={{ opacity: 1, y: 0 }}
                      viewport={{ once: true }}
                      transition={{ duration: 0.4, delay: i * 0.04 }}
                      onClick={() => navigate(`/events/${ev.id}`)}
                      className={`group cursor-pointer py-7 grid grid-cols-1 gap-6 md:grid-cols-[140px_1fr_auto] items-start transition-colors hover:text-primary ${isPast ? "opacity-50" : ""}`}
                    >
                      {/* date */}
                      <div>
                        <p className="font-heading text-3xl font-medium tracking-[-0.02em]">
                          {new Date(ev.start_date).getDate()}
                        </p>
                        <p className="font-mono-caps text-[10px] text-muted-foreground">
                          {new Date(ev.start_date).toLocaleDateString("en-GB", { weekday: "long" })}
                        </p>
                        <p className="font-mono-caps text-[10px] text-muted-foreground">{formatTime(ev.start_date)}</p>
                      </div>
                      {/* info */}
                      <div>
                        <div className="flex items-center gap-3 mb-2">
                          <span className={`font-mono-caps text-[10px] px-2 py-0.5 ${TYPE_COLORS[ev.event_type] || TYPE_COLORS.Other}`}>
                            {ev.event_type}
                          </span>
                          {ev.chapter && (
                            <span className="font-mono-caps text-[10px] text-muted-foreground">{ev.chapter}</span>
                          )}
                          {ev.is_free ? (
                            <span className="font-mono-caps text-[10px] text-green-600">Free</span>
                          ) : (
                            <span className="font-mono-caps text-[10px] text-muted-foreground">{ev.ticket_price}</span>
                          )}
                        </div>
                        <h3 className="font-heading text-2xl tracking-[-0.01em] group-hover:text-primary transition-colors">{ev.title}</h3>
                        {ev.venue && (
                          <p className="mt-1 flex items-center gap-1 font-mono-caps text-[11px] text-muted-foreground">
                            <MapPin className="h-3 w-3" /> {ev.venue}{ev.address ? `, ${ev.address}` : ""}
                          </p>
                        )}
                        {ev.description && (
                          <p className="mt-3 text-sm text-muted-foreground leading-relaxed max-w-lg">{ev.description}</p>
                        )}
                        {ev.organizer_name && (
                          <p className="mt-2 font-mono-caps text-[10px] text-muted-foreground">Organised by {ev.organizer_name}</p>
                        )}
                      </div>
                      {/* image + link */}
                      <div className="flex flex-col items-end gap-3">
                        {ev.image_url && (
                          <div className="h-24 w-24 overflow-hidden shrink-0" data-artwork>
                            <Image src={ev.image_url} alt={ev.title} fittingType="fill" className="h-full w-full object-cover" />
                          </div>
                        )}
                        {ev.external_link && (
                          <a
                            href={ev.external_link}
                            target="_blank"
                            rel="noreferrer"
                            onClick={(e) => e.stopPropagation()}
                            className="flex items-center gap-1 font-mono-caps text-[10px] border border-border px-3 py-1.5 text-muted-foreground hover:border-primary hover:text-primary transition-colors"
                          >
                            <ExternalLink className="h-3 w-3" /> Details
                          </a>
                        )}
                      </div>
                    </motion.div>
                  );
                })}
              </div>
            </div>
          ))}
        </div>
      </div>

      <SlimFooter />

      {showAdd && (
        <AddEventModal
          user={user}
          onClose={() => setShowAdd(false)}
          onCreated={() => { setShowAdd(false); loadEvents(); }}
        />
      )}
    </>
  );
}

function AddEventModal({ user, onClose, onCreated }) {
  const [form, setForm] = useState({
    title: "", description: "", event_type: "Exhibition", chapter: "London",
    venue: "", address: "", start_date: "", end_date: "", external_link: "",
    is_free: true, ticket_price: "", image_url: "",
  });
  const [file, setFile] = useState(null);
  const [saving, setSaving] = useState(false);
  const set = (k, v) => setForm((f) => ({ ...f, [k]: v }));

  const handleSubmit = async (e) => {
    e.preventDefault();
    setSaving(true);
    let image_url = form.image_url;
    if (file) {
      const res = await base44.integrations.Core.UploadFile({ file });
      image_url = res.file_url;
    }
    await base44.entities.Event.create({
      ...form,
      image_url,
      organizer_id: user.id,
      organizer_name: user.full_name || "AFC Member",
    });
    setSaving(false);
    onCreated();
  };

  const input = "w-full border border-border bg-transparent px-4 py-3 text-base outline-none focus:border-foreground";
  const selectCls = "w-full border border-border bg-background px-4 py-3 text-base outline-none focus:border-foreground";

  return (
    <div className="fixed inset-0 z-50 bg-background/90 backdrop-blur-sm flex items-center justify-center p-6" onClick={onClose}>
      <div className="bg-card border border-border w-full max-w-xl max-h-[90vh] overflow-y-auto" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between px-6 py-5 border-b border-border">
          <p className="font-mono-caps text-[11px]">Add Event</p>
          <button onClick={onClose}><X className="h-4 w-4 text-muted-foreground" /></button>
        </div>
        <form onSubmit={handleSubmit} className="p-6 space-y-4">
          <div>
            <label className="font-mono-caps text-[11px] text-muted-foreground">Title *</label>
            <input className={`${input} mt-2`} value={form.title} onChange={(e) => set("title", e.target.value)} required />
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="font-mono-caps text-[11px] text-muted-foreground">Type</label>
              <select className={`${selectCls} mt-2`} value={form.event_type} onChange={(e) => set("event_type", e.target.value)}>
                {["Exhibition", "Opening", "Talk", "Workshop", "Screening", "Performance", "Social", "Other"].map((t) => <option key={t}>{t}</option>)}
              </select>
            </div>
            <div>
              <label className="font-mono-caps text-[11px] text-muted-foreground">Chapter</label>
              <select className={`${selectCls} mt-2`} value={form.chapter} onChange={(e) => set("chapter", e.target.value)}>
                {["London", "Tokyo", "Berlin", "Seoul", "Mexico City", "Online", "Other"].map((c) => <option key={c}>{c}</option>)}
              </select>
            </div>
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="font-mono-caps text-[11px] text-muted-foreground">Start Date & Time *</label>
              <input type="datetime-local" className={`${input} mt-2`} value={form.start_date} onChange={(e) => set("start_date", e.target.value)} required />
            </div>
            <div>
              <label className="font-mono-caps text-[11px] text-muted-foreground">End Date & Time</label>
              <input type="datetime-local" className={`${input} mt-2`} value={form.end_date} onChange={(e) => set("end_date", e.target.value)} />
            </div>
          </div>
          <div>
            <label className="font-mono-caps text-[11px] text-muted-foreground">Venue</label>
            <input className={`${input} mt-2`} value={form.venue} onChange={(e) => set("venue", e.target.value)} placeholder="Gallery / venue name" />
          </div>
          <div>
            <label className="font-mono-caps text-[11px] text-muted-foreground">Address</label>
            <input className={`${input} mt-2`} value={form.address} onChange={(e) => set("address", e.target.value)} placeholder="Street, City" />
          </div>
          <div>
            <label className="font-mono-caps text-[11px] text-muted-foreground">Description</label>
            <textarea className={`${input} mt-2 resize-none`} rows={3} value={form.description} onChange={(e) => set("description", e.target.value)} />
          </div>
          <div>
            <label className="font-mono-caps text-[11px] text-muted-foreground">Event URL / Ticket Link</label>
            <input type="url" className={`${input} mt-2`} value={form.external_link} onChange={(e) => set("external_link", e.target.value)} placeholder="https://…" />
          </div>
          <div>
            <label className="font-mono-caps text-[11px] text-muted-foreground">Event Image</label>
            <input type="file" accept="image/*" className={`${input} mt-2 file:mr-4 file:border-0 file:bg-muted file:px-3 file:py-1 file:font-mono-caps file:text-[11px]`} onChange={(e) => setFile(e.target.files?.[0])} />
          </div>
          <label className="flex items-center gap-2 cursor-pointer">
            <input type="checkbox" checked={form.is_free} onChange={(e) => set("is_free", e.target.checked)} className="h-4 w-4 accent-primary" />
            <span className="font-mono-caps text-[11px] text-muted-foreground">Free event</span>
          </label>
          {!form.is_free && (
            <div>
              <label className="font-mono-caps text-[11px] text-muted-foreground">Ticket Price</label>
              <input className={`${input} mt-2`} value={form.ticket_price} onChange={(e) => set("ticket_price", e.target.value)} placeholder="e.g. £15 / Free with RSVP" />
            </div>
          )}
          <div className="flex flex-wrap items-center gap-4 pt-2">
            <button type="submit" disabled={saving} className="flex items-center gap-2 bg-primary px-8 py-4 font-mono-caps text-[11px] text-primary-foreground hover:opacity-80 disabled:opacity-50">
              {saving ? <Loader2 className="h-3 w-3 animate-spin" /> : null}
              Publish Event
            </button>
            <button type="button" onClick={onClose} className="font-mono-caps text-[11px] text-muted-foreground hover:text-foreground">Cancel</button>
          </div>
        </form>
      </div>
    </div>
  );
}