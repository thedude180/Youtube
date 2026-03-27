export interface ContentRiskAdjustment {
  contentType: string;
  baseValue: number;
  aiDisplacementRisk: number;
  humanValueMultiplier: number;
  adjustedValue: number;
  riskCategory: "low" | "medium" | "high" | "critical";
  mitigation: string[];
}

export interface AIRiskAdjustedStrategy {
  adjustments: ContentRiskAdjustment[];
  portfolioRisk: number;
  recommendedMix: { contentType: string; targetPercentage: number }[];
  recommendations: string[];
  assessedAt: Date;
}

const CONTENT_TYPE_RISKS: Record<string, { aiRisk: number; humanMultiplier: number; mitigations: string[] }> = {
  walkthrough: { aiRisk: 0.7, humanMultiplier: 0.5, mitigations: ["Add unique commentary insights", "Include personal gaming tips", "Show alternative paths"] },
  review: { aiRisk: 0.6, humanMultiplier: 0.7, mitigations: ["Emphasize hands-on experience", "Include real gameplay footage", "Personal opinion framing"] },
  first_impressions: { aiRisk: 0.3, humanMultiplier: 0.9, mitigations: ["Capture genuine reactions", "Real-time discovery moments", "Authentic first-time gameplay"] },
  challenge_run: { aiRisk: 0.1, humanMultiplier: 1.0, mitigations: ["Unique challenge concepts", "Live skill demonstration", "Community-suggested challenges"] },
  hidden_gems: { aiRisk: 0.4, humanMultiplier: 0.8, mitigations: ["Personal curation", "Deep gameplay demos", "Why-you-should-play narratives"] },
  comparison: { aiRisk: 0.8, humanMultiplier: 0.4, mitigations: ["Side-by-side real gameplay", "Personal preference insights", "Community poll integration"] },
  live_stream: { aiRisk: 0.05, humanMultiplier: 1.0, mitigations: ["Real-time interaction", "Unpredictable moments", "Community participation"] },
  guide_100_percent: { aiRisk: 0.5, humanMultiplier: 0.6, mitigations: ["Video demonstration superiority", "Efficient route optimization", "Personal tips from experience"] },
  lore_analysis: { aiRisk: 0.5, humanMultiplier: 0.7, mitigations: ["Unique theories", "In-game evidence gathering", "Community discussion"] },
  compilation: { aiRisk: 0.6, humanMultiplier: 0.5, mitigations: ["Curated with taste", "Original footage", "Thematic storytelling"] },
};

export function analyzeAIRiskAdjustedStrategy(
  contentMix: { contentType: string; currentPercentage: number; monthlyRevenue: number }[]
): AIRiskAdjustedStrategy {
  const adjustments: ContentRiskAdjustment[] = contentMix.map((item) => {
    const riskProfile = CONTENT_TYPE_RISKS[item.contentType] || { aiRisk: 0.5, humanMultiplier: 0.6, mitigations: ["Add unique human perspective"] };
    const adjustedValue = item.monthlyRevenue * (1 - riskProfile.aiRisk * 0.5) * riskProfile.humanMultiplier;
    const riskCategory: ContentRiskAdjustment["riskCategory"] =
      riskProfile.aiRisk >= 0.7 ? "critical" : riskProfile.aiRisk >= 0.5 ? "high" : riskProfile.aiRisk >= 0.3 ? "medium" : "low";

    return {
      contentType: item.contentType,
      baseValue: item.monthlyRevenue,
      aiDisplacementRisk: riskProfile.aiRisk,
      humanValueMultiplier: riskProfile.humanMultiplier,
      adjustedValue,
      riskCategory,
      mitigation: riskProfile.mitigations,
    };
  });

  const totalBase = adjustments.reduce((sum, a) => sum + a.baseValue, 0);
  const totalAdjusted = adjustments.reduce((sum, a) => sum + a.adjustedValue, 0);
  const portfolioRisk = totalBase > 0 ? 1 - (totalAdjusted / totalBase) : 0;

  const lowRiskTypes = Object.entries(CONTENT_TYPE_RISKS)
    .filter(([, v]) => v.aiRisk < 0.3)
    .map(([k]) => k);

  const recommendedMix = [
    ...lowRiskTypes.map((t) => ({ contentType: t, targetPercentage: 30 / lowRiskTypes.length })),
    ...contentMix
      .filter((c) => (CONTENT_TYPE_RISKS[c.contentType]?.aiRisk || 1) < 0.5)
      .map((c) => ({ contentType: c.contentType, targetPercentage: c.currentPercentage * 1.2 })),
  ];

  const recommendations: string[] = [];
  const criticalTypes = adjustments.filter((a) => a.riskCategory === "critical");
  if (criticalTypes.length > 0) {
    recommendations.push(`High AI displacement risk: ${criticalTypes.map((c) => c.contentType).join(", ")} — reduce dependency or add human value`);
  }
  if (portfolioRisk > 0.3) {
    recommendations.push("Portfolio risk is elevated — shift content mix toward human-value-high formats");
  }
  recommendations.push("Prioritize live streams and challenge runs — lowest AI displacement risk");

  return { adjustments, portfolioRisk, recommendedMix, recommendations, assessedAt: new Date() };
}
