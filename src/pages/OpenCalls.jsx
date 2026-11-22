import React, { useState, useEffect } from "react";
import { Link } from "react-router-dom";
import { base44 } from "@/api/base44Client";
import { Plus, ExternalLink, Loader2, Calendar, MapPin, Pencil, ArrowRight } from "lucide-react";
import SlimFooter from "@/components/SlimFooter";
import { CALL_TYPES, OpenCallForm, UpgradeToView, TryAgain, canEditCall, deadlineInfo, openCallPath } from "@/components/openCalls";

const TYPES = ["All", ...CALL_TYPES];

export default function OpenCalls() {
  const [calls, setCalls] = useState([]);
  // false until the list has arrived. The empty message used to show while it
  // was still loading, so a slow connection read as "no opportunities".
  const [loaded, setLoaded] = useState(false);
  const [filter, setFilter] = useState("All");
  // null = closed, "new" = posting, a call = editing it.
  const [form, setForm] = useState(null);
  const [user, setUser] = useState(null);
  // null while checking. Who may view comes from the database
  // (open_call_access: premium-only in 026, open to everyone in 031).
  const [access, setAccess] = useState(null);
  // A failed load is said as such — never "no opportunities" or "upgrade",
  // which would be wrong for a paying member on a bad connection.
  const [loadFailed, setLoadFailed] = useState(false);

  const loadCalls = () => {
    setLoadFailed(false);
    return base44.entities.OpenCall.list("-created_date", 100)
      .then((rows) => { setCalls(rows || []); setLoaded(true); })
      .catch(() => setLoadFailed(true));
  };

  const check = () => {
    setAccess(null);
    base44.auth.openCallAccess()
      .then((a) => {
        setAccess(a);
        if (a.can_view) loadCalls();
      })
      .catch(() => setAccess({ can_view: false, can_post: false, failed: true }));
  };

  useEffect(() => {
    base44.auth.me().then(setUser).catch(() => setUser(null));
    check();
  }, []);

  const filtered = filter === "All" ? calls : calls.filter((c) => c.type === filter);
  const active = filtered.filter((c) => !deadlineInfo(c.deadline)?.closed);
  const expired = filtered.filter((c) => deadlineInfo(c.deadline)?.closed);

  const onSaved = (saved) => {
    setForm(null);
    if (saved?.id) {
      setCalls((prev) => (prev.some((c) => c.id === saved.id) ? prev.map((c) => (c.id === saved.id ? saved : c)) : [saved, ...prev]));
    }
    loadCalls();
  };

  return (
    <>
      {access?.can_post && (
        <div className="flex justify-end px-6 py-3 md:px-10 border-b border-border">
          <button onClick={() => setForm("new")} className="flex items-center gap-1.5 bg-primary px-4 py-2 font-mono-caps text-[11px] text-primary-foreground hover:opacity-80">
            <Plus className="h-3 w-3" /> Post Opportunity
          </button>
        </div>
      )}

      <div className="px-6 py-16 md:px-10 max-w-5xl mx-auto">
        <p className="font-mono-caps text-[11px] text-muted-foreground">AFC — Opportunities Board</p>
        <h1 className="mt-3 font-heading text-5xl font-medium tracking-[-0.02em] md:text-7xl">Open Calls</h1>
        <p className="mt-4 text-lg text-muted-foreground"><span className="text-primary">Residencies</span>, <span className="text-accent">grants</span>, <span className="text-highlight">fellowships</span> and calls for submissions.</p>

        {access === null && (
          <div className="mt-16 flex justify-center"><Loader2 className="h-5 w-5 animate-spin text-muted-foreground" /></div>
        )}

        {access?.failed && <TryAgain onRetry={check} />}

        {access && !access.can_view && !access.failed && <UpgradeToView signedIn={!!user} />}

        {access?.can_view && (<>
        <div className="mt-10 flex flex-wrap gap-2">
          {TYPES.map((t) => (
            <button key={t} onClick={() => setFilter(t)}
              className={`font-mono-caps text-[11px] px-3 py-1.5 border transition-colors ${filter === t ? "border-foreground bg-foreground text-background" : "border-border text-muted-foreground hover:border-foreground"}`}>
              {t}
            </button>
          ))}
        </div>

        {loadFailed && <TryAgain onRetry={loadCalls} />}

        <div className="mt-12 space-y-4">
          {!loaded && !loadFailed && (
            <div className="py-16 flex justify-center" data-testid="open-calls-loading"><Loader2 className="h-5 w-5 animate-spin text-muted-foreground" /></div>
          )}
          {loaded && !loadFailed && active.length === 0 && expired.length === 0 && (
            <div className="py-16 text-center border border-border">
              <p className="font-mono-caps text-[11px] text-muted-foreground">{filter === "All" ? "No opportunities posted yet." : `No ${filter.toLowerCase()} opportunities right now.`}</p>
            </div>
          )}
          {active.map((c) => <CallCard key={c.id} call={c} canEdit={canEditCall(user, c)} onEdit={() => setForm(c)} />)}
          {expired.length > 0 && (
            <>
              <p className="font-mono-caps text-[11px] text-muted-foreground pt-8 pb-2">Past Deadlines</p>
              {expired.map((c) => <CallCard key={c.id} call={c} expired canEdit={canEditCall(user, c)} onEdit={() => setForm(c)} />)}
            </>
          )}
        </div>
        </>)}
      </div>

      <SlimFooter />

      {form && (
        <OpenCallForm
          user={user}
          call={form === "new" ? null : form}
          onClose={() => setForm(null)}
          onSaved={onSaved}
        />
      )}
    </>
  );
}

function CallCard({ call, expired, canEdit, onEdit }) {
  const d = deadlineInfo(call.deadline);
  const href = openCallPath(call);
  return (
    <div className={`border border-border p-6 ${expired ? "opacity-60" : ""}`} data-testid="open-call-card">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div className="flex-1 min-w-0">
          <div className="flex flex-wrap items-center gap-2 mb-2">
            <span className="font-mono-caps text-[10px] border border-border px-2 py-0.5 text-muted-foreground">{call.type}</span>
            {call.is_free && <span className="font-mono-caps text-[10px] border border-green-600 px-2 py-0.5 text-green-700">Free</span>}
            {expired && <span className="font-mono-caps text-[10px] border border-destructive px-2 py-0.5 text-destructive">Closed</span>}
          </div>
          {call.image_url && (
            <Link to={href} tabIndex={-1} aria-hidden="true">
              <img src={call.image_url} alt="" className="aspect-video w-full mb-4 object-cover" loading="lazy" />
            </Link>
          )}
          <h3 className="font-heading text-2xl tracking-[-0.01em] break-words">
            <Link to={href} className="hover:text-primary transition-colors" data-testid="open-call-link">{call.title}</Link>
          </h3>
          <p className="mt-1 font-mono-caps text-[11px] text-primary">{call.organizer}</p>
          {call.description && <p className="mt-3 text-sm text-muted-foreground leading-relaxed line-clamp-3 whitespace-pre-line">{call.description}</p>}
          <div className="mt-4 flex flex-wrap gap-x-5 gap-y-2">
            {call.location && (
              <span className="flex items-center gap-1.5 font-mono-caps text-[11px] text-muted-foreground">
                <MapPin className="h-3 w-3" /> {call.location}
              </span>
            )}
            {d && (
              <span className="flex items-center gap-1.5 font-mono-caps text-[11px] text-muted-foreground">
                <Calendar className="h-3 w-3" /> Deadline: {d.label}
              </span>
            )}
            {call.prize && <span className="font-mono-caps text-[11px] text-primary">Prize: {call.prize}</span>}
            {!call.is_free && call.fee && <span className="font-mono-caps text-[11px] text-accent">Fee: {call.fee}</span>}
          </div>
          <div className="mt-5 flex flex-wrap items-center gap-4">
            <Link to={href} className="flex items-center gap-1.5 font-mono-caps text-[11px] text-foreground underline-offset-4 hover:text-primary hover:underline">
              View full details <ArrowRight className="h-3 w-3" />
            </Link>
            {canEdit && (
              <button type="button" onClick={onEdit} data-testid="open-call-edit" className="flex items-center gap-1.5 font-mono-caps text-[11px] text-muted-foreground hover:text-primary">
                <Pencil className="h-3 w-3" /> Edit
              </button>
            )}
          </div>
        </div>
        {call.external_link && (
          <a
            href={call.external_link}
            target="_blank" rel="noreferrer"
            className="shrink-0 self-start flex items-center gap-1.5 border border-border px-4 py-2 font-mono-caps text-[11px] text-muted-foreground hover:border-primary hover:text-primary transition-colors">
            <ExternalLink className="h-3 w-3" /> Apply
          </a>
        )}
      </div>
    </div>
  );
}
