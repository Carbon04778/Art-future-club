import React, { useState } from "react";
import { Image } from "@/components/ui/image";
import ImageCropBox from "@/components/ImageCropBox";
import { useFilePreview } from "@/hooks/useFilePreview";

/**
 * Choose and adjust a profile photo (B14 in docs/CLIENT-REQUESTS.md).
 *
 * Julie: "People are having difficulty uploading their profile images. They
 * are not able to adjust the view." The artist and gallery forms had a bare
 * file picker — the photo went up exactly as chosen and the round frame
 * took the middle of it. Only the collector and admin forms could crop.
 *
 * Now every member form uses this:
 *  - choose a photo → drag it into place and zoom, with the circle the
 *    profile will show drawn on top;
 *  - the round preview beside it shows the result as it will appear;
 *  - "Adjust current photo" re-opens a photo already uploaded, so nobody
 *    has to find the original file again to fix the framing;
 *  - "Cancel" keeps the photo that was there.
 *
 * onChange receives the file to upload (the adjusted square), or null when
 * nothing should change. The parent uploads it on save, as before.
 */
export default function ProfilePhotoPicker({ currentUrl, name, onChange, label = "Profile Photo", inputClassName = "" }) {
  const [raw, setRaw] = useState(null); // the photo being adjusted
  const [result, setResult] = useState(null); // what will be uploaded
  const [loading, setLoading] = useState(false);
  const [problem, setProblem] = useState("");
  const preview = useFilePreview(result);

  const pick = (file) => {
    setResult(file);
    onChange?.(file);
  };
  const start = (file) => {
    setProblem("");
    setRaw(file);
    // Until the crop box sends its first adjusted copy, the photo as chosen.
    pick(file);
  };
  const cancel = () => {
    setRaw(null);
    pick(null);
  };
  const adjustCurrent = async () => {
    setProblem("");
    setLoading(true);
    try {
      const res = await fetch(currentUrl, { mode: "cors" });
      if (!res.ok) throw new Error(String(res.status));
      const blob = await res.blob();
      if (!blob.type.startsWith("image/")) throw new Error(blob.type);
      start(new File([blob], "profile-photo", { type: blob.type }));
    } catch {
      setProblem("This photo can't be re-opened here. Choose the file again to adjust it.");
    } finally {
      setLoading(false);
    }
  };

  const shown = preview || currentUrl;
  return (
    <div className="flex flex-col gap-6 sm:flex-row sm:items-start sm:gap-8" data-testid="profile-photo-picker">
      <div className="h-24 w-24 shrink-0 overflow-hidden rounded-full bg-muted flex items-center justify-center" aria-label="How your photo will look">
        {preview
          ? <img src={preview} alt="Profile photo preview" className="h-full w-full object-cover" />
          : shown
            ? <Image src={shown} alt="Profile photo" fittingType="fill" className="h-full w-full object-cover" />
            : <span className="font-mono-caps text-2xl text-muted-foreground">{name?.[0]}</span>}
      </div>

      <div className="flex-1 min-w-0">
        <label className="block font-mono-caps text-[11px] text-muted-foreground mb-2">{label}</label>

        {raw && (
          <div className="mb-3 max-w-xs">
            <ImageCropBox file={raw} alt={name || "Profile photo"} round onChange={(f) => f && pick(f)} />
            <p className="mt-2 font-mono-caps text-[10px] text-muted-foreground">
              Drag the photo to position it, use the slider to zoom. The circle is what your profile shows.
            </p>
            <button type="button" onClick={cancel} className="mt-2 font-mono-caps text-[11px] text-muted-foreground underline hover:text-primary">
              Cancel — keep the current photo
            </button>
          </div>
        )}

        <input
          type="file"
          accept="image/*"
          aria-label={label}
          className={`${inputClassName} file:mr-4 file:border-0 file:bg-muted file:px-3 file:py-1 file:font-mono-caps file:text-[11px]`}
          onChange={(e) => {
            const f = e.target.files?.[0] || null;
            if (f) start(f);
            e.target.value = ""; // choosing the same file again still works
          }}
        />

        {!raw && currentUrl && (
          <button type="button" onClick={adjustCurrent} disabled={loading}
            className="mt-3 font-mono-caps text-[11px] text-primary hover:opacity-70 disabled:opacity-50">
            {loading ? "Opening…" : "Adjust current photo"}
          </button>
        )}
        {problem && <p className="mt-2 text-xs text-destructive" role="alert">{problem}</p>}
      </div>
    </div>
  );
}
