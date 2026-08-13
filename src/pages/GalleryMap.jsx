import React, { useState, useEffect } from "react";
import { Link } from "react-router-dom";
import { base44 } from "@/api/base44Client";
import { X } from "lucide-react";
import { MapContainer, TileLayer, CircleMarker, Popup } from "react-leaflet";
import "leaflet/dist/leaflet.css";
import { Image } from "@/components/ui/image";
import SlimFooter from "@/components/SlimFooter";

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

export default function GalleryMap() {
  const [works, setWorks] = useState([]);
  const [artists, setArtists] = useState({});
  const [selectedChapter, setSelectedChapter] = useState(null);

  useEffect(() => {
    // Load gallery works and artist profiles to get chapter info
    Promise.all([
      base44.entities.GalleryWork.list("-created_date", 200),
      base44.entities.ArtistProfile.list("-created_date", 200),
    ]).then(([galleryWorks, profiles]) => {
      setWorks(galleryWorks);
      // Map artist_id -> chapter
      const map = {};
      profiles.forEach((p) => { map[p.user_id] = p; });
      setArtists(map);
    });
  }, []);

  // Group works by chapter
  const byChapter = works.reduce((acc, w) => {
    const profile = artists[w.artist_id];
    const ch = profile?.chapter || "Other";
    if (!acc[ch]) acc[ch] = [];
    acc[ch].push({ ...w, _chapter: ch });
    return acc;
  }, {});

  const chapters = Object.keys(CHAPTER_COORDS).filter((c) => byChapter[c]?.length > 0);
  const selectedWorks = selectedChapter ? (byChapter[selectedChapter] || []) : [];

  return (
    <>
      <div className="px-6 py-12 md:px-10">
        <p className="font-mono-caps text-[11px] text-muted-foreground">AFC — Works by Location</p>
        <h1 className="mt-3 font-heading text-5xl font-medium tracking-[-0.02em] md:text-6xl mb-3">Gallery Map</h1>
        <p className="font-mono-caps text-[11px] text-muted-foreground mb-10">{works.length} works on display</p>

        <div className="grid grid-cols-1 gap-8 lg:grid-cols-[1fr_380px]">
          {/* Map */}
          <div className="border border-border overflow-hidden" style={{ height: "65vh" }}>
            <MapContainer center={[30, 10]} zoom={2} style={{ height: "100%", width: "100%" }}>
              <TileLayer
                url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
                attribution='&copy; <a href="https://openstreetmap.org">OpenStreetMap</a>'
              />
              {chapters.map((chapter) => {
                const coords = CHAPTER_COORDS[chapter];
                if (!coords) return null;
                const count = byChapter[chapter]?.length || 0;
                const isSelected = selectedChapter === chapter;
                return (
                  <CircleMarker
                    key={chapter}
                    center={coords}
                    radius={Math.min(8 + count * 2, 28)}
                    pathOptions={{
                      fillColor: isSelected ? "hsl(0, 72%, 51%)" : "hsl(224, 100%, 59%)",
                      color: isSelected ? "hsl(0, 72%, 40%)" : "hsl(224, 100%, 40%)",
                      fillOpacity: 0.75,
                      weight: 2,
                    }}
                    eventHandlers={{ click: () => setSelectedChapter(chapter) }}
                  >
                    <Popup>
                      <div className="font-sans text-sm">
                        <strong>{chapter}</strong> — {count} work{count !== 1 ? "s" : ""}
                        <div className="mt-1 text-gray-500 text-xs">Click marker to browse works →</div>
                      </div>
                    </Popup>
                  </CircleMarker>
                );
              })}
            </MapContainer>
          </div>

          {/* Side panel */}
          <div className="border border-border overflow-y-auto" style={{ maxHeight: "65vh" }}>
            {!selectedChapter ? (
              <div className="p-6 space-y-4">
                <p className="font-mono-caps text-[11px] text-muted-foreground mb-4">Select a city to browse works</p>
                {chapters.length === 0 ? (
                  <p className="text-sm text-muted-foreground">No gallery works found yet.</p>
                ) : (
                  chapters.map((ch) => (
                    <button
                      key={ch}
                      onClick={() => setSelectedChapter(ch)}
                      className="w-full text-left border border-border p-4 hover:border-primary transition-colors"
                    >
                      <p className="font-mono-caps text-[11px] text-primary">{ch}</p>
                      <p className="font-heading text-2xl mt-1">{byChapter[ch]?.length || 0}</p>
                      <p className="font-mono-caps text-[10px] text-muted-foreground">works</p>
                    </button>
                  ))
                )}
              </div>
            ) : (
              <div>
                <div className="sticky top-0 bg-background border-b border-border px-4 py-3 flex items-center justify-between">
                  <p className="font-mono-caps text-[11px] text-foreground">{selectedChapter} — {selectedWorks.length} works</p>
                  <button onClick={() => setSelectedChapter(null)}>
                    <X className="h-4 w-4 text-muted-foreground hover:text-foreground" />
                  </button>
                </div>
                <div className="divide-y divide-border">
                  {selectedWorks.map((work) => (
                    <Link
                      key={work.id}
                      to={`/gallery`}
                      className="flex items-center gap-3 px-4 py-3 hover:bg-muted/30 transition-colors"
                    >
                      {work.image_url && (
                        <div className="h-14 w-14 shrink-0 overflow-hidden bg-muted">
                          <Image src={work.image_url} alt={work.title} fittingType="fill" className="h-full w-full object-cover" />
                        </div>
                      )}
                      <div className="min-w-0 flex-1">
                        <p className="font-body text-sm font-medium truncate">{work.title}</p>
                        <p className="font-mono-caps text-[10px] text-muted-foreground truncate">{work.artist_name}</p>
                        {work.medium && <p className="font-mono-caps text-[10px] text-muted-foreground truncate">{work.medium}</p>}
                        {work.available_for_sale && work.price && (
                          <p className="font-mono-caps text-[10px] text-primary">{work.currency || "USD"} {work.price}</p>
                        )}
                      </div>
                    </Link>
                  ))}
                </div>
              </div>
            )}
          </div>
        </div>

        {/* Chapter stats */}
        <div className="mt-8 grid grid-cols-2 gap-4 md:grid-cols-3 lg:grid-cols-5">
          {chapters.map((chapter) => (
            <button
              key={chapter}
              onClick={() => setSelectedChapter(chapter)}
              className={`text-left border p-4 transition-colors ${selectedChapter === chapter ? "border-primary" : "border-border hover:border-primary/50"}`}
            >
              <p className="font-mono-caps text-[11px] text-primary">{chapter}</p>
              <p className="mt-1 font-heading text-3xl">{byChapter[chapter]?.length || 0}</p>
              <p className="font-mono-caps text-[10px] text-muted-foreground">works</p>
            </button>
          ))}
        </div>
      </div>
      <SlimFooter />
    </>
  );
}