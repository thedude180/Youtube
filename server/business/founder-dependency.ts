import { db } from "../db";
import { revenueRecords, channels, videos, streams } from "@shared/schema";
import { eq, desc, sql, gte } from "drizzle-orm";

export interface FounderDependencyScore {
  overallScore: number;
  riskLevel: "low" | "medium" | "high" | "critical";
  factors: {
    contentCreation: number;
    revenueGeneration: number;
    audienceRelationship: number;
    operationalControl: number;
    brandIdentity: number;
  };
  mitigations: string[];
  delegationOpportunities: string[];
}

export interface ChannelResilienceScore {
  overallResilience: number;
  grade: "A" | "B" | "C" | "D" | "F";
  scenarios: DisruptionScenario[];
  strengths: string[];
  vulnerabilities: string[];
  contingencyPlan: string[];
}

export interface DisruptionScenario {
  scenario: string;
  probability: "low" | "medium" | "high";
  revenueImpact: number;
  recoveryTime: string;
  survivalScore: number;
  mitigations: string[];
}

export async function computeFounderDependency(userId: string): Promise<FounderDependencyScore> {
  const [records, userChannels, userVideos, userStreams] = await Promise.all([
    db.select().from(revenueRecords)
      .where(eq(revenueRecords.userId, userId))
      .orderBy(desc(revenueRecords.recordedAt)),
    db.select().from(channels).where(eq(channels.userId, userId)),
    db.select().from(videos)
      .where(sql`${videos.channelId} IN (SELECT id FROM channels WHERE user_id = ${userId})`)
      .orderBy(desc(videos.createdAt))
      .limit(500),
    db.select().from(streams)
      .where(eq(streams.userId, userId))
      .orderBy(desc(streams.createdAt))
      .limit(200),
  ]);

  const revenueSources = new Set(records.map(r => r.source));
  const passiveRevenueSources = new Set(["Ad Revenue", "Affiliate", "Merchandise", "Licensing"]);
  const activeRevenueSources = new Set(["Sponsorship", "Super Chat", "Donations", "Consulting"]);
  let passiveRevenue = 0;
  let activeRevenue = 0;
  for (const r of records) {
    const isPassive = [...passiveRevenueSources].some(s => r.source.toLowerCase().includes(s.toLowerCase()));
    if (isPassive) passiveRevenue += r.amount;
    else activeRevenue += r.amount;
  }
  const totalRev = passiveRevenue + activeRevenue;
  const revenueGeneration = totalRev > 0 ? Math.round((activeRevenue / totalRev) * 100) : 90;

  const contentCreation = 90;
  const audienceRelationship = userStreams.length > 10 ? 85 : userStreams.length > 3 ? 70 : 50;
  const operationalControl = userChannels.length > 2 ? 70 : userChannels.length > 1 ? 80 : 90;

  const brandIdentity = 85;

  const overallScore = Math.round(
    contentCreation * 0.25 +
    revenueGeneration * 0.25 +
    audienceRelationship * 0.20 +
    operationalControl * 0.15 +
    brandIdentity * 0.15
  );

  const riskLevel: FounderDependencyScore["riskLevel"] =
    overallScore >= 80 ? "critical" : overallScore >= 65 ? "high" : overallScore >= 45 ? "medium" : "low";

  const mitigations: string[] = [];
  const delegationOpportunities: string[] = [];

  if (contentCreation > 70) {
    mitigations.push("Develop a content production pipeline that doesn't require founder for every piece");
    delegationOpportunities.push("Hire a video editor to handle post-production");
    delegationOpportunities.push("Create templated content formats that team members can produce");
  }

  if (revenueGeneration > 60) {
    mitigations.push("Build passive revenue streams (merch, affiliates, evergreen courses) that don't require daily founder involvement");
    delegationOpportunities.push("Hire a sponsorship/brand deals manager");
  }

  if (audienceRelationship > 60) {
    mitigations.push("Build community managers and moderators who maintain audience relationships");
    delegationOpportunities.push("Train community moderators to handle day-to-day engagement");
  }

  if (operationalControl > 70) {
    mitigations.push("Document all SOPs and create an operations manual");
    delegationOpportunities.push("Hire an operations manager to handle scheduling, publishing, and analytics");
  }

  if (brandIdentity > 70) {
    mitigations.push("Evolve brand identity from personal brand toward team/studio brand");
  }

  return {
    overallScore,
    riskLevel,
    factors: {
      contentCreation,
      revenueGeneration,
      audienceRelationship,
      operationalControl,
      brandIdentity,
    },
    mitigations,
    delegationOpportunities,
  };
}

export async function computeChannelResilience(userId: string): Promise<ChannelResilienceScore> {
  const [records, userChannels, userVideos, userStreams] = await Promise.all([
    db.select().from(revenueRecords)
      .where(eq(revenueRecords.userId, userId))
      .orderBy(desc(revenueRecords.recordedAt)),
    db.select().from(channels).where(eq(channels.userId, userId)),
    db.select().from(videos)
      .where(sql`${videos.channelId} IN (SELECT id FROM channels WHERE user_id = ${userId})`)
      .orderBy(desc(videos.createdAt))
      .limit(500),
    db.select().from(streams)
      .where(eq(streams.userId, userId))
      .orderBy(desc(streams.createdAt))
      .limit(200),
  ]);

  const totalRevenue = records.reduce((s, r) => s + r.amount, 0);
  const platformCount = new Set(userChannels.map(c => c.platform)).size;
  const sourceCount = new Set(records.map(r => r.source)).size;
  const videoCount = userVideos.length;
  const verifiedPercent = totalRevenue > 0
    ? (records.filter(r => r.reconciliationStatus === "verified").reduce((s, r) => s + r.amount, 0) / totalRevenue) * 100
    : 0;

  const revenueByPlatform = new Map<string, number>();
  for (const r of records) {
    revenueByPlatform.set(r.platform, (revenueByPlatform.get(r.platform) || 0) + r.amount);
  }
  const maxPlatformShare = totalRevenue > 0
    ? Math.max(...Array.from(revenueByPlatform.values())) / totalRevenue : 1;

  const scenarios: DisruptionScenario[] = [];

  const topPlatform = userChannels.length > 0 ? userChannels[0].platform : "primary platform";
  const platformBanImpact = maxPlatformShare * 100;
  scenarios.push({
    scenario: `${topPlatform} account ban or suspension`,
    probability: "low",
    revenueImpact: Math.round(platformBanImpact),
    recoveryTime: platformCount > 1 ? "1-3 months" : "6-12 months",
    survivalScore: Math.round(100 - platformBanImpact * 0.8),
    mitigations: [
      "Maintain active presence on multiple platforms",
      "Build email list as platform-independent audience channel",
      "Keep content backups for reposting on alternative platforms",
    ],
  });

  const algoChangeImpact = 30 + (maxPlatformShare > 0.7 ? 20 : 0);
  scenarios.push({
    scenario: "Major algorithm change reducing reach by 50%",
    probability: "high",
    revenueImpact: Math.round(algoChangeImpact),
    recoveryTime: "2-4 months",
    survivalScore: Math.round(100 - algoChangeImpact * 0.6),
    mitigations: [
      "Diversify content formats to hedge against algorithm shifts",
      "Build direct audience relationships (email, Discord) independent of algorithms",
      "Maintain SEO-optimized evergreen content that doesn't depend on algorithmic push",
    ],
  });

  const absenceImpact = 50 + (sourceCount < 3 ? 20 : 0);
  scenarios.push({
    scenario: "Creator unable to produce content for 3 months",
    probability: "medium",
    revenueImpact: Math.round(absenceImpact),
    recoveryTime: "3-6 months",
    survivalScore: Math.round(100 - absenceImpact * 0.7),
    mitigations: [
      "Build a content backlog buffer (2-4 weeks of pre-recorded content)",
      "Develop SOPs so team members can continue production",
      "Maximize passive revenue streams that continue without creator",
    ],
  });

  const demonetizationImpact = 40 + (sourceCount < 3 ? 25 : 0);
  scenarios.push({
    scenario: "Platform demonetization (policy violation or industry change)",
    probability: "medium",
    revenueImpact: Math.round(demonetizationImpact),
    recoveryTime: "1-3 months",
    survivalScore: Math.round(100 - demonetizationImpact * 0.6),
    mitigations: [
      "Diversify revenue beyond platform ad revenue (sponsors, merch, courses)",
      "Stay compliant with all platform policies",
      "Build direct-to-consumer revenue channels",
    ],
  });

  const avgSurvival = scenarios.reduce((s, sc) => s + sc.survivalScore, 0) / scenarios.length;
  const diversificationBonus = Math.min(20, platformCount * 5 + sourceCount * 3);
  const contentDepthBonus = Math.min(15, Math.log2(Math.max(videoCount, 1)) * 3);
  const verificationBonus = verifiedPercent >= 80 ? 10 : verifiedPercent >= 50 ? 5 : 0;

  const overallResilience = Math.round(Math.min(100, avgSurvival + diversificationBonus + contentDepthBonus + verificationBonus));

  const grade: ChannelResilienceScore["grade"] =
    overallResilience >= 80 ? "A" : overallResilience >= 65 ? "B" : overallResilience >= 50 ? "C" : overallResilience >= 35 ? "D" : "F";

  const strengths: string[] = [];
  const vulnerabilities: string[] = [];
  const contingencyPlan: string[] = [];

  if (platformCount >= 3) strengths.push("Strong multi-platform presence");
  else vulnerabilities.push("Limited platform diversification");

  if (sourceCount >= 4) strengths.push("Well-diversified revenue streams");
  else if (sourceCount < 2) vulnerabilities.push("Revenue concentrated in too few sources");

  if (videoCount >= 100) strengths.push("Deep content library with long-tail value");
  else if (videoCount < 20) vulnerabilities.push("Small content library limits resilience");

  if (verifiedPercent >= 80) strengths.push("Revenue data is well-verified and audit-ready");
  else if (verifiedPercent < 50) vulnerabilities.push("Low revenue verification reduces financial credibility");

  contingencyPlan.push("Maintain 4-week content buffer at all times");
  contingencyPlan.push("Keep platform credentials and access documented for team");
  if (platformCount < 3) contingencyPlan.push("Expand to at least 3 active platforms within 60 days");
  if (sourceCount < 3) contingencyPlan.push("Add 2+ revenue streams to reduce concentration risk");
  contingencyPlan.push("Review and update contingency plan monthly");

  return {
    overallResilience,
    grade,
    scenarios,
    strengths,
    vulnerabilities,
    contingencyPlan,
  };
}
