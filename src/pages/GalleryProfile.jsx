import React, { useState, useEffect } from "react";
import { isVenueType } from "@/lib/venueTypes";
import { Link, useParams } from "react-router-dom";
import { base44 } from "@/api/base44Client";
import { Image } from "@/components/ui/image";
import { ArrowLeft, Plus, X, Loader2, ShoppingBag, ExternalLink, Instagram } from "lucide-react";
import SlimFooter from "@/components/SlimFooter";
import InquiryModal from "@/components/InquiryModal";
import LikeButton from "@/components/LikeButton";
import CollectButton from "@/components/CollectButton";
import FollowButton from "@/components/FollowButton";
import ShareButtons from "@/components/ShareButtons";
import CommentsSection from "@/components/CommentsSection";
import SpaceGallery from "@/components/gallery/SpaceGallery";
import ExhibitionsSection from "@/components/gallery/ExhibitionsSection";
import GalleryAddressMap from "@/components/gallery/GalleryAddressMap";
import { Mail, Phone, Clock, MapPin } from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";
import { useGallerySeoMeta } from "@/hooks/useGallerySeoMeta";
import GeoAddressField from "@/components/gallery/GeoAddressField";

const INTERESTS = ["Painting", "Sculpture", "Photography", "Installation", "Video Art", "Performance", "Drawing", "Ceramics", "Digital Art", "Mixed Media"];
const SEEKING = ["Emerging Artists", "Established Artists", "Commissions", "Editions", "Gallery Partnerships"];
const BUDGETS = ["Under $1k", "$1k–$5k", "$5k–$20k", "$20k–$100k", "$100k+"];

export default function GalleryProfile() {
  const { id } = useParams();
  const [profile, setProfile] = useState(null);
  const [works, setWorks] = useState([]);
  const [events, setEvents] = useState([]);
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);
  const [showAdd, setShowAdd] = useState(false);
  const [selected, setSelected] = useState(null);
  const [showInquiry, setShowInquiry] = useState(false);
  const [editMode, setEditMode] = useState(false);
  const [showUpgrade, setShowUpgrade] = useState(false);

  useEffect(() => {
    base44.entities.CollectorProfile.get(id).then((p) => {
      setProfile(p);
      base44.entities.GalleryWork.filter({ artist_id: p.user_id }).then(setWorks);
      base44.entities.Event.filter({ organizer_id: p.user_id }, "start_date").then((list) => setEvents(list.filter((e) => (p.user_id && e.organizer_id === p.user_id) || (!e.organizer_id && e.organizer_name === p.display_name)))).catch(() => setEvents([]));
      setLoading(false);
    }).catch(() => setLoading(false));
    base44.auth.me().then((u) => setUser(u)).catch(() => {});
  }, [id]);

  const isOwner = user?.id === profile?.user_id || user?.role === "admin";

  const reloadWorks = () => base44.entities.GalleryWork.filter({ artist_id: profile.user_id }).then(setWorks);
  const reloadEvents = () => base44.entities.Event.filter({ organizer_id: profile.user_id }, "start_date").then((list) => setEvents(list.filter((e) => (profile.user_id && e.organizer_id === profile.user_id) || (!e.organizer_id && e.organizer_name === profile.display_name)))).catch(() => setEvents([]));
  const onProfileSaved = (p) => { setProfile(p); setEditMode(false); };
  const onProfileUpdated = (p) => setProfile(p);

  useGallerySeoMeta(profile);


  if (loading) {
    return (
      <>
        <div className="flex items-center justify-center py-40"><Loader2 className="h-6 w-6 animate-spin text-muted-foreground" /></div>
        <SlimFooter />
      </>
    );
  }
  if (!profile) {
    return (
      <>
        <div className="px-6 py-32 text-center">
          <p className="font-mono-caps text-[11px] text-muted-foreground">Gallery not found.</p>
          <Link to="/gallery" className="mt-4 inline-flex items-center gap-1 font-mono-caps text-[11px] text-primary hover:underline"><ArrowLeft className="h-3 w-3" /> Back to Galleries</Link>
        </div>
        <SlimFooter />
      </>
    );
  }

  return (
    <>

      <div className="px-6 pt-10 md:px-10">
        <Link to={isVenueType(profile.type) ? "/venues" : "/gallery"} className="inline-flex items-center gap-1 font-mono-caps text-[11px] text-muted-foreground hover:text-foreground">
          <ArrowLeft className="h-3 w-3" /> {isVenueType(profile.type) ? "All Venues" : "All Galleries"}
        </Link>
      </div>

      {editMode && isOwner ? (
        <GalleryEditForm profile={profile} onSave={onProfileSaved} onCancel={() => setEditMode(false)} />
      ) : (
        <ProfileHeader profile={profile} isOwner={isOwner} onEdit={() => setEditMode(true)} />
      )}

      <div className="px-6 pb-24 md:px-10">
        <SpaceGallery profile={profile} isOwner={isOwner} onUpdated={onProfileUpdated} />
        <ExhibitionsSection profile={profile} isOwner={isOwner} events={events} onReload={reloadEvents} />

        <div className="mt-16 flex items-end justify-between border-b border-border pb-4">
          <h2 className="font-heading text-3xl tracking-[-0.01em]">Works</h2>
          {isOwner && (
            <button onClick={() => (works.length >= 4 ? setShowUpgrade(true) : setShowAdd(true))} className="flex items-center gap-2 bg-primary px-4 py-2 font-mono-caps text-[11px] text-primary-foreground hover:opacity-80">
              <Plus className="h-3 w-3" /> Add Work
            </button>
          )}
        </div>

        {works.length === 0 ? (
          <div className="mt-12 border border-border py-16 text-center">
            <p className="font-mono-caps text-[11px] text-muted-foreground">No works uploaded yet.</p>
            {isOwner && <button onClick={() => setShowAdd(true)} className="mt-4 font-mono-caps text-[11px] text-primary hover:underline">Upload your first work →</button>}
          </div>
        ) : (
          <div className="mt-10 columns-1 gap-6 sm:columns-2 lg:columns-3">
            {works.map((work, i) => (
              <motion.div
                key={work.id}
                initial={{ opacity: 0, y: 12 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.4, delay: i * 0.03 }}
                className="mb-6 break-inside-avoid cursor-pointer group"
                onClick={() => setSelected(work)}
                data-artwork
              >
                <div className="overflow-hidden bg-muted">
                  <Image src={work.image_url} alt={work.title} fittingType="fit" className="w-full group-hover:scale-[1.02] transition-transform duration-500" />
                </div>
                <div className="mt-3">
                  {work.artist_name && (
                    <p className="font-mono-caps text-[10px] text-primary mb-1">{work.artist_name}{work.artist_discipline ? ` · ${work.artist_discipline}` : ""}</p>
                  )}
                  <div className="flex items-start justify-between gap-2">
                    <div>
                      <p className="font-heading text-lg tracking-[-0.01em]">{work.title}</p>
                      <p className="font-mono-caps text-[10px] text-muted-foreground mt-0.5">{work.year ? `${work.year}` : ""}{work.medium ? ` · ${work.medium}` : ""}</p>
                    </div>
                    {work.available_for_sale && <span className="font-mono-caps text-[10px] border border-primary px-1.5 py-0.5 text-primary shrink-0">{work.currency || "USD"} {work.price}</span>}
                  </div>
                  {work.description && <p className="mt-2 text-xs text-muted-foreground/70 leading-relaxed line-clamp-2">{work.description}</p>}
                  {work.tags && work.tags.length > 0 && (
                    <div className="flex flex-wrap gap-1.5 mt-2">
                      {work.tags.slice(0, 4).map((t) => (
                        <span key={t} className="font-mono-caps text-[9px] border border-border px-1.5 py-0.5 text-muted-foreground/70">{t}</span>
                      ))}
                    </div>
                  )}
                </div>
              </motion.div>
            ))}
          </div>
        )}

        <div className="mt-16">
          <GalleryAddressMap profile={profile} />
        </div>
      </div>

      {/* lightbox */}
      <AnimatePresence>
        {selected && (
          <motion.div
            initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
            className="fixed inset-0 z-50 bg-background/95 backdrop-blur-sm flex items-center justify-center p-6"
            onClick={() => setSelected(null)}
          >
            <button className="absolute top-6 right-6 p-2 hover:text-primary" onClick={() => setSelected(null)}><X className="h-5 w-5" /></button>
            <motion.div
              initial={{ scale: 0.95, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} exit={{ scale: 0.95, opacity: 0 }}
              className="max-w-4xl w-full grid grid-cols-1 md:grid-cols-2 gap-10 items-start"
              onClick={(e) => e.stopPropagation()}
            >
              <div className="overflow-hidden bg-muted">
                <Image src={selected.image_url} alt={selected.title} fittingType="fit" className="w-full max-h-[70vh]" />
              </div>
              <div className="py-4">
                <h2 className="font-heading text-4xl font-medium tracking-[-0.02em]">{selected.title}</h2>
                <p className="mt-2 font-mono-caps text-[11px] text-muted-foreground">{[selected.medium, selected.dimensions, selected.year].filter(Boolean).join(" · ")}</p>
                {selected.artist_name && (
                  <p className="mt-3 font-mono-caps text-[12px] text-primary">
                    Artist: {selected.artist_name}{selected.artist_discipline ? ` · ${selected.artist_discipline}` : ""}
                  </p>
                )}
                {selected.description && <p className="mt-3 text-sm text-muted-foreground leading-relaxed">{selected.description}</p>}
                {selected.tags && selected.tags.length > 0 && (
                  <div className="flex flex-wrap gap-2 mt-4">
                    {selected.tags.map((t) => (
                      <span key={t} className="font-mono-caps text-[10px] border border-border px-2 py-1 text-muted-foreground">{t}</span>
                    ))}
                  </div>
                )}
                {selected.available_for_sale && (
                  <div className="mt-6">
                    <p className="font-heading text-2xl">{selected.currency || "USD"} {selected.price}</p>
                    <button
                      onClick={(e) => { e.stopPropagation(); setShowInquiry(true); }}
                      className="mt-3 inline-flex items-center gap-2 bg-primary px-6 py-3 font-mono-caps text-[11px] text-primary-foreground hover:opacity-80"
                    >
                      <ShoppingBag className="h-3.5 w-3.5" /> Enquire to Purchase
                    </button>
                  </div>
                )}
                <div className="mt-6 pt-6 border-t border-border space-y-4">
                  {/* Primary actions wrap rather than overflow; sharing sits on
                      its own line so the icons never collide with the labels. */}
                  <div className="flex flex-wrap items-center gap-x-5 gap-y-3">
                    <LikeButton targetId={selected.id} targetType="gallery_work" userId={user?.id} />
                    <CollectButton
                      userId={user?.id}
                      artistId={selected.artist_id || id}
                      artistName={selected.artist_name || profile.display_name}
                      work={selected}
                      workRef={`gallery-work-${selected.id}`}
                    />
                    <FollowButton artistProfile={{ user_id: profile.user_id, display_name: profile.display_name }} currentUserId={user?.id} />
                  </div>
                  <div className="flex flex-wrap items-center gap-x-5 gap-y-3">
                    <ShareButtons url={`${window.location.origin}/gallery/${id}`} title={`${selected.title} by ${profile.display_name}`} compact />
                  </div>
                  <CommentsSection targetId={selected.id} targetType="gallery_work" userId={user?.id} userName={user?.full_name || profile.display_name} ownerId={profile.user_id} ownerLabel={selected.title ? `"${selected.title}"` : "your work"} />
                </div>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {showInquiry && selected && (
        <InquiryModal
          work={selected}
          artistProfile={{ display_name: selected.artist_name || profile.display_name, user_id: profile.user_id }}
          type="purchase"
          onClose={() => setShowInquiry(false)}
        />
      )}

      {showAdd && isOwner && (
        <GalleryWorkModal
          profile={profile}
          onClose={() => setShowAdd(false)}
          onCreated={() => { setShowAdd(false); reloadWorks(); }}
        />
      )}

      {showUpgrade && (
        <div className="fixed inset-0 z-[70] bg-background/90 backdrop-blur-sm flex items-center justify-center p-6" onClick={() => setShowUpgrade(false)}>
          <div className="bg-card border border-border w-full max-w-md p-8" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between mb-4">
              <span className="font-mono-caps text-[11px] text-primary">Membership Required</span>
              <button onClick={() => setShowUpgrade(false)}><X className="h-4 w-4 text-muted-foreground" /></button>
            </div>
            <h3 className="font-heading text-3xl tracking-[-0.02em]">You’ve reached the free limit</h3>
            <p className="mt-3 text-sm text-muted-foreground leading-relaxed">
              Free gallery & venue profiles can showcase up to <span className="text-foreground">4 artworks</span> and post <span className="text-foreground">1 exhibition per month</span>. To add more, upgrade your membership.
            </p>
            <div className="mt-6 flex items-center gap-3">
              <Link to="/upgrade" className="bg-primary px-6 py-3 font-mono-caps text-[11px] text-primary-foreground hover:opacity-80">Upgrade Membership ↑</Link>
              <button onClick={() => setShowUpgrade(false)} className="font-mono-caps text-[11px] text-muted-foreground hover:text-foreground">Maybe later</button>
            </div>
          </div>
        </div>
      )}

      <SlimFooter />
    </>
  );
}

function ProfileHeader({ profile, isOwner, onEdit }) {
  const typeLabel = profile.type === "Gallery" ? "Gallery / Museum" : profile.type;
  return (
    <div>
      {profile.cover_image_url && (
        <div className="px-6 md:px-10 mt-8">
          <div className="relative h-56 md:h-72 w-full overflow-hidden bg-muted">
            <Image src={profile.cover_image_url} alt={profile.display_name} fittingType="fill" className="h-full w-full object-cover" data-artwork />
          </div>
        </div>
      )}
      <div className="px-6 md:px-10 pt-10">
        <div className="flex flex-col md:flex-row gap-10 items-start">
          <div className="h-32 w-32 shrink-0 overflow-hidden rounded-full bg-muted flex items-center justify-center ring-4 ring-background">
            {profile.avatar_url
              ? <Image src={profile.avatar_url} alt={profile.display_name} fittingType="fill" className="h-full w-full object-cover" />
              : <span className="font-mono-caps text-5xl text-muted-foreground">{profile.display_name?.[0]}</span>}
          </div>
          <div className="flex-1">
            <div className="flex items-start justify-between gap-4 flex-wrap">
              <div>
                <div className="flex items-center gap-2 flex-wrap">
                  <p className="font-mono-caps text-[11px] text-primary">{typeLabel}</p>
                  {profile.partnership_type && (
                    <span className={`font-mono-caps text-[9px] px-2 py-0.5 ${profile.partnership_type === 'Paid Member' ? 'border border-primary text-primary' : 'border border-highlight text-highlight'}`}>
                      {profile.partnership_type}
                    </span>
                  )}
                </div>
                <h1 className="mt-1 font-heading text-5xl font-medium tracking-[-0.02em] md:text-6xl">{profile.display_name}</h1>
                {profile.based_in && <p className="mt-2 font-mono-caps text-[11px] text-muted-foreground">{profile.based_in}</p>}
              </div>
              {isOwner && (
                <button onClick={onEdit} className="font-mono-caps text-[11px] border border-foreground px-4 py-2 hover:bg-foreground hover:text-background">Edit Profile</button>
              )}
            </div>
            {profile.bio && <p className="mt-5 text-base text-muted-foreground leading-relaxed max-w-2xl">{profile.bio}</p>}

            {/* contact & visit details */}
            <div className="mt-6 flex flex-wrap gap-x-6 gap-y-2 font-mono-caps text-[11px] text-muted-foreground">
              {profile.address && (
                <a
                  href={`https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(profile.address)}`}
                  target="_blank"
                  rel="noreferrer"
                  className="flex items-center gap-1.5 hover:text-primary"
                >
                  <MapPin className="h-3 w-3" /> {profile.address}
                </a>
              )}
              {profile.opening_hours && <span className="flex items-center gap-1.5"><Clock className="h-3 w-3" /> {profile.opening_hours}</span>}
              {profile.phone && <a href={`tel:${profile.phone}`} className="flex items-center gap-1.5 hover:text-primary"><Phone className="h-3 w-3" /> {profile.phone}</a>}
              {profile.email && <a href={`mailto:${profile.email}`} className="flex items-center gap-1.5 hover:text-primary"><Mail className="h-3 w-3" /> {profile.email}</a>}
            </div>

            <div className="mt-6 flex flex-wrap gap-2">
              {(profile.interests || []).map((i) => (
                <span key={i} className="font-mono-caps text-[10px] border border-border px-2 py-1 text-muted-foreground">{i}</span>
              ))}
              {(profile.seeking || []).map((s) => (
                <span key={s} className="font-mono-caps text-[10px] border border-accent px-2 py-1 text-accent">Seeking: {s}</span>
              ))}
            </div>
            <div className="mt-6 flex flex-wrap gap-4">
              {profile.website && <a href={profile.website} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 font-mono-caps text-[11px] text-muted-foreground hover:text-primary"><ExternalLink className="h-3 w-3" /> Website</a>}
              {profile.instagram && <a href={`https://instagram.com/${profile.instagram.replace(/^@/, "")}`} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 font-mono-caps text-[11px] text-muted-foreground hover:text-primary"><Instagram className="h-3 w-3" /> {profile.instagram}</a>}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

function GalleryEditForm({ profile, onSave, onCancel }) {
  const [form, setForm] = useState({
    display_name: profile.display_name || "",
    based_in: profile.based_in || "",
    bio: profile.bio || "",
    website: profile.website || "",
    instagram: profile.instagram || "",
    facebook: profile.facebook || "",
    linkedin: profile.linkedin || "",
    avatar_url: profile.avatar_url || "",
    cover_image_url: profile.cover_image_url || "",
    address: profile.address || "",
    opening_hours: profile.opening_hours || "",
    phone: profile.phone || "",
    email: profile.email || "",
    interests: profile.interests || [],
    seeking: profile.seeking || [],
    budget_range: profile.budget_range || "",
    seo_title: profile.seo_title || "",
    seo_description: profile.seo_description || "",
    seo_keywords: profile.seo_keywords || "",
    geo_address: profile.geo_placename && profile.address ? profile.address : "",
    geo_placename: profile.geo_placename || "",
    geo_region: profile.geo_region || "",
    geo_lat: profile.geo_lat ?? "",
    geo_lng: profile.geo_lng ?? "",
  });
  const [avatarFile, setAvatarFile] = useState(null);
  const [coverFile, setCoverFile] = useState(null);
  const [saving, setSaving] = useState(false);
  const set = (k, v) => setForm((f) => ({ ...f, [k]: v }));
  const toggle = (key, val) => set(key, form[key].includes(val) ? form[key].filter((x) => x !== val) : [...form[key], val]);
  const input = "w-full border border-border bg-transparent px-4 py-3 text-base outline-none focus:border-foreground";

  const submit = async (e) => {
    e.preventDefault();
    setSaving(true);
    let avatar_url = form.avatar_url;
    if (avatarFile) { const r = await base44.integrations.Core.UploadFile({ file: avatarFile }); avatar_url = r.file_url; }
    let cover_image_url = form.cover_image_url;
    if (coverFile) { const r = await base44.integrations.Core.UploadFile({ file: coverFile }); cover_image_url = r.file_url; }
    const { geo_address, ...payload } = form;
    const updated = await base44.entities.CollectorProfile.update(profile.id, { ...payload, avatar_url, cover_image_url, type: profile.type, user_id: profile.user_id });
    setSaving(false);
    onSave(updated);
  };

  return (
    <form onSubmit={submit} className="px-6 md:px-10 pt-10 mx-auto max-w-3xl space-y-10">
      <div className="flex items-start gap-8">
        <div className="h-24 w-24 shrink-0 overflow-hidden rounded-full bg-muted flex items-center justify-center">
          {(form.avatar_url || avatarFile)
            ? <Image src={avatarFile ? URL.createObjectURL(avatarFile) : form.avatar_url} alt="Avatar" fittingType="fill" className="h-full w-full object-cover" />
            : <span className="font-mono-caps text-2xl text-muted-foreground">{form.display_name?.[0]}</span>}
        </div>
        <div className="flex-1">
          <label className="font-mono-caps text-[11px] text-muted-foreground">Profile Photo</label>
          <input type="file" accept="image/*" className={`${input} mt-2 file:mr-4 file:border-0 file:bg-muted file:px-3 file:py-1 file:font-mono-caps file:text-[11px]`} onChange={(e) => setAvatarFile(e.target.files?.[0] || null)} />
        </div>
      </div>
      <div><label className="font-mono-caps text-[11px] text-muted-foreground">Gallery Name *</label><input className={`${input} mt-2`} value={form.display_name} onChange={(e) => set("display_name", e.target.value)} required /></div>
      <div><label className="font-mono-caps text-[11px] text-muted-foreground">Based In</label><input className={`${input} mt-2`} value={form.based_in} onChange={(e) => set("based_in", e.target.value)} placeholder="City, Country" /></div>
      <div><label className="font-mono-caps text-[11px] text-muted-foreground">Bio / About</label><textarea className={`${input} mt-2 resize-none`} rows={4} value={form.bio} onChange={(e) => set("bio", e.target.value)} /></div>
      <div>
        <label className="font-mono-caps text-[11px] text-muted-foreground">Cover Photo</label>
        <input type="file" accept="image/*" className={`${input} mt-2 file:mr-4 file:border-0 file:bg-muted file:px-3 file:py-1 file:font-mono-caps file:text-[11px]`} onChange={(e) => setCoverFile(e.target.files?.[0] || null)} />
      </div>
      <div><label className="font-mono-caps text-[11px] text-muted-foreground">Address</label><input className={`${input} mt-2`} value={form.address} onChange={(e) => set("address", e.target.value)} placeholder="12 Example St, London" /></div>
      <div><label className="font-mono-caps text-[11px] text-muted-foreground">Opening Hours</label><input className={`${input} mt-2`} value={form.opening_hours} onChange={(e) => set("opening_hours", e.target.value)} placeholder="Tue–Sat, 11:00–18:00" /></div>
      <div className="grid grid-cols-2 gap-4">
        <div><label className="font-mono-caps text-[11px] text-muted-foreground">Phone</label><input className={`${input} mt-2`} value={form.phone} onChange={(e) => set("phone", e.target.value)} placeholder="+44 …" /></div>
        <div><label className="font-mono-caps text-[11px] text-muted-foreground">Email</label><input className={`${input} mt-2`} value={form.email} onChange={(e) => set("email", e.target.value)} placeholder="hello@…" /></div>
      </div>
      <div>
        <label className="font-mono-caps text-[11px] text-muted-foreground">Disciplines of Interest</label>
        <div className="flex flex-wrap gap-2 mt-2">
          {INTERESTS.map((i) => (
            <button type="button" key={i} onClick={() => toggle("interests", i)}
              className={`font-mono-caps text-[11px] px-3 py-1.5 border transition-colors ${form.interests.includes(i) ? "border-foreground bg-foreground text-background" : "border-border text-muted-foreground"}`}>{i}</button>
          ))}
        </div>
      </div>
      <div>
        <label className="font-mono-caps text-[11px] text-muted-foreground">Seeking</label>
        <div className="flex flex-wrap gap-2 mt-2">
          {SEEKING.map((s) => (
            <button type="button" key={s} onClick={() => toggle("seeking", s)}
              className={`font-mono-caps text-[11px] px-3 py-1.5 border transition-colors ${form.seeking.includes(s) ? "border-foreground bg-foreground text-background" : "border-border text-muted-foreground"}`}>{s}</button>
          ))}
        </div>
      </div>
      <div><label className="font-mono-caps text-[11px] text-muted-foreground">Website</label><input className={`${input} mt-2`} value={form.website} onChange={(e) => set("website", e.target.value)} placeholder="https://yourgallery.com" type="url" /></div>
      <div><label className="font-mono-caps text-[11px] text-muted-foreground">Instagram</label><input className={`${input} mt-2`} value={form.instagram} onChange={(e) => set("instagram", e.target.value)} placeholder="@handle" /></div>
      <div><label className="font-mono-caps text-[11px] text-muted-foreground">Facebook</label><input className={`${input} mt-2`} value={form.facebook} onChange={(e) => set("facebook", e.target.value)} placeholder="@page or URL" /></div>
      <div><label className="font-mono-caps text-[11px] text-muted-foreground">LinkedIn</label><input className={`${input} mt-2`} value={form.linkedin} onChange={(e) => set("linkedin", e.target.value)} placeholder="@profile or URL" /></div>

      <div className="border-t border-border pt-8 space-y-5">
        <div>
          <p className="font-mono-caps text-[11px] text-primary">SEO & GEO Settings</p>
          <p className="mt-1 text-xs text-muted-foreground/70 leading-relaxed">Optimise how this profile appears in search engines and local search results.</p>
        </div>
        <div><label className="font-mono-caps text-[11px] text-muted-foreground">SEO Title</label><input className={`${input} mt-2`} value={form.seo_title} onChange={(e) => set("seo_title", e.target.value)} placeholder="e.g. Tate Modern Exchange — Contemporary Art Gallery, London" /></div>
        <div><label className="font-mono-caps text-[11px] text-muted-foreground">SEO Description</label><textarea className={`${input} mt-2 resize-none`} rows={3} value={form.seo_description} onChange={(e) => set("seo_description", e.target.value)} placeholder="A concise summary for search results (≈150–160 characters)." /></div>
        <div><label className="font-mono-caps text-[11px] text-muted-foreground">SEO Keywords</label><input className={`${input} mt-2`} value={form.seo_keywords} onChange={(e) => set("seo_keywords", e.target.value)} placeholder="contemporary art, London gallery, South Bank…" /></div>
        <GeoAddressField
          value={form}
          onChange={(geo) => setForm((f) => ({ ...f, ...geo, geo_address: f.geo_address }))}
        />
      </div>

      <div className="flex flex-wrap items-center gap-4 pt-2">
        <button type="submit" disabled={saving} className="flex items-center gap-2 bg-primary px-8 py-4 font-mono-caps text-[11px] text-primary-foreground hover:opacity-80 disabled:opacity-50">
          {saving && <Loader2 className="h-3 w-3 animate-spin" />} Save Changes
        </button>
        <button type="button" onClick={onCancel} className="font-mono-caps text-[11px] text-muted-foreground hover:text-foreground">Cancel</button>
      </div>
    </form>
  );
}

function GalleryWorkModal({ profile, onClose, onCreated }) {
  const [form, setForm] = useState({ artist_name: "", artist_discipline: "", title: "", year: "", medium: "", dimensions: "", description: "", available_for_sale: false, price: "", currency: "USD", tags: [] });
  const [file, setFile] = useState(null);
  const [tagInput, setTagInput] = useState("");
  const [saving, setSaving] = useState(false);
  const set = (k, v) => setForm((f) => ({ ...f, [k]: v }));
  const input = "w-full border border-border bg-transparent px-4 py-3 text-base outline-none focus:border-foreground";
  const DISCIPLINES = ["Painting", "Sculpture", "Photography", "Installation", "Video Art", "Performance", "Drawing", "Printmaking", "Ceramics", "Sound Art", "Digital Art", "Mixed Media", "Other"];

  const submit = async (e) => {
    e.preventDefault();
    if (!file) return;
    setSaving(true);
    const res = await base44.integrations.Core.UploadFile({ file });
    await base44.entities.GalleryWork.create({
      ...form, image_url: res.file_url,
      artist_id: profile.user_id,
      artist_name: form.artist_name?.trim() || profile.display_name,
    });
    setSaving(false);
    onCreated();
  };

  const addTag = () => {
    const t = tagInput.trim();
    if (t && !form.tags.includes(t)) set("tags", [...form.tags, t]);
    setTagInput("");
  };

  return (
    <div className="fixed inset-0 z-50 bg-background/90 backdrop-blur-sm flex items-center justify-center p-6" onClick={onClose}>
      <div className="bg-card border border-border w-full max-w-xl max-h-[90vh] overflow-y-auto" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between px-6 py-5 border-b border-border">
          <p className="font-mono-caps text-[11px]">Add Work</p>
          <button onClick={onClose}><X className="h-4 w-4 text-muted-foreground" /></button>
        </div>
        <form onSubmit={submit} className="p-6 space-y-5">
          <div className="border-b border-border pb-5">
            <p className="font-mono-caps text-[10px] text-primary mb-3">Represented Artist</p>
            <div className="grid grid-cols-2 gap-4">
              <div><label className="font-mono-caps text-[11px] text-muted-foreground">Artist Name</label><input className={`${input} mt-2`} value={form.artist_name} onChange={(e) => set("artist_name", e.target.value)} placeholder="e.g. Yayoi Kusama" /></div>
              <div>
                <label className="font-mono-caps text-[11px] text-muted-foreground">Discipline</label>
                <select className={`${input} mt-2`} value={form.artist_discipline} onChange={(e) => set("artist_discipline", e.target.value)}>
                  <option value="">Select…</option>
                  {DISCIPLINES.map((d) => <option key={d}>{d}</option>)}
                </select>
              </div>
            </div>
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div><label className="font-mono-caps text-[11px] text-muted-foreground">Title *</label><input className={`${input} mt-2`} value={form.title} onChange={(e) => set("title", e.target.value)} required /></div>
            <div><label className="font-mono-caps text-[11px] text-muted-foreground">Year</label><input className={`${input} mt-2`} value={form.year} onChange={(e) => set("year", e.target.value)} placeholder="2024" /></div>
            <div><label className="font-mono-caps text-[11px] text-muted-foreground">Medium</label><input className={`${input} mt-2`} value={form.medium} onChange={(e) => set("medium", e.target.value)} placeholder="Oil on canvas" /></div>
            <div><label className="font-mono-caps text-[11px] text-muted-foreground">Dimensions</label><input className={`${input} mt-2`} value={form.dimensions} onChange={(e) => set("dimensions", e.target.value)} placeholder="120 × 90 cm" /></div>
          </div>
          <div><label className="font-mono-caps text-[11px] text-muted-foreground">Description</label><textarea className={`${input} mt-2 resize-none`} rows={3} value={form.description} onChange={(e) => set("description", e.target.value)} placeholder="A short note about the work, its context, or the artist's process…" /></div>
          <div>
            <label className="font-mono-caps text-[11px] text-muted-foreground">Tags</label>
            <div className="flex gap-2 mt-2">
              <input className={`${input} flex-1`} value={tagInput} onChange={(e) => setTagInput(e.target.value)} onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); addTag(); } }} placeholder="Add a tag…" />
              <button type="button" onClick={addTag} className="font-mono-caps text-[11px] border border-foreground px-4 py-3 hover:bg-foreground hover:text-background">Add</button>
            </div>
            {form.tags.length > 0 && (
              <div className="flex flex-wrap gap-2 mt-3">
                {form.tags.map((t) => (
                  <span key={t} className="inline-flex items-center gap-1 font-mono-caps text-[10px] border border-border px-2 py-1 text-muted-foreground">
                    {t}
                    <button type="button" onClick={() => set("tags", form.tags.filter((x) => x !== t))} className="hover:text-primary"><X className="h-2.5 w-2.5" /></button>
                  </span>
                ))}
              </div>
            )}
          </div>
          <div><label className="font-mono-caps text-[11px] text-muted-foreground">Image *</label><input type="file" accept="image/*" required className={`${input} mt-2 file:mr-4 file:border-0 file:bg-muted file:px-3 file:py-1 file:font-mono-caps file:text-[11px]`} onChange={(e) => setFile(e.target.files?.[0])} /></div>
          <label className="flex items-center gap-2 cursor-pointer">
            <input type="checkbox" checked={form.available_for_sale} onChange={(e) => set("available_for_sale", e.target.checked)} className="h-4 w-4 accent-primary" />
            <span className="font-mono-caps text-[11px] text-muted-foreground">Available for sale</span>
          </label>
          {form.available_for_sale && (
            <div className="flex gap-3">
              <select className="border border-border bg-background px-3 py-3 text-sm outline-none" value={form.currency} onChange={(e) => set("currency", e.target.value)}>
                {["USD", "EUR", "GBP", "JPY", "KRW", "HKD"].map((c) => <option key={c}>{c}</option>)}
              </select>
              <input className={`${input} flex-1`} value={form.price} onChange={(e) => set("price", e.target.value)} placeholder="Price" />
            </div>
          )}
          <div className="flex flex-wrap items-center gap-4 pt-2">
            <button type="submit" disabled={saving} className="flex items-center gap-2 bg-primary px-8 py-4 font-mono-caps text-[11px] text-primary-foreground hover:opacity-80 disabled:opacity-50">
              {saving && <Loader2 className="h-3 w-3 animate-spin" />} Add Work
            </button>
            <button type="button" onClick={onClose} className="font-mono-caps text-[11px] text-muted-foreground hover:text-foreground">Cancel</button>
          </div>
        </form>
      </div>
    </div>
  );
}