/**
 * description-formatter.ts
 *
 * Assembles YouTube descriptions from structured AI output into the
 * professional multi-section format shown in the screenshot:
 *
 *   [hook paragraph]
 *
 *   [body paragraph with keywords]
 *
 *   ⏱ Chapters:
 *   0:00 Intro + setup
 *   …
 *
 *   [CTA]
 *
 *   #hashtag1 #hashtag2 #hashtag3
 *
 *   Follow ET Gaming 247 ►
 *   📺 YouTube  ➜  https://youtube.com/@ETGaming247
 *   🎮 Twitch   ➜  https://twitch.tv/etgaming247
 *   …
 *   🌐  https://etgaming247.com
 *
 * Platform links are passed in as a ChannelLinks object resolved from
 * the database — no hardcoded placeholder text.
 */

export interface ChannelLinks {
  youtube?: string;
  twitch?: string;
  kick?: string;
  tiktok?: string;
  x?: string;
  discord?: string;
  website?: string;
  [key: string]: string | undefined;
}

export interface DescriptionParts {
  hookLines: string[];
  bodyParagraph: string;
  chapters: Array<{ time: string; label: string }>;
  ctaLine: string;
  hashtags: string[];
}

// ── Platform icons + display names ───────────────────────────────────────────

const PLATFORM_META: Record<string, { icon: string; label: string; order: number }> = {
  youtube:  { icon: "📺", label: "YouTube",  order: 1 },
  twitch:   { icon: "🎮", label: "Twitch",   order: 2 },
  kick:     { icon: "🟢", label: "Kick",     order: 3 },
  tiktok:   { icon: "🎵", label: "TikTok",   order: 4 },
  x:        { icon: "𝕏",  label: "X",        order: 5 },
  discord:  { icon: "💬", label: "Discord",  order: 6 },
  rumble:   { icon: "🔴", label: "Rumble",   order: 7 },
  instagram:{ icon: "📸", label: "Instagram",order: 8 },
};

// ── Follow section builder ────────────────────────────────────────────────────

function buildFollowSection(links: ChannelLinks): string {
  const lines: string[] = ["Follow ET Gaming 247 ►"];

  // Sort by defined order; unknown platforms go last
  const entries = Object.entries(links)
    .filter(([key, url]) => key !== "website" && url)
    .sort((a, b) => {
      const oa = PLATFORM_META[a[0]]?.order ?? 99;
      const ob = PLATFORM_META[b[0]]?.order ?? 99;
      return oa - ob;
    });

  for (const [platform, url] of entries) {
    const meta = PLATFORM_META[platform];
    if (meta) {
      lines.push(`${meta.icon}  ${meta.label}  ➜  ${url}`);
    } else {
      lines.push(`🔗  ${platform}  ➜  ${url}`);
    }
  }

  if (links.website) {
    lines.push(`🌐  ${links.website}`);
  }

  lines.push("Managed with CreatorOS.");
  return lines.join("\n");
}

// Fallback footer used when no channel links are available yet
const FALLBACK_FOOTER = [
  "Follow ET Gaming 247 ►",
  "🎮  Twitch  ➜  https://twitch.tv/etgaming247",
  "🟢  Kick  ➜  https://kick.com/etgaming247",
  "🎵  TikTok  ➜  https://tiktok.com/@etgaming247",
  "𝕏   X  ➜  https://x.com/etgaming247",
  "🌐  https://etgaming247.com",
  "Managed with CreatorOS.",
].join("\n");

// ── Main assembler ────────────────────────────────────────────────────────────

/**
 * Build a fully formatted YouTube description from structured AI parts + real links.
 * Each section is separated by a blank line; timestamps each get their own line.
 */
export function buildDescription(parts: DescriptionParts, links?: ChannelLinks): string {
  const sections: string[] = [];

  // 1. Hook lines (each on its own line within the section)
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

  // 5. Hashtags
  if (parts.hashtags && parts.hashtags.length > 0) {
    const tags = parts.hashtags
      .map(t => (t.startsWith("#") ? t : `#${t}`))
      .join(" ");
    sections.push(tags);
  }

  // 6. Follow / social links section — always last
  const hasLinks = links && Object.values(links).some(v => v);
  sections.push(hasLinks ? buildFollowSection(links!) : FALLBACK_FOOTER);

  return sections.join("\n\n");
}

// ── Reformat legacy flat-string descriptions ──────────────────────────────────

/**
 * Repair a description that was returned as one big wall of text.
 * Detects inline timestamp patterns and splits them onto their own lines,
 * then appends a follow section with real links if provided.
 */
export function reformatRawDescription(raw: string, links?: ChannelLinks): string {
  if (!raw) return "";

  let text = raw.replace(/\r\n/g, "\n").replace(/\r/g, "\n");

  // Split inline timestamps onto their own lines
  // Matches a timestamp like "1:23" or "12:34" or "1:23:45" that is preceded
  // by non-newline content (i.e. it's crammed onto the same line)
  text = text.replace(
    /([^\n])(\s)(\d{1,2}:\d{2}(?::\d{2})?)\s+/g,
    (_match, before, _space, ts) => `${before}\n${ts} `
  );

  // Remove any existing generic footer text so we can replace with real links
  const genericFooterPatterns = [
    /Catch the live streams on Twitch.*$/ms,
    /Clips & highlights on TikTok.*$/ms,
    /Updates & hot takes on X.*$/ms,
    /Join the community on Discord.*$/ms,
    /Managed with CreatorOS\./,
    /Follow ET Gaming 247 ►[\s\S]*/,
  ];
  for (const pattern of genericFooterPatterns) {
    text = text.replace(pattern, "");
  }
  text = text.trimEnd();

  // Collapse triple+ newlines to double
  text = text.replace(/\n{3,}/g, "\n\n");

  // Append real follow section
  const hasLinks = links && Object.values(links).some(v => v);
  const footer = hasLinks ? buildFollowSection(links!) : FALLBACK_FOOTER;
  text = text + "\n\n" + footer;

  return text.trim();
}
