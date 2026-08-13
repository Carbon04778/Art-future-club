import React, { useState, useEffect } from "react";
import { useNavigate, Link } from "react-router-dom";
import { base44 } from "@/api/base44Client";
import { Image } from "@/components/ui/image";
import { Pencil, ExternalLink, Instagram, MapPin, LogOut } from "lucide-react";
import SlimFooter from "@/components/SlimFooter";

export default function CollectorProfileView() {
  const navigate = useNavigate();
  const [user, setUser] = useState(null);
  const [profile, setProfile] = useState(null);
  const [collection, setCollection] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    base44.auth.me().then(async (u) => {
      setUser(u);
      try {
        const [res, collected] = await Promise.all([
          base44.entities.CollectorProfile.filter({ user_id: u.id }),
          base44.entities.CollectedWork.filter({ user_id: u.id }, "-created_date", 60),
        ]);
        if (res.length > 0) {
          const p = res[0];
          // Galleries have their own preview page.
          if (p.type === "Gallery") { navigate(`/gallery/${p.id}`, { replace: true }); return; }
          setProfile(p);
        }
        setCollection(collected);
      } catch {}
      setLoading(false);
    }).catch(() => navigate("/login"));
  }, []);

  const removeFromCollection = async (id) => {
    await base44.entities.CollectedWork.delete(id);
    setCollection((c) => c.filter((w) => w.id !== id));
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[60vh]">
        <div className="w-6 h-6 border-2 border-border border-t-foreground rounded-full animate-spin" />
      </div>
    );
  }

  if (!profile) {
    return (
      <>
        <div className="mx-auto max-w-2xl px-6 py-24 text-center">
          <h1 className="font-heading text-4xl font-medium tracking-[-0.02em] mb-4">No profile yet</h1>
          <p className="text-muted-foreground mb-8">Create your collector profile to signal your intent to the AFC artist community.</p>
          <button onClick={() => navigate("/collector-profile")} className="bg-primary px-8 py-4 font-mono-caps text-[11px] text-primary-foreground hover:opacity-80">
            Create Profile →
          </button>
        </div>
        <SlimFooter />
      </>
    );
  }

  const initials = (profile.display_name || "?").trim().split(/\s+/).map((w) => w[0]).slice(0, 2).join("");

  return (
    <>

      <div className="mx-auto max-w-4xl px-6 py-16 md:px-10">
        {/* Header */}
        <div className="flex flex-col gap-8 md:flex-row md:items-end md:justify-between border-b border-border pb-10">
          <div className="flex items-start gap-6">
            <div className="h-24 w-24 shrink-0 overflow-hidden rounded-full bg-muted flex items-center justify-center">
              {profile.avatar_url ? <Image src={profile.avatar_url} alt={profile.display_name} fittingType="fill" className="h-full w-full object-cover" /> : <span className="font-heading text-3xl text-muted-foreground">{initials}</span>}
            </div>
            <div>
              <p className="font-mono-caps text-[11px] text-primary mb-2">{profile.type}</p>
              <h1 className="font-heading text-5xl font-medium tracking-[-0.02em]">{profile.display_name}</h1>
              {profile.based_in && (
                <p className="mt-3 flex items-center gap-1.5 text-muted-foreground"><MapPin className="h-3 w-3" />{profile.based_in}</p>
              )}
            </div>
          </div>
          <div className="flex items-center gap-3">
            <button onClick={() => navigate("/collector-profile")} className="flex items-center gap-2 border border-border px-5 py-3 font-mono-caps text-[11px] hover:border-foreground transition-colors">
              <Pencil className="h-3 w-3" /> Edit Profile
            </button>
            <button onClick={() => base44.auth.logout()} className="flex items-center gap-2 border border-border px-5 py-3 font-mono-caps text-[11px] hover:border-foreground transition-colors">
              <LogOut className="h-3 w-3" /> Log Out
            </button>
          </div>
        </div>

        {/* Bio */}
        {profile.bio && (
          <div className="py-10 border-b border-border">
            <p className="font-mono-caps text-[11px] text-muted-foreground mb-4">About</p>
            <p className="text-lg leading-relaxed text-foreground/90 whitespace-pre-line">{profile.bio}</p>
          </div>
        )}

        {/* Collection focus */}
        {(profile.interests?.length > 0 || profile.seeking?.length > 0 || profile.budget_range) && (
          <div className="py-10 border-b border-border space-y-8">
            <p className="font-mono-caps text-[11px] text-muted-foreground">Collection Focus</p>
            {profile.interests?.length > 0 && (
              <div>
                <p className="font-mono-caps text-[10px] text-muted-foreground/60 mb-3">Disciplines of Interest</p>
                <div className="flex flex-wrap gap-2">
                  {profile.interests.map((i) => <span key={i} className="font-mono-caps text-[11px] px-3 py-1.5 border border-border">{i}</span>)}
                </div>
              </div>
            )}
            {profile.seeking?.length > 0 && (
              <div>
                <p className="font-mono-caps text-[10px] text-muted-foreground/60 mb-3">Seeking</p>
                <div className="flex flex-wrap gap-2">
                  {profile.seeking.map((s) => <span key={s} className="font-mono-caps text-[11px] px-3 py-1.5 border border-accent/40 text-accent">{s}</span>)}
                </div>
              </div>
            )}
            {profile.budget_range && (
              <div>
                <p className="font-mono-caps text-[10px] text-muted-foreground/60 mb-3">Budget Range</p>
                <p className="font-mono-caps text-[11px]">{profile.budget_range}</p>
              </div>
            )}
          </div>
        )}

        {/* Links */}
        {(profile.website || profile.instagram) && (
          <div className="py-10 space-y-4 border-b border-border">
            <p className="font-mono-caps text-[11px] text-muted-foreground">Links</p>
            <div className="flex flex-col gap-3">
              {profile.website && (
                <a href={profile.website} target="_blank" rel="noreferrer" className="inline-flex items-center gap-2 font-mono-caps text-[11px] text-primary hover:opacity-80">
                  <ExternalLink className="h-3 w-3" /> {profile.website.replace(/^https?:\/\//, "")}
                </a>
              )}
              {profile.instagram && (
                <a href={`https://instagram.com/${profile.instagram.replace(/^@/, "")}`} target="_blank" rel="noreferrer" className="inline-flex items-center gap-2 font-mono-caps text-[11px] text-primary hover:opacity-80">
                  <Instagram className="h-3 w-3" /> {profile.instagram}
                </a>
              )}
            </div>
          </div>
        )}

        {/* Collection gallery */}
        <div className="py-10">
          <div className="flex items-end justify-between mb-8">
            <div>
              <p className="font-mono-caps text-[11px] text-muted-foreground">My Collection</p>
              <p className="mt-2 font-heading text-2xl tracking-[-0.01em]">{collection.length} {collection.length === 1 ? "work" : "works"}</p>
            </div>
          </div>
          {collection.length === 0 ? (
            <div className="border border-dashed border-border p-12 text-center">
              <p className="text-muted-foreground mb-2">No works collected yet.</p>
              <p className="font-mono-caps text-[11px] text-muted-foreground/60">Browse artist profiles and tap <span className="text-primary">Collect</span> to build your gallery.</p>
              <Link to="/artists" className="inline-block mt-6 border border-border px-5 py-3 font-mono-caps text-[11px] hover:border-foreground transition-colors">Discover Artists →</Link>
            </div>
          ) : (
            <div className="grid grid-cols-1 gap-8 md:grid-cols-2 lg:grid-cols-3">
              {collection.map((w) => (
                <div key={w.id} className="group">
                  {w.work_image_url && (
                    <Image src={w.work_image_url} alt={w.work_title} fittingType="fill" className="aspect-[4/5] w-full mb-4" />
                  )}
                  <div className="flex items-start justify-between gap-2">
                    <div>
                      <h3 className="font-heading text-xl tracking-[-0.01em]">{w.work_title || "Untitled"}</h3>
                      {w.artist_name && (
                        <Link to={`/artists/${w.artist_id}`} className="mt-1 inline-block font-mono-caps text-[11px] text-primary hover:opacity-80">{w.artist_name}</Link>
                      )}
                      <p className="mt-1 font-mono-caps text-[11px] text-muted-foreground">
                        {[w.work_medium, w.work_dimensions, w.work_year].filter(Boolean).join(" · ")}
                      </p>
                    </div>
                    {w.work_price && (
                      <p className="shrink-0 font-mono-caps text-[11px] text-primary">{w.work_currency || "USD"} {w.work_price}</p>
                    )}
                  </div>
                  {w.work_description && (
                    <p className="mt-3 text-sm text-muted-foreground leading-relaxed line-clamp-3">{w.work_description}</p>
                  )}
                  <div className="mt-4 border-t border-border pt-3 flex items-center justify-between">
                    <Link to={`/artists/${w.artist_id}`} className="font-mono-caps text-[10px] text-muted-foreground hover:text-primary">View Artist →</Link>
                    <button onClick={() => removeFromCollection(w.id)} className="font-mono-caps text-[10px] text-muted-foreground hover:text-destructive transition-colors">Remove</button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
      <SlimFooter />
    </>
  );
}