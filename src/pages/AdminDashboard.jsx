import React, { useState, useEffect } from "react";
import { Link } from "react-router-dom";
import { base44 } from "@/api/base44Client";
import { Users, Star, ShoppingBag, FileText, Trash2, Check, X } from "lucide-react";
import SlimFooter from "@/components/SlimFooter";
import { Image } from "@/components/ui/image";
import AdminCreatePanel from "@/components/AdminCreatePanel";
import AdminMembersPanel from "@/components/AdminMembersPanel";
import AdminArticlesPanel from "@/components/AdminArticlesPanel";
import AdminSubscribersPanel from "@/components/AdminSubscribersPanel";

const TABS = ["Add Listing", "Members", "Editorial", "Artists", "Inquiries", "Forum", "Open Calls", "Newsletter", "Subscriptions"];

export default function AdminDashboard() {
  const [tab, setTab] = useState("Add Listing");
  const [artists, setArtists] = useState([]);
  const [inquiries, setInquiries] = useState([]);
  const [posts, setPosts] = useState([]);
  const [openCalls, setOpenCalls] = useState([]);
  const [subs, setSubs] = useState([]);
  const [profiles, setProfiles] = useState([]);
  const [subBusy, setSubBusy] = useState(null);
  const [subError, setSubError] = useState("");

  /**
   * Mark a subscription cancelled and remove the features it granted.
   *
   * This is the record-keeping side only. The Stripe subscription itself must
   * be cancelled in the Stripe dashboard, otherwise billing continues and the
   * next payment webhook will reactivate this row.
   */
  const deactivateSub = async (s) => {
    setSubError("");
    setSubBusy(s.id);
    try {
      await base44.entities.Subscription.update(s.id, { status: "cancelled" });
      setSubs((prev) => prev.map((x) => (x.id === s.id ? { ...x, status: "cancelled" } : x)));
    } catch (e) {
      const msg = String(e?.message || e);
      setSubError(
        /row-level security|policy|coerce/i.test(msg)
          ? "Subscriptions are written by the Stripe webhook only. Cancel it in Stripe instead — the webhook will update this automatically."
          : msg
      );
    } finally {
      setSubBusy(null);
    }
  };
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    base44.auth.me().then((u) => {
      setUser(u);
      if (u.role !== "admin") { setLoading(false); return; }
      Promise.all([
        base44.entities.ArtistProfile.list("-created_date", 200),
        base44.entities.Inquiry.list("-created_date", 100),
        base44.entities.ForumPost.list("-created_date", 100),
        base44.entities.OpenCall.list("-created_date", 100),
        base44.entities.Subscription.list("-created_date", 100),
        // Subscriptions store only a user_id. Without the profiles the tab
        // showed a raw uuid, which tells an admin nothing about who paid.
        base44.entities.Profile.list("-created_date", 500).catch(() => []),
      ]).then(([a, i, p, oc, s, pr]) => { setArtists(a); setInquiries(i); setPosts(p); setOpenCalls(oc); setSubs(s); setProfiles(pr || []); setLoading(false); });
    }).catch(() => setLoading(false));
  }, []);

  const featureArtist = async (artist) => {
    await base44.entities.ArtistProfile.update(artist.id, { is_featured: !artist.is_featured });
    setArtists((prev) => prev.map((a) => a.id === artist.id ? { ...a, is_featured: !a.is_featured } : a));
  };

  const premiumArtist = async (artist) => {
    await base44.entities.ArtistProfile.update(artist.id, { is_premium: !artist.is_premium });
    setArtists((prev) => prev.map((a) => a.id === artist.id ? { ...a, is_premium: !a.is_premium } : a));
  };

  const deletePost = async (id) => {
    if (!confirm("Delete this post?")) return;
    await base44.entities.ForumPost.delete(id);
    setPosts((prev) => prev.filter((p) => p.id !== id));
  };

  const updateInquiry = async (id, status) => {
    await base44.entities.Inquiry.update(id, { status });
    setInquiries((prev) => prev.map((i) => i.id === id ? { ...i, status } : i));
  };

  const deleteOpenCall = async (id) => {
    await base44.entities.OpenCall.delete(id);
    setOpenCalls((prev) => prev.filter((c) => c.id !== id));
  };

  if (loading) return (
    <div className="flex min-h-screen items-center justify-center">
      <div className="w-6 h-6 border-2 border-border border-t-foreground rounded-full animate-spin" />
    </div>
  );

  if (user?.role !== "admin") return (
    <div className="flex min-h-screen items-center justify-center">
      <p className="font-mono-caps text-[11px] text-muted-foreground">Admin access required.</p>
    </div>
  );

  const STATUS_COLOR = { new: "text-primary", replied: "text-green-600", closed: "text-muted-foreground" };

  return (
    <>

      <div className="px-6 py-12 md:px-10 max-w-7xl mx-auto">
        <h1 className="font-heading text-5xl font-medium tracking-[-0.02em] mb-8">Admin</h1>
        <p className="font-mono-caps text-[11px] text-muted-foreground mb-8">{artists.length} artists</p>

        {/* Stats */}
        <div className="grid grid-cols-2 gap-4 md:grid-cols-5 mb-10">
          {[
            { label: "Artists", value: artists.length, icon: Users },
            { label: "Inquiries", value: inquiries.filter((i) => i.status === "new").length, icon: ShoppingBag, suffix: " new" },
            { label: "Forum Posts", value: posts.length, icon: FileText },
            { label: "Open Calls", value: openCalls.length, icon: FileText },
            { label: "Subscriptions", value: subs.filter((s) => s.status === "active").length, icon: Star, suffix: " active" },
          ].map(({ label, value, icon: Icon, suffix }) => (
            <div key={label} className="border border-border p-4">
              <Icon className="h-4 w-4 text-muted-foreground mb-2" />
              <p className="font-heading text-3xl">{value}{suffix}</p>
              <p className="font-mono-caps text-[10px] text-muted-foreground">{label}</p>
            </div>
          ))}
        </div>

        {/* Tabs */}
        <div className="flex gap-px border-b border-border mb-8">
          {TABS.map((t) => (
            <button key={t} onClick={() => setTab(t)}
              className={`px-5 py-3 font-mono-caps text-[11px] border-b-2 transition-colors ${tab === t ? "border-foreground text-foreground" : "border-transparent text-muted-foreground hover:text-foreground"}`}>
              {t}
            </button>
          ))}
        </div>

        {/* Artists tab */}
        {tab === "Add Listing" && (
          <AdminCreatePanel onCreated={() => window.location.reload()} />
        )}

        {tab === "Members" && <AdminMembersPanel />}

        {tab === "Editorial" && <AdminArticlesPanel user={user} />}

        {tab === "Newsletter" && <AdminSubscribersPanel />}

        {tab === "Artists" && (
          <div>
            <table className="w-full">
              <thead>
                <tr className="border-b border-border">
                  {["Artist", "Discipline", "Chapter", "Premium", "Featured", "Actions"].map((h) => (
                    <th key={h} className="pb-3 text-left font-mono-caps text-[10px] text-muted-foreground">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {artists.map((a) => (
                  <tr key={a.id} className="border-b border-border hover:bg-muted/30">
                    <td className="py-4">
                      <div className="flex items-center gap-3">
                        <div className="h-8 w-8 shrink-0 overflow-hidden rounded-full bg-muted flex items-center justify-center">
                          {a.avatar_url ? <Image src={a.avatar_url} alt={a.display_name} fittingType="fill" className="h-full w-full object-cover" /> : <span className="font-mono-caps text-[10px]">{a.display_name?.[0]}</span>}
                        </div>
                        <Link to={`/artists/${a.id}`} className="font-heading text-base hover:text-primary">{a.display_name}</Link>
                      </div>
                    </td>
                    <td className="py-4 font-mono-caps text-[11px] text-muted-foreground">{a.discipline}</td>
                    <td className="py-4 font-mono-caps text-[11px] text-muted-foreground">{a.chapter || "—"}</td>
                    <td className="py-4">
                      <button onClick={() => premiumArtist(a)}
                        className={`font-mono-caps text-[10px] px-2 py-0.5 border ${a.is_premium ? "border-primary text-primary" : "border-border text-muted-foreground"}`}>
                        {a.is_premium ? "Premium" : "Set Premium"}
                      </button>
                    </td>
                    <td className="py-4">
                      <button onClick={() => featureArtist(a)}
                        className={`font-mono-caps text-[10px] px-2 py-0.5 border ${a.is_featured ? "border-yellow-500 text-yellow-600" : "border-border text-muted-foreground"}`}>
                        {a.is_featured ? "Featured ✓" : "Feature"}
                      </button>
                    </td>
                    <td className="py-4">
                      <Link to={`/artists/${a.id}`} className="font-mono-caps text-[10px] text-primary hover:underline">View →</Link>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        {/* Inquiries tab */}
        {tab === "Inquiries" && (
          <div className="space-y-4">
            {inquiries.map((inq) => (
              <div key={inq.id} className="border border-border p-5">
                <div className="flex items-start justify-between gap-4">
                  <div>
                    <div className="flex items-center gap-3 mb-1">
                      <span className={`font-mono-caps text-[10px] uppercase ${STATUS_COLOR[inq.status]}`}>{inq.status}</span>
                      <span className="font-mono-caps text-[10px] text-muted-foreground">{inq.type}</span>
                    </div>
                    <p className="font-heading text-xl">{inq.work_title || "Commission Request"}</p>
                    <p className="font-mono-caps text-[11px] text-primary mt-0.5">For: {inq.artist_name}</p>
                    <p className="mt-2 text-sm text-muted-foreground">From: <strong>{inq.buyer_name}</strong> — {inq.buyer_email}</p>
                    <p className="mt-1 text-sm text-muted-foreground">{inq.message}</p>
                    {inq.price && <p className="mt-2 font-mono-caps text-[11px] text-primary">{inq.currency} {inq.price}</p>}
                  </div>
                  <div className="flex items-center gap-2">
                    {inq.status !== "replied" && (
                      <button onClick={() => updateInquiry(inq.id, "replied")} className="flex items-center gap-1 font-mono-caps text-[10px] border border-green-600 px-2 py-1 text-green-600 hover:bg-green-600 hover:text-white transition-colors">
                        <Check className="h-3 w-3" /> Replied
                      </button>
                    )}
                    {inq.status !== "closed" && (
                      <button onClick={() => updateInquiry(inq.id, "closed")} className="flex items-center gap-1 font-mono-caps text-[10px] border border-border px-2 py-1 text-muted-foreground hover:text-foreground transition-colors">
                        <X className="h-3 w-3" /> Close
                      </button>
                    )}
                  </div>
                </div>
              </div>
            ))}
            {inquiries.length === 0 && <p className="font-mono-caps text-[11px] text-muted-foreground py-8 text-center">No inquiries yet.</p>}
          </div>
        )}

        {/* Forum tab */}
        {tab === "Forum" && (
          <div className="space-y-2">
            {posts.map((p) => (
              <div key={p.id} className="flex items-center justify-between border-b border-border py-4">
                <div>
                  <p className="font-heading text-lg">{p.title}</p>
                  <p className="font-mono-caps text-[10px] text-muted-foreground">{p.author_name} · {p.category} · {p.reply_count} replies</p>
                </div>
                <button onClick={() => deletePost(p.id)} className="flex items-center gap-1 font-mono-caps text-[10px] border border-destructive px-2 py-1 text-destructive hover:bg-destructive hover:text-white transition-colors">
                  <Trash2 className="h-3 w-3" /> Delete
                </button>
              </div>
            ))}
            {posts.length === 0 && <p className="font-mono-caps text-[11px] text-muted-foreground py-8 text-center">No posts.</p>}
          </div>
        )}

        {/* Open Calls tab */}
        {tab === "Open Calls" && (
          <div className="space-y-2">
            {openCalls.map((c) => (
              <div key={c.id} className="flex items-center justify-between border-b border-border py-4">
                <div>
                  <p className="font-heading text-lg">{c.title}</p>
                  <p className="font-mono-caps text-[10px] text-muted-foreground">{c.organizer} · {c.type}{c.deadline ? ` · Deadline: ${c.deadline}` : ""}</p>
                </div>
                <button onClick={() => deleteOpenCall(c.id)} className="flex items-center gap-1 font-mono-caps text-[10px] border border-destructive px-2 py-1 text-destructive hover:bg-destructive hover:text-white transition-colors">
                  <Trash2 className="h-3 w-3" /> Delete
                </button>
              </div>
            ))}
            {openCalls.length === 0 && <p className="font-mono-caps text-[11px] text-muted-foreground py-8 text-center">No open calls.</p>}
          </div>
        )}

        {/* Subscriptions tab */}
        {tab === "Subscriptions" && (
          <div className="space-y-2">
            {subError && <p className="pb-3 text-sm text-destructive">{subError}</p>}
            {subs.map((s) => (
              <div key={s.id} className="flex items-center justify-between border-b border-border py-4">
                <div>
                  <p className="font-mono-caps text-[11px]">{s.plan}</p>
                  <p className="font-mono-caps text-[10px] text-muted-foreground">
                    {(() => {
                      const who = profiles.find((x) => x.id === s.user_id);
                      return who ? (who.full_name || who.email) : `Unknown member (${String(s.user_id).slice(0, 8)}…)`;
                    })()}
                    {s.expires_at ? ` · expires ${new Date(s.expires_at).toLocaleDateString()}` : ""}
                  </p>
                </div>
                <div className="flex flex-wrap items-center gap-2">
                  <span className={`font-mono-caps text-[10px] border px-2 py-0.5 ${s.status === "active" ? "border-green-600 text-green-600" : "border-border text-muted-foreground"}`}>{s.status}</span>
                  {/*
                    Marks the record inactive here only. It does NOT cancel the
                    Stripe subscription, so the member may still be billed —
                    cancel in Stripe as well, or the webhook will set it back
                    to active on the next successful payment.
                  */}
                  {s.status === "active" && (
                    <button
                      type="button"
                      onClick={() => deactivateSub(s)}
                      disabled={subBusy === s.id}
                      className="border border-border px-3 py-1 font-mono-caps text-[10px] text-muted-foreground transition-colors hover:border-destructive hover:text-destructive disabled:opacity-50"
                    >
                      {subBusy === s.id ? "Working…" : "Mark inactive"}
                    </button>
                  )}
                </div>
              </div>
            ))}
            {subs.length === 0 && <p className="font-mono-caps text-[11px] text-muted-foreground py-8 text-center">No subscriptions.</p>}
          </div>
        )}
      </div>
      <SlimFooter />
    </>
  );
}