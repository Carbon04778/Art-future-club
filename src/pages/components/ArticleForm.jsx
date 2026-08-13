import React, { useState, useEffect, useMemo } from "react";
import { base44 } from "@/api/base44Client";
import { X, Loader2, Trash2 } from "lucide-react";
import ArticlePreview from "@/components/ArticlePreview";

// Which gallery-placement layouts also use a full-width intro image (images[0]).
const INTRO_LAYOUTS = ["image_after_intro", "intro_middle"];

const SLOT_LABELS = {
  intro: "Intro Image — full-width after paragraph 1",
  gallery: "Gallery Images",
  closing: "Closing Image — full-width before the final paragraph",
};

// Searchable category tags (multi-select). Beyond the main `category` enum.
const CATEGORY_TAGS = [
  "Artist Feature", "Gallery Feature", "Collector Feature", "Curator Feature",
  "Art Fair", "Exhibition", "Festival", "Residency", "Studio Visit",
  "Auction", "Market", "Commission", "Scholarship",
  "Chapter: Hong Kong", "Chapter: London", "Chapter: New York", "Chapter: Los Angeles",
  "Chapter: Bangkok", "Chapter: Milano", "Chapter: Toronto", "Chapter: Zurich",
];
const CHAPS = ["Hong Kong", "London", "New York", "Los Angeles", "Bangkok", "Milano", "Toronto", "Zurich"];

const slugify = (s) => (s || "").toLowerCase().trim().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 80);

let entryId = 0;
// a stored image may be {url,alt,caption} or a legacy string url
const toEntry = (img) => {
  const o = typeof img === "string" ? { url: img } : (img || {});
  return { id: ++entryId, url: o.url || o.image_url || "", alt: o.alt || "", caption: o.caption || "", file: null, preview: o.url || o.image_url || "" };
};
const entryForFile = (file) => ({ id: ++entryId, file, preview: URL.createObjectURL(file), url: "", alt: "", caption: "" });

const Section = ({ title, children }) => (
  <div className="border-t border-border pt-5">
    <p className="font-mono-caps text-[11px] text-primary mb-3">{title}</p>
    {children}
  </div>
);

export default function ArticleForm({ user, article, onClose, onCreated }) {
  const isEdit = !!article;
  const [form, setForm] = useState({
    title: article?.title || "",
    subtitle: article?.subtitle || "",
    body: article?.body || "",
    category: article?.category || "Feature",
    author_name: article?.author_name || user?.full_name || "",
    cover_image_url: article?.cover_image_url || "",
    cover_image_alt: article?.cover_image_alt || "",
    cover_image_caption: article?.cover_image_caption || "",
    layout: ["cover_top", "image_after_intro", "gallery_middle", "intro_middle"].includes(article?.layout) ? article.layout : "cover_top",
    publish_date: article?.publish_date ? article?.publish_date.slice(0, 16) : "",
    published: article?.published ?? true,
    featured: article?.featured ?? false,
    // SEO
    slug: article?.slug || "",
    seo_title: article?.seo_title || "",
    seo_description: article?.seo_description || "",
    seo_keywords: article?.seo_keywords || "",
    canonical_url: article?.canonical_url || "",
    og_image_url: article?.og_image_url || "",
    // GEO
    geo_placename: article?.geo_placename || "",
    geo_region: article?.geo_region || "",
    geo_lat: article?.geo_lat ?? "",
    geo_lng: article?.geo_lng ?? "",
    // taxonomy
    categories: article?.categories || [],
    tags: article?.tags || [],
  });

  const splitImages = (layout, imgs) => {
    const all = imgs.map(toEntry);
    if (INTRO_LAYOUTS.includes(layout)) return { intro: all.slice(0, 1), gallery: all.slice(1) };
    return { intro: [], gallery: all };
  };
  const initialSplit = splitImages(form.layout, article?.images || []);

  const [coverFile, setCoverFile] = useState(null);
  const [coverPreview, setCoverPreview] = useState(form.cover_image_url || "");
  const [intro, setIntro] = useState(initialSplit.intro);
  const [gallery, setGallery] = useState(initialSplit.gallery);
  const [closing, setClosing] = useState(
    article?.closing_image_url
      ? [{ id: ++entryId, url: article.closing_image_url, alt: article.closing_image_alt || "", caption: article.closing_image_caption || "", file: null, preview: article.closing_image_url }]
      : []
  );
  const [hasClosing, setHasClosing] = useState(!!article?.closing_image_url);
  const [tagInput, setTagInput] = useState("");
  const [geoAddress, setGeoAddress] = useState(article?.geo_placename || "");
  const [locating, setLocating] = useState(false);
  const [geoError, setGeoError] = useState("");
  const [saving, setSaving] = useState(false);

  const set = (k, v) => setForm((f) => ({ ...f, [k]: v }));
  const input = "w-full border border-border bg-transparent px-4 py-3 text-base outline-none focus:border-foreground";

  useEffect(() => {
    if (!coverFile) { setCoverPreview(form.cover_image_url || ""); return; }
    const url = URL.createObjectURL(coverFile);
    setCoverPreview(url);
    return () => URL.revokeObjectURL(url);
     
  }, [coverFile]);

  useEffect(() => {
    setIntro((prevIntro) => {
      const all = [...prevIntro, ...gallery];
      if (INTRO_LAYOUTS.includes(form.layout)) {
        setGallery(all.slice(1));
        return all.slice(0, 1);
      }
      setGallery(all);
      return [];
    });
     
  }, [form.layout]);

  useEffect(() => {
    return () => {
      [intro, gallery, closing].flat().forEach((e) => e?.file && URL.revokeObjectURL(e.preview));
    };
     
  }, []);

  const introOn = form.layout === "image_after_intro" || form.layout === "intro_middle";
  const middleOn = form.layout === "gallery_middle" || form.layout === "intro_middle";
  const setPlacement = (nextIntro, nextMiddle) => {
    const layout = nextIntro && nextMiddle ? "intro_middle" : nextIntro ? "image_after_intro" : nextMiddle ? "gallery_middle" : "cover_top";
    set("layout", layout);
  };

  const orderedImages = useMemo(
    () => (INTRO_LAYOUTS.includes(form.layout) ? [...intro, ...gallery] : gallery),
    [form.layout, intro, gallery]
  );
  const previewImages = useMemo(
    () => orderedImages.map((e) => ({ url: e.preview || e.url, alt: e.alt, caption: e.caption })).filter((o) => o.url),
    [orderedImages]
  );
  const closingPreview = hasClosing && closing[0]
    ? { url: closing[0].preview || closing[0].url, alt: closing[0].alt, caption: closing[0].caption }
    : "";

  const slotState = {
    intro: [intro, setIntro],
    gallery: [gallery, setGallery],
    closing: [closing, setClosing],
  };
  const galleryLabel = middleOn
    ? "Middle Gallery Images — placed in the middle of the article"
    : "Gallery Images — placed at the end of the article";

  const addFiles = (key, files, multi) => {
    const [list, setList] = slotState[key];
    const entries = Array.from(files).map(entryForFile);
    if (multi) {
      setList([...list, ...entries]);
    } else {
      list.forEach((e) => e?.file && URL.revokeObjectURL(e.preview));
      setList(entries.slice(0, 1));
    }
  };

  const updateMeta = (key, id, field, value) => {
    const [list, setList] = slotState[key];
    setList(list.map((e) => (e.id === id ? { ...e, [field]: value } : e)));
  };

  const removeEntry = (key, id) => {
    const [list, setList] = slotState[key];
    const found = list.find((e) => e.id === id);
    if (found?.file) URL.revokeObjectURL(found.preview);
    setList(list.filter((e) => e.id !== id));
  };

  const toggleClosing = (on) => {
    setHasClosing(on);
    if (!on) {
      closing.forEach((e) => e?.file && URL.revokeObjectURL(e.preview));
      setClosing([]);
    }
  };

  const toggleCat = (c) =>
    set("categories", form.categories.includes(c) ? form.categories.filter((x) => x !== c) : [...form.categories, c]);

  const addTag = (t) => {
    t = (t || "").trim();
    if (!t) return;
    set("tags", Array.from(new Set([...form.tags, t])));
  };
  const removeTag = (t) => set("tags", form.tags.filter((x) => x !== t));

  const locate = async () => {
    if (!geoAddress.trim()) return;
    setLocating(true);
    setGeoError("");
    try {
      const res = await base44.functions.invoke("geocodeAddress", { address: geoAddress });
      const d = res?.data || {};
      if (d.error) { setGeoError(d.error); return; }
      set("geo_lat", d.lat);
      set("geo_lng", d.lng);
      if (d.region) set("geo_region", d.region);
      set("geo_placename", d.placename || geoAddress);
    } catch (e) {
      setGeoError(e?.message || "Failed to geocode address");
    } finally {
      setLocating(false);
    }
  };

  const renderSlot = (key, multi) => {
    const [list] = slotState[key];
    const label = key === "gallery" ? galleryLabel : SLOT_LABELS[key];
    return (
      <div className="border border-border p-4">
        <label className="font-mono-caps text-[11px] text-muted-foreground">{label}</label>
        <input
          type="file"
          accept="image/*"
          multiple={multi}
          className={`${input} mt-2 file:mr-4 file:border-0 file:bg-muted file:px-3 file:py-1 file:font-mono-caps file:text-[11px]`}
          onChange={(e) => addFiles(key, e.target.files || [], multi)}
        />
        {list.length > 0 && (
          <div className="mt-3 space-y-3">
            {list.map((e) => (
              <div key={e.id} className="border border-border p-3">
                <div className="relative group">
                  <img src={e.preview || e.url} alt="" className="aspect-video w-full object-cover" />
                  <button
                    type="button"
                    onClick={() => removeEntry(key, e.id)}
                    className="absolute top-1 right-1 bg-background/80 p-1 opacity-0 group-hover:opacity-100 transition-opacity"
                  >
                    <Trash2 className="h-3 w-3 text-destructive" />
                  </button>
                </div>
                <input className={`${input} mt-2`} placeholder="Alt text (accessibility & SEO)" value={e.alt} onChange={(ev) => updateMeta(key, e.id, "alt", ev.target.value)} />
                <input className={`${input} mt-2`} placeholder="Caption (shown beneath the image)" value={e.caption} onChange={(ev) => updateMeta(key, e.id, "caption", ev.target.value)} />
              </div>
            ))}
          </div>
        )}
      </div>
    );
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setSaving(true);
    let cover_image_url = form.cover_image_url;
    if (coverFile) {
      const r = await base44.integrations.Core.UploadFile({ file: coverFile });
      cover_image_url = r.file_url;
    }
    const images = [];
    for (const entry of orderedImages) {
      if (!entry.file && !entry.url) continue;
      let url = entry.url;
      if (entry.file) {
        const r = await base44.integrations.Core.UploadFile({ file: entry.file });
        url = r.file_url;
      }
      images.push({ url, alt: entry.alt || "", caption: entry.caption || "" });
    }
    let closing_image_url = "", closing_image_alt = "", closing_image_caption = "";
    if (hasClosing && closing[0]) {
      const e = closing[0];
      if (e.file) { const r = await base44.integrations.Core.UploadFile({ file: e.file }); closing_image_url = r.file_url; }
      else closing_image_url = e.url;
      closing_image_alt = e.alt || "";
      closing_image_caption = e.caption || "";
    }
    const wordCount = (form.body || "").trim().split(/\s+/).filter(Boolean).length;
    const reading_time_mins = Math.max(1, Math.round(wordCount / 200));
    const payload = {
      ...form,
      slug: form.slug || slugify(form.title),
      cover_image_url,
      images,
      closing_image_url,
      closing_image_alt,
      closing_image_caption,
      author_id: user.id,
      reading_time_mins,
      geo_lat: form.geo_lat === "" ? undefined : Number(form.geo_lat),
      geo_lng: form.geo_lng === "" ? undefined : Number(form.geo_lng),
      publish_date: form.publish_date ? new Date(form.publish_date).toISOString() : undefined,
    };
    if (isEdit) {
      await base44.entities.Article.update(article.id, payload);
    } else {
      await base44.entities.Article.create(payload);
    }
    setSaving(false);
    onCreated();
  };

  return (
    <div className="fixed inset-0 z-50 bg-background/90 backdrop-blur-sm flex items-center justify-center p-6" onClick={onClose}>
      <div className="bg-card border border-border w-full max-w-6xl max-h-[92vh] overflow-hidden flex flex-col" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between px-6 py-5 border-b border-border shrink-0">
          <p className="font-mono-caps text-[11px]">{isEdit ? "Edit Article" : "New Article"} <span className="text-muted-foreground">— live preview on the right</span></p>
          <button onClick={onClose}><X className="h-4 w-4 text-muted-foreground" /></button>
        </div>
        <div className="grid grid-cols-1 lg:grid-cols-2 flex-1 min-h-0">
          <form onSubmit={handleSubmit} className="p-6 space-y-5 overflow-y-auto">
            <div><label className="font-mono-caps text-[11px] text-muted-foreground">Title *</label><input className={`${input} mt-2`} value={form.title} onChange={(e) => set("title", e.target.value)} required /></div>
            <div><label className="font-mono-caps text-[11px] text-muted-foreground">Subtitle</label><input className={`${input} mt-2`} value={form.subtitle} onChange={(e) => set("subtitle", e.target.value)} /></div>
            <div className="grid grid-cols-2 gap-4">
              <div><label className="font-mono-caps text-[11px] text-muted-foreground">Category</label>
                <select className="w-full border border-border bg-background px-4 py-3 text-base outline-none mt-2" value={form.category} onChange={(e) => set("category", e.target.value)}>
                  {["Interview", "Essay", "Review", "Open Call", "News", "Feature"].map((c) => <option key={c}>{c}</option>)}
                </select>
              </div>
              <div><label className="font-mono-caps text-[11px] text-muted-foreground">Author</label><input className={`${input} mt-2`} value={form.author_name} onChange={(e) => set("author_name", e.target.value)} /></div>
            </div>
            <div><label className="font-mono-caps text-[11px] text-muted-foreground">Body *</label><textarea className={`${input} mt-2 resize-none`} rows={10} value={form.body} onChange={(e) => set("body", e.target.value)} required placeholder="Use blank lines to separate paragraphs." /></div>

            <Section title="Cover Image">
              <input type="file" accept="image/*" className={`${input} file:mr-4 file:border-0 file:bg-muted file:px-3 file:py-1 file:font-mono-caps file:text-[11px]`} onChange={(e) => setCoverFile(e.target.files?.[0])} />
              <input className={`${input} mt-2`} placeholder="Cover alt text (accessibility & SEO)" value={form.cover_image_alt} onChange={(e) => set("cover_image_alt", e.target.value)} />
              <input className={`${input} mt-2`} placeholder="Cover caption (shown beneath the cover)" value={form.cover_image_caption} onChange={(e) => set("cover_image_caption", e.target.value)} />
            </Section>

            <Section title="Image Placements — toggle any combination">
              <div className="space-y-2">
                <label className="flex items-start gap-3 border border-border px-3 py-2.5 cursor-pointer hover:border-foreground">
                  <input type="checkbox" checked={introOn} onChange={(e) => setPlacement(e.target.checked, middleOn)} className="mt-0.5 h-4 w-4 accent-primary" />
                  <span><span className="font-mono-caps text-[11px]">Intro Image</span><span className="mt-1 block text-xs text-muted-foreground">Full-width image after paragraph 1.</span></span>
                </label>
                <label className="flex items-start gap-3 border border-border px-3 py-2.5 cursor-pointer hover:border-foreground">
                  <input type="checkbox" checked={middleOn} onChange={(e) => setPlacement(introOn, e.target.checked)} className="mt-0.5 h-4 w-4 accent-primary" />
                  <span><span className="font-mono-caps text-[11px]">Gallery in Middle</span><span className="mt-1 block text-xs text-muted-foreground">Gallery grid placed in the middle of the article. Off = gallery sits at the end.</span></span>
                </label>
              </div>
              <div className="mt-3 space-y-3">
                {INTRO_LAYOUTS.includes(form.layout) && <div>{renderSlot("intro", false)}</div>}
                <div>{renderSlot("gallery", true)}</div>
              </div>
              <label className="mt-4 flex items-center gap-2 cursor-pointer">
                <input type="checkbox" checked={hasClosing} onChange={(e) => toggleClosing(e.target.checked)} className="h-4 w-4 accent-primary" />
                <span className="font-mono-caps text-[11px] text-muted-foreground">Add a closing image before the final paragraph</span>
              </label>
              {hasClosing && <div className="mt-3">{renderSlot("closing", false)}</div>}
            </Section>

            <Section title="Taxonomy — Categories & Tags">
              <p className="text-xs text-muted-foreground mb-2">Categories — searchable (pick any):</p>
              <div className="flex flex-wrap gap-1.5">
                {CATEGORY_TAGS.map((c) => (
                  <button type="button" key={c} onClick={() => toggleCat(c)}
                    className={`font-mono-caps text-[10px] px-2 py-1 border transition-colors ${form.categories.includes(c) ? "border-primary bg-primary/10 text-primary" : "border-border text-muted-foreground hover:border-foreground"}`}>
                    {c}
                  </button>
                ))}
              </div>
              <p className="text-xs text-muted-foreground mt-4 mb-2">Tags — free-form keywords (press Enter):</p>
              <input className={input} placeholder="Add a tag and press Enter" value={tagInput}
                onChange={(e) => setTagInput(e.target.value)}
                onKeyDown={(e) => { if (e.key === "Enter" || e.key === ",") { e.preventDefault(); addTag(tagInput); setTagInput(""); } }} />
              {form.tags.length > 0 && (
                <div className="mt-2 flex flex-wrap gap-1.5">
                  {form.tags.map((t) => (
                    <span key={t} className="inline-flex items-center gap-1 font-mono-caps text-[10px] border border-border px-2 py-1">
                      {t}
                      <button type="button" onClick={() => removeTag(t)} className="text-muted-foreground hover:text-destructive"><X className="h-3 w-3" /></button>
                    </span>
                  ))}
                </div>
              )}
            </Section>

            <Section title="SEO Settings">
              <div><label className="font-mono-caps text-[11px] text-muted-foreground">URL Slug</label><input className={`${input} mt-2`} value={form.slug} onChange={(e) => set("slug", e.target.value)} placeholder="auto-generated from title if blank" /></div>
              <p className="mt-1 text-xs text-muted-foreground">Article page: /editorial/{form.slug || slugify(form.title) || "your-slug"}</p>
              <div className="mt-3"><label className="font-mono-caps text-[11px] text-muted-foreground">SEO Title</label><input className={`${input} mt-2`} value={form.seo_title} onChange={(e) => set("seo_title", e.target.value)} placeholder="defaults to article title" /></div>
              <div className="mt-3"><label className="font-mono-caps text-[11px] text-muted-foreground">Meta Description</label><textarea className={`${input} mt-2 resize-none`} rows={2} value={form.seo_description} onChange={(e) => set("seo_description", e.target.value)} placeholder="defaults to subtitle" /></div>
              <div className="mt-3"><label className="font-mono-caps text-[11px] text-muted-foreground">SEO Keywords (comma-separated)</label><input className={`${input} mt-2`} value={form.seo_keywords} onChange={(e) => set("seo_keywords", e.target.value)} /></div>
              <div className="grid grid-cols-2 gap-4 mt-3">
                <div><label className="font-mono-caps text-[11px] text-muted-foreground">Canonical URL</label><input className={`${input} mt-2`} value={form.canonical_url} onChange={(e) => set("canonical_url", e.target.value)} placeholder="optional" /></div>
                <div><label className="font-mono-caps text-[11px] text-muted-foreground">OG Image URL</label><input className={`${input} mt-2`} value={form.og_image_url} onChange={(e) => set("og_image_url", e.target.value)} placeholder="defaults to cover" /></div>
              </div>
            </Section>

            <Section title="GEO Settings — just type the address">
              <label className="font-mono-caps text-[11px] text-muted-foreground">Address</label>
              <div className="mt-2 flex gap-2">
                <input
                  className={input}
                  value={geoAddress}
                  onChange={(e) => setGeoAddress(e.target.value)}
                  onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); locate(); } }}
                  placeholder="e.g. 1 Hollywood Road, Hong Kong"
                />
                <button type="button" onClick={locate} disabled={locating} className="flex items-center gap-2 shrink-0 border border-foreground px-4 font-mono-caps text-[11px] hover:bg-foreground hover:text-background disabled:opacity-50">
                  {locating && <Loader2 className="h-3 w-3 animate-spin" />} Locate
                </button>
              </div>
              {geoError && <p className="mt-2 text-xs text-destructive">{geoError}</p>}
              {(form.geo_lat !== "" || form.geo_lng !== "") && (
                <div className="mt-3 flex flex-wrap gap-2">
                  {form.geo_placename && <span className="font-mono-caps text-[10px] border border-border px-2 py-1 text-muted-foreground">{form.geo_placename}</span>}
                  <span className="font-mono-caps text-[10px] border border-border px-2 py-1 text-muted-foreground">{form.geo_region && `${form.geo_region} · `}{form.geo_lat}, {form.geo_lng}</span>
                </div>
              )}
            </Section>

            <Section title="Publishing">
              <div><label className="font-mono-caps text-[11px] text-muted-foreground">Publish Date — to backdate or schedule</label>
                <input type="datetime-local" className={`${input} mt-2`} value={form.publish_date} onChange={(e) => set("publish_date", e.target.value)} />
                <p className="mt-1 text-xs text-muted-foreground">Leave blank to use the creation time. A future date hides the article until then.</p>
              </div>
              <div className="flex flex-wrap items-center gap-6 mt-3">
                <label className="flex items-center gap-2 cursor-pointer"><input type="checkbox" checked={form.published} onChange={(e) => set("published", e.target.checked)} className="h-4 w-4 accent-primary" /><span className="font-mono-caps text-[11px] text-muted-foreground">Publish immediately</span></label>
                <label className="flex items-center gap-2 cursor-pointer"><input type="checkbox" checked={form.featured} onChange={(e) => set("featured", e.target.checked)} className="h-4 w-4 accent-primary" /><span className="font-mono-caps text-[11px] text-muted-foreground">Featured</span></label>
              </div>
            </Section>

            <div className="flex flex-wrap items-center gap-4 pt-2 pb-6">
              <button type="submit" disabled={saving} className="flex items-center gap-2 bg-primary px-8 py-4 font-mono-caps text-[11px] text-primary-foreground hover:opacity-80 disabled:opacity-50">
                {saving && <Loader2 className="h-3 w-3 animate-spin" />} {isEdit ? "Save Changes" : "Publish Article"}
              </button>
              <button type="button" onClick={onClose} className="font-mono-caps text-[11px] text-muted-foreground">Cancel</button>
            </div>
          </form>
          <div className="hidden lg:block border-l border-border overflow-y-auto bg-background">
            <div className="p-6">
              <p className="font-mono-caps text-[10px] text-muted-foreground mb-4">Live Preview</p>
              <ArticlePreview data={{ ...form, cover_image_url: coverPreview, images: previewImages, closing_image_url: hasClosing && closing[0] ? (closing[0].preview || closing[0].url) : "" }} />
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}