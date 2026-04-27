/**
 * description-formatter.ts
 * Assembles YouTube descriptions from structured AI output into a clean,
 * professional multi-section format with proper line breaks.
 *
 * The AI returns individual fields; we build the final string here so
 * formatting is always consistent regardless of what the AI outputs.
 */

const FOOTER = [
  "https://etgaming247.com",
  "Catch the live streams on Twitch & Kick",
  "Clips & highlights on TikTok",
  "Updates & hot takes on X",
  "Join the community on Discord",
  "Managed with CreatorOS.",
].join("\n");

export interface DescriptionParts {
  hookLines: string[];
  bodyParagraph: string;
  chapters: Array<{ time: string; label: string }>;
  ctaLine: string;
  hashtags: string[];
}

/**
 * Build a fully formatted YouTube description from structured parts.
 * Each section is separated by a blank line; timestamps each get their own line.
 */
export function buildDescription(parts: DescriptionParts): string {
  const sections: string[] = [];

  // 1. Hook lines (each on its own line)
  if (parts.hookLines && parts.hookLines.length > 0) {
    sections.push(parts.hookLines.map(l => l.trim()).filter(Boolean).join("\n"));
  }

  // 2. Body paragraph
  if (parts.bodyParagraph && parts.bodyParagraph.trim()) {
    sections.push(parts.bodyParagraph.trim());
  }

  // 3. Chapter timestamps — each on its own line
  if (parts.chapters && parts.chapters.length > 0) {
    const chapterLines = parts.chapters
      .filter(c => c.time && c.label)
      .map(c => `${c.time.trim()} ${c.label.trim()}`);
    if (chapterLines.length > 0) {
      sections.push("⏱ Chapters:\n" + chapterLines.join("\n"));
    }
  }

  // 4. CTA
  if (parts.ctaLine && parts.ctaLine.trim()) {
    sections.push(parts.ctaLine.trim());
  }

  // 5. Hashtags on their own line
  if (parts.hashtags && parts.hashtags.length > 0) {
    const tags = parts.hashtags
      .map(t => (t.startsWith("#") ? t : `#${t}`))
      .join(" ");
    sections.push(tags);
  }

  // 6. Footer (links + branding) — always last
  sections.push(FOOTER);

  return sections.join("\n\n");
}

/**
 * Repair an already-generated description that was returned as one big
 * wall of text.  Detects timestamp patterns and re-separates sections.
 * Used as a fallback when the AI doesn't return structured fields.
 */
export function reformatRawDescription(raw: string): string {
  if (!raw) return "";

  // Normalise all line endings
  let text = raw.replace(/\r\n/g, "\n").replace(/\r/g, "\n");

  // If timestamps are inline (e.g. "0:00 Intro 0:40 Setup"), split them onto their own lines
  // Pattern: a timestamp like "1:23" or "12:34" or "1:23:45" preceded by space/text
  text = text.replace(
    /(\s)(\d{1,2}:\d{2}(?::\d{2})?)\s+/g,
    (_match, _before, ts) => `\n${ts} `
  );

  // Ensure double newline before the footer if it's already present
  const footerKeyword = "https://etgaming247.com";
  if (text.includes(footerKeyword)) {
    text = text.replace(
      new RegExp(`\n*(${footerKeyword})`, "g"),
      "\n\n$1"
    );
  } else {
    text = text.trimEnd() + "\n\n" + FOOTER;
  }

  // Collapse triple+ newlines to double
  text = text.replace(/\n{3,}/g, "\n\n");

  return text.trim();
}
