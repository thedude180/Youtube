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

export interface LiveLoadAssessment {
  userId: string;
  currentLoad: number;
  sustainabilityScore: number;
  projectedBurnoutDays: number | null;
  loadBreakdown: { factor: string; contribution: number; status: "safe" | "warning" | "danger" }[];
  adaptiveRecommendations: string[];
  assessedAt: Date;
}

export async function assessLiveLoad(
  userId: string,
  factors: {
    streamsThisWeek?: number;
    avgStreamDurationHours?: number;
    daysSinceBreak?: number;
    consecutiveStreamDays?: number;
    contentBacklogSize?: number;
    overrideCount?: number;
    socialMediaHoursDaily?: number;
    editingHoursDaily?: number;
  }
): Promise<LiveLoadAssessment> {
  const prediction = await predictBurnout(userId, factors);

  const loadBreakdown: LiveLoadAssessment["loadBreakdown"] = [];

  const streamLoad = Math.min(1, (factors.streamsThisWeek || 0) / 7);
  loadBreakdown.push({ factor: "Stream frequency", contribution: streamLoad * 0.2, status: streamLoad > 0.7 ? "danger" : streamLoad > 0.4 ? "warning" : "safe" });

  const durationLoad = Math.min(1, (factors.avgStreamDurationHours || 0) / 6);
  loadBreakdown.push({ factor: "Stream duration", contribution: durationLoad * 0.2, status: durationLoad > 0.7 ? "danger" : durationLoad > 0.5 ? "warning" : "safe" });

  const restLoad = Math.min(1, (factors.daysSinceBreak || 0) / 21);
  loadBreakdown.push({ factor: "Rest deficit", contribution: restLoad * 0.25, status: restLoad > 0.7 ? "danger" : restLoad > 0.4 ? "warning" : "safe" });

  const consecutiveLoad = Math.min(1, (factors.consecutiveStreamDays || 0) / 10);
  loadBreakdown.push({ factor: "Consecutive days", contribution: consecutiveLoad * 0.15, status: consecutiveLoad > 0.7 ? "danger" : consecutiveLoad > 0.5 ? "warning" : "safe" });

  const overrideLoad = Math.min(1, (factors.overrideCount || 0) / 20);
  loadBreakdown.push({ factor: "AI friction (overrides)", contribution: overrideLoad * 0.1, status: overrideLoad > 0.5 ? "warning" : "safe" });

  const editingLoad = Math.min(1, (factors.editingHoursDaily || 0) / 8);
  loadBreakdown.push({ factor: "Editing workload", contribution: editingLoad * 0.1, status: editingLoad > 0.7 ? "danger" : editingLoad > 0.4 ? "warning" : "safe" });

  const currentLoad = loadBreakdown.reduce((sum, l) => sum + l.contribution, 0);
  const sustainabilityScore = Math.max(0, 1 - currentLoad);

  let projectedBurnoutDays: number | null = null;
  if (currentLoad > 0.6) {
    projectedBurnoutDays = Math.max(1, Math.round((1 - currentLoad) / 0.05 * 7));
  }

  const dangerFactors = loadBreakdown.filter(l => l.status === "danger");
  const adaptiveRecommendations: string[] = [];

  if (dangerFactors.length > 0) {
    for (const d of dangerFactors) {
      switch (d.factor) {
        case "Stream frequency": adaptiveRecommendations.push("Reduce to 3-4 streams per week max"); break;
        case "Stream duration": adaptiveRecommendations.push("Cap streams at 3 hours — use timer alerts"); break;
        case "Rest deficit": adaptiveRecommendations.push("Take at least 2 consecutive rest days this week"); break;
        case "Consecutive days": adaptiveRecommendations.push("Insert a rest day between every 3 streaming days"); break;
        case "Editing workload": adaptiveRecommendations.push("Batch edit sessions and consider outsourcing clips"); break;
      }
    }
  }

  if (sustainabilityScore > 0.7) adaptiveRecommendations.push("Current pace is sustainable — maintain this rhythm");
  if (projectedBurnoutDays && projectedBurnoutDays < 14) adaptiveRecommendations.push(`Burnout projected in ~${projectedBurnoutDays} days — take preventive action now`);

  return {
    userId, currentLoad, sustainabilityScore, projectedBurnoutDays,
    loadBreakdown, adaptiveRecommendations, assessedAt: new Date(),
  };
}
