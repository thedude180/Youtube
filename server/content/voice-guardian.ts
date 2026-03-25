import { getBrandProfile } from "./brand-system";

export interface VoiceCheck {
  consistent: boolean;
  score: number;
  issues: string[];
  voiceProfile: string;
}

const GAMING_VOICE_MARKERS = {
  positive: ["gameplay", "walkthrough", "no commentary", "full game", "ps5", "4k", "boss fight", "highlights", "cinematic"],
  negative: ["hey guys", "smash that", "like and subscribe", "what's up", "yo", "drop a comment", "notification bell"],
};

export function checkVoiceConsistency(
  userId: string,
  text: string,
  context?: { isTitle?: boolean; isDescription?: boolean },
): VoiceCheck {
  const profile = getBrandProfile(userId);
  const issues: string[] = [];
  let score = 0.8;

  const textLower = text.toLowerCase();

  for (const marker of GAMING_VOICE_MARKERS.negative) {
    if (textLower.includes(marker)) {
      issues.push(`Voice inconsistency: "${marker}" conflicts with no-commentary brand`);
      score -= 0.15;
    }
  }

  if (context?.isTitle) {
    if (/[A-Z]{5,}/.test(text) && text !== text.toUpperCase()) {
      issues.push("Mixed-case shouting in title damages cinematic brand voice");
      score -= 0.1;
    }

    if (/😱|🤯|💥|🔥{3,}/.test(text)) {
      issues.push("Excessive emoji usage conflicts with cinematic tone");
      score -= 0.1;
    }
  }

  if (context?.isDescription) {
    if (text.split("\n").filter(l => l.trim().startsWith("http")).length > 5) {
      issues.push("Excessive link spam in description");
      score -= 0.1;
    }
  }

  const hasPositiveMarkers = GAMING_VOICE_MARKERS.positive.some(m => textLower.includes(m));
  if (hasPositiveMarkers) score += 0.1;

  score = Math.max(0, Math.min(1, score));

  return {
    consistent: issues.length === 0 && score >= 0.6,
    score,
    issues,
    voiceProfile: profile.voiceTone,
  };
}

export function getVoiceProfile(userId: string) {
  const brand = getBrandProfile(userId);
  return {
    tone: brand.voiceTone,
    pillars: brand.contentPillars,
    forbidden: GAMING_VOICE_MARKERS.negative,
    encouraged: GAMING_VOICE_MARKERS.positive,
  };
}
