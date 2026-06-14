import { emitDomainEvent } from "../kernel/index";

export interface BrandProfile {
  voiceTone: string;
  colorPalette: string[];
  contentPillars: string[];
  audiencePersona: string;
  brandValues: string[];
  channelIdentity: string;
}

const DEFAULT_GAMING_BRAND: BrandProfile = {
  voiceTone: "cinematic-immersive",
  colorPalette: ["#1a1a2e", "#16213e", "#0f3460", "#e94560"],
  contentPillars: ["no-commentary full playthroughs", "live stream VODs", "raw gameplay footage", "Shorts clipped from long-form content"],
  audiencePersona: "gaming enthusiasts who prefer pure gameplay without commentary or face cam",
  brandValues: ["authenticity", "quality", "immersion", "consistency"],
  channelIdentity: "no-commentary gaming channel — full playthroughs and live streams are the primary content; Shorts are clipped from that footage as a growth tool, not the main format",
};

export function getBrandProfile(userId: string): BrandProfile {
  return { ...DEFAULT_GAMING_BRAND };
}

export function checkBrandAlignment(content: { title: string; description?: string; tags?: string[] }, profile: BrandProfile): {
  aligned: boolean;
  score: number;
  issues: string[];
} {
  const issues: string[] = [];
  let score = 0.7;

  const titleLower = content.title.toLowerCase();

  if (titleLower.includes("commentary") && profile.contentPillars.includes("no-commentary gameplay")) {
    issues.push("Title mentions commentary which conflicts with no-commentary brand identity");
    score -= 0.2;
  }

  if (/!{3,}|click|subscribe now|smash/i.test(content.title)) {
    issues.push("Clickbait language detected — may damage brand authenticity");
    score -= 0.15;
  }

  if (content.title.length > 80) {
    issues.push("Title exceeds recommended length for gaming content");
    score -= 0.05;
  }

  if (content.tags && content.tags.length > 0) {
    const gamingTags = content.tags.filter(t => /game|play|ps5|gameplay|walk|stream/i.test(t));
    if (gamingTags.length / content.tags.length < 0.3) {
      issues.push("Tag set lacks gaming-specific keywords");
      score -= 0.1;
    }
  }

  score = Math.max(0, Math.min(1, score));

  return {
    aligned: issues.length === 0 && score >= 0.6,
    score,
    issues,
  };
}
