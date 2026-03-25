export function checkLiveAccessibility(streamConfig: {
  hasCaptions?: boolean;
  hasAudioDescription?: boolean;
  chatModeration?: boolean;
  colorBlindFriendly?: boolean;
  thumbnailAltText?: boolean;
}): { score: number; level: string; issues: string[]; suggestions: string[] } {
  let score = 0;
  const issues: string[] = [];
  const suggestions: string[] = [];

  if (streamConfig.hasCaptions) {
    score += 0.3;
  } else {
    issues.push("No live captions enabled");
    suggestions.push("Enable YouTube auto-captions for live stream accessibility");
  }

  if (streamConfig.chatModeration) {
    score += 0.2;
  } else {
    issues.push("Chat moderation not configured");
    suggestions.push("Enable chat moderation to ensure inclusive environment");
  }

  if (streamConfig.thumbnailAltText) {
    score += 0.2;
  } else {
    suggestions.push("Add alt text to stream thumbnail for screen readers");
  }

  if (streamConfig.hasAudioDescription) {
    score += 0.15;
  } else {
    suggestions.push("For no-commentary gameplay, on-screen text overlays help hearing-impaired viewers");
  }

  if (streamConfig.colorBlindFriendly) {
    score += 0.15;
  }

  score = Math.min(1, score);
  const level = score >= 0.8 ? "AAA" : score >= 0.5 ? "AA" : score >= 0.3 ? "A" : "needs improvement";

  return { score, level, issues, suggestions };
}

export function getLiveAccessibilityScore(
  hasCaptions: boolean,
  chatModeration: boolean,
): number {
  let score = 0.3;
  if (hasCaptions) score += 0.4;
  if (chatModeration) score += 0.3;
  return score;
}
