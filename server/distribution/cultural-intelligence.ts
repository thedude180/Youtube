import { db } from "../db";
import { liveAudienceGeo } from "@shared/schema";
import { eq, desc } from "drizzle-orm";

type CulturalSensitivityResult = {
  region: string;
  score: number;
  issues: string[];
  recommendations: string[];
  safeToDistribute: boolean;
};

type CulturalAnalysis = {
  userId: string;
  results: CulturalSensitivityResult[];
  overallScore: number;
  blockedRegions: string[];
};

const REGION_SENSITIVITIES: Record<string, { topics: string[]; themes: string[]; rating: string }> = {
  CN: { topics: ["tiananmen", "tibet", "taiwan independence", "falun gong"], themes: ["gambling", "gore", "skeleton", "ghost"], rating: "strict" },
  DE: { topics: ["nazi", "swastika"], themes: ["excessive violence", "hate symbol"], rating: "moderate" },
  AU: { topics: [], themes: ["excessive violence", "drug use"], rating: "moderate" },
  SA: { topics: [], themes: ["gambling", "alcohol", "lgbtq"], rating: "strict" },
  JP: { topics: [], themes: ["war crimes"], rating: "moderate" },
  KR: { topics: [], themes: ["japan war", "gambling"], rating: "moderate" },
  IN: { topics: ["kashmir", "religious violence"], themes: ["beef", "religious mockery"], rating: "moderate" },
  RU: { topics: ["ukraine", "protest"], themes: ["lgbtq", "anti-government"], rating: "strict" },
};

async function checkTrustBudget(userId: string): Promise<{ allowed: boolean }> {
  try {
    const { checkTrustBudget: check } = await import("../kernel/trust-budget");
    const result = await check(userId, "cultural-intelligence", 2);
    return { allowed: !result.blocked };
  } catch {
    return { allowed: false };
  }
}

export async function scoreCulturalSensitivity(
  userId: string,
  content: { title: string; description: string; tags: string[]; game?: string },
  targetRegions?: string[]
): Promise<CulturalAnalysis> {
  const trust = await checkTrustBudget(userId);
  if (!trust.allowed) {
    return { userId, results: [], overallScore: 0, blockedRegions: [] };
  }

  let regions = targetRegions;
  if (!regions || regions.length === 0) {
    const geoData = await db.select().from(liveAudienceGeo)
      .where(eq(liveAudienceGeo.userId, userId))
      .orderBy(desc(liveAudienceGeo.viewerCount))
      .limit(20);
    regions = [...new Set(geoData.map(g => g.country))];
    if (regions.length === 0) regions = ["US", "GB", "DE", "JP", "BR"];
  }

  const contentText = `${content.title} ${content.description} ${content.tags.join(" ")} ${content.game || ""}`.toLowerCase();
  const results: CulturalSensitivityResult[] = [];
  const blockedRegions: string[] = [];

  for (const region of regions) {
    const sensitivity = REGION_SENSITIVITIES[region];
    const issues: string[] = [];
    const recommendations: string[] = [];
    let score = 1.0;

    if (sensitivity) {
      for (const topic of sensitivity.topics) {
        if (contentText.includes(topic.toLowerCase())) {
          issues.push(`Sensitive topic "${topic}" detected for ${region}`);
          score -= 0.3;
        }
      }
      for (const theme of sensitivity.themes) {
        if (contentText.includes(theme.toLowerCase())) {
          issues.push(`Sensitive theme "${theme}" may be restricted in ${region}`);
          score -= 0.2;
        }
      }
      if (sensitivity.rating === "strict" && issues.length > 0) {
        recommendations.push(`Consider excluding ${region} from distribution or modifying content`);
        score -= 0.1;
      }
    }

    score = Math.max(0, Math.min(1, score));
    const safeToDistribute = score >= 0.5;
    if (!safeToDistribute) blockedRegions.push(region);

    results.push({ region, score, issues, recommendations, safeToDistribute });
  }

  const overallScore = results.length > 0
    ? results.reduce((s, r) => s + r.score, 0) / results.length : 1.0;

  try {
    const { emitDomainEvent } = await import("../kernel/index");
    await emitDomainEvent(userId, "cultural.scored", {
      regionCount: results.length, blockedCount: blockedRegions.length, overallScore,
    }, "cultural-intelligence", "scoring");
  } catch {}

  return { userId, results, overallScore, blockedRegions };
}
