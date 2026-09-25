/**
 * Loading the Google Maps JavaScript API, once, for the whole app.
 *
 * WHY A KEY MAY BE ABSENT, AND WHY THAT MUST NOT BREAK ANYTHING
 *
 * The key is a build-time variable. It is missing in three ordinary cases:
 *
 *   - the test environment (.env.test sets only VITE_USE_MOCK), so the render
 *     smoke test never tries to reach Google;
 *   - a developer who has not been given one;
 *   - a deploy where the variable was not set in Vercel.
 *
 * In all three the maps fall back to Leaflet with free OpenStreetMap-derived
 * tiles, which is what the site used before. A missing key degrades the map;
 * it never empties the page.
 *
 * THE KEY IS PUBLIC, AND THAT IS NORMAL
 *
 * Every browser map exposes its key — Google's model is referrer restriction,
 * not secrecy. Ours is restricted to artfutureclub.com, which is what stops
 * anyone else spending the quota. Confirmed on 2026-09-24: a server-side call
 * with this key is refused with "API keys with referer restrictions cannot be
 * used with this API", which is the restriction working.
 *
 * WHAT THIS CANNOT TELL YOU
 *
 * Whether the referrer list actually contains this site, and whether billing
 * is enabled. Both only show up when a real browser loads a real map: the
 * first as RefererNotAllowedMapError, the second as "For development purposes
 * only" printed across the tiles. Neither is visible to any status check —
 * look at the map after deploying.
 */
import { Loader } from "@googlemaps/js-api-loader";

export const GOOGLE_MAPS_KEY = import.meta.env.VITE_GOOGLE_MAPS_API_KEY || "";

/** Is a Google map even possible here? */
export const hasGoogleMaps = () => Boolean(GOOGLE_MAPS_KEY);

let loaderPromise = null;

/*
 * AUTHENTICATION FAILS AFTER THE LIBRARY HAS LOADED, NOT BEFORE.
 *
 * A wrong key, a referrer that is not on its list, an unactivated API or no
 * billing account all load the script perfectly well and only then refuse. The
 * loader's promise RESOLVES; Google draws its own grey box over the map —
 * "This page can't load Google Maps correctly" — and reports the real reason
 * only to the console. So a .catch() on loading never sees any of it, and the
 * fallback that exists for a missing key was never reached for the far more
 * likely case of a misconfigured one.
 *
 * `window.gm_authFailure` is the hook Google provides for exactly this. Every
 * map registers here and is told to fall back to Leaflet, which is a map the
 * visitor can still use.
 */
const authFailureListeners = new Set();
let authHasFailed = false;

/** True once Google has refused this key — checked before mounting a map. */
export const googleAuthFailed = () => authHasFailed;

/** Call back when Google refuses; returns an unsubscribe. */
export function onGoogleAuthFailure(fn) {
  if (authHasFailed) fn();
  authFailureListeners.add(fn);
  return () => authFailureListeners.delete(fn);
}

if (typeof window !== "undefined") {
  window.gm_authFailure = () => {
    authHasFailed = true;
    // Nothing will authenticate now, so let a later map skip Google entirely.
    loaderPromise = null;
    authFailureListeners.forEach((fn) => fn());
    if (typeof console !== "undefined") {
      console.warn(
        "[afc] Google Maps refused this key — falling back to the free map. " +
          "The exact reason is logged above by Google: RefererNotAllowedMapError " +
          "means the site is not on the key's referrer list, " +
          "BillingNotEnabledMapError means billing is off, " +
          "ApiNotActivatedMapError means the Maps JavaScript API is not enabled."
      );
    }
  };
}

/**
 * Resolves with the `google.maps` namespace, or rejects.
 *
 * Shared across every map on the page: the Maps API must be loaded exactly
 * once, and loading it twice logs a warning and can leave two copies of the
 * library fighting over the same globals.
 */
export function loadGoogleMaps() {
  if (!hasGoogleMaps()) return Promise.reject(new Error("No Google Maps key"));
  if (!loaderPromise) {
    /*
     * An async function, so that a SYNCHRONOUS throw becomes a rejection.
     * The loader injects a script tag and then reads the `google` global; where
     * that script cannot run — jsdom, an offline browser — it throws on the
     * spot rather than rejecting, and a plain .catch() on the returned promise
     * never sees it. That took down every route in the render smoke test with
     * "google is not defined" instead of falling back to Leaflet.
     */
    loaderPromise = (async () => {
      const loader = new Loader({
        apiKey: GOOGLE_MAPS_KEY,
        version: "weekly",
      });
      /*
       * The core maps library only. The marker library was imported here for
       * AdvancedMarkerElement, which turned out to require a Map ID on the
       * map — without one Google throws "The map is initialized without a
       * valid Map ID" once per marker and covers the map with its generic
       * error dialog. The classic marker needs no Map ID and lets the
       * monochrome styling stay in this file; see GoogleSpacesSurface.
       */
      const maps = await loader.importLibrary("maps");
      return { maps };
    })().catch((err) => {
      // Cleared so a later map can try again — a transient network failure
      // should not disable Google for the rest of the session.
      loaderPromise = null;
      throw err;
    });
  }
  return loaderPromise;
}

/**
 * The site is black, white and grey, and a default Google map is not. These
 * styles strip the colour and most of the clutter, leaving roads, water and
 * labels — close to the reference apps and to the Esri canvas the Leaflet
 * fallback uses, so the two look like the same product.
 *
 * Point-of-interest labels are off deliberately: the pins are the content, and
 * Google's own restaurant and shop markers compete with them.
 */
export const MONOCHROME_STYLE = [
  { elementType: "geometry", stylers: [{ color: "#f5f5f5" }] },
  { elementType: "labels.icon", stylers: [{ visibility: "off" }] },
  { elementType: "labels.text.fill", stylers: [{ color: "#616161" }] },
  { elementType: "labels.text.stroke", stylers: [{ color: "#f5f5f5" }] },
  { featureType: "administrative.land_parcel", elementType: "labels", stylers: [{ visibility: "off" }] },
  { featureType: "poi", stylers: [{ visibility: "off" }] },
  { featureType: "poi.park", elementType: "geometry", stylers: [{ color: "#e5e5e5" }] },
  { featureType: "road", elementType: "geometry", stylers: [{ color: "#ffffff" }] },
  { featureType: "road.arterial", elementType: "labels.text.fill", stylers: [{ color: "#757575" }] },
  { featureType: "road.highway", elementType: "geometry", stylers: [{ color: "#dadada" }] },
  { featureType: "road.highway", elementType: "labels.text.fill", stylers: [{ color: "#616161" }] },
  { featureType: "road.local", elementType: "labels.text.fill", stylers: [{ color: "#9e9e9e" }] },
  { featureType: "transit", stylers: [{ visibility: "off" }] },
  { featureType: "water", elementType: "geometry", stylers: [{ color: "#d9dde0" }] },
  { featureType: "water", elementType: "labels.text.fill", stylers: [{ color: "#9e9e9e" }] },
];
