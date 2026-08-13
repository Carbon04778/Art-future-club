// Free-text address -> coordinates, via OpenStreetMap Nominatim.
// Ported from the original Deno function; the response shape is unchanged so
// GalleryProfile.jsx and Editorial.jsx need no modification.
//
// Nominatim's usage policy allows roughly 1 request/second and REQUIRES a
// descriptive User-Agent. Do not remove that header.

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS });

  try {
    const { address } = await req.json();
    if (!address) {
      return Response.json({ error: "address is required" }, { status: 400, headers: CORS });
    }

    const url = new URL("https://nominatim.openstreetmap.org/search");
    url.searchParams.set("q", address);
    url.searchParams.set("format", "json");
    url.searchParams.set("limit", "1");
    url.searchParams.set("addressdetails", "1");

    const res = await fetch(url, {
      headers: { "User-Agent": "ArtFutureClub/1.0 (contact@artfutureclub.com)" },
    });
    if (!res.ok) throw new Error(`Nominatim returned ${res.status}`);

    const [hit] = await res.json();
    if (!hit) {
      return Response.json({ error: "Address not found" }, { status: 404, headers: CORS });
    }

    const a = hit.address ?? {};
    return Response.json(
      {
        lat: parseFloat(hit.lat),
        lng: parseFloat(hit.lon),
        placename:
          a.suburb || a.neighbourhood || a.city_district || a.city || a.town || "",
        region: [a.city || a.town || a.state, a.country].filter(Boolean).join(", "),
        display_name: hit.display_name,
      },
      { headers: CORS },
    );
  } catch (err) {
    return Response.json(
      { error: String(err?.message ?? err) },
      { status: 500, headers: CORS },
    );
  }
});
