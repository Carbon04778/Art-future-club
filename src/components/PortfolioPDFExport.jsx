import React, { useState } from "react";
import { Download, Loader2 } from "lucide-react";

/**
 * Export an artist's portfolio as a PDF.
 *
 * WHAT WAS WRONG
 *
 * 1. Only body text was wrapped. Headings, metadata and CV rows were drawn
 *    with doc.text() and no width, so a long title, venue or discipline ran
 *    straight off the right edge of the page and was simply lost. That is the
 *    "words deformed and running off the page" report.
 *
 * 2. Page breaks were guessed. A handful of `if (y > 250)` checks sat between
 *    sections, but nothing checked before drawing an individual line — so text
 *    ran off the BOTTOM too, and a work could be split across a break with its
 *    title on one page and its details on the next.
 *
 * 3. CV rows used fixed columns at 20mm and 100mm. A title longer than 80mm
 *    overlapped the venue beside it.
 *
 * 4. No images at all. A portfolio with no artwork in it is a strange thing to
 *    send a gallery.
 *
 * Every piece of text now goes through one function that wraps to the column
 * width and takes a page break when it runs out of room.
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
   * aspect ratio so pictures are not stretched.
   */
  const loadImage = (url) =>
    new Promise((resolve) => {
      const img = new Image();
      img.crossOrigin = "anonymous";
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
          resolve({
            data: canvas.toDataURL("image/jpeg", 0.82),
            width: canvas.width,
            height: canvas.height,
          });
        } catch {
          // A cross-origin image taints the canvas. Skip it rather than
          // failing the whole export.
          resolve(null);
        }
      };
      img.onerror = () => resolve(null);
      img.src = url;
    });

  const generate = async () => {
    setGenerating(true);
    setError("");
    setProgress("Preparing…");

    try {
      // Loaded on demand — jsPDF is ~600kB and most visitors never export.
      const { default: jsPDF } = await import("jspdf");
      const doc = new jsPDF({ orientation: "portrait", unit: "mm", format: "a4" });

      const PAGE_W = 210;
      const PAGE_H = 297;
      const MARGIN = 20;
      const COL = PAGE_W - MARGIN * 2;   // usable width
      const BOTTOM = PAGE_H - MARGIN;    // last y a line may occupy
      let y = MARGIN;

      /** Start a new page if `needed` mm will not fit. */
      const room = (needed) => {
        if (y + needed > BOTTOM) {
          doc.addPage();
          y = MARGIN;
          return true;
        }
        return false;
      };

      /**
       * The only way text is written.
       *
       * Wraps to the column width, breaks the page when it runs out of room,
       * and keeps wrapped lines together rather than splitting mid-sentence.
       */
      const text = (
        value,
        { size = 10, bold = false, color = [50, 50, 50], upper = false, gap = 2, indent = 0, width } = {}
      ) => {
        if (value === undefined || value === null || value === "") return;
        const str = upper ? String(value).toUpperCase() : String(value);

        doc.setFont("helvetica", bold ? "bold" : "normal");
        doc.setFontSize(size);
        doc.setTextColor(...color);

        const lineH = size * 0.42;                     // mm per line at this size
        const lines = doc.splitTextToSize(str, width ?? COL - indent);

        for (const l of lines) {
          room(lineH);
          doc.text(l, MARGIN + indent, y);
          y += lineH;
        }
        y += gap;
      };

      const rule = (gap = 6) => {
        room(gap);
        doc.setDrawColor(200);
        doc.line(MARGIN, y, PAGE_W - MARGIN, y);
        y += gap;
      };

      const label = (value) =>
        text(value, { size: 8, color: [120, 120, 120], upper: true, gap: 3 });

      /* ------------------------------------------------------------ header */

      label("Art Future Club — Artist Portfolio");
      text(profile.display_name, { size: 26, bold: true, color: [15, 15, 15], gap: 3 });

      const sub = [profile.discipline, profile.chapter && `AFC ${profile.chapter}`, profile.based_in]
        .filter(Boolean)
        .join("  ·  ");
      text(sub, { size: 10, color: [100, 100, 100], gap: 6 });
      rule();

      /* -------------------------------------------------------------- bio */

      if (profile.bio) {
        label("Practice");
        text(profile.bio, { size: 10, gap: 6 });
      }

      if (profile.cv?.statement) {
        label("Artist Statement");
        text(profile.cv.statement, { size: 10, gap: 6 });
      }

      /* ------------------------------------------------------------ links */

      const links = [
        profile.website,
        profile.instagram && `instagram.com/${String(profile.instagram).replace(/^@/, "")}`,
        profile.linkedin,
      ].filter(Boolean);

      if (links.length) {
        label("Links");
        links.forEach((l) => text(l, { size: 9, color: [60, 100, 200], gap: 1 }));
        y += 4;
      }

      /* --------------------------------------------------------------- CV */

      /**
       * A CV row: year, title, venue.
       *
       * Laid out in real columns that WRAP. The old version drew each field at
       * a fixed offset with no width, so a long title ran under the venue
       * beside it and a long venue ran off the page entirely.
       */
      const cvSection = (heading, items) => {
        if (!items?.length) return;
        room(20);
        rule();
        label(heading);

        const YEAR_W = 18;
        const VENUE_W = 55;
        const TITLE_W = COL - YEAR_W - VENUE_W - 6;

        items.forEach((item) => {
          doc.setFont("helvetica", "normal");
          doc.setFontSize(9.5);

          const titleLines = doc.splitTextToSize(String(item.title || ""), TITLE_W);
          const venueLines = doc.splitTextToSize(String(item.venue || ""), VENUE_W);
          const rowH = Math.max(titleLines.length, venueLines.length, 1) * 4.2 + 2.5;

          room(rowH);
          const top = y;

          doc.setFont("helvetica", "bold");
          doc.setTextColor(15, 15, 15);
          doc.text(String(item.year || ""), MARGIN, top);

          doc.setFont("helvetica", "normal");
          doc.setTextColor(40, 40, 40);
          doc.text(titleLines, MARGIN + YEAR_W, top);

          doc.setTextColor(120, 120, 120);
          doc.text(venueLines, MARGIN + YEAR_W + TITLE_W + 6, top);

          y = top + rowH;
        });
        y += 2;
      };

      cvSection("Exhibitions", profile.cv?.exhibitions);
      cvSection("Education", profile.cv?.education);
      cvSection("Awards & Residencies", profile.cv?.awards);

      /* ------------------------------------------------------------- works */

      const works = profile.portfolio_works || [];
      if (works.length) {
        doc.addPage();
        y = MARGIN;
        label("Portfolio Works");
        y += 2;

        for (let i = 0; i < works.length; i++) {
          const work = works[i];
          setProgress(`Adding artwork ${i + 1} of ${works.length}…`);

          const image = work.image_url ? await loadImage(work.image_url) : null;

          // How much room does this whole entry need? Working it out first
          // means a title never sits alone at the foot of a page with its
          // picture on the next.
          const imgH = image ? Math.min(110, (COL * image.height) / image.width) : 0;
          room(imgH + 30);

          if (image) {
            const w = Math.min(COL, (imgH * image.width) / image.height);
            doc.addImage(image.data, "JPEG", MARGIN, y, w, imgH);
            y += imgH + 5;
          }

          text(work.title || "Untitled", { size: 13, bold: true, color: [15, 15, 15], gap: 1.5 });

          const meta = [work.medium, work.dimensions, work.year].filter(Boolean).join("  ·  ");
          text(meta, { size: 8.5, color: [120, 120, 120], upper: true, gap: 2 });

          if (work.description) text(work.description, { size: 9, gap: 2 });

          if (work.available_for_sale && work.price) {
            text(`${work.currency || "USD"} ${work.price}`, {
              size: 9, bold: true, color: [60, 100, 200], gap: 2,
            });
          }

          y += 6;
          if (i < works.length - 1) rule(4);
        }
      }

      /* ------------------------------------------------------------ footer */

      // Written last, on every page, so the count is right.
      const pages = doc.getNumberOfPages();
      for (let p = 1; p <= pages; p++) {
        doc.setPage(p);
        doc.setFont("helvetica", "normal");
        doc.setFontSize(7);
        doc.setTextColor(160, 160, 160);
        doc.text(
          `Art Future Club — artfutureclub.com  ·  ${new Date().toLocaleDateString()}`,
          MARGIN,
          PAGE_H - 8
        );
        doc.text(`${p} / ${pages}`, PAGE_W - MARGIN, PAGE_H - 8, { align: "right" });
      }

      const safe = (profile.display_name || "portfolio").replace(/[^\w-]+/g, "-");
      doc.save(`${safe}-AFC-Portfolio.pdf`);
    } catch (err) {
      setError(String(err?.message || err) || "Could not create the PDF.");
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
      {error && <span className="text-xs text-destructive">{error}</span>}
    </span>
  );
}
