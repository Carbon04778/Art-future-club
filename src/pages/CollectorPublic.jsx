import React, { useEffect, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { base44 } from "@/api/base44Client";
import { Image } from "@/components/ui/image";
import { ArrowLeft, Loader2, MapPin, ExternalLink, Instagram } from "lucide-react";
import SlimFooter from "@/components/SlimFooter";
import CollectorsGate from "@/components/CollectorsGate";
import MyCollection from "@/components/MyCollection";
import { findBySlugOrId } from "@/lib/slugs";
import { isPeopleType } from "@/lib/venueTypes";
import { websiteUrl, websiteLabel, socialUrl, socialLabel } from "@/lib/links";

/**
 * One collector's page (B10): who they are and their collections. Members
 * only (CollectorsGate). A private collector is not returned by the
 * database at all (migration 029), so they read as "not available".
 */
export default function CollectorPublic() {
  return (
    <>
      <CollectorsGate title="Collector">{(user) => <CollectorDetail user={user} />}</CollectorsGate>
      <SlimFooter />
    </>
  );
}

function CollectorDetail({ user }) {
  const { id } = useParams();
  const [profile, setProfile] = useState(undefined);

  useEffect(() => {
    findBySlugOrId(base44.entities.CollectorProfile, id)
      .then((p) => setProfile(p && isPeopleType(p.type) ? p : null))
      .catch(() => setProfile(null));
  }, [id]);

  if (profile === undefined) return <div className="flex justify-center py-32"><Loader2 className="h-5 w-5 animate-spin text-muted-foreground" /></div>;
  if (profile === null) {
    return (
      <div className="mx-auto max-w-xl px-6 py-24 text-center" data-testid="collector-unavailable">
        <p className="font-mono-caps text-[11px] text-muted-foreground">This collector's profile is private or no longer available.</p>
        <Link to="/collectors" className="mt-4 inline-flex items-center gap-1 font-mono-caps text-[11px] text-primary hover:underline"><ArrowLeft className="h-3 w-3" /> All collectors</Link>
      </div>
    );
  }
  const isOwner = user?.id && user.id === profile.user_id;

  return (
    <div data-testid="collector-public">
      <div className="mx-auto max-w-4xl px-6 py-12 md:px-10">
        <Link to="/collectors" className="inline-flex items-center gap-1 font-mono-caps text-[11px] text-muted-foreground hover:text-foreground"><ArrowLeft className="h-3 w-3" /> All collectors</Link>
        <div className="mt-8 flex flex-wrap items-start gap-6 border-b border-border pb-10">
          <div className="h-24 w-24 shrink-0 overflow-hidden rounded-full bg-muted flex items-center justify-center">
            {profile.avatar_url
              ? <Image src={profile.avatar_url} alt={profile.display_name} fittingType="fill" className="h-full w-full object-cover" />
              : <span className="font-heading text-3xl text-muted-foreground">{profile.display_name?.[0]}</span>}
          </div>
          <div className="min-w-0">
            <p className="font-mono-caps text-[11px] text-primary">{profile.type}</p>
            <h1 className="mt-1 font-heading text-4xl font-medium tracking-[-0.02em] md:text-5xl">{profile.display_name}</h1>
            {profile.based_in && <p className="mt-2 flex items-center gap-1.5 text-muted-foreground"><MapPin className="h-3 w-3" /> {profile.based_in}</p>}
            <div className="mt-3 flex flex-wrap gap-4">
              {websiteUrl(profile.website) && <a href={websiteUrl(profile.website)} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 font-mono-caps text-[11px] text-primary"><ExternalLink className="h-3 w-3" /> {websiteLabel(profile.website)}</a>}
              {socialUrl("instagram", profile.instagram) && <a href={socialUrl("instagram", profile.instagram)} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 font-mono-caps text-[11px] text-primary"><Instagram className="h-3 w-3" /> {socialLabel("instagram", profile.instagram)}</a>}
            </div>
            {isOwner && (
              <p className="mt-3 font-mono-caps text-[10px] text-muted-foreground">
                {profile.is_private ? "Your profile is private — only you and the AFC team can see it." : "Visible to collectors and premium members."}{" "}
                <Link to="/collector-profile" className="text-primary underline">Edit</Link>
              </p>
            )}
          </div>
        </div>
        {profile.bio && <p className="mt-8 max-w-2xl whitespace-pre-line text-lg leading-relaxed text-foreground/90">{profile.bio}</p>}
        {profile.interests?.length > 0 && (
          <div className="mt-6 flex flex-wrap gap-2">
            {profile.interests.map((i) => <span key={i} className="font-mono-caps text-[11px] border border-border px-3 py-1">{i}</span>)}
          </div>
        )}
      </div>
      <MyCollection userId={profile.user_id} isOwner={isOwner} />
    </div>
  );
}
