import React, { useState, useEffect } from "react";
import { Link } from "react-router-dom";
import { base44 } from "@/api/base44Client";
import { X } from "lucide-react";
import { MapContainer, TileLayer, CircleMarker, Popup } from "react-leaflet";
import "leaflet/dist/leaflet.css";
import { Image } from "@/components/ui/image";

const CHAPTER_COORDS = {
  "Hong Kong": [22.319, 114.169],
  London: [51.507, -0.127],
  "New York": [40.713, -74.006],
  "Los Angeles": [34.052, -118.244],
  Bangkok: [13.756, 100.502],
  Milano: [45.465, 9.186],
  Toronto: [43.653, -79.383],
  Zurich: [47.377, 8.542],
};

const matchChapter = (profile) => {
  const haystack = `${profile.based_in || ""} ${profile.address || ""}`;
  return Object.keys(CHAPTER_COORDS).find((ch) => haystack.includes(ch)) || "Other";
};

export default function GalleriesVenuesMap() {
  const [profiles, setProfiles] = useState([]);
  const [selectedChapter, setSelectedChapter] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    base44.entities.CollectorProfile.filter({ type: { $in: ["Gallery", "Institution"] } }, "-updated_date", 300)
      .then(setProfiles)
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  const byChapter = profiles.reduce((acc, p) => {
    const ch = matchChapter(p);
    if (!acc[ch]) acc[ch] = [];
    acc[ch].push(p);
    return acc;
  }, {});

  const chapters = Object.keys(CHAPTER_COORDS).filter((c) => byChapter[c]?.length > 0);
  const selectedProfiles = selectedChapter ? (byChapter[selectedChapter] || []) : [];

  return (
    <section>
      <p className="font-mono-caps text-[11px] text-muted-foreground">AFC — Spaces on the Map</p>
      <h2 className="mt-3 font-heading text-4xl font-medium tracking-[-0.02em] md:text-5xl mb-3">Galleries &amp; Venues Map</h2>
      <p className="font-mono-caps text-[11px] text-muted-foreground mb-8">
        {loading ? "Loading…" : `${profiles.length} galleries & venues across the network`}
      </p>

      <div className="grid grid-cols-1 gap-8 lg:grid-cols-[1fr_320px]">
        <div className="border border-border overflow-hidden" style={{ height: "55vh" }}>
          <MapContainer center={[30, 10]} zoom={2} style={{ height: "100%", width: "100%" }}>
            <TileLayer
              url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
              attribution='&copy; <a href="https://openstreetmap.org">OpenStreetMap</a>'
            />
            {chapters.map((chapter) => {
              const coords = CHAPTER_COORDS[chapter];
              const count = byChapter[chapter]?.length || 0;
              const isSelected = selectedChapter === chapter;
              return (
                <CircleMarker
                  key={chapter}
                  center={coords}
                  radius={Math.min(8 + count * 2, 28)}
                  pathOptions={{
                    fillColor: isSelected ? "hsl(339, 82%, 56%)" : "hsl(195, 95%, 50%)",
                    color: isSelected ? "hsl(339, 60%, 40%)" : "hsl(195, 60%, 35%)",
                    fillOpacity: 0.75,
                    weight: 2,
                  }}
                  eventHandlers={{ click: () => setSelectedChapter(chapter) }}
                >
                  <Popup>
                    <div className="font-sans text-sm">
                      <strong>{chapter}</strong> — {count} space{count !== 1 ? "s" : ""}
                      <div className="mt-1 text-gray-500 text-xs">Click marker to browse spaces →</div>
                    </div>
                  </Popup>
                </CircleMarker>
              );
            })}
          </MapContainer>
        </div>

        <div className="border border-border overflow-y-auto" style={{ maxHeight: "55vh" }}>
          {!selectedChapter ? (
            <div className="p-6 space-y-4">
              <p className="font-mono-caps text-[11px] text-muted-foreground mb-4">Select a city to browse spaces</p>
              {chapters.length === 0 ? (
                <p className="text-sm text-muted-foreground">No galleries or venues listed yet.</p>
              ) : (
                chapters.map((ch) => (
                  <button
                    key={ch}
                    onClick={() => setSelectedChapter(ch)}
                    className="w-full text-left border border-border p-4 hover:border-primary transition-colors"
                  >
                    <p className="font-mono-caps text-[11px] text-primary">{ch}</p>
                    <p className="font-heading text-2xl mt-1">{byChapter[ch]?.length || 0}</p>
                    <p className="font-mono-caps text-[10px] text-muted-foreground">spaces</p>
                  </button>
                ))
              )}
            </div>
          ) : (
            <div>
              <div className="sticky top-0 bg-background border-b border-border px-4 py-3 flex items-center justify-between">
                <p className="font-mono-caps text-[11px] text-foreground">{selectedChapter} — {selectedProfiles.length} spaces</p>
                <button onClick={() => setSelectedChapter(null)}>
                  <X className="h-4 w-4 text-muted-foreground hover:text-foreground" />
                </button>
              </div>
              <div className="divide-y divide-border">
                {selectedProfiles.map((p) => {
                  const to = p.type === "Institution" ? `/venues/${p.id}` : `/gallery/${p.id}`;
                  return (
                    <Link
                      key={p.id}
                      to={to}
                      className="flex items-center gap-3 px-4 py-3 hover:bg-muted/30 transition-colors"
                    >
                      <div className="h-14 w-14 shrink-0 overflow-hidden bg-muted">
                        {p.cover_image_url || p.avatar_url ? (
                          <Image src={p.cover_image_url || p.avatar_url} alt={p.display_name} fittingType="fill" className="h-full w-full object-cover" />
                        ) : (
                          <div className="flex h-full w-full items-center justify-center text-xl text-muted-foreground/40 font-mono-caps">
                            {p.display_name?.[0]}
                          </div>
                        )}
                      </div>
                      <div className="min-w-0 flex-1">
                        <p className="font-body text-sm font-medium truncate">{p.display_name}</p>
                        <p className="font-mono-caps text-[10px] text-primary truncate">{p.type === "Institution" ? "Venue" : "Gallery"}</p>
                        {p.based_in && <p className="font-mono-caps text-[10px] text-muted-foreground truncate">{p.based_in}</p>}
                      </div>
                    </Link>
                  );
                })}
              </div>
            </div>
          )}
        </div>
      </div>
    </section>
  );
}