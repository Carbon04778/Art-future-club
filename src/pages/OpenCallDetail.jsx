import React, { useEffect, useState } from "react";
import { useParams, Link, useNavigate } from "react-router-dom";
import { base44 } from "@/api/base44Client";
import { ArrowLeft, ExternalLink, Calendar, MapPin, Loader2, Pencil, Trash2, Award, Tag, Wallet } from "lucide-react";
import SlimFooter from "@/components/SlimFooter";
import { OpenCallForm, UpgradeToView, TryAgain, canEditCall, deadlineInfo } from "@/components/openCalls";

/**
 * One open call on its own page: the full description, every detail, and
 * Edit / Delete for the person who posted it or an admin.
 */
export default function OpenCallDetail() {
  const { id } = useParams();
  const navigate = useNavigate();
  const [user, setUser] = useState(null);
  const [access, setAccess] = useState(null);
  const [call, setCall] = useState(null);
  const [state, setState] = useState("loading"); // loading | ready | missing | failed
  const [editing, setEditing] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [error, setError] = useState("");

  const load = () => {
    setState("loading");
    setAccess(null);
    base44.auth.openCallAccess()
      .then((a) => {
        setAccess(a);
        if (!a.can_view) { setState("ready"); return; }
        return base44.entities.OpenCall.filter({ id }, undefined, 1)
          .then((rows) => {
            const row = rows?.[0];
            setCall(row || null);
            setState(row ? "ready" : "missing");
          })
          // A mistyped link ("/open-calls/abc") is refused by the database as
          // "invalid input syntax for type uuid": that is not-found, not offline.
          .catch((e) => setState(/uuid|22P02/i.test(String(e?.message || e)) ? "missing" : "failed"));
      })
      .catch(() => setState("failed"));
  };

  useEffect(() => {
    base44.auth.me().then(setUser).catch(() => setUser(null));
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id]);

  useEffect(() => {
    if (!call) return;
    const before = document.title;
    document.title = `${call.title} — Open Calls | Art Future Club`;
    return () => { document.title = before; };
  }, [call]);

  const onDelete = async () => {
    if (!window.confirm(`Delete "${call.title}"? This cannot be undone.`)) return;
    setDeleting(true);
    setError("");
    try {
      await base44.entities.OpenCall.delete(call.id);
      navigate("/open-calls", { replace: true });
    } catch (e) {
      setError(String(e?.message || e) || "Could not delete. Please try again.");
      setDeleting(false);
    }
  };

  const d = call ? deadlineInfo(call.deadline) : null;
  const canEdit = canEditCall(user, call);

  return (
    <>
      <div className="px-6 py-10 md:px-10 max-w-4xl mx-auto" data-testid="open-call-page">
        <Link to="/open-calls" className="inline-flex items-center gap-1.5 font-mono-caps text-[11px] text-muted-foreground hover:text-foreground">
          <ArrowLeft className="h-3 w-3" /> All Open Calls
        </Link>

        {state === "loading" && (
          <div className="mt-24 flex justify-center"><Loader2 className="h-5 w-5 animate-spin text-muted-foreground" /></div>
        )}

        {state === "failed" && <TryAgain onRetry={load} what="this open call" />}

        {state === "ready" && access && !access.can_view && <UpgradeToView signedIn={!!user} />}

        {state === "missing" && (
          <div className="mt-12 border border-border px-6 py-16 text-center" data-testid="open-call-missing">
            <h1 className="font-heading text-3xl tracking-[-0.02em]">Open call not found</h1>
            <p className="mt-3 text-sm text-muted-foreground">It may have been removed by the organiser.</p>
            <Link to="/open-calls" className="mt-6 inline-block font-mono-caps text-[11px] text-primary underline">See all open calls</Link>
          </div>
        )}

        {state === "ready" && call && (
          <article className="mt-8">
            <div className="flex flex-wrap items-center gap-2">
              <span className="font-mono-caps text-[10px] border border-border px-2 py-0.5 text-muted-foreground">{call.type}</span>
              {call.is_free && <span className="font-mono-caps text-[10px] border border-green-600 px-2 py-0.5 text-green-700">Free to apply</span>}
              {d?.closed && <span className="font-mono-caps text-[10px] border border-destructive px-2 py-0.5 text-destructive">Closed</span>}
              {d && !d.closed && d.daysLeft <= 14 && (
                <span className="font-mono-caps text-[10px] border border-accent px-2 py-0.5 text-accent">
                  {d.daysLeft <= 0 ? "Closes today" : d.daysLeft === 1 ? "1 day left" : `${d.daysLeft} days left`}
                </span>
              )}
            </div>

            <h1 className="mt-4 font-heading text-4xl font-medium tracking-[-0.02em] break-words md:text-6xl" data-testid="open-call-title">{call.title}</h1>
            <p className="mt-3 font-mono-caps text-[12px] text-primary">{call.organizer}</p>

            {canEdit && (
              <div className="mt-6 flex flex-wrap items-center gap-3" data-testid="open-call-owner-tools">
                <button type="button" onClick={() => setEditing(true)} data-testid="open-call-edit"
                  className="flex items-center gap-1.5 border border-border px-4 py-2 font-mono-caps text-[11px] hover:border-primary hover:text-primary">
                  <Pencil className="h-3 w-3" /> Edit
                </button>
                <button type="button" onClick={onDelete} disabled={deleting}
                  className="flex items-center gap-1.5 border border-destructive px-4 py-2 font-mono-caps text-[11px] text-destructive hover:bg-destructive hover:text-white disabled:opacity-50">
                  {deleting ? <Loader2 className="h-3 w-3 animate-spin" /> : <Trash2 className="h-3 w-3" />} Delete
                </button>
                {error && <p className="w-full text-sm text-destructive" role="alert">{error}</p>}
              </div>
            )}

            {call.image_url && (
              <img src={call.image_url} alt={call.title} className="mt-8 w-full max-h-[70vh] object-contain bg-muted/30" />
            )}

            <div className="mt-10 grid gap-10 md:grid-cols-[1fr_260px]">
              <div className="min-w-0">
                {call.description
                  ? <div className="text-base leading-relaxed whitespace-pre-line break-words" data-testid="open-call-description">{call.description}</div>
                  : <p className="text-sm text-muted-foreground">No description given. See the organiser's page for full details.</p>}
              </div>

              <aside className="border border-border p-5 space-y-5 self-start">
                {d && (
                  <Fact icon={Calendar} label="Deadline">{d.long}</Fact>
                )}
                {call.location && <Fact icon={MapPin} label="Location">{call.location}</Fact>}
                {call.prize && <Fact icon={Award} label="Prize / Stipend">{call.prize}</Fact>}
                <Fact icon={Wallet} label="Application fee">{call.is_free ? "Free" : call.fee || "Fee applies"}</Fact>
                <Fact icon={Tag} label="Type">{call.type}</Fact>
                {call.external_link && (
                  <a href={call.external_link} target="_blank" rel="noreferrer" data-testid="open-call-apply"
                    className="flex w-full items-center justify-center gap-2 bg-primary px-6 py-3 font-mono-caps text-[11px] text-primary-foreground hover:opacity-80">
                    <ExternalLink className="h-3 w-3" /> {d?.closed ? "Organiser's page" : "Apply"}
                  </a>
                )}
              </aside>
            </div>
          </article>
        )}
      </div>

      <SlimFooter />

      {editing && call && (
        <OpenCallForm
          user={user}
          call={call}
          onClose={() => setEditing(false)}
          onSaved={(saved) => { setCall(saved); setEditing(false); }}
        />
      )}
    </>
  );
}

function Fact({ icon: Icon, label, children }) {
  return (
    <div>
      <p className="flex items-center gap-1.5 font-mono-caps text-[10px] text-muted-foreground"><Icon className="h-3 w-3" /> {label}</p>
      <p className="mt-1 text-sm break-words">{children}</p>
    </div>
  );
}
