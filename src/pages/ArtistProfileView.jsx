import React, { useState, useEffect } from "react";
import { useParams, Link } from "react-router-dom";
import { base44 } from "@/api/base44Client";
import { Image } from "@/components/ui/image";
import { ExternalLink, Instagram, ShoppingBag, Mail, Linkedin, LogOut, Images } from "lucide-react";

const TwitterXIcon = () => (
  <svg viewBox="0 0 24 24" className="h-3 w-3 fill-current">
    <path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-4.714-6.231-5.401 6.231H2.746l7.73-8.835L1.254 2.25H8.08l4.253 5.622zm-1.161 17.52h1.833L7.084 4.126H5.117z"/>
  </svg>
);
const TikTokIcon = () => (
  <svg viewBox="0 0 24 24" className="h-3 w-3 fill-current">
    <path d="M19.59 6.69a4.83 4.83 0 01-3.77-4.25V2h-3.45v13.67a2.89 2.89 0 01-2.88 2.5 2.89 2.89 0 01-2.89-2.89 2.89 2.89 0 012.89-2.89c.28 0 .54.04.79.1V9.01a6.27 6.27 0 00-.79-.05 6.34 6.34 0 00-6.34 6.34 6.34 6.34 0 006.34 6.34 6.34 6.34 0 006.33-6.34V8.69a8.18 8.18 0 004.78 1.52V6.78a4.85 4.85 0 01-1.01-.09z"/>
  </svg>
);
import { motion, AnimatePresence } from "framer-motion";
import SlimFooter from "@/components/SlimFooter";
import LikeButton from "@/components/LikeButton";
import CollectButton from "@/components/CollectButton";
import FollowButton from "@/components/FollowButton";
import CommentsSection from "@/components/CommentsSection";
import ShareButtons from "@/components/ShareButtons";
import InquiryModal from "@/components/InquiryModal";
import PortfolioPDFExport from "@/components/PortfolioPDFExport";
import PortfolioLightbox from "@/components/portfolio/PortfolioLightbox";

export default function ArtistProfileView() {
  const { id } = useParams();
  const [profile, setProfile] = useState(null);
  // Roles live on `profiles`, not on artist_profile, so the badge needs a
  // separate lookup keyed on the profile owner.
  const [ownerRole, setOwnerRole] = useState(null);
  const [currentUser, setCurrentUser] = useState(null);
  const [currentUserName, setCurrentUserName] = useState("");
  const [inquiryWork, setInquiryWork] = useState(null); // work object or null for commission
  const [showInquiry, setShowInquiry] = useState(false);
  const [inquiryType, setInquiryType] = useState("purchase");
  const [lightbox, setLightbox] = useState(null); // { workIndex, start }

  useEffect(() => {
    base44.entities.ArtistProfile.get(id).then((p) => {
      setProfile(p);
      // Unclaimed profiles have no user_id, so there is no role to look up.
      if (!p?.user_id) return;
      base44.entities.Profile.filter({ id: p.user_id })
        .then((rows) => setOwnerRole(rows[0]?.role || null))
        .catch(() => setOwnerRole(null));
    });
    base44.auth.me().then((u) => {
      setCurrentUser(u);
      // get their display name from profile
      base44.entities.ArtistProfile.filter({ user_id: u.id }).then((res) => {
        setCurrentUserName(res[0]?.display_name || u.full_name || "Member");
      });
    }).catch(() => {});
  }, [id]);

  if (!profile) {
    return (
      <div className="flex min-h-screen items-center justify-center">
        <div className="w-6 h-6 border-2 border-border border-t-foreground rounded-full animate-spin" />
      </div>
    );
  }

  const isOwner = currentUser && profile.user_id === currentUser.id;
  const profileUrl = window.location.href;

  return (
    <>
      <div className="mx-auto max-w-5xl px-6 pt-6 md:px-10 flex items-center justify-end gap-3">
        {/* Admin-created profiles are "unclaimed" and have no user_id, so there
            is nobody to deliver a message to. Offering the button would take
            the sender to a compose box whose send silently fails. */}
        {currentUser && !isOwner && profile.user_id && (
          <Link
            to={`/messages?to=${profile.user_id}&name=${encodeURIComponent(profile.display_name)}`}
            className="flex items-center gap-1.5 font-mono-caps text-[11px] text-muted-foreground hover:text-primary border border-border px-3 py-1.5 hover:border-primary transition-colors"
          >
            <Mail className="h-3 w-3" /> Message
          </Link>
        )}
        {isOwner && (
          <>
            <PortfolioPDFExport profile={profile} />
            <Link to="/profile/edit" className="font-mono-caps text-[11px] text-primary">Edit Profile →</Link>
            <button
              type="button"
              onClick={() => base44.auth.logout(window.location.origin)}
              className="flex items-center gap-1.5 font-mono-caps text-[11px] text-muted-foreground hover:text-accent border border-border px-3 py-1.5 hover:border-accent transition-colors"
            >
              <LogOut className="h-3 w-3" /> Log Out
            </button>
          </>
        )}
      </div>

      <div className="mx-auto max-w-5xl px-6 py-16 md:px-10">
        {/* hero */}
        <div className="grid grid-cols-1 gap-10 md:grid-cols-[auto_1fr] md:items-start">
          <div className="h-28 w-28 overflow-hidden rounded-full bg-muted flex items-center justify-center shrink-0">
            {profile.avatar_url
              ? <Image src={profile.avatar_url} alt={profile.display_name} fittingType="fill" className="h-full w-full object-cover" />
              : <span className="font-heading text-4xl text-muted-foreground">{profile.display_name?.[0]}</span>
            }
          </div>
          <div>
            <p className="font-mono-caps text-[11px] text-muted-foreground">Artist Profile</p>
            <h1 className="mt-2 font-heading text-5xl font-medium tracking-[-0.02em] md:text-7xl">
              {profile.display_name}
            </h1>
            <div className="mt-3 flex flex-wrap items-center gap-4">
              <span className="font-mono-caps text-[13px] text-primary">{profile.discipline}</span>
              {profile.based_in && <span className="font-mono-caps text-[11px] text-muted-foreground">{profile.based_in}</span>}
              {profile.chapter && <span className="font-mono-caps text-[11px] text-muted-foreground">AFC {profile.chapter}</span>}
              {(ownerRole === "editor" || ownerRole === "admin") && (
                <span className="font-mono-caps text-[10px] border border-accent px-2 py-0.5 text-accent">
                  {ownerRole === "admin" ? "AFC Team" : "AFC Editor"}
                </span>
              )}
              {profile.is_premium && <span className="font-mono-caps text-[10px] border border-primary px-2 py-0.5 text-primary">Premium</span>}
              {profile.is_featured && <span className="font-mono-caps text-[10px] border border-yellow-500 px-2 py-0.5 text-yellow-600">Featured</span>}
            </div>

            {/* social links */}
            <div className="mt-4 flex flex-wrap items-center gap-5">
              {profile.website && (
                <a href={profile.website} target="_blank" rel="noreferrer" className="flex items-center gap-1.5 font-mono-caps text-[11px] text-muted-foreground hover:text-primary">
                  <ExternalLink className="h-3 w-3" /> Website
                </a>
              )}
              {profile.instagram && (
                <a href={`https://instagram.com/${profile.instagram.replace("@", "")}`} target="_blank" rel="noreferrer" className="flex items-center gap-1.5 font-mono-caps text-[11px] text-muted-foreground hover:text-primary">
                  <Instagram className="h-3 w-3" /> {profile.instagram}
                </a>
              )}
              {profile.twitter && (
                <a href={`https://twitter.com/${profile.twitter.replace("@", "")}`} target="_blank" rel="noreferrer" className="flex items-center gap-1.5 font-mono-caps text-[11px] text-muted-foreground hover:text-primary">
                  <TwitterXIcon /> {profile.twitter}
                </a>
              )}
              {profile.tiktok && (
                <a href={`https://tiktok.com/${profile.tiktok.replace("@", "")}`} target="_blank" rel="noreferrer" className="flex items-center gap-1.5 font-mono-caps text-[11px] text-muted-foreground hover:text-primary">
                  <TikTokIcon /> {profile.tiktok}
                </a>
              )}
              {profile.linkedin && (
                <a href={profile.linkedin} target="_blank" rel="noreferrer" className="flex items-center gap-1.5 font-mono-caps text-[11px] text-muted-foreground hover:text-primary">
                  <Linkedin className="h-3 w-3" /> LinkedIn
                </a>
              )}
            </div>

            {/* follow + like + share */}
            <div className="mt-6 flex flex-wrap items-center gap-4">
              {!isOwner && (
                <FollowButton artistProfile={profile} currentUserId={currentUser?.id} />
              )}
              <LikeButton targetId={id} targetType="artist_profile" userId={currentUser?.id} />
              <ShareButtons url={profileUrl} title={`${profile.display_name} — AFC Artist Profile`} compact />
            </div>
          </div>
        </div>

        {/* bio */}
        {profile.bio && (
          <div className="mt-16 border-t border-border pt-12 grid grid-cols-1 gap-6 md:grid-cols-[160px_1fr]">
            <p className="font-mono-caps text-[11px] text-muted-foreground">Practice</p>
            <p className="text-lg leading-relaxed">{profile.bio}</p>
          </div>
        )}

        {/* seeking */}
        {profile.seeking?.length > 0 && (
          <div className="mt-12 grid grid-cols-1 gap-6 md:grid-cols-[160px_1fr]">
            <p className="font-mono-caps text-[11px] text-muted-foreground">Seeking</p>
            <div className="flex flex-wrap gap-2">
              {profile.seeking.map((s) => (
                <span key={s} className="font-mono-caps text-[11px] border border-border px-3 py-1.5 text-muted-foreground">{s}</span>
              ))}
              {profile.open_to_commissions && (
                <span className="font-mono-caps text-[11px] border border-primary px-3 py-1.5 text-primary">Open to Commissions</span>
              )}
            </div>
          </div>
        )}

        {/* commission CTA */}
        {!isOwner && profile.open_to_commissions && (
          <div className="mt-10 border border-primary p-6 flex items-center justify-between">
            <div>
              <p className="font-mono-caps text-[11px] text-primary mb-1">Open to Commissions</p>
              <p className="text-sm text-muted-foreground">{profile.display_name} is currently accepting commission enquiries.</p>
            </div>
            <button
              onClick={() => { setInquiryWork(null); setInquiryType("commission"); setShowInquiry(true); }}
              className="shrink-0 flex items-center gap-2 bg-primary px-5 py-3 font-mono-caps text-[11px] text-primary-foreground hover:opacity-80"
            >
              <ShoppingBag className="h-3 w-3" /> Commission Request
            </button>
          </div>
        )}

        {/* CV */}
        {(profile.cv?.statement || profile.cv?.exhibitions?.length > 0 || profile.cv?.education?.length > 0 || profile.cv?.awards?.length > 0) && (
          <div className="mt-16 border-t border-border pt-12 space-y-10">
            <p className="font-mono-caps text-[11px] text-muted-foreground">CV</p>
            {profile.cv.statement && (
              <div className="grid grid-cols-1 gap-6 md:grid-cols-[160px_1fr]">
                <p className="font-mono-caps text-[11px] text-muted-foreground">Statement</p>
                <p className="text-lg leading-relaxed italic">{profile.cv.statement}</p>
              </div>
            )}
            {[["Exhibitions", profile.cv.exhibitions], ["Education", profile.cv.education], ["Awards & Residencies", profile.cv.awards]].map(([label, items]) =>
              items?.length > 0 ? (
                <div key={label} className="grid grid-cols-1 gap-6 md:grid-cols-[160px_1fr]">
                  <p className="font-mono-caps text-[11px] text-muted-foreground">{label}</p>
                  <ul className="space-y-3">
                    {items.map((item, i) => (
                      <li key={i} className="flex gap-6">
                        <span className="font-mono-caps text-[11px] text-muted-foreground w-10 shrink-0">{item.year}</span>
                        <span className="text-sm">{item.title}{item.venue ? <span className="text-muted-foreground"> — {item.venue}</span> : ""}</span>
                      </li>
                    ))}
                  </ul>
                </div>
              ) : null
            )}
          </div>
        )}

        {/* comments on profile */}
        <div className="mt-12 border-t border-border pt-8">
          <CommentsSection
            targetId={id}
            targetType="artist_profile"
            userId={currentUser?.id}
            userName={currentUserName}
          />
        </div>

        {/* portfolio */}
        {profile.portfolio_works?.length > 0 && (
          <div className="mt-16 border-t border-border pt-12">
            <p className="font-mono-caps text-[11px] text-muted-foreground mb-10">Portfolio</p>
            <div className="grid grid-cols-1 gap-8 md:grid-cols-2 lg:grid-cols-4">
              {profile.portfolio_works.map((work, i) => (
                <motion.div
                  key={i}
                  initial={{ opacity: 0, y: 16 }}
                  whileInView={{ opacity: 1, y: 0 }}
                  viewport={{ once: true, margin: "-60px" }}
                  transition={{ duration: 0.6 }}
                  data-artwork
                >
                  {work.image_url && (
                    <button
                      type="button"
                      onClick={() => setLightbox({ workIndex: i, start: 0 })}
                      className="relative block w-full mb-5 group cursor-zoom-in"
                      data-artwork
                    >
                      <Image src={work.image_url} alt={work.title} fittingType="fill" className="aspect-[4/5] w-full" />
                      {work.additional_images?.length > 0 && (
                        <span className="absolute top-2 right-2 flex items-center gap-1 bg-background/80 px-1.5 py-1 font-mono-caps text-[9px]">
                          <Images className="h-3 w-3" /> {1 + work.additional_images.length}
                        </span>
                      )}
                    </button>
                  )}
                  <div className="flex items-start justify-between gap-2">
                    <div>
                      <h3 className="font-heading text-2xl tracking-[-0.01em]">{work.title}</h3>
                      <p className="mt-1 font-mono-caps text-[11px] text-muted-foreground">
                        {[work.medium, work.dimensions, work.year].filter(Boolean).join(" · ")}
                      </p>
                    </div>
                    {work.available_for_sale && (
                      <div className="shrink-0 text-right">
                        <p className="font-mono-caps text-[11px] text-primary">
                          {work.currency || "USD"} {work.price}
                        </p>
                        <button
                          onClick={() => { setInquiryWork(work); setInquiryType("purchase"); setShowInquiry(true); }}
                          className="mt-1 inline-flex items-center gap-1 font-mono-caps text-[10px] border border-primary px-2 py-1 text-primary hover:bg-primary hover:text-primary-foreground transition-colors"
                        >
                          <ShoppingBag className="h-3 w-3" /> Enquire
                        </button>
                      </div>
                    )}
                  </div>
                  {work.description && (
                    <p className="mt-3 text-sm text-muted-foreground leading-relaxed">{work.description}</p>
                  )}
                  {/* Two rows, not one. In the two-column portfolio grid a
                      single row cannot fit like + collect + comment + four
                      share icons, and without wrapping they overlapped the
                      labels and ran past the card edge. */}
                  {/*
                    Three rows, in order of prominence: the actions that relate
                    to the work itself, then sharing, then comments last.

                    Comments used to sit inline with Like and Collect, which
                    pulled attention away from the artwork — the main focus of
                    the page. Moving the discussion below the actions keeps the
                    work first and the conversation available underneath.
                  */}
                  <div className="mt-4 border-t border-border pt-4">
                    <div className="flex flex-wrap items-center gap-x-5 gap-y-3">
                      <LikeButton targetId={`${id}-work-${i}`} targetType="portfolio_work" userId={currentUser?.id} />
                      {!isOwner && (
                        <CollectButton userId={currentUser?.id} artistId={id} artistName={profile.display_name} work={work} workRef={`${id}-work-${i}`} />
                      )}
                    </div>
                    {/* Share keeps its own row. Four icons alongside Like and
                        Collect is what overflowed the narrow grid column
                        originally, and that has not changed. */}
                    <div className="mt-3 flex flex-wrap items-center gap-x-5 gap-y-3">
                      <ShareButtons url={`${window.location.href}#work-${i}`} title={`${work.title} by ${profile.display_name}`} compact />
                    </div>
                    <div className="mt-3 border-t border-border/50 pt-3">
                      <CommentsSection
                        targetId={`${id}-work-${i}`}
                        targetType="portfolio_work"
                        userId={currentUser?.id}
                        userName={currentUserName}
                        ownerId={profile.user_id}
                        ownerLabel={work.title ? `"${work.title}"` : "your work"}
                      />
                    </div>
                  </div>
                </motion.div>
              ))}
            </div>
          </div>
        )}
      </div>

      <SlimFooter />

      {showInquiry && (
        <InquiryModal
          work={inquiryWork}
          artistProfile={profile}
          type={inquiryType}
          onClose={() => setShowInquiry(false)}
        />
      )}

      <AnimatePresence>
        {lightbox && (
          <PortfolioLightbox
            images={[
              profile.portfolio_works[lightbox.workIndex].image_url,
              ...(profile.portfolio_works[lightbox.workIndex].additional_images || []),
            ].filter(Boolean)}
            startIndex={lightbox.start}
            onClose={() => setLightbox(null)}
          />
        )}
      </AnimatePresence>
    </>
  );
}