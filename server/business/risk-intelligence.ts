import { db } from "../db";
import { videos, channels, revenueRecords } from "@shared/schema";
import { eq, desc, sql } from "drizzle-orm";
import { computeRevenueConfidence } from "./revenue-confidence";

export interface AiDisplacementRisk {
  overallRiskScore: number;
  riskLevel: "low" | "moderate" | "elevated" | "high" | "critical";
  vulnerabilities: Array<{ area: string; riskScore: number; explanation: string }>;
  mitigations: string[];
  timeHorizon: string;
}

export interface HumanValueMoat {
  moatStrength: number;
  moatLevel: "fortress" | "strong" | "developing" | "weak";
  uniqueFactors: Array<{ factor: string; strength: number; description: string }>;
  irreplaceableElements: string[];
  recommendations: string[];
}

export interface CreatorWellnessScore {
  wellnessScore: number;
  level: "thriving" | "sustainable" | "strained" | "burnout_risk";
  indicators: {
    contentCadence: number;
    workloadBalance: number;
    revenueStability: number;
    diversificationHealth: number;
  };
  burnoutRiskFactors: string[];
  wellnessActions: string[];
}

export interface RiskIntelligenceReport {
  aiDisplacement: AiDisplacementRisk;
  humanValueMoat: HumanValueMoat;
  creatorWellness: CreatorWellnessScore;
  revenueConfidence: { totalRevenue: number; verifiedPercent: number; confidenceLabel: string };
  overallRiskProfile: "low" | "moderate" | "elevated" | "high";
}

export async function computeRiskIntelligence(userId: string): Promise<RiskIntelligenceReport> {
  const userChannelIds = db
    .select({ id: channels.id })
    .from(channels)
    .where(eq(channels.userId, userId));

  const [userChannels, userVideos, records] = await Promise.all([
    db.select().from(channels).where(eq(channels.userId, userId)),
    db.select().from(videos)
      .where(sql`${videos.channelId} IN (${userChannelIds})`)
      .orderBy(desc(videos.createdAt))
      .limit(200),
    db.select().from(revenueRecords)
      .where(eq(revenueRecords.userId, userId))
      .orderBy(desc(revenueRecords.recordedAt))
      .limit(500),
  ]);

  const confidence = computeRevenueConfidence(records);

  const platformSet = new Set(userChannels.map(c => c.platform));
  const totalVideos = userVideos.length;
  const totalSubs = userChannels.reduce((s, c) => s + (c.subscriberCount || 0), 0);

  const isNoCommentary = userChannels.some(c =>
    c.contentNiche?.toLowerCase().includes("no commentary") ||
    c.contentNiche?.toLowerCase().includes("no-commentary")
  );

  const revenueBySource = new Map<string, number>();
  for (const r of records) {
    revenueBySource.set(r.source, (revenueBySource.get(r.source) || 0) + r.amount);
  }
  const sourceDiversity = revenueBySource.size;

  const aiDisplacement = computeAiDisplacement(isNoCommentary, totalVideos, totalSubs, platformSet.size, sourceDiversity);
  const humanValueMoat = computeHumanValueMoat(isNoCommentary, totalSubs, platformSet.size, totalVideos, sourceDiversity);
  const creatorWellness = computeCreatorWellness(userVideos, records, platformSet.size, sourceDiversity);

  const avgRisk = (aiDisplacement.overallRiskScore + (100 - humanValueMoat.moatStrength) + (100 - creatorWellness.wellnessScore)) / 3;
  const overallRiskProfile: RiskIntelligenceReport["overallRiskProfile"] =
    avgRisk >= 75 ? "high" : avgRisk >= 50 ? "elevated" : avgRisk >= 25 ? "moderate" : "low";

  return {
    aiDisplacement,
    humanValueMoat,
    creatorWellness,
    revenueConfidence: {
      totalRevenue: Math.round(confidence.totalRevenue),
      verifiedPercent: confidence.verifiedPercent,
      confidenceLabel: confidence.confidenceLabel,
    },
    overallRiskProfile,
  };
}

function computeAiDisplacement(isNoCommentary: boolean, totalVideos: number, totalSubs: number, platformCount: number, sourceDiversity: number): AiDisplacementRisk {
  const vulnerabilities: AiDisplacementRisk["vulnerabilities"] = [];

  if (isNoCommentary) {
    vulnerabilities.push({
      area: "No-Commentary Format",
      riskScore: 70,
      explanation: "AI can replicate no-commentary gameplay; personal presence is the strongest differentiator",
    });
  }

  if (platformCount <= 1) {
    vulnerabilities.push({
      area: "Single Platform Dependency",
      riskScore: 60,
      explanation: "Algorithm changes on one platform could eliminate discoverability overnight",
    });
  }

  if (sourceDiversity <= 1) {
    vulnerabilities.push({
      area: "Revenue Concentration",
      riskScore: 55,
      explanation: "Single revenue source makes the business fragile to market shifts",
    });
  }

  if (totalVideos < 20) {
    vulnerabilities.push({
      area: "Thin Content Library",
      riskScore: 40,
      explanation: "Small library reduces long-tail discovery and licensing value",
    });
  }

  const overallRiskScore = vulnerabilities.length > 0
    ? Math.round(vulnerabilities.reduce((s, v) => s + v.riskScore, 0) / vulnerabilities.length)
    : 15;

  const riskLevel: AiDisplacementRisk["riskLevel"] =
    overallRiskScore >= 80 ? "critical" : overallRiskScore >= 60 ? "high" :
    overallRiskScore >= 40 ? "elevated" : overallRiskScore >= 20 ? "moderate" : "low";

  const mitigations: string[] = [];
  if (isNoCommentary) mitigations.push("Add personality-driven content (commentary, reactions) to build personal brand moat");
  if (platformCount <= 1) mitigations.push("Expand to at least 2-3 platforms to reduce dependency");
  if (sourceDiversity <= 1) mitigations.push("Diversify revenue with memberships, merchandise, or sponsorships");
  mitigations.push("Build community engagement that AI cannot replicate");
  mitigations.push("Develop proprietary content formats and series that create viewer habits");

  return {
    overallRiskScore,
    riskLevel,
    vulnerabilities,
    mitigations,
    timeHorizon: overallRiskScore >= 60 ? "6-12 months" : "12-24 months",
  };
}

function computeHumanValueMoat(isNoCommentary: boolean, totalSubs: number, platformCount: number, totalVideos: number, sourceDiversity: number): HumanValueMoat {
  const uniqueFactors: HumanValueMoat["uniqueFactors"] = [];

  const communityStrength = Math.min(100, totalSubs / 1000);
  uniqueFactors.push({
    factor: "Community Size",
    strength: Math.round(communityStrength),
    description: `${totalSubs.toLocaleString()} subscribers across platforms`,
  });

  const libraryDepth = Math.min(100, totalVideos * 2);
  uniqueFactors.push({
    factor: "Content Library Depth",
    strength: Math.round(libraryDepth),
    description: `${totalVideos} videos creating long-tail value`,
  });

  const platformDiversity = Math.min(100, platformCount * 25);
  uniqueFactors.push({
    factor: "Platform Presence",
    strength: Math.round(platformDiversity),
    description: `Active on ${platformCount} platform(s)`,
  });

  const revenueResilience = Math.min(100, sourceDiversity * 20);
  uniqueFactors.push({
    factor: "Revenue Resilience",
    strength: Math.round(revenueResilience),
    description: `${sourceDiversity} revenue stream(s)`,
  });

  if (!isNoCommentary) {
    uniqueFactors.push({
      factor: "Personal Brand Voice",
      strength: 80,
      description: "Commentary and personality create irreplaceable viewer connection",
    });
  }

  const moatStrength = Math.round(uniqueFactors.reduce((s, f) => s + f.strength, 0) / uniqueFactors.length);

  const moatLevel: HumanValueMoat["moatLevel"] =
    moatStrength >= 75 ? "fortress" : moatStrength >= 50 ? "strong" : moatStrength >= 25 ? "developing" : "weak";

  const irreplaceableElements: string[] = [];
  if (!isNoCommentary) irreplaceableElements.push("Authentic personality and commentary style");
  if (totalSubs >= 10000) irreplaceableElements.push("Established community trust and relationships");
  if (totalVideos >= 50) irreplaceableElements.push("Deep content library with institutional knowledge");
  irreplaceableElements.push("Creative taste and curation decisions");

  const recommendations: string[] = [];
  if (moatStrength < 50) recommendations.push("Invest in building personal brand identity that AI cannot replicate");
  if (communityStrength < 50) recommendations.push("Focus on community building — direct audience relationships are the ultimate moat");
  recommendations.push("Document and protect proprietary content formats and series concepts");

  return { moatStrength, moatLevel, uniqueFactors, irreplaceableElements, recommendations };
}

function computeCreatorWellness(
  userVideos: Array<{ createdAt: Date | null }>,
  records: Array<{ amount: number; source: string }>,
  platformCount: number,
  sourceDiversity: number,
): CreatorWellnessScore {
  const now = Date.now();
  const thirtyDaysAgo = now - 30 * 24 * 60 * 60 * 1000;
  const recentVideos = userVideos.filter(v => v.createdAt && new Date(v.createdAt).getTime() >= thirtyDaysAgo);

  const contentCadence = Math.min(100, recentVideos.length * 15);
  const workloadBalance = platformCount <= 2 ? 80 : platformCount <= 4 ? 60 : 40;
  const totalRevenue = records.reduce((s, r) => s + r.amount, 0);
  const revenueStability = Math.min(100, totalRevenue > 0 ? (records.length >= 10 ? 80 : records.length * 10) : 0);
  const diversificationHealth = Math.min(100, sourceDiversity * 25);

  const wellnessScore = Math.round(
    contentCadence * 0.25 +
    workloadBalance * 0.25 +
    revenueStability * 0.3 +
    diversificationHealth * 0.2
  );

  const level: CreatorWellnessScore["level"] =
    wellnessScore >= 75 ? "thriving" : wellnessScore >= 50 ? "sustainable" : wellnessScore >= 25 ? "strained" : "burnout_risk";

  const burnoutRiskFactors: string[] = [];
  if (recentVideos.length >= 15) burnoutRiskFactors.push("Very high content output may not be sustainable");
  if (platformCount >= 5) burnoutRiskFactors.push("Managing too many platforms increases cognitive load");
  if (sourceDiversity <= 1 && totalRevenue > 0) burnoutRiskFactors.push("Single revenue source creates financial stress");

  const wellnessActions: string[] = [];
  if (level === "burnout_risk" || level === "strained") wellnessActions.push("Establish sustainable content schedule with rest days");
  if (workloadBalance < 60) wellnessActions.push("Consolidate platform presence or delegate management");
  wellnessActions.push("Batch content creation to create buffer and reduce daily pressure");
  wellnessActions.push("Set revenue milestones to celebrate progress and maintain motivation");

  return {
    wellnessScore,
    level,
    indicators: { contentCadence, workloadBalance, revenueStability, diversificationHealth },
    burnoutRiskFactors,
    wellnessActions,
  };
}
