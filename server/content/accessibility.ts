export interface AccessibilityCheck {
  score: number;
  issues: string[];
  suggestions: string[];
  level: "AAA" | "AA" | "A" | "fail";
}

export function checkAccessibility(content: {
  title: string;
  description?: string;
  hasSubtitles?: boolean;
  hasAltText?: boolean;
  hasThumbnailAltText?: boolean;
}): AccessibilityCheck {
  const issues: string[] = [];
  const suggestions: string[] = [];
  let score = 0.5;

  if (content.hasSubtitles) {
    score += 0.2;
  } else {
    issues.push("No subtitles/captions available");
    suggestions.push("Add closed captions for hearing-impaired viewers");
  }

  if (content.description && content.description.length >= 100) {
    score += 0.1;
  } else {
    issues.push("Description too short for screen reader context");
    suggestions.push("Add detailed description with timestamps and content summary");
  }

  if (content.hasThumbnailAltText) {
    score += 0.1;
  } else {
    suggestions.push("Add alt text to thumbnail for visually impaired users");
  }

  if (/[A-Z]{10,}/.test(content.title)) {
    issues.push("Excessive caps in title may cause screen reader issues");
    score -= 0.1;
  }

  score = Math.max(0, Math.min(1, score));
  const level = score >= 0.9 ? "AAA" : score >= 0.7 ? "AA" : score >= 0.5 ? "A" : "fail";

  return { score, issues, suggestions, level };
}

export function generateAltText(content: {
  title: string;
  gameTitle?: string;
  momentType?: string;
}): string {
  const parts = [];
  if (content.gameTitle) parts.push(content.gameTitle);
  if (content.momentType) parts.push(content.momentType.replace(/_/g, " "));
  parts.push("gameplay screenshot");
  if (content.title) parts.push(`from "${content.title}"`);
  return parts.join(" — ");
}
