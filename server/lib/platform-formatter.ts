import { PLATFORM_CONTENT_SPECS } from "@shared/platform-specs";

export interface FormatResult {
  title?: string;
  content: string;
  caption?: string;
  tags?: string[];
  hashtags?: string[];
  warnings: string[];
}

function stripMarkdown(text: string): string {
  return text
    .replace(/\*\*(.*?)\*\*/g, "$1")
    .replace(/\*(.*?)\*/g, "$1")
    .replace(/__(.*?)__/g, "$1")
    .replace(/_(.*?)_/g, "$1")
    .replace(/~~(.*?)~~/g, "$1")
    .replace(/#{1,6}\s+/g, "")
    .replace(/`{1,3}[^`]*`{1,3}/g, "")
    .replace(/\[([^\]]+)\]\([^)]+\)/g, "$1")
    .trim();
}

function extractHashtags(text: string): string[] {
  const matches = text.match(/#\w+/g) || [];
  return [...new Set(matches)];
}

function removeExcessHashtags(text: string, maxCount: number): string {
  const tags = extractHashtags(text);
  if (tags.length <= maxCount) return text;
  const keep = tags.slice(0, maxCount);
  let result = text;
  tags.slice(maxCount).forEach(tag => {
    result = result.replace(new RegExp(`\\s*${tag.replace(/[#]/g, "\\$&")}\\b`, "g"), "");
  });
  return result.trim();
}

function truncateSmart(text: string, limit: number): string {
  if (text.length <= limit) return text;
  const truncated = text.substring(0, limit - 3);
  const lastSpace = truncated.lastIndexOf(" ");
  return (lastSpace > limit * 0.8 ? truncated.substring(0, lastSpace) : truncated) + "...";
}

function removeYouTubeLingo(text: string): string {
  return text
    .replace(/\bsubscribe\b/gi, "follow")
    .replace(/\bsubscription\b/gi, "following")
    .replace(/\bliked and subscribed\b/gi, "liked and followed")
    .replace(/\bwatch on youtube\b/gi, "watch now")
    .replace(/\byoutube channel\b/gi, "channel")
    .replace(/\bsee you next video\b/gi, "see you next time")
    .replace(/\bnotification bell\b/gi, "notifications");
}

export function formatForYouTubeLongForm(
  content: string,
  metadata?: any,
): FormatResult {
  const warnings: string[] = [];
  const spec = PLATFORM_CONTENT_SPECS.youtube;

  let title = metadata?.caption || metadata?.title || "";
  if (title.length > 100) {
    title = title.substring(0, 97) + "...";
    warnings.push("Title truncated to 100 chars (60 is ideal for CTR)");
  } else if (title.length > 60) {
    warnings.push("Title over 60 chars — may be cut off in search results");
  }

  const hasShorts = /\bshorts?\b/i.test(title) || /#Shorts\b/.test(title);
  if (hasShorts) {
    warnings.push("Long-form title contains 'Shorts' — removed to avoid misclassification");
    title = title.replace(/#?Shorts?\b/gi, "").trim();
  }

  let description = content;
  if (description.length > spec.limits.descriptionMaxLength) {
    description = description.substring(0, spec.limits.descriptionMaxLength);
    warnings.push(`Description truncated to ${spec.limits.descriptionMaxLength} chars`);
  }

  const tags: string[] = metadata?.tags || [];
  if (tags.length > (spec.limits.maxTags || 30)) {
    tags.splice(spec.limits.maxTags || 30);
    warnings.push(`Tags trimmed to ${spec.limits.maxTags} max`);
  }
  const tagCharCount = tags.join("").length;
  if (tagCharCount > (spec.limits.maxTagsChars || 500)) {
    warnings.push("Tags total characters near YouTube limit");
  }

  return { title, content: description, tags, warnings };
}

export function formatForYouTubeShort(
  content: string,
  metadata?: any,
): FormatResult {
  const warnings: string[] = [];

  let title = metadata?.caption || metadata?.title || "";
  if (title.length > 100) {
    title = title.substring(0, 97) + "...";
    warnings.push("Title truncated to 100 chars");
  }

  if (!/\bshorts?\b/i.test(title) && !/#Shorts\b/.test(content)) {
    warnings.push("#Shorts missing — added to description for algorithmic reach");
  }

  let description = content;
  if (!/#Shorts\b/.test(description)) {
    description = description.trim() + "\n\n#Shorts";
  }

  if (description.length > 5000) {
    description = description.substring(0, 4997) + "...";
    warnings.push("Shorts description truncated to 5000 chars");
  }

  return { title, content: description, warnings };
}

export function formatForTikTok(
  content: string,
  metadata?: any,
): FormatResult {
  const warnings: string[] = [];
  const HARD_LIMIT = 2200;
  const SOFT_LIMIT = 150;

  let caption = metadata?.tiktokCaption || content;

  caption = removeYouTubeLingo(caption);
  caption = caption.replace(/\n{3,}/g, "\n\n").trim();

  if (!/#fyp\b/i.test(caption) && !/#foryou\b/i.test(caption)) {
    const hashtagSection = caption.match(/(#\w+(\s+#\w+)*)\s*$/);
    if (hashtagSection) {
      caption = caption.replace(hashtagSection[0], "#fyp " + hashtagSection[0]);
    } else {
      caption = caption + "\n#fyp";
    }
    warnings.push("#fyp added for For You Page algorithmic reach");
  }

  caption = removeExcessHashtags(caption, 30);

  if (caption.length > HARD_LIMIT) {
    caption = truncateSmart(caption, HARD_LIMIT);
    warnings.push(`Caption truncated to ${HARD_LIMIT} chars (TikTok hard limit)`);
  }

  const firstLine = caption.split("\n")[0];
  if (firstLine.length > SOFT_LIMIT) {
    warnings.push(`First line is ${firstLine.length} chars — TikTok shows ~${SOFT_LIMIT} chars before "more"`);
  }

  const youtubeRefs = caption.match(/\byoutube\b/gi);
  if (youtubeRefs && youtubeRefs.length > 0) {
    warnings.push("Caption references YouTube — TikTok may suppress reach for competitor mentions");
  }

  return { content: caption, warnings };
}

export function formatForDiscord(
  content: string,
  metadata?: any,
): FormatResult {
  const warnings: string[] = [];
  const LIMIT = 2000;
  const EMBED_DESC_LIMIT = 4096;

  let text = content.replace(/\n{4,}/g, "\n\n\n").trim();

  let hasEmbed = false;
  let embedTitle: string | undefined;
  let embedDescription: string | undefined;

  const titleMatch = text.match(/^\*\*(.+?)\*\*/);
  if (titleMatch) {
    embedTitle = titleMatch[1].substring(0, 256);
    embedDescription = text.replace(titleMatch[0], "").trim().substring(0, EMBED_DESC_LIMIT);
    hasEmbed = true;
  } else {
    const caption = metadata?.caption || metadata?.title;
    if (caption) {
      text = `**${caption}**\n\n${text}`;
      embedTitle = caption.substring(0, 256);
      embedDescription = content.substring(0, EMBED_DESC_LIMIT);
      hasEmbed = true;
      warnings.push("Discord embed auto-formatted from caption — will show as rich embed");
    }
  }

  if (!hasEmbed && text.length > LIMIT) {
    text = truncateSmart(text, LIMIT);
    warnings.push(`Discord plain message truncated to ${LIMIT} chars`);
  }

  return {
    content: hasEmbed ? (embedDescription || text) : text,
    title: embedTitle,
    warnings,
  };
}

export function formatForTwitch(
  content: string,
  _metadata?: any,
): FormatResult {
  const warnings: string[] = [];
  const LIMIT = 500;

  let text = stripMarkdown(content);
  text = text.replace(/\n/g, " ").replace(/\s{2,}/g, " ").trim();

  if (text.length > LIMIT) {
    text = truncateSmart(text, LIMIT);
    warnings.push(`Twitch announcement truncated to ${LIMIT} chars`);
  }

  return { content: text, warnings };
}

export function formatContentForPlatform(
  platform: string,
  content: string,
  metadata?: any,
): FormatResult {
  switch (platform) {
    case "youtube": {
      const contentType = metadata?.contentType || "";
      if (contentType === "youtube-short" || contentType === "short") {
        return formatForYouTubeShort(content, metadata);
      }
      return formatForYouTubeLongForm(content, metadata);
    }
    case "youtubeshorts":
      return formatForYouTubeShort(content, metadata);
    case "tiktok":
      return formatForTikTok(content, metadata);
    case "discord":
      return formatForDiscord(content, metadata);
    case "twitch":
      return formatForTwitch(content, metadata);
    default:
      return { content, warnings: [] };
  }
}

export function getFormatSummary(platform: string): {
  rules: string[];
  limits: Record<string, string | number>;
} {
  switch (platform) {
    case "youtube":
      return {
        rules: [
          "Title ≤ 100 chars (60 ideal for CTR)",
          "Description ≤ 5,000 chars — first 2 lines visible before 'Show more'",
          "Up to 30 tags, 500 total chars",
          "Shorts must have #Shorts + vertical 9:16",
        ],
        limits: { title: 100, description: 5000, tags: 30, tagChars: 500 },
      };
    case "tiktok":
      return {
        rules: [
          "Caption ≤ 2,200 chars (keep first line under 150 for preview)",
          "Include #fyp or #foryou for algorithmic reach",
          "Avoid 'YouTube', 'subscribe', or competitor mentions",
          "Hook in first 1–2 seconds — put the best line first",
        ],
        limits: { caption: 2200, softPreview: 150, hashtags: 30 },
      };
    case "discord":
      return {
        rules: [
          "2,000 char limit for plain messages",
          "Bold titles auto-converted to rich embeds",
          "Markdown fully supported (**bold**, *italic*, etc.)",
          "Webhook URL required in Settings → Channels",
        ],
        limits: { chars: 2000, embedTitle: 256, embedDesc: 4096 },
      };
    case "twitch":
      return {
        rules: [
          "Chat announcement ≤ 500 chars",
          "No markdown (will render as literal text)",
          "Goes to chat as a highlighted announcement",
        ],
        limits: { chars: 500 },
      };
    default:
      return { rules: [], limits: {} };
  }
}
