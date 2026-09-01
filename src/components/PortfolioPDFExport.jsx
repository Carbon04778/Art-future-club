import React, { useState } from "react";
import { Download, Loader2 } from "lucide-react";
import { buildPortfolioPdf, portfolioFileName } from "@/lib/portfolioPdf";

/**
 * Export an artist's portfolio as a PDF.
 *
 * The page layout lives in src/lib/portfolioPdf.js. It was moved out of this
 * file because scripts/verify-pdf.mjs could not import it from a React
 * component, so the suite kept its own copy of the layout helpers and tested
 * that instead — which is how a pagination bug reached the client with every
 * check passing. The suite now imports the real builder.
 *
 * What stays here is what only a browser can do: fetching the image bytes and
 * saving the file.
 */
export default function PortfolioPDFExport({ profile }) {
  const [generating, setGenerating] = useState(false);
  const [progress, setProgress] = useState("");
  const [error, setError] = useState("");

  /**
   * Fetch an image and return it as a data URL plus its true dimensions.
   *
   * Drawn through a canvas rather than passed to jsPDF directly: images are
   * stored as WebP, which jsPDF cannot embed, and the canvas gives us the
   * aspect ratio, which the layout needs to size the block.
   *
   * Never rejects. A single unreachable artwork must not cost the artist the
   * whole export — the layout gives the text the full column width when an
   * image is missing, so the page still reads properly.
   */
  const loadImage = (url) =>
    new Promise((resolve) => {
      const img = new Image();
      img.crossOrigin = "anonymous";

      // A dead or very slow URL would otherwise leave the button spinning with
      // nothing shown — the failure mode the client cannot diagnose.
      const timer = setTimeout(() => resolve(null), 15000);
      const done = (value) => { clearTimeout(timer); resolve(value); };

      img.onload = () => {
        try {
          // Cap the long edge. A 4000px photograph would produce a PDF too
          // large to email, which defeats the point of the export.
          const MAX = 1400;
          const scale = Math.min(1, MAX / Math.max(img.naturalWidth, img.naturalHeight));
          const canvas = document.createElement("canvas");
          canvas.width = Math.round(img.naturalWidth * scale);
          canvas.height = Math.round(img.naturalHeight * scale);
          canvas.getContext("2d").drawImage(img, 0, 0, canvas.width, canvas.height);
          done({
            data: canvas.toDataURL("image/jpeg", 0.82),
            width: canvas.width,
            height: canvas.height,
          });
        } catch {
          // A cross-origin image taints the canvas. Skip it rather than
          // failing the whole export.
          done(null);
        }
      };
      img.onerror = () => done(null);
      img.src = url;
    });

  const generate = async () => {
    setGenerating(true);
    setError("");
    setProgress("Preparing…");

    try {
      // Loaded on demand — jsPDF is ~600kB and most visitors never export.
      const mod = await import("jspdf");
      const jsPDF = mod.jsPDF || mod.default;

      const doc = await buildPortfolioPdf({
        jsPDF,
        profile,
        loadImage,
        onProgress: setProgress,
      });

      doc.save(portfolioFileName(profile));
    } catch (err) {
      // The client cannot open a console. Name the cause in the interface.
      setError(
        `Could not create the PDF: ${String(err?.message || err)}. ` +
        `Please send this message on.`
      );
    } finally {
      setGenerating(false);
      setProgress("");
    }
  };

  return (
    <span className="inline-flex flex-col gap-1">
      <button
        onClick={generate}
        disabled={generating}
        className="flex items-center gap-2 border border-border px-4 py-2.5 font-mono-caps text-[11px] text-muted-foreground hover:border-foreground hover:text-foreground transition-colors disabled:opacity-50"
      >
        {generating ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Download className="h-3.5 w-3.5" />}
        {generating ? progress || "Generating…" : "Export PDF Portfolio"}
      </button>
      {error && <span className="max-w-xs text-xs text-destructive">{error}</span>}
    </span>
  );
}