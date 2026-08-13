import React, { useState } from "react";
import { Download, Loader2 } from "lucide-react";

export default function PortfolioPDFExport({ profile }) {
  const [generating, setGenerating] = useState(false);

  const generate = async () => {
    setGenerating(true);
    // Loaded on demand — jsPDF is ~600kB and most visitors never export.
    const { default: jsPDF } = await import("jspdf");
    const doc = new jsPDF({ orientation: "portrait", unit: "mm", format: "a4" });
    const W = 210;
    const margin = 20;
    let y = margin;

    const line = () => { doc.setDrawColor(200); doc.line(margin, y, W - margin, y); y += 6; };
    const mono = (text, size = 8, color = [120, 120, 120]) => { doc.setFont("helvetica", "normal"); doc.setFontSize(size); doc.setTextColor(...color); doc.text(text.toUpperCase(), margin, y); y += size * 0.5; };
    const heading = (text, size = 22) => { doc.setFont("helvetica", "bold"); doc.setFontSize(size); doc.setTextColor(15, 15, 15); doc.text(text, margin, y); y += size * 0.6; };
    const body = (text, size = 10, maxW = W - margin * 2) => {
      doc.setFont("helvetica", "normal"); doc.setFontSize(size); doc.setTextColor(50, 50, 50);
      const lines = doc.splitTextToSize(text, maxW);
      doc.text(lines, margin, y);
      y += lines.length * size * 0.5 + 2;
    };

    // Header
    mono("Art Future Club — Artist Portfolio", 8);
    y += 6;
    heading(profile.display_name, 28);
    y += 2;
    mono(`${profile.discipline || ""}${profile.chapter ? " · AFC " + profile.chapter : ""}${profile.based_in ? " · " + profile.based_in : ""}`, 9, [100, 100, 100]);
    y += 8;
    line();

    // Bio
    if (profile.bio) {
      mono("Practice", 8);
      y += 4;
      body(profile.bio, 10);
      y += 6;
    }

    // Artist Statement
    if (profile.cv?.statement) {
      mono("Artist Statement", 8);
      y += 4;
      body(profile.cv.statement, 10);
      y += 6;
    }

    // Links
    const links = [profile.website, profile.instagram && `instagram.com/${profile.instagram}`, profile.linkedin].filter(Boolean);
    if (links.length) {
      mono("Links", 8); y += 4;
      links.forEach((l) => { body(l, 9, [60, 100, 200]); });
      y += 4;
    }

    // CV sections
    const cvSection = (label, items) => {
      if (!items?.length) return;
      if (y > 250) { doc.addPage(); y = margin; }
      line();
      mono(label, 8); y += 4;
      items.forEach((item) => {
        doc.setFont("helvetica", "bold"); doc.setFontSize(10); doc.setTextColor(15, 15, 15);
        doc.text(`${item.year || ""}`, margin, y);
        doc.setFont("helvetica", "normal");
        doc.text(`${item.title || ""}`, margin + 20, y);
        doc.setTextColor(100, 100, 100);
        doc.text(`${item.venue || ""}`, margin + 100, y);
        y += 7;
      });
    };
    cvSection("Exhibitions", profile.cv?.exhibitions);
    cvSection("Education", profile.cv?.education);
    cvSection("Awards & Residencies", profile.cv?.awards);

    // Portfolio Works
    if (profile.portfolio_works?.length) {
      if (y > 200) { doc.addPage(); y = margin; }
      line();
      mono("Portfolio Works", 8); y += 4;
      profile.portfolio_works.forEach((work, i) => {
        if (y > 260) { doc.addPage(); y = margin; }
        heading(work.title, 14);
        const meta = [work.medium, work.dimensions, work.year].filter(Boolean).join(" · ");
        if (meta) { mono(meta, 8, [120, 120, 120]); y += 3; }
        if (work.description) { body(work.description, 9); }
        if (work.available_for_sale && work.price) {
          mono(`For Sale: ${work.currency || "USD"} ${work.price}`, 8, [60, 100, 200]); y += 3;
        }
        y += 4;
      });
    }

    // Footer
    doc.setFont("helvetica", "normal");
    doc.setFontSize(7);
    doc.setTextColor(160, 160, 160);
    doc.text(`Art Future Club — artfutureclub.com · Generated ${new Date().toLocaleDateString()}`, margin, 290);

    doc.save(`${profile.display_name.replace(/\s+/g, "-")}-AFC-Portfolio.pdf`);
    setGenerating(false);
  };

  return (
    <button
      onClick={generate}
      disabled={generating}
      className="flex items-center gap-2 border border-border px-4 py-2.5 font-mono-caps text-[11px] text-muted-foreground hover:border-foreground hover:text-foreground transition-colors disabled:opacity-50"
    >
      {generating ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Download className="h-3.5 w-3.5" />}
      {generating ? "Generating…" : "Export PDF Portfolio"}
    </button>
  );
}