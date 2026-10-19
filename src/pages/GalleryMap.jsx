import React from "react";
import { Navigate } from "react-router-dom";

/*
 * There is one map now (B1 in docs/CLIENT-REQUESTS.md). /gallery-map is kept
 * so existing links and bookmarks still land somewhere sensible: the map with
 * "Galleries" selected.
 */
export default function GalleryMap() {
  return <Navigate to="/map?show=galleries" replace />;
}
