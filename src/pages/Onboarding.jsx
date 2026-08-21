import React, { useState, useEffect } from "react";
import { isVenueType } from "@/lib/venueTypes";
import { useNavigate } from "react-router-dom";
import { base44 } from "@/api/base44Client";
import { Loader2, ChevronRight } from "lucide-react";
import { CHAPTER_OPTIONS } from "@/lib/chaptersData";

const STEPS = ["Welcome", "Your Role", "Your Profile", "Done"];
const DISCIPLINES = ["Painting", "Sculpture", "Photography", "Installation", "Video Art", "Performance", "Drawing", "Printmaking", "Ceramics", "Sound Art", "Digital Art", "Mixed Media", "Other"];
const CHAPTERS = CHAPTER_OPTIONS;

export default function Onboarding() {
  const navigate = useNavigate();
  const [step, setStep] = useState(0);
  const [user, setUser] = useState(null);
  const [role, setRole] = useState(null); // "artist" | "collector" | "gallery"
  const [form, setForm] = useState({ display_name: "", discipline: "", chapter: "", based_in: "", bio: "" });
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    let alive = true;
    base44.auth.me().then(async (u) => {
      if (!alive) return;
      setUser(u);
      setForm((f) => ({ ...f, display_name: u.full_name || "" }));
      try {
        // If an admin created a listing for this person's email before they
        // registered, attach it to their new account first. They then land on
        // a profile already filled in rather than an empty onboarding form.
        await base44.auth.claimMyProfile?.();
      } catch {
        // Nothing to claim, or migration 013 not run — carry on as normal.
      }

      // Skip onboarding for users who already have a profile — send them to it.
      try {
        const [artists, collectors] = await Promise.all([
          base44.entities.ArtistProfile.filter({ user_id: u.id }),
          base44.entities.CollectorProfile.filter({ user_id: u.id }),
        ]);
        if (!alive) return;
        if (artists.length > 0) return navigate(`/artists/${artists[0].id}`, { replace: true });
        const gallery = collectors.find((c) => c.type === "Gallery");
        const venue = collectors.find((c) => isVenueType(c.type));
        if (gallery) return navigate(`/gallery/${gallery.id}`, { replace: true });
        if (venue) return navigate(`/venues/${venue.id}`, { replace: true });
        if (collectors.length > 0) return navigate("/collector-profile/view", { replace: true });
      } catch {}
    }).catch(() => navigate("/login"));
    return () => { alive = false; };
  }, []);

  const set = (k, v) => setForm((f) => ({ ...f, [k]: v }));

  const handleFinish = async () => {
    setSaving(true);
    if (role === "artist") {
      const existing = await base44.entities.ArtistProfile.filter({ user_id: user.id });
      if (existing.length === 0) {
        await base44.entities.ArtistProfile.create({ ...form, user_id: user.id });
      }
      navigate("/profile/edit");
    } else {
      const profileType = role === "gallery" ? "Gallery" : role === "venue" ? "Institution" : "Collector";
      const existing = await base44.entities.CollectorProfile.filter({ user_id: user.id });
      let collectorId;
      if (existing.length === 0) {
        const created = await base44.entities.CollectorProfile.create({ display_name: form.display_name, type: profileType, user_id: user.id });
        collectorId = created.id;
      } else {
        collectorId = existing[0].id;
        await base44.entities.CollectorProfile.update(existing[0].id, { type: profileType, display_name: form.display_name });
      }
      // Galleries and venues have their own profile pages; collectors use the collector form.
      navigate(role === "gallery" ? `/gallery/${collectorId}` : role === "venue" ? `/venues/${collectorId}` : "/collector-profile");
    }
    setSaving(false);
  };

  const progress = ((step + 1) / STEPS.length) * 100;
  const input = "w-full border border-border bg-transparent px-4 py-3 text-base outline-none focus:border-foreground";

  return (
    <div className="min-h-screen flex flex-col items-center justify-center px-6 py-16">
      {/* Progress */}
      <div className="w-full max-w-md mb-12">
        <div className="flex justify-between mb-3">
          {STEPS.map((s, i) => (
            <span key={s} className={`font-mono-caps text-[10px] ${i === step ? "text-foreground" : "text-muted-foreground"}`}>{s}</span>
          ))}
        </div>
        <div className="h-px bg-border w-full relative">
          <div className="h-px bg-primary transition-all duration-500" style={{ width: `${progress}%` }} />
        </div>
      </div>

      <div className="w-full max-w-md">
        {/* Step 0: Welcome */}
        {step === 0 && (
          <div className="text-center">
            <img
              src="/images/artfuture.png"
              alt="Art Future Club"
              className="h-14 w-auto mx-auto mb-6"
            />
            <h1 className="font-heading text-5xl font-medium tracking-[-0.02em] mb-6">Welcome{user?.full_name ? `, ${user.full_name.split(" ")[0]}` : ""}.</h1>
            <p className="text-lg text-muted-foreground mb-12">You're joining a <span className="text-primary">global network</span> of <span className="text-accent">artists, collectors, curators and galleries</span>. Let's set up your profile in a few steps.</p>
            <button onClick={() => setStep(1)} className="w-full flex items-center justify-center gap-2 bg-primary py-4 font-mono-caps text-[11px] text-primary-foreground hover:opacity-80">
              Get Started <ChevronRight className="h-3 w-3" />
            </button>
          </div>
        )}

        {/* Step 1: Role */}
        {step === 1 && (
          <div>
            <h2 className="font-heading text-4xl font-medium tracking-[-0.02em] mb-4">How would you describe yourself?</h2>
            <p className="text-muted-foreground mb-8">This helps us <span className="text-primary">personalise</span> your <span className="text-accent">experience</span>. You can always change this later.</p>
            <div className="space-y-3 mb-10">
              {[
                { key: "artist", label: "Artist / Practitioner", desc: "I create work and want to share my practice." },
                { key: "collector", label: "Collector", desc: "I collect, commission, and support artists." },
                { key: "gallery", label: "Gallery & Museum", desc: "I run a gallery or institution and exhibit artists." },
                { key: "venue", label: "Venue / Space", desc: "I host exhibitions, events, and cultural programming." },
              ].map(({ key, label, desc }) => (
                <button key={key} type="button" onClick={() => setRole(key)}
                  className={`w-full text-left border p-5 transition-colors ${role === key ? "border-foreground bg-foreground text-background" : "border-border hover:border-foreground"}`}>
                  <p className="font-mono-caps text-[11px] mb-1">{label}</p>
                  <p className={`text-sm ${role === key ? "text-background/70" : "text-muted-foreground"}`}>{desc}</p>
                </button>
              ))}
            </div>
            <div className="flex gap-4">
              <button onClick={() => setStep(0)} className="font-mono-caps text-[11px] text-muted-foreground">← Back</button>
              <button onClick={() => setStep(2)} disabled={!role} className="flex-1 flex items-center justify-center gap-2 bg-primary py-4 font-mono-caps text-[11px] text-primary-foreground hover:opacity-80 disabled:opacity-40">
                Continue <ChevronRight className="h-3 w-3" />
              </button>
            </div>
          </div>
        )}

        {/* Step 2: Basic profile */}
        {step === 2 && (
          <div>
            <h2 className="font-heading text-4xl font-medium tracking-[-0.02em] mb-4">Tell us about yourself</h2>
            <p className="text-muted-foreground mb-8">Just the essentials — you can add more from your profile page.</p>
            <div className="space-y-5 mb-10">
              <div>
                <label className="font-mono-caps text-[11px] text-muted-foreground">Display Name *</label>
                <input className={`${input} mt-2`} value={form.display_name} onChange={(e) => set("display_name", e.target.value)} placeholder="Your name or studio" required />
              </div>
              {role === "artist" && (
                <>
                  <div>
                    <label className="font-mono-caps text-[11px] text-muted-foreground">Primary Discipline</label>
                    <select className="w-full border border-border bg-background px-4 py-3 text-base outline-none mt-2" value={form.discipline} onChange={(e) => set("discipline", e.target.value)}>
                      <option value="">Select…</option>
                      {DISCIPLINES.map((d) => <option key={d}>{d}</option>)}
                    </select>
                  </div>
                  <div>
                    <label className="font-mono-caps text-[11px] text-muted-foreground">AFC Chapter</label>
                    <select className="w-full border border-border bg-background px-4 py-3 text-base outline-none mt-2" value={form.chapter} onChange={(e) => set("chapter", e.target.value)}>
                      <option value="">Not yet / Other</option>
                      {CHAPTERS.map((c) => <option key={c}>{c}</option>)}
                    </select>
                    {form.chapter === "Other" && (
                      <>
                        {/* Stored in based_in so chapter filters stay clean. */}
                        <input
                          className="w-full border border-border bg-background px-4 py-3 text-base outline-none mt-3"
                          value={form.based_in}
                          onChange={(e) => set("based_in", e.target.value)}
                          placeholder="Which city are you based in?"
                        />
                        <p className="mt-2 text-xs text-muted-foreground">
                          No chapter there yet — tell us your city.
                        </p>
                      </>
                    )}
                  </div>
                  <div>
                    <label className="font-mono-caps text-[11px] text-muted-foreground">Brief Bio</label>
                    <textarea className={`${input} mt-2 resize-none`} rows={3} value={form.bio} onChange={(e) => set("bio", e.target.value)} placeholder="A sentence about your practice…" />
                  </div>
                </>
              )}
            </div>
            <div className="flex gap-4">
              <button onClick={() => setStep(1)} className="font-mono-caps text-[11px] text-muted-foreground">← Back</button>
              <button onClick={() => setStep(3)} disabled={!form.display_name} className="flex-1 flex items-center justify-center gap-2 bg-primary py-4 font-mono-caps text-[11px] text-primary-foreground hover:opacity-80 disabled:opacity-40">
                Continue <ChevronRight className="h-3 w-3" />
              </button>
            </div>
          </div>
        )}

        {/* Step 3: Done */}
        {step === 3 && (
          <div className="text-center">
            <div className="w-16 h-16 border border-primary rounded-full flex items-center justify-center mx-auto mb-8">
              <span className="font-heading text-2xl text-primary">✓</span>
            </div>
            <h2 className="font-heading text-4xl font-medium tracking-[-0.02em] mb-4">You're all set.</h2>
            <p className="text-muted-foreground mb-12">Your profile has been created. Now complete it with your full portfolio and social links to connect with the network.</p>
            <button onClick={handleFinish} disabled={saving} className="w-full flex items-center justify-center gap-2 bg-primary py-4 font-mono-caps text-[11px] text-primary-foreground hover:opacity-80 disabled:opacity-50">
              {saving && <Loader2 className="h-3 w-3 animate-spin" />}
              Complete My Profile →
            </button>
          </div>
        )}
      </div>
    </div>
  );
}