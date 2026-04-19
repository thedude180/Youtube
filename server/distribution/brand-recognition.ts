import { db } from "../db";
import { brandAssets, brandDriftAlerts, contentDnaProfiles } from "@shared/schema";
import type { Platform } from "@shared/schema";
import { eq, desc, and } from "drizzle-orm";

type BrandConsistencyScore = {
  overallScore: number;
  platformScores: Record<string, number>;
  driftDetected: boolean;
  driftAreas: string[];
  suggestions: string[];
};

type BrandElement = {
  element: string;
  consistent: boolean;
  score: number;
  platforms: string[];
  issue?: string;
};

async function checkTrustBudgetForBrand(userId: string): Promise<{ allowed: boolean; remaining: number }> {
  try {
    const { checkTrustBudget } = await import("../kernel/trust-budget");
    const result = await checkTrustBudget(userId, "brand-recognition", 2);
    return { allowed: !result.blocked, remaining: result.remaining };
  } catch {
    return { allowed: false, remaining: 0 };
  }
}

export async function scoreBrandConsistency(userId: string): Promise<BrandConsistencyScore> {
  const trustCheck = await checkTrustBudgetForBrand(userId);
  if (!trustCheck.allowed) {
    return {
      overallScore: 0,
      platformScores: {},
      driftDetected: false,
      driftAreas: [],
      suggestions: ["Trust budget exhausted — brand consistency check blocked"],
    };
  }

  const { getBrandProfile, checkBrandAlignment } = await import("../content/brand-system");
  const profile = getBrandProfile(userId);

  const assets = await db.select().from(brandAssets)
    .where(eq(brandAssets.userId, userId))
    .orderBy(desc(brandAssets.createdAt))
    .limit(50);

  const dnaProfiles = await db.select().from(contentDnaProfiles)
    .where(eq(contentDnaProfiles.userId, userId))
    .limit(10);

  const platformScores: Record<string, number> = {};
  const driftAreas: string[] = [];
  const suggestions: string[] = [];

  const assetTypeCounts: Record<string, number> = {};
  for (const asset of assets) {
    assetTypeCounts[asset.assetType] = (assetTypeCounts[asset.assetType] || 0) + 1;
  }

  let baseScore = 0.7;
  if (assets.length < 2) {
    baseScore = 0.5;
    suggestions.push("Limited brand assets — consider adding more branded elements");
  }

  const hasLogo = !!assetTypeCounts["logo"];
  const hasBanner = !!assetTypeCounts["banner"];
  const hasColor = !!assetTypeCounts["color_palette"] || !!assetTypeCounts["color"];
  const hasFont = !!assetTypeCounts["font"] || !!assetTypeCounts["typography"];

  if (!hasLogo) { baseScore -= 0.1; driftAreas.push("missing logo asset"); }
  if (!hasBanner) { baseScore -= 0.05; }
  if (!hasColor) { baseScore -= 0.05; driftAreas.push("missing color palette asset"); }
  if (hasFont) { baseScore += 0.05; }

  baseScore = Math.max(0, Math.min(1, baseScore));

  const targetPlatforms = ["youtube", "tiktok", "x", "twitch", "kick", "discord", "rumble"];
  for (const plat of targetPlatforms) {
    platformScores[plat] = baseScore;
  }

  if (assets.length === 0) {
    suggestions.push("No brand assets found — set up brand identity for consistency tracking");
  }

  if (dnaProfiles.length > 0) {
    const dna = dnaProfiles[0];
    const profileData = dna.profileData;
    if (profileData?.tonalPattern && profileData.tonalPattern !== profile.voiceTone) {
      driftAreas.push(`Tonal drift: content DNA shows "${profileData.tonalPattern}" vs brand profile "${profile.voiceTone}"`);
    }
    if (profileData?.visualStyle) {
      const visualLower = profileData.visualStyle.toLowerCase();
      if (!visualLower.includes("cinematic") && !visualLower.includes("immersive")) {
        driftAreas.push("Visual style may be drifting from cinematic-immersive brand identity");
      }
    }
  }

  const scores = Object.values(platformScores);
  const overallScore = scores.length > 0 ? scores.reduce((a, b) => a + b, 0) / scores.length : 0.5;

  if (scores.length > 1) {
    const minScore = Math.min(...scores);
    const maxScore = Math.max(...scores);
    if (maxScore - minScore > 0.3) {
      driftAreas.push("Significant brand consistency gap between platforms");
      suggestions.push("Align brand presentation across platforms to reduce drift");
    }
  }

  const driftDetected = driftAreas.length > 0;

  if (driftDetected) {
    await db.insert(brandDriftAlerts).values({
      userId,
      alertType: "consistency_check",
      severity: driftAreas.length > 2 ? "high" : "medium",
      message: `Brand drift detected: ${driftAreas.join("; ")}`,
      metadata: { platformScores, driftAreas, suggestions },
      resolved: false,
    } as any).catch(() => {});

    try {
      const { emitDomainEvent } = await import("../kernel/index");
      await emitDomainEvent(userId, "brand.drift.detected", { driftAreas, overallScore }, "brand-recognition", "drift-check");
    } catch {}
  }

  return { overallScore, platformScores, driftDetected, driftAreas, suggestions };
}

export async function getBrandElements(userId: string): Promise<BrandElement[]> {
  const trustCheck = await checkTrustBudgetForBrand(userId);
  if (!trustCheck.allowed) return [];

  const { getBrandProfile } = await import("../content/brand-system");
  const profile = getBrandProfile(userId);
  const elements: BrandElement[] = [];

  elements.push({
    element: "voice_tone",
    consistent: true,
    score: 0.8,
    platforms: ["youtube", "tiktok", "x"],
  });

  for (const pillar of profile.contentPillars) {
    elements.push({
      element: `pillar:${pillar}`,
      consistent: true,
      score: 0.75,
      platforms: ["youtube"],
    });
  }

  elements.push({
    element: "visual_identity",
    consistent: true,
    score: 0.7,
    platforms: ["youtube", "tiktok"],
  });

  return elements;
}

export async function getDriftHistory(userId: string, limit: number = 20): Promise<any[]> {
  const trustCheck = await checkTrustBudgetForBrand(userId);
  if (!trustCheck.allowed) return [];

  return db.select().from(brandDriftAlerts)
    .where(eq(brandDriftAlerts.userId, userId))
    .orderBy(desc(brandDriftAlerts.createdAt))
    .limit(limit);
}
