/**
 * Portfolio PDF layout.
 *
 * WHY THIS IS A SEPARATE FILE
 *
 * The layout used to live inside PortfolioPDFExport.jsx, and scripts/
 * verify-pdf.mjs tested it by keeping its OWN COPY of the two helpers. So the
 * suite proved that a copy of the algorithm wrapped text correctly, while the
 * real component was free to drift. The pagination bug below was invisible to
 * it for exactly that reason. The builder lives here now, takes jsPDF and an
 * image loader as arguments, and the suite imports the real thing.
 *
 *
 * WHAT WAS WRONG WITH THE OUTPUT
 *
 * 1. PAGINATION FOUGHT ITSELF. Works were placed by two rules at once:
 *
 *        if (i > 0 && i % 2 === 0) { doc.addPage(); }   // "two to a page"
 *        room(BLOCK);                                   // "break if short"
 *
 *    `i % 2` assumes every page opens with an even-numbered work. It does not:
 *    the first works page opens with a section heading, which costs ~17mm. So
 *    work 0 ended low, work 1 no longer fitted and `room()` gave it a page of
 *    its own — and then work 2 took ANOTHER new page because its index was
 *    even, though 139mm was free above it. A four-work portfolio came out
 *    1 / 1 / 2 across three pages with two of them two-thirds empty.
 *
 * 2. EVERY WORK CLAIMED THE SAME HEIGHT. The loop ended `y = top + BLOCK` with
 *    BLOCK fixed at 118mm, sized for the tallest case. A work with a four-line
 *    description left the same hole in the page as a full-height portrait.
 *
 * Both are gone. Each work is now MEASURED before it is drawn — the image at
 * its true aspect ratio, the text through the same wrapper that will draw it —
 * and placed on the current page if it fits, on a fresh one if it does not.
 * Nothing else decides. Pages fill in order and no work is ever split.
 *
 * A dry run and a real run use one code path (`text(..., { dry: true })`), so
 * a measurement cannot disagree with what lands on the page.
 */

export const PAGE_W = 210;
export const PAGE_H = 297;
export const MARGIN = 20;
export const COL = PAGE_W - MARGIN * 2;
export const BOTTOM = PAGE_H - MARGIN;

/** Left-hand image column for a work, and the gap to its text. */
const IMG_W = 72;
const IMG_MAX_H = 96;
const GUTTER = 8;

/** Vertical space between two works sharing a page. */
const SEP = 12;

/**
 * Measure for running prose.
 *
 * The bio and statement were set across the full 170mm column, which at 10pt
 * is around 100 characters a line — well past the 60-75 that reads
 * comfortably. Combined with tight leading it made the statement a grey slab.
 * Narrowing the measure is the single biggest readability change here; the
 * section rules stay full width, which reads as deliberate rather than short.
 */
const PROSE_W = 128;

/**
 * Line height as a multiple of the point size, in mm.
 *
 * 0.42 is 1.19x the glyph height — fine for a heading, too tight for a
 * paragraph. Prose gets 0.50 (about 1.4x), which is ordinary book leading.
 */
const LEAD_TIGHT = 0.42;
const LEAD_PROSE = 0.50;

/** Space between paragraphs within one block of prose. */
const PARA_GAP = 3;

/**
 * Readable, unambiguous date for the footer.
 *
 * toLocaleDateString() gave "9/1/2026", which is 9 January to most of the
 * world and 1 September to the rest. This portfolio is sent to galleries in
 * eight cities.
 */
function footerDate(now = new Date()) {
  const months = ["January", "February", "March", "April", "May", "June",
    "July", "August", "September", "October", "November", "December"];
  return `${now.getDate()} ${months[now.getMonth()]} ${now.getFullYear()}`;
}

/**
 * Build the document.
 *
 * @param {object}   opts
 * @param {Function} opts.jsPDF     the jsPDF constructor
 * @param {object}   opts.profile   artist profile
 * @param {Function} [opts.loadImage]  async (url) => { data, width, height } | null
 * @param {Function} [opts.onProgress] (message) => void
 * @param {Date}     [opts.now]     injectable, so tests are not date-dependent
 * @returns {Promise<object>} the jsPDF document, ready to save
 */
export async function buildPortfolioPdf({
  jsPDF,
  profile,
  loadImage = async () => null,
  onProgress = () => {},
  now = new Date(),
}) {
  const doc = new jsPDF({ orientation: "portrait", unit: "mm", format: "a4" });
  let y = MARGIN;

  /** Start a new page if `needed` mm will not fit below the cursor. */
  const room = (needed) => {
    if (y + needed > BOTTOM) {
      doc.addPage();
      y = MARGIN;
      return true;
    }
    return false;
  };

  /**
   * The only way text is written — and the only way it is measured.
   *
   * With `dry: true` it draws nothing, moves nothing, and returns the height
   * it WOULD have taken. Same font, same wrap, same arithmetic, so the layout
   * pass and the drawing pass can never disagree.
   *
   * ⚠️ EVERY LINE IS DRAWN WITH baseline: "top".
   *
   * jsPDF's default places y at the BASELINE, so glyphs are painted ABOVE the
   * cursor — while this helper advances the cursor afterwards as though y were
   * the top of the line. Each line therefore sat one line-height too high, and
   * the error grew with the font size: invisible between two 10pt lines, and
   * an outright collision between the 7.5pt cover label and the 30pt name,
   * which overlapped to the millimetre.
   *
   *     label ink   68.1 .. 70.0mm
   *     name ink    70.0 .. 77.7mm     <- starts where the label ends
   *
   * With baseline "top", y means the top of the line box, which is what every
   * measurement here already assumed — and what doc.addImage() has always
   * meant, so text and the image beside it now start level.
   *
   * @returns {number} height in mm, including the trailing gap
   */
  const text = (value, opts = {}) => {
    const {
      size = 10, bold = false, color = [50, 50, 50], upper = false,
      gap = 2, indent = 0, width, dry = false, lead = LEAD_TIGHT,
    } = opts;

    if (value === undefined || value === null || value === "") return 0;
    const str = upper ? String(value).toUpperCase() : String(value);

    doc.setFont("helvetica", bold ? "bold" : "normal");
    doc.setFontSize(size);
    if (!dry) doc.setTextColor(...color);

    const lineH = size * lead;
    const w = width ?? COL - indent;

    /*
     * A blank line in the source is a paragraph break and is drawn as one.
     * Every line previously got the same leading, so a statement written in
     * three paragraphs arrived as a single unbroken block.
     */
    const paragraphs = str.split(/\n[ \t]*\n/);

    let height = 0;
    paragraphs.forEach((para, i) => {
      const lines = doc.splitTextToSize(para, w);
      height += lines.length * lineH;
      if (!dry) {
        for (const l of lines) {
          room(lineH);
          // baseline: "top" — see the note above the helper. Without it jsPDF
          // treats y as the baseline and the glyphs are drawn ABOVE the cursor.
          doc.text(l, MARGIN + indent, y, { baseline: "top" });
          y += lineH;
        }
      }
      if (i < paragraphs.length - 1) {
        height += PARA_GAP;
        if (!dry) y += PARA_GAP;
      }
    });

    height += gap;
    if (!dry) y += gap;
    return height;
  };

  /** A small grey caption. */
  const label = (value) =>
    text(value, { size: 7.5, color: [140, 140, 140], upper: true, gap: 2.5 });

  /** A section heading with a rule beneath it. */
  const section = (title) => {
    room(24);
    y += 5;
    text(title, { size: 12, bold: true, color: [15, 15, 15], upper: true, gap: 1.5 });
    doc.setDrawColor(210);
    doc.line(MARGIN, y, PAGE_W - MARGIN, y);
    y += 4;
  };

  /* ---------------------------------------------------------- title page */

  y = 70;
  label("Art Future Club — Artist Portfolio");
  y += 2;
  text(profile.display_name, { size: 30, bold: true, color: [15, 15, 15], gap: 4 });

  const sub = [profile.discipline, profile.chapter && `AFC ${profile.chapter}`, profile.based_in]
    .filter(Boolean)
    .join("   ·   ");
  text(sub, { size: 10.5, color: [110, 110, 110], gap: 5 });

  doc.setDrawColor(15, 15, 15);
  doc.setLineWidth(0.6);
  doc.line(MARGIN, y, MARGIN + 40, y);
  doc.setLineWidth(0.2);
  y += 10;

  const links = [
    profile.website,
    profile.instagram && `instagram.com/${String(profile.instagram).replace(/^@/, "")}`,
    profile.linkedin,
  ].filter(Boolean);

  if (links.length) {
    links.forEach((l) => text(l, { size: 9, color: [90, 90, 90], gap: 1 }));
    y += 4;
  }

  /* -------------------------------------------------- practice & statement */

  if (profile.bio || profile.cv?.statement) {
    doc.addPage();
    y = MARGIN;
  }

  if (profile.bio) {
    section("Practice");
    text(profile.bio, { size: 10, gap: 4, width: PROSE_W, lead: LEAD_PROSE });
  }

  if (profile.cv?.statement) {
    section("Artist Statement");
    text(profile.cv.statement, { size: 10, gap: 4, width: PROSE_W, lead: LEAD_PROSE });
  }

  /* --------------------------------------------------------------- CV */

  /**
   * A CV row: year, title, venue, in columns that wrap.
   *
   * The row height is the tallest of its three cells, so a two-line title
   * cannot run under the venue beside it.
   */
  const cvSection = (heading, items) => {
    if (!items?.length) return;
    section(heading);

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
      doc.text(String(item.year || ""), MARGIN, top, { baseline: "top" });

      doc.setFont("helvetica", "normal");
      doc.setTextColor(40, 40, 40);
      doc.text(titleLines, MARGIN + YEAR_W, top, { baseline: "top" });

      doc.setTextColor(120, 120, 120);
      doc.text(venueLines, MARGIN + YEAR_W + TITLE_W + 6, top, { baseline: "top" });

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
    section(`Works — ${works.length} piece${works.length === 1 ? "" : "s"}`);

    for (let i = 0; i < works.length; i++) {
      const work = works[i];
      onProgress(`Adding artwork ${i + 1} of ${works.length}…`);

      const image = work.image_url ? await loadImage(work.image_url) : null;

      /*
       * Image at its true aspect ratio, capped on the long edge so a tall
       * portrait cannot swallow a page on its own.
       */
      let imgW = 0;
      let imgH = 0;
      if (image && image.width > 0 && image.height > 0) {
        imgH = Math.min(IMG_MAX_H, (IMG_W * image.height) / image.width);
        imgW = (imgH * image.width) / image.height;
      }
      const hasImage = imgH > 0;

      /*
       * With no image the text takes the full column rather than sitting in a
       * narrow strip beside an empty space. An image that fails to load — a
       * dead URL, a cross-origin refusal — should not leave a hole.
       */
      const indent = hasImage ? IMG_W + GUTTER : 0;
      const textW = COL - indent;

      const meta = [work.medium, work.dimensions, work.year].filter(Boolean).join("  ·  ");
      const price =
        work.available_for_sale && work.price ? `${work.currency || "USD"} ${work.price}` : "";

      /** Every piece of text in the block, drawn and measured from one list. */
      const parts = [
        [work.title || "Untitled", { size: 13, bold: true, color: [15, 15, 15], gap: 2 }],
        [meta, { size: 8, color: [130, 130, 130], upper: true, gap: 3 }],
        [price, { size: 9.5, bold: true, color: [60, 100, 200], gap: 3 }],
        [work.description, { size: 8.5, color: [70, 70, 70], gap: 0, lead: LEAD_PROSE }],
      ];

      let textH = 0;
      for (const [value, opts] of parts) {
        textH += text(value, { ...opts, width: textW, dry: true });
      }

      const blockH = Math.max(imgH, textH);

      /*
       * Place it. A separator is only needed if something is already on this
       * page, and it counts towards the space required — otherwise a block
       * that "just fits" pushes its own rule past the bottom margin.
       */
      const needsSeparator = y > MARGIN;
      const needed = blockH + (needsSeparator ? SEP : 0);

      if (needsSeparator && y + needed > BOTTOM) {
        doc.addPage();
        y = MARGIN;
      } else if (needsSeparator) {
        doc.setDrawColor(232);
        doc.line(MARGIN, y + SEP / 2, PAGE_W - MARGIN, y + SEP / 2);
        y += SEP;
      }

      const top = y;

      if (hasImage) {
        doc.addImage(image.data, "JPEG", MARGIN, top, imgW, imgH);
      }

      y = top;
      for (const [value, opts] of parts) {
        text(value, { ...opts, width: textW, indent });
      }

      /*
       * Advance past the taller of the two columns. A description longer than
       * a whole page will already have broken inside text() — rare, and it
       * loses nothing; Math.max keeps the cursor honest either way.
       */
      y = Math.max(y, top + blockH);
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
    // PAGE_H - 10 with a top baseline sits where PAGE_H - 8 sat with the
    // default one, so the footer has not moved on the page.
    doc.text(
      `Art Future Club — artfutureclub.com  ·  ${footerDate(now)}`,
      MARGIN,
      PAGE_H - 10,
      { baseline: "top" }
    );
    doc.text(`${p} / ${pages}`, PAGE_W - MARGIN, PAGE_H - 10, { align: "right", baseline: "top" });
  }

  return doc;
}

/** Filename for the download. */
export function portfolioFileName(profile) {
  const safe = (profile?.display_name || "portfolio").replace(/[^\w-]+/g, "-");
  return `${safe}-AFC-Portfolio.pdf`;
}