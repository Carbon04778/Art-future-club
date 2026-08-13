import React, { useState } from "react";
import { base44 } from "@/api/base44Client";
import { X, Loader2 } from "lucide-react";

const CATEGORIES = ["Open Call", "Critique Request", "Collaboration", "Advice", "Exhibition News", "Opportunities", "General"];

export default function ForumPostModal({ user, profile, onClose, onCreated }) {
  const [title, setTitle] = useState("");
  const [body, setBody] = useState("");
  const [category, setCategory] = useState("General");
  const [imageFile, setImageFile] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!title.trim() || !body.trim()) return;
    setLoading(true);
    setError("");
    try {
      let image_url = null;
      if (imageFile) {
        const res = await base44.integrations.Core.UploadFile({ file: imageFile });
        image_url = res.file_url;
      }
      await base44.entities.ForumPost.create({
        author_id: user?.id,
        author_name: profile?.display_name || user?.full_name || "Anonymous",
        author_discipline: profile?.discipline || "",
        author_chapter: profile?.chapter || "",
        title: title.trim(),
        body: body.trim(),
        category,
        image_url,
        reply_count: 0,
      });
      onCreated();
    } catch (err) {
      setError("Failed to post. Please try again.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-foreground/50 p-4 backdrop-blur-sm">
      <div className="w-full max-w-2xl bg-background border border-border">
        <div className="flex items-center justify-between border-b border-border px-6 py-4">
          <p className="font-mono-caps text-[11px] text-foreground">New Post</p>
          <button onClick={onClose}><X className="h-4 w-4 text-muted-foreground hover:text-foreground" /></button>
        </div>
        <form onSubmit={handleSubmit} className="p-6 space-y-5">
          {error && <p className="font-mono-caps text-[11px] text-destructive">{error}</p>}

          <div>
            <label className="font-mono-caps text-[11px] text-muted-foreground">Category</label>
            <div className="mt-2 flex flex-wrap gap-2">
              {CATEGORIES.map((c) => (
                <button
                  type="button"
                  key={c}
                  onClick={() => setCategory(c)}
                  className={`font-mono-caps text-[11px] px-3 py-1.5 border transition-colors ${category === c ? "border-foreground bg-foreground text-background" : "border-border text-muted-foreground"}`}
                >
                  {c}
                </button>
              ))}
            </div>
          </div>

          <div>
            <label className="font-mono-caps text-[11px] text-muted-foreground">Title</label>
            <input
              className="mt-2 w-full border border-border bg-transparent px-4 py-3 font-heading text-xl outline-none focus:border-foreground"
              placeholder="Post title…"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              required
            />
          </div>

          <div>
            <label className="font-mono-caps text-[11px] text-muted-foreground">Body</label>
            <textarea
              className="mt-2 w-full border border-border bg-transparent px-4 py-3 text-base leading-relaxed outline-none focus:border-foreground resize-none"
              rows={6}
              placeholder="Share your thoughts, work, or question…"
              value={body}
              onChange={(e) => setBody(e.target.value)}
              required
            />
          </div>

          <div>
            <label className="font-mono-caps text-[11px] text-muted-foreground">Attach Image (optional)</label>
            <input
              type="file"
              accept="image/*"
              className="mt-2 w-full font-mono-caps text-[11px] text-muted-foreground file:mr-4 file:border-0 file:bg-muted file:px-4 file:py-2 file:font-mono-caps file:text-[11px] file:text-foreground"
              onChange={(e) => setImageFile(e.target.files?.[0] || null)}
            />
          </div>

          <div className="flex justify-end gap-3 pt-2">
            <button type="button" onClick={onClose} className="font-mono-caps text-[11px] text-muted-foreground hover:text-foreground px-4 py-2">
              Cancel
            </button>
            <button
              type="submit"
              disabled={loading}
              className="flex items-center gap-2 bg-primary px-6 py-3 font-mono-caps text-[11px] text-primary-foreground hover:opacity-80 disabled:opacity-50"
            >
              {loading ? <Loader2 className="h-3 w-3 animate-spin" /> : null}
              Publish Post
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}