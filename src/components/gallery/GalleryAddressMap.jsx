import React, { useState, useEffect } from "react";
import PlaceMap from "@/components/map/PlaceMap";
import { MapPin, ExternalLink, Clock, Phone, Mail, Globe, Instagram, Facebook, Linkedin } from "lucide-react";

/**
 * Shows a gallery/museum's address + contact details (location, hours, phone,
 * email, website, social) with an embedded map when the address resolves.
 * Contact info renders even when no address / map is available.
 */
export default function GalleryAddressMap({ profile }) {
  const address = profile?.address || profile?.based_in;
  const name = profile?.display_name;
  const [coords, setCoords] = useState(null);
  const [status, setStatus] = useState("idle"); // idle | loading | ok | fail

  /*
   * The listing's OWN coordinates first. This used to geocode the address
   * through Nominatim on every single page view, for an answer already
   * stored on the profile by the Locate button — a network round trip per
   * visitor, against a service whose policy is about one request a second,
   * and capable of disagreeing with a pin an admin had placed deliberately.
   *
   * Geocoding stays only for a listing that has an address but was never
   * located. Nineteen of those were backfilled on 2026-09-23, but nothing
   * stops a new one being created.
   */
  useEffect(() => {
    if (profile?.geo_lat != null && profile?.geo_lng != null) {
      setCoords([Number(profile.geo_lat), Number(profile.geo_lng)]);
      setStatus("ok");
      return undefined;
    }
    if (!profile?.address) return undefined;
    let alive = true;
    setStatus("loading");
    fetch(
      `https://nominatim.openstreetmap.org/search?format=jsonv2&limit=1&q=${encodeURIComponent(profile.address)}`,
      { headers: { Accept: "application/json" } }
    )
      .then((r) => r.json())
      .then((data) => {
        if (!alive) return;
        const hit = Array.isArray(data) && data[0];
        if (hit) {
          setCoords([parseFloat(hit.lat), parseFloat(hit.lon)]);
          setStatus("ok");
        } else {
          setStatus("fail");
        }
      })
      .catch(() => alive && setStatus("fail"));
    return () => { alive = false; };
  }, [profile?.address, profile?.geo_lat, profile?.geo_lng]);

  const normalizeUrl = (u) => (u && !/^https?:\/\//i.test(u) ? `https://${u}` : u);
  const socialHandle = (u) => (u || "").replace(/^@/, "");
  const socialUrl = (u, base) => {
    const h = socialHandle(u);
    return /^https?:\/\//i.test(h) ? h : `${base}${h}`;
  };

  const rows = [];
  if (profile?.address) rows.push({ icon: MapPin, label: "Address", value: profile.address, href: `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(profile.address)}`, hrefLabel: "Open in Google Maps" });
  if (profile?.based_in && !profile?.address) rows.push({ icon: MapPin, label: "Location", value: profile.based_in, href: `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(profile.based_in)}`, hrefLabel: "Open in Google Maps" });
  if (profile?.opening_hours) rows.push({ icon: Clock, label: "Hours", value: profile.opening_hours });
  if (profile?.phone) rows.push({ icon: Phone, label: "Phone", value: profile.phone, href: `tel:${profile.phone}` });
  if (profile?.email) rows.push({ icon: Mail, label: "Email", value: profile.email, href: `mailto:${profile.email}` });
  if (profile?.website) rows.push({ icon: Globe, label: "Website", value: profile.website.replace(/^https?:\/\//, ""), href: normalizeUrl(profile.website), hrefLabel: "Visit site" });
  if (profile?.instagram) rows.push({ icon: Instagram, label: "Instagram", value: socialHandle(profile.instagram), href: socialUrl(profile.instagram, "https://instagram.com/") });
  if (profile?.facebook) rows.push({ icon: Facebook, label: "Facebook", value: socialHandle(profile.facebook), href: socialUrl(profile.facebook, "https://facebook.com/") });
  if (profile?.linkedin) rows.push({ icon: Linkedin, label: "LinkedIn", value: socialHandle(profile.linkedin), href: socialUrl(profile.linkedin, "https://linkedin.com/in/") });

  const hasMap = !!profile?.address || (profile?.geo_lat != null && profile?.geo_lng != null);
  if (!rows.length && !hasMap) return null;

  const MapBlock = (
    <div className="border border-border overflow-hidden bg-muted" style={{ height: "340px" }}>
      {status === "ok" && coords ? (
        <PlaceMap lat={coords[0]} lng={coords[1]} type={profile?.type} />
      ) : (
        <div className="flex h-full items-center justify-center px-6 text-center font-mono-caps text-[11px] text-muted-foreground">
          {status === "loading" ? "Locating on map…" : "Map unavailable for this address."}
        </div>
      )}
    </div>
  );

  const ContactBlock = (
    <div className="flex flex-col justify-start gap-5">
      {rows.map((row, i) => {
        const Icon = row.icon;
        return (
          <div key={i} className="flex items-start gap-3">
            <Icon className="mt-0.5 h-4 w-4 shrink-0 text-primary" />
            <div className="min-w-0">
              <p className="font-mono-caps text-[10px] uppercase tracking-wider text-muted-foreground">{row.label}</p>
              <p className="text-sm leading-relaxed text-foreground">{row.value}</p>
              {row.href && (
                <a href={row.href} target={row.href.startsWith("mailto:") || row.href.startsWith("tel:") ? undefined : "_blank"} rel="noreferrer" className="inline-flex items-center gap-1.5 mt-1 font-mono-caps text-[11px] text-primary hover:underline">
                  {row.hrefLabel || (row.href.startsWith("mailto:") || row.href.startsWith("tel:") ? row.value : "Open")}
                  {row.hrefLabel && <ExternalLink className="h-3 w-3" />}
                </a>
              )}
            </div>
          </div>
        );
      })}
    </div>
  );

  return (
    <section className="mt-12 border-t border-border pt-8">
      <h2 className="font-heading text-3xl font-medium tracking-[-0.01em] mb-5">Visit</h2>
      {hasMap ? (
        <div className="grid grid-cols-1 gap-8 md:grid-cols-[1fr_320px]">
          {MapBlock}
          {ContactBlock}
        </div>
      ) : (
        ContactBlock
      )}
    </section>
  );
}