import React, { useState } from "react";
import { MapPin, Loader2, Search } from "lucide-react";
import { base44 } from "@/api/base44Client";

const input = "w-full border border-border bg-transparent px-4 py-3 text-base outline-none focus:border-foreground";

/**
 * Resolves map coordinates for a gallery or venue, from its own address.
 *
 * THE BUG THIS FIXES
 *
 * This box used to hold the address in LOCAL state, seeded from the profile's
 * address and never reported back. The parent then discarded it before saving
 * (`const { geo_address, ...payload } = form`) and re-seeded the box from the
 * address column every time the form opened.
 *
 * So editing the address here did resolve new coordinates, and they did save —
 * but the text itself was never stored, and reopening the form refilled the
 * box from the old address column. It looked exactly as though the edit had
 * been rejected. It had not; it was never a saved value.
 *
 * The box is now bound to the profile's real `address`, so there is ONE
 * address: type it here or in the Address field above, press Locate, and the
 * address and its coordinates are saved together.
 */
export default function GeoAddressField({ value, onChange }) {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  /* Address edited since the coordinates were last resolved — so the shown
   * coordinates no longer necessarily match the text. */
  const [stale, setStale] = useState(false);

  const query = value?.address || "";

  const hasCoords =
    value?.geo_lat != null && value?.geo_lng != null &&
    value.geo_lat !== "" && value.geo_lng !== "" &&
    !Number.isNaN(Number(value.geo_lat)) && !Number.isNaN(Number(value.geo_lng));
  const resolved = hasCoords && !stale;

  const setQuery = (next) => {
    // Writes straight to the profile's address — this is the real field now.
    onChange({ address: next });
    setStale(true);
  };

  const resolve = async () => {
    const addr = query.trim();
    if (!addr) return;
    setLoading(true);
    setError("");
    try {
      const res = await base44.functions.invoke("geocodeAddress", { address: addr });
      if (res?.error) { setError(res.error); return; }
      const { lat, lng, placename, region } = res.data || res;
      onChange({
        geo_placename: placename || addr,
        geo_region: region || "",
        geo_lat: typeof lat === "string" ? Number(lat) : lat,
        geo_lng: typeof lng === "string" ? Number(lng) : lng,
      });
      setStale(false);
    } catch (e) {
      setError(e?.message || "Geocoding failed");
    } finally {
      setLoading(false);
    }
  };

  /* Clears the COORDINATES only. The address is the gallery's real one now, so
   * wiping it here would silently delete it from the profile. */
  const clear = () => {
    onChange({ geo_placename: "", geo_region: "", geo_lat: "", geo_lng: "" });
    setStale(false);
    setError("");
  };

  return (
    <div className="space-y-3">
      <p className="font-mono-caps text-[11px] text-muted-foreground">Geo Location</p>
      <p className="text-xs text-muted-foreground/70 leading-relaxed -mt-2">
        This is the gallery&rsquo;s address — editing it here changes it above too.
        Press Locate to pin it on the map, then save.
      </p>

      <div className="flex gap-2">
        <div className="relative flex-1">
          <MapPin className="absolute left-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground pointer-events-none" />
          <input
            className={`${input} pl-9`}
            value={query}
            onChange={(e) => setQuery(e.target.value)}
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

      {/* Says plainly that the address will still save — only the map pin is
          waiting. Otherwise an edited address with no re-Locate looks broken. */}
      {stale && hasCoords && !error && (
        <p className="font-mono-caps text-[10px] text-yellow-600">
          Address changed — press Locate to move the map pin. Saving without it
          keeps the new address and the old pin.
        </p>
      )}

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