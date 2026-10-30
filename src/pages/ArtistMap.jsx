import React from "react";
import { useSearchParams } from "react-router-dom";
import SlimFooter from "@/components/SlimFooter";
import SpacesMap from "@/components/SpacesMap";

/*
 * One map, filtered by All / Artists / Galleries / Venues (B1 in
 * docs/CLIENT-REQUESTS.md).
 *
 * This page used to stack two maps: the galleries-and-venues map, then a
 * separate Leaflet map of artists drawn as one dot per chapter. That second
 * map read only the newest 200 artists. Artists are now a layer of the one
 * map — one pin per chapter city, every published artist, paged.
 *
 * ?show=artists|galleries|venues|directory preselects a filter; /gallery-map uses it.
 */
const SHOW = { artists: "Artists", galleries: "Galleries", venues: "Venues", directory: "Directory", events: "Events" };

export default function ArtistMap() {
  const [params] = useSearchParams();
  const initialKind = SHOW[String(params.get("show") || "").toLowerCase()] || "All";

  return (
    <>
      <SpacesMap title="Map" includeArtists initialKind={initialKind} />
      <SlimFooter />
    </>
  );
}
