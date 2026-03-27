import { emitDomainEvent } from "../kernel/index";

export interface REITReadinessAssessment {
  overallScore: number;
  readinessLevel: "not_ready" | "early" | "developing" | "ready" | "advanced";
  dimensions: REITDimension[];
  recommendations: string[];
  assessedAt: Date;
}

export interface REITDimension {
  name: string;
  score: number;
  weight: number;
  details: string;
}

export function assessREITReadiness(metrics: {
  monthlyRevenue?: number;
  revenueStreams?: number;
  contentLibrarySize?: number;
  evergreenContentRatio?: number;
  subscriberCount?: number;
  monthlyGrowthRate?: number;
  operationalAutomation?: number;
  founderDependency?: number;
  brandStrength?: number;
  ipAssetsCount?: number;
}): REITReadinessAssessment {
  const dimensions: REITDimension[] = [
    { name: "Revenue Stability", score: Math.min(1, (metrics.monthlyRevenue || 0) / 10000), weight: 0.2, details: `$${metrics.monthlyRevenue || 0}/month revenue` },
    { name: "Revenue Diversification", score: Math.min(1, (metrics.revenueStreams || 1) / 5), weight: 0.15, details: `${metrics.revenueStreams || 1} revenue streams` },
    { name: "Content Asset Base", score: Math.min(1, (metrics.contentLibrarySize || 0) / 500), weight: 0.15, details: `${metrics.contentLibrarySize || 0} content assets` },
    { name: "Evergreen Content Ratio", score: metrics.evergreenContentRatio || 0, weight: 0.1, details: `${((metrics.evergreenContentRatio || 0) * 100).toFixed(0)}% evergreen` },
    { name: "Audience Scale", score: Math.min(1, (metrics.subscriberCount || 0) / 100000), weight: 0.1, details: `${metrics.subscriberCount || 0} subscribers` },
    { name: "Growth Trajectory", score: Math.min(1, (metrics.monthlyGrowthRate || 0) / 0.1), weight: 0.1, details: `${((metrics.monthlyGrowthRate || 0) * 100).toFixed(1)}% monthly growth` },
    { name: "Operational Automation", score: metrics.operationalAutomation || 0, weight: 0.08, details: `${((metrics.operationalAutomation || 0) * 100).toFixed(0)}% automated` },
    { name: "Founder Independence", score: 1 - (metrics.founderDependency || 0.8), weight: 0.07, details: `${((1 - (metrics.founderDependency || 0.8)) * 100).toFixed(0)}% independent` },
    { name: "Brand Value", score: metrics.brandStrength || 0, weight: 0.03, details: `Brand strength: ${((metrics.brandStrength || 0) * 100).toFixed(0)}%` },
    { name: "IP Portfolio", score: Math.min(1, (metrics.ipAssetsCount || 0) / 10), weight: 0.02, details: `${metrics.ipAssetsCount || 0} IP assets` },
  ];

  const overallScore = dimensions.reduce((sum, d) => sum + d.score * d.weight, 0);

  const readinessLevel: REITReadinessAssessment["readinessLevel"] =
    overallScore >= 0.8 ? "advanced" :
    overallScore >= 0.6 ? "ready" :
    overallScore >= 0.4 ? "developing" :
    overallScore >= 0.2 ? "early" : "not_ready";

  const recommendations: string[] = [];
  const weakDimensions = dimensions.filter((d) => d.score < 0.4).sort((a, b) => b.weight - a.weight);
  for (const wd of weakDimensions.slice(0, 3)) {
    recommendations.push(`Improve ${wd.name}: ${wd.details}`);
  }
  if (readinessLevel === "not_ready") {
    recommendations.push("Focus on building stable, diversified revenue before REIT-style thinking");
  }

  return { overallScore, readinessLevel, dimensions, recommendations, assessedAt: new Date() };
}
