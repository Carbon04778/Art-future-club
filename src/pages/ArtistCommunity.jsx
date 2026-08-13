import React, { useState, useEffect } from "react";
import { Link, useNavigate } from "react-router-dom";
import { base44 } from "@/api/base44Client";
import { motion } from "framer-motion";
import { Image } from "@/components/ui/image";
import { ArrowUpRight, Plus, MessageSquare } from "lucide-react";
import ForumPostModal from "@/components/ForumPostModal";
import SlimFooter from "@/components/SlimFooter";

const CATEGORY_COLORS = {
  "Open Call": "text-primary",
  "Critique Request": "text-muted-foreground",
  "Collaboration": "text-primary",
  "Advice": "text-muted-foreground",
  "Exhibition News": "text-muted-foreground",
  "Opportunities": "text-primary",
  "General": "text-muted-foreground",
};

export default function ArtistCommunity() {
  const [user, setUser] = useState(null);
  const [profile, setProfile] = useState(null);
  const [posts, setPosts] = useState([]);
  const [showNewPost, setShowNewPost] = useState(false);
  const [filter, setFilter] = useState("All");
  const [locationFilter, setLocationFilter] = useState("All");
  const navigate = useNavigate();

  useEffect(() => {
    base44.auth.me().then((u) => {
      setUser(u);
      base44.entities.ArtistProfile.filter({ user_id: u.id }).then((res) => {
        if (res.length > 0) setProfile(res[0]);
      });
    });
    loadPosts();
  }, []);

  const loadPosts = async () => {
    const res = await base44.entities.ForumPost.list("-created_date", 50);
    setPosts(res);
  };

  const CATEGORIES = ["All", "Open Call", "Critique Request", "Collaboration", "Advice", "Exhibition News", "Opportunities", "General"];
  const LOCATIONS = ["All", "Hong Kong", "London", "New York", "Los Angeles", "Bangkok", "Milano", "Toronto", "Zurich", "Other"];
  const filtered = posts
    .filter((p) => filter === "All" || p.category === filter)
    .filter((p) => locationFilter === "All" || p.author_chapter === locationFilter);

  return (
    <>
      {/* contextual action bar */}
      <div className="flex items-center justify-between px-6 py-3 md:px-10 border-b border-border">
        <span className="font-mono-caps text-[11px] text-foreground">Community Forum</span>
        <div className="flex flex-wrap items-center gap-4">
          <Link to="/collector-profile" className="font-mono-caps text-[11px] text-muted-foreground hover:text-primary">
            Collector
          </Link>
          <button
            onClick={() => setShowNewPost(true)}
            className="flex items-center gap-2 bg-primary px-4 py-2 font-mono-caps text-[11px] text-primary-foreground hover:opacity-80"
          >
            <Plus className="h-3 w-3" /> New Post
          </button>
        </div>
      </div>

      <div className="min-h-screen px-6 py-12 md:px-10">
        {/* header */}
        <div className="max-w-5xl">
          <p className="font-mono-caps text-[11px] text-muted-foreground">Artists · Community Forum</p>
          <h1 className="mt-3 font-heading text-5xl font-medium leading-[1.0] tracking-[-0.02em] md:text-7xl">
            The Network
          </h1>
          <p className="mt-4 max-w-xl text-lg text-muted-foreground leading-relaxed">
            A space for <span className="text-primary">artists, curators, and collectors</span> across all chapters to share work, seek critique, announce <span className="text-accent">opportunities</span>, and build <span className="text-highlight">connections</span>.
          </p>
        </div>

        {/* profile prompt if no profile */}
        {user && !profile && (
          <div className="mt-10 flex items-center justify-between border border-primary/30 bg-primary/5 p-6">
            <div>
              <p className="font-mono-caps text-[11px] text-primary">Your profile is incomplete</p>
              <p className="mt-1 text-sm text-muted-foreground">Add your artist profile so the community can discover your work.</p>
            </div>
            <Link to="/profile/edit" className="flex items-center gap-2 bg-primary px-5 py-3 font-mono-caps text-[11px] text-primary-foreground hover:opacity-80">
              Create Profile <ArrowUpRight className="h-3 w-3" />
            </Link>
          </div>
        )}

        <div className="mt-14 grid grid-cols-1 gap-12 lg:grid-cols-[1fr_280px]">
          {/* main feed */}
          <div>
            {/* category filter */}
            <div className="flex flex-wrap gap-3 mb-4">
              {CATEGORIES.map((cat) => (
                <button
                  key={cat}
                  onClick={() => setFilter(cat)}
                  className={`font-mono-caps text-[11px] px-3 py-1.5 border transition-colors ${filter === cat ? "border-foreground bg-foreground text-background" : "border-border text-muted-foreground hover:border-foreground"}`}
                >
                  {cat}
                </button>
              ))}
            </div>
            {/* location filter */}
            <div className="flex flex-wrap gap-3 mb-8">
              <span className="font-mono-caps text-[11px] text-muted-foreground self-center">Chapter:</span>
              {LOCATIONS.map((loc) => (
                <button
                  key={loc}
                  onClick={() => setLocationFilter(loc)}
                  className={`font-mono-caps text-[11px] px-3 py-1.5 border transition-colors ${locationFilter === loc ? "border-primary bg-primary text-primary-foreground" : "border-border text-muted-foreground hover:border-primary"}`}
                >
                  {loc}
                </button>
              ))}
            </div>

            {/* post list */}
            {filtered.length === 0 ? (
              <div className="border border-border py-16 text-center">
                <p className="font-mono-caps text-[11px] text-muted-foreground">No posts yet in this category.</p>
                <button onClick={() => setShowNewPost(true)} className="mt-4 font-mono-caps text-[11px] text-primary hover:underline">
                  Be the first to post →
                </button>
              </div>
            ) : (
              <ul className="divide-y divide-border">
                {filtered.map((post, i) => (
                  <motion.li
                    key={post.id}
                    initial={{ opacity: 0, y: 10 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ duration: 0.4, delay: i * 0.04 }}
                  >
                    <Link to={`/community/post/${post.id}`} className="group block py-7 hover:bg-muted/30 -mx-4 px-4">
                      <div className="flex items-start justify-between gap-4">
                        <div className="flex-1">
                          <div className="flex items-center gap-3 mb-2">
                            <span className={`font-mono-caps text-[10px] ${CATEGORY_COLORS[post.category] ?? "text-muted-foreground"}`}>
                              {post.category}
                            </span>
                            {post.author_chapter && (
                              <span className="font-mono-caps text-[10px] text-muted-foreground">{post.author_chapter}</span>
                            )}
                          </div>
                          <h3 className="font-heading text-xl tracking-[-0.01em] group-hover:text-primary transition-colors md:text-2xl">
                            {post.title}
                          </h3>
                          <p className="mt-2 text-sm text-muted-foreground line-clamp-2">{post.body}</p>
                          <div className="mt-3 flex flex-wrap items-center gap-4">
                            <span className="font-mono-caps text-[11px] text-muted-foreground">
                              {post.author_name || "Anonymous"}
                              {post.author_discipline && ` · ${post.author_discipline}`}
                            </span>
                            <span className="flex items-center gap-1 font-mono-caps text-[11px] text-muted-foreground">
                              <MessageSquare className="h-3 w-3" />
                              {post.reply_count ?? 0}
                            </span>
                          </div>
                        </div>
                        {post.image_url && (
                          <div className="shrink-0 h-20 w-20 overflow-hidden" data-artwork>
                            <Image src={post.image_url} alt={post.title} fittingType="fill" className="h-full w-full object-cover" />
                          </div>
                        )}
                      </div>
                    </Link>
                  </motion.li>
                ))}
              </ul>
            )}
          </div>

          {/* sidebar */}
          <div className="space-y-8">
            <div className="border border-border p-5 space-y-3">
              <p className="font-mono-caps text-[11px] text-muted-foreground">Quick Links</p>
              {[
                { to: "/artists", label: "Artists Directory" },
                { to: "/map", label: "Artist Map" },
                { to: "/open-calls", label: "Open Calls & Residencies" },
                { to: "/editorial", label: "Editorial Archive" },
                { to: "/gallery", label: "Gallery Showcase" },
                { to: "/gallery-map", label: "Gallery Map" },
                { to: "/events", label: "Event Calendar" },
                { to: "/collector-profile", label: "Collector Profile" },
                { to: "/upgrade", label: "Upgrade ↑" },
              ].map(({ to, label }) => (
                <Link key={to} to={to} className="block font-mono-caps text-[11px] text-muted-foreground hover:text-primary transition-colors">
                  → {label}
                </Link>
              ))}
            </div>
            <ArtistsSidebar />
          </div>
        </div>
      </div>

      <SlimFooter />

      {showNewPost && (
        <ForumPostModal
          user={user}
          profile={profile}
          onClose={() => setShowNewPost(false)}
          onCreated={() => { setShowNewPost(false); loadPosts(); }}
        />
      )}
    </>
  );
}

function ArtistsSidebar() {
  const [artists, setArtists] = useState([]);
  useEffect(() => {
    base44.entities.ArtistProfile.list("-created_date", 10).then(setArtists);
  }, []);
  return (
    <div>
      <div className="flex items-center justify-between mb-5">
        <p className="font-mono-caps text-[11px] text-muted-foreground">Artists in the Network</p>
        <Link to="/artists" className="font-mono-caps text-[11px] text-primary">All →</Link>
      </div>
      {artists.length === 0 ? (
        <p className="text-sm text-muted-foreground">No profiles yet.</p>
      ) : (
        <ul className="divide-y divide-border">
          {artists.map((a) => (
            <li key={a.id}>
              <Link to={`/artists/${a.id}`} className="flex items-center gap-3 py-3 hover:text-primary group">
                <div className="h-8 w-8 shrink-0 overflow-hidden rounded-full bg-muted flex items-center justify-center">
                  {a.avatar_url
                    ? <Image src={a.avatar_url} alt={a.display_name} fittingType="fill" className="h-full w-full object-cover" />
                    : <span className="font-mono-caps text-[10px]">{a.display_name?.[0]}</span>
                  }
                </div>
                <div className="min-w-0">
                  <p className="font-body text-sm font-medium truncate group-hover:text-primary">{a.display_name}</p>
                  <p className="font-mono-caps text-[10px] text-muted-foreground truncate">{a.discipline}</p>
                </div>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}