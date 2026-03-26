import { db } from "../db";
import { revenueRecords, channels, videos } from "@shared/schema";
import { eq, desc, sql } from "drizzle-orm";
import { computeRevenueConfidence } from "./revenue-confidence";

export interface LearningSignal {
  category: string;
  signal: string;
  confidence: "high" | "medium" | "low";
  actionable: boolean;
  suggestedAction: string;
  source: string;
}

export interface BusinessLearningReport {
  signals: LearningSignal[];
  patterns: {
    revenuePatterns: string[];
    contentPatterns: string[];
    growthPatterns: string[];
  };
  maturityAssessment: {
    stage: "seed" | "early" | "growth" | "scale" | "mature";
    score: number;
    nextMilestone: string;
  };
  revenueConfidence: { totalRevenue: number; verifiedPercent: number; confidenceLabel: string };
  governedConfidence: { confidence: number; maturityLevel: string } | null;
  feedbackLoops: Array<{ loop: string; status: "active" | "dormant" | "missing"; impact: string }>;
}

export async function computeBusinessLearning(userId: string): Promise<BusinessLearningReport> {
  const userChannelIds = db
    .select({ id: channels.id })
    .from(channels)
    .where(eq(channels.userId, userId));

  const [userChannels, userVideos, records] = await Promise.all([
    db.select().from(channels).where(eq(channels.userId, userId)),
    db.select().from(videos)
      .where(sql`${videos.channelId} IN (${userChannelIds})`)
      .orderBy(desc(videos.createdAt))
      .limit(500),
    db.select().from(revenueRecords)
      .where(eq(revenueRecords.userId, userId))
      .orderBy(desc(revenueRecords.recordedAt))
      .limit(500),
  ]);

  const confidence = computeRevenueConfidence(records);
  const totalRevenue = records.reduce((s, r) => s + r.amount, 0);
  const totalSubs = userChannels.reduce((s, c) => s + (c.subscriberCount || 0), 0);
  const sourceDiversity = new Set(records.map(r => r.source)).size;
  const platformCount = new Set(userChannels.map(c => c.platform)).size;

  const signals = extractSignals(userVideos, records, userChannels, totalRevenue, totalSubs, sourceDiversity, platformCount, confidence);
  const patterns = detectPatterns(userVideos, records, totalRevenue, sourceDiversity);
  const maturityAssessment = assessMaturity(totalRevenue, totalSubs, userVideos.length, sourceDiversity, platformCount);
  const feedbackLoops = identifyFeedbackLoops(userVideos.length, records.length, sourceDiversity, platformCount);

  let governedRevenue: { confidence: number; maturityLevel: string } | null = null;
  try {
    const { getGovernedConfidenceForDomain } = await import("../services/learning-governance");
    const gc = await getGovernedConfidenceForDomain(userId, "revenue");
    governedRevenue = { confidence: gc.confidence, maturityLevel: gc.maturityLevel };
  } catch (err: any) {
    console.warn("[business-learning] governance confidence lookup failed:", err?.message);
  }

  const report = {
    signals,
    patterns,
    maturityAssessment,
    revenueConfidence: {
      totalRevenue: Math.round(confidence.totalRevenue),
      verifiedPercent: confidence.verifiedPercent,
      confidenceLabel: confidence.confidenceLabel,
    },
    governedConfidence: governedRevenue,
    feedbackLoops,
  };

  try {
    const { recordFinancialAudit } = await import("../services/financial-audit");
    await recordFinancialAudit(
      userId, "business_learning_computed", "business_learning_report", null,
      {},
      { signalCount: signals.length, patternCount: (patterns.revenuePatterns?.length || 0) + (patterns.contentPatterns?.length || 0) + (patterns.growthPatterns?.length || 0), maturityStage: maturityAssessment.stage, totalRevenue: Math.round(confidence.totalRevenue), confidenceLabel: confidence.confidenceLabel },
      "business-learning",
    );
  } catch (err: unknown) {
    console.warn("[business-learning] audit trail write failed:", (err as Error)?.message);
  }

  return report;
}

function extractSignals(
  userVideos: Array<{ createdAt: Date | null; metadata: Record<string, unknown> | null }>,
  records: Array<{ amount: number; source: string }>,
  userChannels: Array<{ subscriberCount: number | null; platform: string }>,
  totalRevenue: number,
  totalSubs: number,
  sourceDiversity: number,
  platformCount: number,
  confidence: ReturnType<typeof computeRevenueConfidence>,
): LearningSignal[] {
  const signals: LearningSignal[] = [];

  if (totalRevenue > 0 && confidence.verifiedPercent < 50) {
    signals.push({
      category: "Revenue Quality",
      signal: `Only ${confidence.verifiedPercent}% of revenue is verified — reconciliation gaps reduce business intelligence accuracy`,
      confidence: "high",
      actionable: true,
      suggestedAction: "Reconcile unverified revenue records to improve forecast accuracy",
      source: "revenue-confidence",
    });
  }

  if (sourceDiversity <= 1 && totalRevenue > 0) {
    signals.push({
      category: "Revenue Concentration",
      signal: "All revenue from a single source — high vulnerability to market changes",
      confidence: "high",
      actionable: true,
      suggestedAction: "Add at least 2 additional revenue streams (memberships, sponsorships, merchandise)",
      source: "revenue-diversification",
    });
  }

  if (platformCount <= 1) {
    signals.push({
      category: "Platform Risk",
      signal: "Operating on a single platform — algorithm or policy changes could devastate reach",
      confidence: "high",
      actionable: true,
      suggestedAction: "Expand to at least one additional platform for audience redundancy",
      source: "risk-intelligence",
    });
  }

  const now = Date.now();
  const thirtyDaysAgo = now - 30 * 24 * 60 * 60 * 1000;
  const recentVideos = userVideos.filter(v => v.createdAt && new Date(v.createdAt).getTime() >= thirtyDaysAgo);
  if (recentVideos.length === 0 && userVideos.length > 0) {
    signals.push({
      category: "Content Velocity",
      signal: "No new content in the last 30 days — audience engagement may decline",
      confidence: "medium",
      actionable: true,
      suggestedAction: "Resume content publishing to maintain audience retention and algorithm favor",
      source: "content-asset-valuation",
    });
  }

  if (totalSubs >= 10000 && totalRevenue < 100) {
    signals.push({
      category: "Monetization Gap",
      signal: `${totalSubs.toLocaleString()} subscribers but minimal revenue — significant monetization opportunity untapped`,
      confidence: "high",
      actionable: true,
      suggestedAction: "Implement monetization strategy: sponsorships, memberships, or affiliate partnerships",
      source: "capital-allocation",
    });
  }

  return signals;
}

function detectPatterns(
  userVideos: Array<{ createdAt: Date | null }>,
  records: Array<{ amount: number; source: string }>,
  totalRevenue: number,
  sourceDiversity: number,
): BusinessLearningReport["patterns"] {
  const revenuePatterns: string[] = [];
  const contentPatterns: string[] = [];
  const growthPatterns: string[] = [];

  if (totalRevenue > 0) {
    const bySource = new Map<string, number>();
    for (const r of records) {
      bySource.set(r.source, (bySource.get(r.source) || 0) + r.amount);
    }
    const sorted = Array.from(bySource.entries()).sort((a, b) => b[1] - a[1]);
    if (sorted.length > 0) {
      revenuePatterns.push(`Top revenue source: ${sorted[0][0]} ($${Math.round(sorted[0][1])})`);
    }
    if (sorted.length > 1) {
      const topPercent = Math.round((sorted[0][1] / totalRevenue) * 100);
      revenuePatterns.push(`Revenue concentration: ${topPercent}% from top source`);
    }
  } else {
    revenuePatterns.push("No revenue recorded yet — pre-monetization phase");
  }

  if (userVideos.length > 0) {
    contentPatterns.push(`Content library: ${userVideos.length} pieces`);
    const now = Date.now();
    const ninetyDaysAgo = now - 90 * 24 * 60 * 60 * 1000;
    const recentCount = userVideos.filter(v => v.createdAt && new Date(v.createdAt).getTime() >= ninetyDaysAgo).length;
    contentPatterns.push(`Recent output (90 days): ${recentCount} pieces`);
  }

  if (sourceDiversity >= 3) {
    growthPatterns.push("Revenue diversification is healthy — multiple income streams active");
  } else if (sourceDiversity === 2) {
    growthPatterns.push("Revenue diversification is developing — consider adding more streams");
  } else {
    growthPatterns.push("Revenue diversification needed — single-source dependency is risky");
  }

  return { revenuePatterns, contentPatterns, growthPatterns };
}

function assessMaturity(
  totalRevenue: number,
  totalSubs: number,
  videoCount: number,
  sourceDiversity: number,
  platformCount: number,
): BusinessLearningReport["maturityAssessment"] {
  let score = 0;
  score += Math.min(25, totalRevenue / 400);
  score += Math.min(25, totalSubs / 4000);
  score += Math.min(25, videoCount / 4);
  score += Math.min(15, sourceDiversity * 5);
  score += Math.min(10, platformCount * 5);
  score = Math.round(Math.min(100, score));

  const stage: BusinessLearningReport["maturityAssessment"]["stage"] =
    score >= 80 ? "mature" : score >= 60 ? "scale" : score >= 40 ? "growth" : score >= 20 ? "early" : "seed";

  const milestones: Record<string, string> = {
    seed: "Publish first 10 videos and establish content cadence",
    early: "Reach 1,000 subscribers and first revenue milestone",
    growth: "Diversify to 3+ revenue streams and 2+ platforms",
    scale: "Build team and systematize operations for scale",
    mature: "Optimize for exit readiness or portfolio expansion",
  };

  return { stage, score, nextMilestone: milestones[stage] };
}

function identifyFeedbackLoops(
  videoCount: number,
  recordCount: number,
  sourceDiversity: number,
  platformCount: number,
): BusinessLearningReport["feedbackLoops"] {
  return [
    {
      loop: "Content → Revenue",
      status: recordCount > 0 && videoCount > 0 ? "active" : videoCount > 0 ? "dormant" : "missing",
      impact: "Content quality and quantity directly drive ad revenue and sponsorship opportunities",
    },
    {
      loop: "Revenue → Reinvestment",
      status: recordCount > 0 ? "active" : "missing",
      impact: "Revenue reinvested in equipment and team compounds content quality",
    },
    {
      loop: "Cross-Platform Amplification",
      status: platformCount >= 2 ? "active" : "dormant",
      impact: "Multi-platform presence creates viral loops and audience redundancy",
    },
    {
      loop: "Community → Growth",
      status: videoCount >= 20 ? "active" : "dormant",
      impact: "Engaged community drives organic discovery through shares and recommendations",
    },
  ];
}
