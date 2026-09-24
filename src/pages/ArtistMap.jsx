import React, { useState, useEffect } from "react";
import { artistPath } from "@/lib/slugs";
import { Link } from "react-router-dom";
import { base44 } from "@/api/base44Client";
import { X, ChevronRight } from "lucide-react";
import { MapContainer, TileLayer, CircleMarker, Popup } from "react-leaflet";
import "leaflet/dist/leaflet.css";
import SlimFooter from "@/components/SlimFooter";
import SpacesMap from "@/components/SpacesMap";
import { useDataRevision } from "@/lib/dataRevision";

// Chapter city coordinates
const CHAPTER_COORDS = {
  "Hong Kong": [22.319, 114.169],
  London: [51.507, -0.127],
  "New York": [40.713, -74.006],
  "Los Angeles": [34.052, -118.244],
  Bangkok: [13.756, 100.502],
  Milano: [45.465, 9.186],
  Toronto: [43.653, -79.383],
  Zurich: [47.377, 8.542],
  Other: null,
};

export default function ArtistMap() {
  const [artists, setArtists] = useState([]);
  const [selectedChapter, setSelectedChapter] = useState(null);
  const rev = useDataRevision();

  useEffect(() => {
    // The map plots counts per chapter and lists names in the sidebar.
    base44.entities.ArtistProfile.list("-created_date", 200, "id,display_name,discipline,chapter,slug")
      .then(setArtists);
  }, [rev]);

  // Group artists by chapter
  const byChapter = artists.reduce((acc, a) => {
    const ch = a.chapter || "Other";
    if (!acc[ch]) acc[ch] = [];
    acc[ch].push(a);
    return acc;
  }, {});

  const chapters = Object.keys(CHAPTER_COORDS).filter((c) => c !== "Other" && byChapter[c]?.length > 0);

  return (
    <>
      {/*
        * The galleries and venues map, the real one: a pin per listing at its
        * own coordinates. This slot used to hold GalleriesVenuesMap, which was
        * the same eight-dot chapter map as the old gallery map — so the page
        * showed two maps, neither of which located anything.
        *
        * Its own padding, so it is dropped outside the wrapper below.
        */}
      <SpacesMap title="Galleries & Venues" />

      <div className="px-6 md:px-10">
        <div className="my-4 border-t border-border" />
      </div>

      <div className="px-6 pb-12 md:px-10">

        <p className="font-mono-caps text-[11px] text-muted-foreground">AFC — Global Network</p>
        <h1 className="mt-3 font-heading text-5xl font-medium tracking-[-0.02em] md:text-6xl mb-3">Artist Residency Map</h1>
        <p className="font-mono-caps text-[11px] text-muted-foreground mb-10">{artists.length} members across the network</p>

        <div className="grid grid-cols-1 gap-8 lg:grid-cols-[1fr_320px]">
          <div className="border border-border overflow-hidden" style={{ height: "60vh" }}>
            <MapContainer center={[30, 10]} zoom={2} style={{ height: "100%", width: "100%" }} zoomControl={true}>
              {/*
                * Esri's gray canvas, not raw tile.openstreetmap.org, which is
                * rate-limited for this use and made zooming feel broken.
                *
                * Deliberately NOT Google. Artists carry a chapter, not an
                * address, so this can only ever be eight city dots — Google
                * would add no precision, and every map instance is billed as
                * its own load, so it would double the cost of this page for
                * nothing. The galleries map above it is the one that needs
                * street-level accuracy.
                */}
              <TileLayer
                url="https://server.arcgisonline.com/ArcGIS/rest/services/Canvas/World_Light_Gray_Base/MapServer/tile/{z}/{y}/{x}"
                attribution="Tiles &copy; Esri &mdash; Esri, DeLorme, NAVTEQ"
                maxZoom={19}
              />
              <TileLayer
                url="https://server.arcgisonline.com/ArcGIS/rest/services/Canvas/World_Light_Gray_Reference/MapServer/tile/{z}/{y}/{x}"
                maxZoom={19}
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
                    radius={Math.min(8 + count * 3, 30)}
                    pathOptions={{
                      fillColor: isSelected ? "hsl(195, 95%, 50%)" : "hsl(224, 100%, 59%)",
                      color: isSelected ? "hsl(195, 60%, 35%)" : "hsl(224, 100%, 40%)",
                      fillOpacity: 0.7,
                      weight: isSelected ? 2.5 : 1.5,
                    }}
                    eventHandlers={{ click: () => setSelectedChapter(chapter) }}
                  >
                    <Popup>
                      <div className="font-sans text-sm">
                        <strong>{chapter}</strong> — {count} artist{count !== 1 ? "s" : ""}
                        <div className="mt-1 text-gray-500 text-xs">Click marker to browse artists →</div>
                      </div>
                    </Popup>
                  </CircleMarker>
                );
              })}
            </MapContainer>
          </div>

          {/* Chapter list — vertical sidebar */}
          <div className="border border-border overflow-y-auto" style={{ maxHeight: "60vh" }}>
            <div className="sticky top-0 bg-background border-b border-border px-4 py-3">
              <p className="font-mono-caps text-[11px] text-foreground">{selectedChapter ? `${selectedChapter} — ${byChapter[selectedChapter]?.length || 0} members` : "Cities"}</p>
              {selectedChapter && (
                <button onClick={() => setSelectedChapter(null)} className="absolute right-3 top-3">
                  <X className="h-3.5 w-3.5 text-muted-foreground hover:text-foreground" />
                </button>
              )}
            </div>
            <div className="divide-y divide-border">
              {!selectedChapter
                ? chapters.map((chapter) => (
                    <button
                      key={chapter}
                      onClick={() => setSelectedChapter(chapter)}
                      className="w-full text-left px-4 py-3 hover:bg-muted/30 transition-colors flex items-center justify-between"
                    >
                      <div>
                        <p className="font-mono-caps text-[11px] text-primary">{chapter}</p>
                        <p className="font-mono-caps text-[10px] text-muted-foreground">{byChapter[chapter]?.length || 0} members</p>
                      </div>
                      <ChevronRight className="h-3 w-3 text-muted-foreground" />
                    </button>
                  ))
                : (byChapter[selectedChapter] || []).map((a) => (
                    <Link
                      key={a.id}
                      to={artistPath(a)}
                      className="block px-4 py-3 hover:bg-muted/30 transition-colors"
                    >
                      <p className="font-body text-sm font-medium truncate">{a.display_name}</p>
                      <p className="font-mono-caps text-[10px] text-muted-foreground truncate">{a.discipline}</p>
                    </Link>
                  ))
              }
            </div>
            {!selectedChapter && (byChapter["Other"]?.length || 0) > 0 && (
              <div className="px-4 py-3 border-t border-border">
                <p className="font-mono-caps text-[10px] text-muted-foreground">
                  + {byChapter["Other"].length} member{byChapter["Other"].length !== 1 ? "s" : ""} without a chapter location
                </p>
              </div>
            )}
          </div>
        </div>
      </div>
      <SlimFooter />
    </>
  );
}