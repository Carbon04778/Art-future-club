// Free-text address -> coordinates, via OpenStreetMap Nominatim.
// Ported from the original Deno function; the response shape is unchanged so
// GalleryProfile.jsx and Editorial.jsx need no modification.
//
// Nominatim's usage policy allows roughly 1 request/second and REQUIRES a
// descriptive User-Agent. Do not remove that header.
//
// PROGRESSIVE SIMPLIFICATION
//
// The address is tried as written, then with the floor and unit dropped, then
// street-and-city, then district-and-city — first hit wins. A Hong Kong gallery
// address opens with a floor and unit that Nominatim cannot match at all:
//
//   9/F, Hang Wai Commercial Building, 231 Hennessy Road, Wan Chai, Hong Kong
//     -> NOT FOUND
//   231 Hennessy Road, Wan Chai, Hong Kong
//     -> 22.27794, 114.17697        (the same building)
//
// The stored address is never altered; only the query is. `precision` says
// whether the hit came from the address as written ("exact") or a simplified
// form ("approximate"), so the page can be honest about the pin.
//
// This logic is mirrored in src/lib/addressQuery.js, which the browser fallback
// uses and which scripts/verify-geocoding.mjs tests. Keep the two in step —
// Deno cannot import from src/, so it is duplicated here deliberately.

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const UNIT_PART =
  /^(?:(?:lg|ug|g|b|m)\/f|\d+\s*\/\s*f|(?:unit|room|rm|shop|suite|flat|studio|office|apt|apartment|block|tower|level|floor|podium|basement)\b|\d+(?:st|nd|rd|th)\s+floor\b)/i;
const STREET_LINE = /^\d+[\d\s/,-]*\s+\S/;

const clean = (s: string) => String(s ?? "").replace(/\s+/g, " ").trim();
const isUnitPart = (part: string) => UNIT_PART.test(clean(part));

function addressCandidates(address: string): string[] {
  const parts = clean(address).split(",").map(clean).filter(Boolean);
  if (!parts.length) return [];

  const out = [parts.join(", ")];
  if (parts.length < 2) return out;

  const add = (q: string) => {
    const v = clean(q);
    if (v && v.length > 2 && !out.includes(v)) out.push(v);
  };

  let i = 0;
  while (i < parts.length - 1 && isUnitPart(parts[i])) i += 1;
  if (i > 0) add(parts.slice(i).join(", "));

  const street = parts.findIndex((p) => STREET_LINE.test(p));
  const last = parts[parts.length - 1];
  if (street >= 0 && street < parts.length - 1) {
    add(parts.slice(street).join(", "));
    add(`${parts[street]}, ${last}`);
    if (street > 0 && !isUnitPart(parts[street - 1])) add(`${parts[street - 1]}, ${last}`);
  }

  add(parts.slice(-2).join(", "));
  return out;
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

async function search(query: string) {
  const url = new URL("https://nominatim.openstreetmap.org/search");
  url.searchParams.set("q", query);
  url.searchParams.set("format", "json");
  url.searchParams.set("limit", "1");
  url.searchParams.set("addressdetails", "1");

  const res = await fetch(url, {
    headers: { "User-Agent": "ArtFutureClub/1.0 (contact@artfutureclub.com)" },
  });
  if (!res.ok) throw new Error(`Nominatim returned ${res.status}`);
  const [hit] = await res.json();
  return hit ?? null;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS });

  try {
    const { address } = await req.json();
    if (!address) {
      return Response.json({ error: "address is required" }, { status: 400, headers: CORS });
    }

    const candidates = addressCandidates(address);
    for (let i = 0; i < candidates.length; i++) {
      const hit = await search(candidates[i]);
      if (hit) {
        const a = hit.address ?? {};
        return Response.json(
          {
            lat: parseFloat(hit.lat),
            lng: parseFloat(hit.lon),
            placename:
              a.suburb || a.neighbourhood || a.city_district || a.city || a.town || "",
            region: [a.city || a.town || a.state, a.country].filter(Boolean).join(", "),
            display_name: hit.display_name,
            precision: i === 0 ? "exact" : "approximate",
            matched: candidates[i],
          },
          { headers: CORS },
        );
      }
      if (i < candidates.length - 1) await sleep(1100);
    }

    return Response.json(
      { error: "Address not found. Check the street name and city, or drop the building name." },
      { status: 404, headers: CORS },
    );
  } catch (err) {
    return Response.json(
      { error: String(err?.message ?? err) },
      { status: 500, headers: CORS },
    );
  }
});
