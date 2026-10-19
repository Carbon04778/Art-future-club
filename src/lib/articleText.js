/**
 * Article text: paragraphs and headings (B4 in docs/CLIENT-REQUESTS.md).
 *
 * An article body is plain text; a blank line separates paragraphs. A
 * paragraph that starts with "## " is a HEADING — larger, bold text that
 * separates sections. Only that explicit marker counts: articles are full of
 * short lines (addresses, dates, image credits) that must never be guessed
 * into headings. No existing paragraph started with "#" when this was added
 * (checked 2026-10-19), so no published article changes.
 *
 * Dependency-free on purpose: the article page, the editor preview and the
 * word count all read text through here.
 */

export const HEADING_MARK = "## ";
// "## " then the heading — or a bare "##" (an "Add heading" left empty),
// which is dropped rather than shown. "##text" with no space is ordinary text.
const HEADING_RE = /^##(?=[ \t]|$)[ \t]*/;

/** Is this paragraph a heading? */
export const isHeading = (para) => HEADING_RE.test(String(para || "").trim());

/**
 * Body text -> blocks: { kind: "heading" | "para", text }.
 * "## Title" followed directly (single line break) by text gives a heading
 * and then a paragraph, so a heading typed without a blank line still works.
 */
export function parseArticleText(body) {
  const blocks = [];
  for (const raw of String(body || "").split("\n\n")) {
    if (!raw.trim()) continue;
    if (isHeading(raw)) {
      const [first, ...rest] = raw.trim().split("\n");
      const heading = first.replace(HEADING_RE, "").trim();
      if (heading) blocks.push({ kind: "heading", text: heading });
      const after = rest.join("\n").trim();
      if (after) blocks.push({ kind: "para", text: after });
    } else {
      // Exactly as stored, not trimmed: the page rendered paragraphs this way
      // before headings existed, and the closing-image placement measures
      // their length. Trimming changed the HTML of 50 of 115 articles.
      blocks.push({ kind: "para", text: raw });
    }
  }
  return blocks;
}

/** The text with heading markers removed — for word counts and plain-text uses. */
export const plainArticleText = (body) =>
  String(body || "").split("\n").map((l) => l.replace(HEADING_RE, "")).join("\n");
