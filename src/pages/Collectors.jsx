import React, { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { base44 } from "@/api/base44Client";
import { Image } from "@/components/ui/image";
import { Loader2, Search, MapPin } from "lucide-react";
import SlimFooter from "@/components/SlimFooter";
import CollectorsGate from "@/components/CollectorsGate";
import { PEOPLE_TYPES, isPeopleType } from "@/lib/venueTypes";
import { collectorPath } from "@/lib/slugs";
import { useDataRevision } from "@/lib/dataRevision";

/**
 * The Collectors page (B10). Members only — see CollectorsGate. The list is
 * whatever the database lets this visitor read: private collectors never
 * arrive here (migration 029).
 */
export default function Collectors() {
  return (
    <>
      <CollectorsGate title="Collectors">{() => <CollectorList />}</CollectorsGate>
      <SlimFooter />
    </>
  );
}

function CollectorList() {
  const [rows, setRows] = useState(null);
  const [query, setQuery] = useState("");
  const rev = useDataRevision();

  useEffect(() => {
    base44.entities.CollectorProfile.filter(
      { type: { $in: PEOPLE_TYPES } }, "display_name", 1000,
      "id,display_name,type,based_in,bio,avatar_url,interests,slug"
    )
      .then((r) => setRows(r.filter((x) => isPeopleType(x.type))))
      .catch(() => setRows([]));
  }, [rev]);

  const q = query.trim().toLowerCase();
  const shown = (rows || []).filter((r) => !q || [r.display_name, r.based_in, r.bio, ...(r.interests || [])].filter(Boolean).some((s) => String(s).toLowerCase().includes(q)));

  return (
    <div className="px-6 py-16 md:px-10" data-testid="collectors-page">
      <p className="font-mono-caps text-[11px] text-muted-foreground">AFC — Members only</p>
      <h1 className="mt-3 font-heading text-5xl font-medium tracking-[-0.02em] md:text-7xl">Collectors</h1>
      <p className="mt-4 text-lg text-muted-foreground">
        The <span className="text-primary">collectors</span> of the network and the <span className="text-accent">collections</span> they are building.
      </p>
      <div className="relative mt-10">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
        <input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Search by name, city, interest…"
          className="w-full sm:w-80 border border-border bg-transparent pl-9 pr-3 py-2 text-sm outline-none focus:border-foreground" />
      </div>

      {rows === null ? (
        <div className="flex justify-center py-24"><Loader2 className="h-5 w-5 animate-spin text-muted-foreground" /></div>
      ) : shown.length === 0 ? (
        <div className="mt-14 border border-border py-16 text-center">
          <p className="font-mono-caps text-[11px] text-muted-foreground">{rows.length === 0 ? "No collectors to show yet." : "Nothing matches your search."}</p>
        </div>
      ) : (
        <div className="mt-12 grid grid-cols-1 gap-6 sm:grid-cols-2 lg:grid-cols-3">
          {shown.map((c) => (
            <Link key={c.id} to={collectorPath(c)} data-testid="collector-card"
              className="group flex flex-wrap items-center gap-4 border border-border p-5 hover:border-foreground transition-colors">
              <div className="h-16 w-16 shrink-0 overflow-hidden rounded-full bg-muted flex items-center justify-center">
                {c.avatar_url
                  ? <Image src={c.avatar_url} alt={c.display_name} fittingType="fill" className="h-full w-full object-cover" />
                  : <span className="font-heading text-2xl text-muted-foreground/60">{c.display_name?.[0]}</span>}
              </div>
              <div className="min-w-0 flex-1">
                <p className="font-mono-caps text-[10px] text-primary">{c.type}</p>
                <h3 className="truncate font-heading text-xl tracking-[-0.01em] group-hover:text-primary">{c.display_name}</h3>
                {c.based_in && <p className="flex items-center gap-1 font-mono-caps text-[10px] text-muted-foreground"><MapPin className="h-3 w-3" /> {c.based_in}</p>}
              </div>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
