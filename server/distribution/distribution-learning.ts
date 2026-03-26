import { db } from "../db";
import { distributionEvents } from "@shared/schema";
import { eq, desc, and, sql } from "drizzle-orm";

type LearningSignal = {
  allowed: boolean;
  trustCost: number;
  policyIssues: string[];
  connectionStatus: string;
  publishSuccess?: boolean;
  publishLatencyMs?: number;
  engagementRate?: number;
  viewCount?: number;
  clickThroughRate?: number;
};

const learningBuffer = new Map<string, LearningSignal[]>();
const MAX_BUFFER = 100;

export async function recordDistributionLearning(
  userId: string,
  platform: string,
  eventType: string,
  signal: LearningSignal
): Promise<void> {
  const key = `${userId}:${platform}`;
  if (!learningBuffer.has(key)) learningBuffer.set(key, []);
  const buf = learningBuffer.get(key)!;
  buf.push(signal);
  if (buf.length > MAX_BUFFER) buf.shift();

  try {
    const { emitDomainEvent } = await import("../kernel/index");
    await emitDomainEvent(
      userId,
      "distribution.learning.recorded",
      { platform, eventType, signal },
      "distribution-learning",
      `${platform}:${eventType}`
    );
  } catch {}

  try {
    const { ingestLearningSignal } = await import("../services/learning-governance");
    const confidence = signal.publishSuccess ? 0.85 : 0.5;
    await ingestLearningSignal(
      userId, "distribution", `dist_${eventType}`,
      { platform, ...signal }, confidence, "distribution-learning"
    );
  } catch {}
}

export function getDistributionLearningContext(userId: string, platform?: string): {
  totalSignals: number;
  successRate: number;
  commonIssues: string[];
  avgTrustCost: number;
  platformBreakdown: Record<string, { total: number; successRate: number }>;
} {
  const breakdown: Record<string, { total: number; successes: number }> = {};
  const allIssues: string[] = [];
  let totalCost = 0;
  let totalSignals = 0;
  let successes = 0;

  for (const [key, signals] of learningBuffer.entries()) {
    const [uid, plat] = key.split(":");
    if (uid !== userId) continue;
    if (platform && plat !== platform) continue;

    if (!breakdown[plat]) breakdown[plat] = { total: 0, successes: 0 };

    for (const s of signals) {
      totalSignals++;
      breakdown[plat].total++;
      totalCost += s.trustCost;
      const isSuccess = s.publishSuccess !== undefined ? s.publishSuccess : s.allowed;
      if (isSuccess) {
        successes++;
        breakdown[plat].successes++;
      }
      allIssues.push(...s.policyIssues);
    }
  }

  const issueCounts = new Map<string, number>();
  for (const issue of allIssues) {
    issueCounts.set(issue, (issueCounts.get(issue) || 0) + 1);
  }
  const commonIssues = [...issueCounts.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, 5)
    .map(([issue]) => issue);

  const platformBreakdown: Record<string, { total: number; successRate: number }> = {};
  for (const [plat, data] of Object.entries(breakdown)) {
    platformBreakdown[plat] = {
      total: data.total,
      successRate: data.total > 0 ? data.successes / data.total : 0,
    };
  }

  return {
    totalSignals,
    successRate: totalSignals > 0 ? successes / totalSignals : 1,
    commonIssues,
    avgTrustCost: totalSignals > 0 ? totalCost / totalSignals : 0,
    platformBreakdown,
  };
}

export async function getDistributionInsights(userId: string): Promise<{
  recentTrend: "improving" | "stable" | "declining";
  bestPlatform: string | null;
  suggestions: string[];
}> {
  const events = await db.select().from(distributionEvents)
    .where(eq(distributionEvents.userId, userId))
    .orderBy(desc(distributionEvents.createdAt))
    .limit(100);

  if (events.length < 5) {
    return { recentTrend: "stable", bestPlatform: null, suggestions: ["Not enough distribution data yet"] };
  }

  const recent = events.slice(0, 20);
  const older = events.slice(20, 40);
  const isSuccess = (s: string) => s === "published" || s === "approved";
  const recentSuccess = recent.filter(e => isSuccess(e.status)).length / recent.length;
  const olderSuccess = older.length > 0 ? older.filter(e => isSuccess(e.status)).length / older.length : recentSuccess;

  const recentTrend = recentSuccess > olderSuccess + 0.05 ? "improving"
    : recentSuccess < olderSuccess - 0.05 ? "declining" : "stable";

  const platformCounts: Record<string, number> = {};
  for (const e of events.filter(e => isSuccess(e.status))) {
    platformCounts[e.platform] = (platformCounts[e.platform] || 0) + 1;
  }
  const bestPlatform = Object.entries(platformCounts).sort((a, b) => b[1] - a[1])[0]?.[0] || null;

  const suggestions: string[] = [];
  const blockedRate = events.filter(e => e.status === "blocked").length / events.length;
  if (blockedRate > 0.2) suggestions.push("High block rate — review trust budget allocation and policy compliance");
  if (Object.keys(platformCounts).length < 3) suggestions.push("Consider diversifying to more platforms for independence");
  if (recentTrend === "declining") suggestions.push("Distribution success is declining — check platform connection health");

  return { recentTrend, bestPlatform, suggestions };
}
