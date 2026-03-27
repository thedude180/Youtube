import { emitDomainEvent } from "../kernel/index";

export interface WellnessMetric {
  category: "workload" | "stress" | "balance" | "growth" | "satisfaction";
  score: number;
  trend: "improving" | "stable" | "declining";
  details: string;
}

export interface WellnessReport {
  overallScore: number;
  status: "thriving" | "balanced" | "strained" | "at_risk" | "burnout_risk";
  metrics: WellnessMetric[];
  recommendations: string[];
  assessedAt: Date;
}

export function assessCreatorWellness(inputs: {
  weeklyHours?: number;
  publishFrequency?: number;
  streamHoursWeekly?: number;
  daysOff?: number;
  revenueStability?: number;
  audienceGrowth?: number;
  contentSatisfaction?: number;
}): WellnessReport {
  const metrics: WellnessMetric[] = [];

  const weeklyHours = inputs.weeklyHours || 40;
  const workloadScore = weeklyHours <= 40 ? 1.0 : weeklyHours <= 50 ? 0.7 : weeklyHours <= 60 ? 0.4 : 0.2;
  metrics.push({ category: "workload", score: workloadScore, trend: "stable", details: `${weeklyHours}h/week` });

  const publishFreq = inputs.publishFrequency || 3;
  const stressScore = publishFreq <= 3 ? 0.9 : publishFreq <= 5 ? 0.6 : publishFreq <= 7 ? 0.3 : 0.1;
  metrics.push({ category: "stress", score: stressScore, trend: "stable", details: `${publishFreq} publishes/week` });

  const daysOff = inputs.daysOff || 2;
  const balanceScore = daysOff >= 2 ? 1.0 : daysOff >= 1 ? 0.5 : 0.1;
  metrics.push({ category: "balance", score: balanceScore, trend: "stable", details: `${daysOff} days off/week` });

  const growthScore = Math.min(1, Math.max(0, inputs.audienceGrowth || 0.5));
  metrics.push({ category: "growth", score: growthScore, trend: "stable", details: `${(growthScore * 100).toFixed(0)}% growth satisfaction` });

  const satisfactionScore = inputs.contentSatisfaction || 0.7;
  metrics.push({ category: "satisfaction", score: satisfactionScore, trend: "stable", details: `${(satisfactionScore * 100).toFixed(0)}% content satisfaction` });

  const overallScore = metrics.reduce((sum, m) => sum + m.score, 0) / metrics.length;

  const status: WellnessReport["status"] =
    overallScore >= 0.8 ? "thriving" :
    overallScore >= 0.6 ? "balanced" :
    overallScore >= 0.4 ? "strained" :
    overallScore >= 0.2 ? "at_risk" : "burnout_risk";

  const recommendations: string[] = [];
  if (workloadScore < 0.5) recommendations.push("Reduce weekly hours — delegate or automate more tasks");
  if (balanceScore < 0.5) recommendations.push("Take at least 1 full day off per week for recovery");
  if (stressScore < 0.5) recommendations.push("Reduce publish frequency or batch content creation");
  if (satisfactionScore < 0.5) recommendations.push("Revisit content strategy — focus on what energizes you");
  if (status === "burnout_risk") recommendations.push("URGENT: Burnout risk detected. Consider a short break and content hiatus");

  return { overallScore, status, metrics, recommendations, assessedAt: new Date() };
}

export async function assessAndEmit(
  userId: string,
  inputs: Parameters<typeof assessCreatorWellness>[0]
): Promise<WellnessReport> {
  const report = assessCreatorWellness(inputs);

  if (report.status === "at_risk" || report.status === "burnout_risk") {
    try {
      await emitDomainEvent(userId, "creator_wellness.risk_detected", {
        status: report.status,
        overallScore: report.overallScore,
      }, "creator-wellness", "wellness");
    } catch (_) {}
  }

  return report;
}
