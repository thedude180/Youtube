import { db } from "../db";
import { liveBurnoutSignals } from "@shared/schema";
import { eq, desc } from "drizzle-orm";

export async function predictBurnout(
  userId: string,
  factors: {
    streamsThisWeek?: number;
    avgStreamDurationHours?: number;
    daysSinceBreak?: number;
    consecutiveStreamDays?: number;
    contentBacklogSize?: number;
    overrideCount?: number;
  },
): Promise<{ riskScore: number; severity: string; factors: string[]; recommendation: string }> {
  let riskScore = 0;
  const riskFactors: string[] = [];

  if (factors.streamsThisWeek && factors.streamsThisWeek > 5) {
    riskScore += 0.25;
    riskFactors.push(`${factors.streamsThisWeek} streams this week (high volume)`);
  }

  if (factors.avgStreamDurationHours && factors.avgStreamDurationHours > 4) {
    riskScore += 0.2;
    riskFactors.push(`Average ${factors.avgStreamDurationHours}h stream duration (long sessions)`);
  }

  if (factors.daysSinceBreak && factors.daysSinceBreak > 14) {
    riskScore += 0.3;
    riskFactors.push(`${factors.daysSinceBreak} days since last break`);
  }

  if (factors.consecutiveStreamDays && factors.consecutiveStreamDays > 7) {
    riskScore += 0.2;
    riskFactors.push(`${factors.consecutiveStreamDays} consecutive streaming days`);
  }

  if (factors.overrideCount && factors.overrideCount > 10) {
    riskScore += 0.1;
    riskFactors.push("High manual override count suggesting AI friction");
  }

  riskScore = Math.min(1, riskScore);
  const severity = riskScore >= 0.7 ? "high" : riskScore >= 0.4 ? "medium" : "low";

  const recommendation = severity === "high"
    ? "Strongly recommend taking a 2-3 day break. Reduce stream frequency next week."
    : severity === "medium"
    ? "Consider shorter streams or skipping 1-2 days this week."
    : "Current pace is sustainable. Continue monitoring.";

  if (riskScore >= 0.4) {
    await db.insert(liveBurnoutSignals).values({
      userId,
      signalType: "prediction",
      severity,
      riskScore,
      factors: { items: riskFactors },
      recommendation,
    });
  }

  return { riskScore, severity, factors: riskFactors, recommendation };
}

export function getBurnoutRiskFactors(): string[] {
  return [
    "streamsThisWeek — number of streams in the current week",
    "avgStreamDurationHours — average hours per stream session",
    "daysSinceBreak — days since the last day off from streaming",
    "consecutiveStreamDays — number of days streamed without a gap",
    "contentBacklogSize — pending content items in queue",
    "overrideCount — number of manual AI overrides recently",
  ];
}

export async function suggestRecovery(userId: string): Promise<string[]> {
  const recent = await db.select().from(liveBurnoutSignals)
    .where(eq(liveBurnoutSignals.userId, userId))
    .orderBy(desc(liveBurnoutSignals.createdAt))
    .limit(5);

  const highRisk = recent.filter(s => s.severity === "high").length;

  const suggestions: string[] = [];
  if (highRisk >= 2) {
    suggestions.push("Take a full week off from live streaming");
    suggestions.push("Pre-record 3-4 videos as buffer content");
    suggestions.push("Reduce stream sessions to 2 hours max when returning");
  } else {
    suggestions.push("Schedule 1-2 rest days per week");
    suggestions.push("Use the pre-creation oracle to batch content planning");
    suggestions.push("Enable more automation to reduce manual workload");
  }

  return suggestions;
}
