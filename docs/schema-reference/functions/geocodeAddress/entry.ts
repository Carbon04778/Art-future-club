import { createClientFromRequest } from 'npm:@base44/sdk@0.8.40';

// Geocodes a free-text address to lat/lng using OpenStreetMap's Nominatim
// (free, no API key). Returns lat, lng, placename, and a derived region string.
export default async function(req) {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 });

    const body = await req.json().catch(() => ({}));
    const address = (body.address || "").trim();
    if (!address) return Response.json({ error: 'Address is required' }, { status: 400 });

    const url = "https://nominatim.openstreetmap.org/search?format=jsonv2&limit=1&q=" + encodeURIComponent(address);
    const res = await fetch(url, {
      headers: {
        'User-Agent': 'ArtFutureClub/1.0 editorial geocoder',
        'Accept': 'application/json'
      }
    });
    if (!res.ok) return Response.json({ error: 'Geocoder request failed (' + res.status + ')' }, { status: 502 });

    const data = await res.json();
    const hit = Array.isArray(data) && data[0];
    if (!hit) return Response.json({ error: 'No match found for that address' }, { status: 404 });

    const parts = (hit.display_name || "").split(",").map((s) => s.trim());
    const region = parts.length > 1 ? parts.slice(-2).join(", ") : (parts[0] || "");

    return Response.json({
      lat: parseFloat(hit.lat),
      lng: parseFloat(hit.lon),
      placename: hit.name || address,
      region
    });
  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
}