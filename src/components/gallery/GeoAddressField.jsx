import React, { useState } from "react";
import { MapPin, Loader2, Search } from "lucide-react";
import { base44 } from "@/api/base44Client";

const input = "w-full border border-border bg-transparent px-4 py-3 text-base outline-none focus:border-foreground";

/**
 * Lets the gallery / venue owner resolve geo coordinates from a free-text
 * address. Calls the geocodeAddress backend function and fills the parent
 * form's geo_placename, geo_region, geo_lat and geo_lng in one go.
 */
export default function GeoAddressField({ value, onChange }) {
  const [query, setQuery] = useState(value?.geo_address || "");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [resolved, setResolved] = useState(
    value?.geo_lat != null && value?.geo_lng != null && !Number.isNaN(Number(value.geo_lat)) && !Number.isNaN(Number(value.geo_lng))
  );

  const resolve = async () => {
    const addr = query.trim();
    if (!addr) return;
    setLoading(true);
    setError("");
    try {
      const res = await base44.functions.invoke("geocodeAddress", { address: addr });
      if (res?.error) { setError(res.error); setResolved(false); return; }
      const { lat, lng, placename, region } = res.data || res;
      onChange({
        geo_placename: placename || addr,
        geo_region: region || "",
        geo_lat: typeof lat === "string" ? Number(lat) : lat,
        geo_lng: typeof lng === "string" ? Number(lng) : lng,
      });
      setResolved(true);
    } catch (e) {
      setError(e?.message || "Geocoding failed");
      setResolved(false);
    } finally {
      setLoading(false);
    }
  };

  const clear = () => {
    onChange({ geo_placename: "", geo_region: "", geo_lat: "", geo_lng: "" });
    setQuery("");
    setResolved(false);
    setError("");
  };

  return (
    <div className="space-y-3">
      <p className="font-mono-caps text-[11px] text-muted-foreground">Geo Location</p>
      <p className="text-xs text-muted-foreground/70 leading-relaxed -mt-2">
        Enter an address to resolve coordinates for local search and map listings.
      </p>

      <div className="flex gap-2">
        <div className="relative flex-1">
          <MapPin className="absolute left-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground pointer-events-none" />
          <input
            className={`${input} pl-9`}
            value={query}
            onChange={(e) => { setQuery(e.target.value); setResolved(false); }}
            onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); resolve(); } }}
            placeholder="e.g. Tate Modern, Bankside, London"
          />
        </div>
        <button
          type="button"
          onClick={resolve}
          disabled={loading || !query.trim()}
          className="flex items-center gap-2 border border-foreground px-5 py-3 font-mono-caps text-[11px] hover:bg-foreground hover:text-background disabled:opacity-40"
        >
          {loading ? <Loader2 className="h-3 w-3 animate-spin" /> : <Search className="h-3 w-3" />}
          Locate
        </button>
      </div>

      {error && <p className="font-mono-caps text-[10px] text-destructive">✗ {error}</p>}

      {resolved && !error && (
        <div className="flex items-center justify-between gap-3 border border-border px-4 py-3 bg-muted/30">
          <div className="min-w-0">
            <p className="font-mono-caps text-[10px] text-primary flex items-center gap-1.5">
              <MapPin className="h-3 w-3" /> {value.geo_placename || query}
            </p>
            <p className="font-mono-caps text-[10px] text-muted-foreground/70 mt-1 truncate">
              {value.geo_region ? `${value.geo_region} · ` : ""}{Number(value.geo_lat).toFixed(4)}, {Number(value.geo_lng).toFixed(4)}
            </p>
          </div>
          <button type="button" onClick={clear} className="font-mono-caps text-[10px] text-muted-foreground hover:text-destructive shrink-0">Clear</button>
        </div>
      )}
    </div>
  );
}