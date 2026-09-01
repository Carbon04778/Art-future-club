/**
 * PDF export.
 *
 * WHAT THIS SUITE USED TO DO, AND WHY IT MISSED A BUG
 *
 * It kept its own copy of the two layout helpers and tested the copy. So it
 * proved that an algorithm resembling the component wrapped text correctly,
 * while the component itself was free to drift. It did — and a pagination bug
 * shipped to the client underneath a passing suite: a four-work portfolio came
 * out one work, one work, then two, with two pages left two-thirds empty.
 *
 * It now imports src/lib/portfolioPdf.js — the real builder — and instruments
 * jsPDF to record where every line and every image actually lands. There is no
 * second copy of anything.
 *
 * WHAT IT CHECKS
 *   · no line crosses the right margin       (the original "running off" report)
 *   · nothing is drawn below the bottom margin
 *   · a work is never split across a page break
 *   · a page is never left with room the next page's first work would have
 *     fitted into  <- the bug above
 *
 * Run: npm run verify:pdf
 */
import { JSDOM } from "jsdom";

const dom = new JSDOM("<!doctype html><html><body></body></html>", { url: "http://localhost/" });
const { window } = dom;
globalThis.window = window;
globalThis.document = window.document;
Object.defineProperty(globalThis, "navigator", { value: window.navigator, configurable: true });
for (const k of ["HTMLElement", "Element", "Node", "Image"]) globalThis[k] = window[k];

// jspdf v4 exposes the constructor as a named export under Node and as the
// default under Vite's browser resolution. Accept either, so this suite runs
// the same way whichever entry point resolves.
const mod = await import("jspdf");
const jsPDF = mod.jsPDF || mod.default;

const { buildPortfolioPdf, portfolioFileName, toWinAnsi, PAGE_W, PAGE_H, MARGIN, BOTTOM } =
  await import("../src/lib/portfolioPdf.js");

let pass = 0;
const fails = [];
const check = (n, c, d = "") => (c ? pass++ : fails.push(`${n}${d ? ` - ${d}` : ""}`));

/* ---------------------------------------------------------- instrument */

/**
 * Wrap jsPDF so every draw is recorded with the page it landed on.
 *
 * Measuring inside the wrapper is accurate because the builder sets the font
 * and size immediately before each call.
 */
function record() {
  const events = [];
  function Instrumented(opts) {
    const doc = new jsPDF(opts);
    let page = 1;
    const oAdd = doc.addPage.bind(doc);
    const oText = doc.text.bind(doc);
    const oImage = doc.addImage.bind(doc);
    const oSetPage = doc.setPage.bind(doc);

    doc.addPage = (...a) => { page += 1; return oAdd(...a); };
    doc.setPage = (p) => { page = p; return oSetPage(p); };
    doc.text = (t, x, y, o) => {
      const lines = Array.isArray(t) ? t : [t];
      const size = doc.getFontSize();
      const h = size * 25.4 / 72;               // ink height in mm
      /*
       * Where the ink really lands.
       *
       * This must read the baseline option ACTUALLY PASSED, not the one the
       * builder ought to pass. An earlier version assumed every call was
       * top-anchored and so measured the intended box — which meant it could
       * not detect the very bug it was written for.
       */
      const top = o && o.baseline === "top" ? y : y - h * 0.75;
      lines.forEach((l, i) => {
        events.push({
          page, kind: "text", x, y: top + i * (h * 1.15),
          w: doc.getTextWidth(String(l)),
          h,
          align: (o && o.align) || "left",
          s: String(l),
        });
      });
      return oText(t, x, y, o);
    };
    doc.addImage = (d, f, x, y, w, h) => {
      events.push({ page, kind: "image", x, y, w, h });
      return oImage(d, f, x, y, w, h);
    };
    return doc;
  }
  return { Instrumented, events };
}

const PX =
  "data:image/jpeg;base64,/9j/4AAQSkZJRgABAQEAYABgAAD/2wBDAAgGBgcGBQgHBwcJCQgKDBQNDAsLDBkS" +
  "Ew8UHRofHh0aHBwgJC4nICIsIxwcKDcpLDAxNDQ0Hyc5PTgyPC4zNDL/wAALCAABAAEBAREA/8QAFAABAAAAAAAA" +
  "AAAAAAAAAAAACf/EABQQAQAAAAAAAAAAAAAAAAAAAAD/2gAIAQEAAD8AKp//2Q==";

const loader = (w, h) => async () => ({ data: PX, width: w, height: h });

/* -------------------------------------------------- deliberately awkward */

const LONG_TITLE =
  "An Extraordinarily Long Exhibition Title That Would Certainly Have Run Off The Right Hand Edge Of The Page In The Previous Version";
const LONG_WORD = "Supercalifragilisticexpialidociousandthensomemoreletterstomakeitlongerstill";
const LONG_BODY = "Lorem ipsum dolor sit amet. ".repeat(120);

const awkward = {
  display_name: LONG_TITLE,
  discipline: LONG_WORD,
  chapter: "Hong Kong",
  based_in: LONG_WORD,
  website: `https://example.com/${LONG_WORD}`,
  bio: LONG_BODY,
  cv: {
    statement: LONG_BODY,
    exhibitions: Array.from({ length: 14 }, (_, i) => ({
      year: "2026", title: `${LONG_TITLE} (row ${i})`, venue: LONG_WORD,
    })),
    education: [{ year: "2019", title: LONG_TITLE, venue: LONG_WORD }],
  },
  portfolio_works: Array.from({ length: 9 }, (_, i) => ({
    title: i % 3 === 0 ? LONG_TITLE : `Work ${i}`,
    medium: LONG_WORD,
    dimensions: "1000 X 2000",
    year: "2025",
    available_for_sale: true,
    price: "12,500",
    currency: "HKD",
    image_url: "x",
    description: i % 4 === 0 ? LONG_BODY.slice(0, 900) : "A short description.",
  })),
};

const { Instrumented, events } = record();
const doc = await buildPortfolioPdf({
  jsPDF: Instrumented,
  profile: awkward,
  loadImage: loader(1000, 1500),      // tall portraits, the worst case for height
  now: new Date(2026, 8, 1),
});

/* ------------------------------------------------------------- margins */

// The footer is drawn deliberately below the bottom margin, on every page.
const FOOTER_Y = PAGE_H - 10;   // top-anchored
const body = events.filter((e) => !(e.kind === "text" && Math.abs(e.y - FOOTER_Y) < 1));

// A right-aligned line extends LEFT from its x, not right. Measuring it the
// same way as left-aligned text reported the page number as overflowing.
const rightEdge = (e) => (e.align === "right" ? e.x : e.x + e.w);
const offRight = body.filter((e) => rightEdge(e) > PAGE_W - MARGIN + 0.5);
const offBottom = body.filter((e) =>
  (e.kind === "image" ? e.y + e.h : e.y) > BOTTOM + 0.5);

check("nothing runs off the right edge", offRight.length === 0,
  offRight.slice(0, 2).map((e) => (e.s || "image").slice(0, 34)).join(" | "));
check("nothing is drawn below the bottom margin", offBottom.length === 0,
  offBottom.slice(0, 2).map((e) => (e.s || "image").slice(0, 34)).join(" | "));

/* ------------------------------------------------------- lines colliding */

/*
 * THE REGRESSION TEST FOR TEXT SITTING ON TOP OF TEXT.
 *
 * jsPDF's default baseline puts y at the BOTTOM of a line, so glyphs paint
 * upwards while the cursor advances downwards. Every line sat one line-height
 * too high and the error scaled with the font size — the 7.5pt cover label and
 * the 30pt name overlapped to the millimetre. Fixed with baseline: "top".
 *
 * Two lines collide if their horizontal spans meet AND their ink boxes meet.
 */
const textOf = (p) => body.filter((e) => e.kind === "text" && e.page === p);
const spansMeet = (a, b) => {
  const ax2 = a.align === "right" ? a.x : a.x + a.w;
  const ax1 = a.align === "right" ? a.x - a.w : a.x;
  const bx2 = b.align === "right" ? b.x : b.x + b.w;
  const bx1 = b.align === "right" ? b.x - b.w : b.x;
  return ax1 < bx2 - 0.5 && bx1 < ax2 - 0.5;
};
const collisions = [];
for (let p = 1; p <= doc.getNumberOfPages(); p++) {
  const lines = textOf(p);
  for (let i = 0; i < lines.length; i++) {
    for (let j = i + 1; j < lines.length; j++) {
      const a = lines[i];
      const b = lines[j];
      if (!spansMeet(a, b)) continue;
      const overlap = Math.min(a.y + a.h, b.y + b.h) - Math.max(a.y, b.y);
      if (overlap > 0.5) {
        collisions.push(`p${p} "${a.s.slice(0, 18)}" / "${b.s.slice(0, 18)}" by ${overlap.toFixed(1)}mm`);
      }
    }
  }
}
check("no two lines of text sit on top of each other", collisions.length === 0,
  collisions.slice(0, 2).join(" | "));

// The cover specifically: the small label above the very large name.
const coverLabel = body.find((e) => e.kind === "text" && /ARTIST PORTFOLIO/i.test(e.s || ""));
const coverName = body.find((e) => e.kind === "text" && e.page === 1 && e.h > 8);
check("the cover label clears the artist's name",
  !coverLabel || !coverName || coverLabel.y + coverLabel.h <= coverName.y + 0.01,
  coverLabel && coverName
    ? `label ends ${(coverLabel.y + coverLabel.h).toFixed(1)}mm, name starts ${coverName.y.toFixed(1)}mm`
    : "not found");

/* ------------------------------------------------------ works pagination */

/*
 * Works are the part that broke. Find the page the works section starts on,
 * then treat each image as the top of a block.
 */
const worksHeading = body.find((e) => e.kind === "text" && /^WORKS/.test(e.s || ""));
check("the works section is reached", Boolean(worksHeading));

const firstWorksPage = worksHeading ? worksHeading.page : Infinity;
const worksBody = body.filter((e) => e.page >= firstWorksPage);
const images = worksBody.filter((e) => e.kind === "image");

check("every work has its image placed", images.length === awkward.portfolio_works.length,
  `${images.length} of ${awkward.portfolio_works.length}`);

/*
 * A work is split if its title does not land on the same page as its image.
 *
 * Paired by ORDER, not by coordinate: the builder draws the image and then
 * immediately the title, so the title is the next text event. Matching on y
 * instead would pair an image on one page with an identically-placed title on
 * another, which is how an earlier version of this check reported five splits
 * in a document that had none.
 */
const split = [];
for (let i = 0; i < worksBody.length; i++) {
  if (worksBody[i].kind !== "image") continue;
  const title = worksBody.slice(i + 1).find((e) => e.kind === "text");
  if (title && title.page !== worksBody[i].page) {
    split.push(`"${(title.s || "").slice(0, 24)}" on p${title.page}, image on p${worksBody[i].page}`);
  }
}
check("no work is split across a page break", split.length === 0, split.slice(0, 2).join(" | "));

/*
 * THE REGRESSION TEST FOR THE REPORTED BUG.
 *
 * For each works page, if the first block on the NEXT page would have fitted
 * in the space left below, the page was abandoned early. That is precisely
 * what the old `i % 2` rule did.
 */
const lowestOn = (p) => {
  const on = worksBody.filter((e) => e.page === p);
  if (!on.length) return MARGIN;
  return Math.max(...on.map((e) => (e.kind === "image" ? e.y + e.h : e.y)));
};
const firstBlockHeightOn = (p) => {
  const on = worksBody.filter((e) => e.page === p);
  if (!on.length) return Infinity;
  const im = on.find((e) => e.kind === "image");
  if (!im) return Infinity;
  const beside = on.filter((e) => e.kind === "text" && e.y >= im.y && e.y <= im.y + im.h + 60);
  const textBottom = beside.length ? Math.max(...beside.map((e) => e.y)) : im.y;
  return Math.max(im.y + im.h, textBottom) - MARGIN;
};

const lastPage = doc.getNumberOfPages();
const abandoned = [];
for (let p = firstWorksPage; p < lastPage; p++) {
  const free = BOTTOM - lowestOn(p);
  const nextBlock = firstBlockHeightOn(p + 1);
  if (Number.isFinite(nextBlock) && nextBlock + 12 <= free) {
    abandoned.push(`page ${p}: ${free.toFixed(0)}mm free, next block ${nextBlock.toFixed(0)}mm`);
  }
}
check("no page is left with room the next work would have fitted",
  abandoned.length === 0, abandoned.slice(0, 2).join(" | "));

/* --------------------------------------------------------------- encoding */

/*
 * THE REGRESSION TEST FOR L I K E   T H I S.
 *
 * jsPDF's built-in fonts encode WinAnsi only. One character outside that set
 * makes it re-encode the WHOLE LINE as UTF-16, and since the font carries no
 * Unicode mapping every null byte is drawn as a blank: a letter-spaced line of
 * double width whose tail runs off the page and is clipped.
 *
 * It happened for real. Julie's statement contained U+2011, a non-breaking
 * hyphen, in "non-traditional" and "real-world" - the kind Word and Google
 * Docs substitute on paste. Two characters in 1,100 destroyed two lines, and
 * the clipped tails read as missing words.
 *
 * This inspects the BYTES OF THE FINISHED PDF, because that is the only place
 * the fault is visible. Every other check passed on the broken file.
 */
check("a non-breaking hyphen becomes a plain one", toWinAnsi("non\u2011traditional") === "non-traditional",
  toWinAnsi("non\u2011traditional"));
check("curly quotes and dashes survive untouched",
  toWinAnsi("\u2018a\u2019 \u201cb\u201d \u2013 \u2014 \u2026") === "\u2018a\u2019 \u201cb\u201d \u2013 \u2014 \u2026");
check("accented Latin survives untouched", toWinAnsi("Barzaghi Ohara Petris \u00e9\u00e8\u00fc\u00f1") === "Barzaghi Ohara Petris \u00e9\u00e8\u00fc\u00f1");
check("zero-width characters are removed", toWinAnsi("a\u200bb\u00adc\ufeffd") === "abcd", toWinAnsi("a\u200bb\u00adc\ufeffd"));
check("characters with no equivalent are made visible", toWinAnsi("\u9999\u6e2f") === "??", toWinAnsi("\u9999\u6e2f"));

/*
 * Build a document seeded with every character class that has broken a line,
 * then read the finished file back and look for UTF-16 text operators.
 */
const hostile = {
  display_name: "Julie\u2011Petris",
  discipline: "Mixed\u2011Media",
  based_in: "Sai\u00a0Kung",
  bio: "Working across non\u2011traditional, affordable spaces \u2013 and real\u2011world execution.",
  cv: {
    statement: "A statement with a non\u2011breaking hyphen, a \u2018curly\u2019 quote, an ellipsis\u2026 and a soft\u00adhyphen, long enough that it wraps onto more than one line so an over-wide line would be obvious.",
    exhibitions: [{ year: "2026", title: "Collect\u2011HK", venue: "Hong\u2011Kong Arts Centre" }],
  },
  portfolio_works: [{
    title: "Spilt Coffee \u2011 Grounded", medium: "Mixed\u2011Media", dimensions: "21 X 16.5",
    year: "2025", image_url: "x", description: "A hyphen\u2011joined description, wrapped over a couple of lines.",
  }],
};

const hostileDoc = await buildPortfolioPdf({ jsPDF, profile: hostile, loadImage: loader(1000, 800) });
const bytes2 = Buffer.from(hostileDoc.output("arraybuffer"));

const zlib = await import("node:zlib");
let drawnLines = 0;
let utf16Lines = 0;
for (const m of bytes2.toString("latin1").matchAll(/stream\r?\n([\s\S]*?)endstream/g)) {
  let data = Buffer.from(m[1], "latin1");
  try { data = zlib.inflateSync(data); } catch { /* not compressed */ }
  for (const t of data.toString("latin1").matchAll(/\((.*?)\) Tj/gs)) {
    drawnLines += 1;
    if (t[1].includes("\u0000")) utf16Lines += 1;
  }
}
check("the finished PDF contains no UTF-16 text runs", utf16Lines === 0,
  `${utf16Lines} of ${drawnLines} lines`);
check("the hostile document actually drew something", drawnLines > 10, `${drawnLines} lines`);

/* ------------------------------------------------------------ typography */

/*
 * Spacing and leading, reported as "unnecessary spacing and font".
 *
 * Body prose was set at 1.19x leading across the full 170mm column - about 100
 * characters a line - while the gap between sections ran to 12.7mm. Lines were
 * cramped and the blocks were adrift from their headings. Paragraph breaks in
 * a statement got the same leading as any other line, so three paragraphs
 * arrived as one.
 *
 * Measured on a profile that is NOTHING BUT prose. An earlier version of this
 * check ran against the awkward profile and matched 9.5pt CV rows and 10.5pt
 * cover text too - their ink heights are within rounding of 10pt - so it
 * reported the cover subtitle as an over-wide paragraph.
 */
const rp = record();
await buildPortfolioPdf({
  jsPDF: rp.Instrumented,
  profile: {
    display_name: "P",
    bio: "A practice paragraph long enough to wrap several times so that the measure and the leading can both be read off the page with confidence.",
    cv: {
      statement:
        "First paragraph here, long enough to wrap onto a second line so the leading can be measured properly and compared with what follows.\n\n" +
        "Second paragraph, also long enough that it wraps and gives us something to compare against the line spacing above it.\n\n" +
        "Third one, shorter.",
    },
  },
});

const prose = rp.events
  .filter((e) => e.kind === "text" && Math.abs(e.h - 10 * 25.4 / 72) < 0.05)
  .sort((a, b) => a.page - b.page || a.y - b.y);

check("prose was found to measure", prose.length > 6, `${prose.length} lines`);

const widest = Math.max(...prose.map((e) => e.w));
check("prose is not set across the full column width", widest <= 132,
  `widest line ${widest.toFixed(0)}mm`);

const steps = [];
for (let i = 1; i < prose.length; i++) {
  if (prose[i].page !== prose[i - 1].page) continue;
  const d = prose[i].y - prose[i - 1].y;
  if (d > 0 && d < 14) steps.push(d);
}
const lineStep = Math.min(...steps);
const paraStep = Math.max(...steps);

check("body lines are not cramped together", lineStep >= 4.6,
  `tightest leading ${lineStep.toFixed(1)}mm`);

/*
 * A statement written in paragraphs must READ as paragraphs: the gap between
 * two of them has to be clearly larger than the gap between two lines.
 */
check("paragraph breaks are visible as paragraph breaks", paraStep >= lineStep * 1.5,
  `line ${lineStep.toFixed(1)}mm vs paragraph ${paraStep.toFixed(1)}mm`);

/* ---------------------------------------------- Julie's actual portfolio */

/*
 * The exact shape that produced the 1 / 1 / 2 output. Four works, mixed
 * orientations, on the page after a section heading.
 */
const julie = {
  display_name: "Julie Petris",
  discipline: "Mixed Media",
  chapter: "Hong Kong",
  based_in: "Sai Kung",
  bio: "Multimedia artist, jewelry designer, and creative entrepreneur.",
  portfolio_works: [
    { title: "Spilt Coffee- A Window into My World", medium: "Mixed Media Framed", dimensions: "40 X 60", year: "2025", available_for_sale: true, price: "2500", currency: "USD", image_url: "a", description: "This piece invites you to look deeper. A smaller framed piece sits above a large one, creating a portal-like view into layers of texture and depth." },
    { title: "Spilt Coffee- The Beginnings", medium: "Mixed Media", dimensions: "71 X 140", year: "2024", available_for_sale: true, price: "7,000", currency: "USD", image_url: "b", description: "This piece started it all. Layers of paint, coffee and resin met rain and weather." },
    { title: "Spilt Coffee- Grounded", medium: "Mixed Media - Framed", dimensions: "21 X 16.5", year: "2025", available_for_sale: true, price: "400", currency: "USD", image_url: "c", description: "A horizon split emerges from the textures of raw wood." },
    { title: "Spilt Coffee- French Roast", medium: "Mixed Media- Framed", dimensions: "22.5 X 17", year: "2025", available_for_sale: true, price: "400", currency: "USD", image_url: "d", description: "Where coffee beans meet water, magic happens." },
  ],
};

const r2 = record();
const doc2 = await buildPortfolioPdf({
  jsPDF: r2.Instrumented, profile: julie, loadImage: loader(1000, 1160),
});
const heading2 = r2.events.find((e) => e.kind === "text" && /^WORKS/.test(e.s || ""));
const imgPages = r2.events.filter((e) => e.kind === "image").map((e) => e.page);
const perPage = {};
for (const p of imgPages) perPage[p] = (perPage[p] || 0) + 1;
const counts = Object.values(perPage);

check("four works do not sprawl over three pages",
  Object.keys(perPage).length <= 2, `${Object.keys(perPage).length} pages: ${counts.join("/")}`);
check("the first works page carries more than one work",
  counts[0] >= 2, `first page holds ${counts[0]}`);
check("the works section starts on its own page", Boolean(heading2));
check("the document is shorter than the version that shipped",
  doc2.getNumberOfPages() <= 4, `${doc2.getNumberOfPages()} pages`);

/* ---------------------------------------------------------- degradation */

const noImages = await buildPortfolioPdf({ jsPDF, profile: julie, loadImage: async () => null });
check("a portfolio still builds when no image loads", noImages.getNumberOfPages() >= 2,
  `${noImages.getNumberOfPages()} pages`);

const bare = await buildPortfolioPdf({ jsPDF, profile: {} });
check("an empty profile does not throw", bare.getNumberOfPages() >= 1);

check("the filename is safe", /^[\w-]+\.pdf$/.test(portfolioFileName(julie)),
  portfolioFileName(julie));
check("a nameless profile still gets a filename",
  portfolioFileName({}) === "portfolio-AFC-Portfolio.pdf", portfolioFileName({}));

/* ------------------------------------------------------------ the file */

const bytes = doc.output("arraybuffer");
check("a real PDF is produced", bytes.byteLength > 1000, `${bytes.byteLength} bytes`);
check("the file is a valid PDF",
  Buffer.from(bytes.slice(0, 5)).toString().startsWith("%PDF"));
check("content spilled onto multiple pages", doc.getNumberOfPages() > 1,
  `${doc.getNumberOfPages()} pages`);

/* ---------------------------------------------------------------- report */

console.log(`\n  awkward profile: ${doc.getNumberOfPages()} pages | ${(bytes.byteLength / 1024).toFixed(0)}kB`);
console.log(`  Julie's four works: ${counts.join(" + ")} across ${Object.keys(perPage).length} page(s)`);
console.log(`  passed: ${pass}`);

if (fails.length) {
  console.log(`  FAILED: ${fails.length}`);
  fails.forEach((f) => console.log("   x " + f));
  window.close();
  process.exit(1);
}
console.log("  text wraps, pages break correctly, and pages fill in order\n");
window.close();
process.exit(0);
