import { db } from "../db";
import { formatInnovations, competitorTracks } from "@shared/schema";
import { eq, desc, and } from "drizzle-orm";

type FormatOpportunity = {
  formatName: string;
  platform: string;
  description: string;
  adoptionStage: string;
  potentialScore: number;
  competitorAdoption: number;
  recommended: boolean;
  reasoning: string;
};

type FormatAnalysis = {
  userId: string;
  opportunities: FormatOpportunity[];
  emergingFormats: FormatOpportunity[];
  recommendations: string[];
};

const KNOWN_EMERGING_FORMATS: Record<string, { name: string; platform: string; description: string; potentialScore: number }[]> = {
  youtube: [
    { name: "YouTube Shorts series", platform: "youtube", description: "Connected short-form series linking to long-form", potentialScore: 0.85 },
    { name: "Community post teasers", platform: "youtube", description: "Engagement-driving community posts before uploads", potentialScore: 0.7 },
    { name: "Podcast format gameplay", platform: "youtube", description: "Long-form relaxed gameplay as background content", potentialScore: 0.65 },
  ],
  tiktok: [
    { name: "Multi-part gameplay stories", platform: "tiktok", description: "Serialized clip series with narrative arcs", potentialScore: 0.8 },
    { name: "Duet/Stitch reactions", platform: "tiktok", description: "Reacting to other gaming content creators", potentialScore: 0.6 },
  ],
  x: [
    { name: "Thread storytelling", platform: "x", description: "Multi-tweet gameplay narrative threads", potentialScore: 0.7 },
    { name: "Clip-first tweets", platform: "x", description: "Leading with short video clips over text", potentialScore: 0.75 },
  ],
  twitch: [
    { name: "Companion streams", platform: "twitch", description: "Simultaneous streams with different camera angles", potentialScore: 0.5 },
  ],
};

async function checkTrustBudget(userId: string): Promise<{ allowed: boolean }> {
  try {
    const { checkTrustBudget: check } = await import("../kernel/trust-budget");
    const result = await check(userId, "format-innovation", 2);
    return { allowed: !result.blocked };
  } catch {
    return { allowed: false };
  }
}

export async function analyzeFormatInnovations(userId: string, platforms?: string[]): Promise<FormatAnalysis> {
  const trust = await checkTrustBudget(userId);
  if (!trust.allowed) {
    return { userId, opportunities: [], emergingFormats: [], recommendations: [] };
  }

  const existingFormats = await db.select().from(formatInnovations)
    .where(eq(formatInnovations.userId, userId))
    .orderBy(desc(formatInnovations.potentialScore))
    .limit(30);

  const competitors = await db.select().from(competitorTracks)
    .where(eq(competitorTracks.userId, userId))
    .limit(50);

  const opportunities: FormatOpportunity[] = existingFormats.map(f => ({
    formatName: f.formatName,
    platform: f.platform,
    description: f.description || "",
    adoptionStage: f.adoptionStage || "emerging",
    potentialScore: f.potentialScore ?? 0,
    competitorAdoption: f.competitorAdoption ?? 0,
    recommended: f.recommended ?? false,
    reasoning: f.competitorAdoption && f.competitorAdoption < 0.3
      ? `Low competitor adoption (${((f.competitorAdoption ?? 0) * 100).toFixed(0)}%) — first-mover advantage`
      : `${((f.competitorAdoption ?? 0) * 100).toFixed(0)}% competitor adoption — consider differentiating`,
  }));

  const existingFormatKeys = new Set(existingFormats.map(f => `${f.platform}:${f.formatName.toLowerCase()}`));
  const targetPlatforms = platforms || Object.keys(KNOWN_EMERGING_FORMATS);
  const emergingFormats: FormatOpportunity[] = [];

  for (const plat of targetPlatforms) {
    const knownFormats = KNOWN_EMERGING_FORMATS[plat] || [];
    for (const fmt of knownFormats) {
      if (existingFormatKeys.has(`${fmt.platform}:${fmt.name.toLowerCase()}`)) continue;

      const competitorAdoption = competitors.filter(c =>
        c.platform === plat && c.strengths?.some(s => s.toLowerCase().includes(fmt.name.split(" ")[0].toLowerCase()))
      ).length / Math.max(1, competitors.filter(c => c.platform === plat).length);

      const opp: FormatOpportunity = {
        formatName: fmt.name,
        platform: fmt.platform,
        description: fmt.description,
        adoptionStage: "emerging",
        potentialScore: fmt.potentialScore,
        competitorAdoption,
        recommended: fmt.potentialScore > 0.6 && competitorAdoption < 0.5,
        reasoning: competitorAdoption < 0.2
          ? `Emerging format with very low adoption — strong first-mover opportunity`
          : `Emerging format — ${(competitorAdoption * 100).toFixed(0)}% competitor adoption`,
      };
      emergingFormats.push(opp);

      await db.insert(formatInnovations).values({
        userId,
        platform: fmt.platform,
        formatName: fmt.name,
        description: fmt.description,
        adoptionStage: "emerging",
        potentialScore: fmt.potentialScore,
        competitorAdoption,
        recommended: opp.recommended,
      }).catch(() => {});
    }
  }

  const recommendations: string[] = [];
  const topOpportunities = [...opportunities, ...emergingFormats]
    .sort((a, b) => b.potentialScore - a.potentialScore)
    .slice(0, 5);

  for (const opp of topOpportunities) {
    if (opp.recommended) {
      recommendations.push(`Adopt "${opp.formatName}" on ${opp.platform} — ${opp.reasoning}`);
    }
  }

  try {
    const { emitDomainEvent } = await import("../kernel/index");
    await emitDomainEvent(userId, "format.innovation.analyzed", {
      existingCount: opportunities.length, emergingCount: emergingFormats.length,
    }, "format-innovation", "analysis");
  } catch {}

  return { userId, opportunities, emergingFormats, recommendations };
}

export async function getFormatRecommendations(userId: string, platform: string): Promise<FormatOpportunity[]> {
  const trust = await checkTrustBudget(userId);
  if (!trust.allowed) return [];

  const analysis = await analyzeFormatInnovations(userId, [platform]);
  return [...analysis.opportunities, ...analysis.emergingFormats]
    .filter(f => f.recommended)
    .sort((a, b) => b.potentialScore - a.potentialScore);
}
