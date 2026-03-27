import { emitDomainEvent } from "../kernel/index";

export interface DisplacementRiskFactor {
  category: string;
  factor: string;
  riskLevel: "low" | "medium" | "high" | "critical";
  score: number;
  description: string;
  mitigation: string;
}

export interface DisplacementRiskReport {
  overallRisk: "low" | "medium" | "high" | "critical";
  overallScore: number;
  factors: DisplacementRiskFactor[];
  humanValueMoat: number;
  recommendations: string[];
  assessedAt: Date;
}

const RISK_FACTORS: Omit<DisplacementRiskFactor, "score" | "riskLevel">[] = [
  { category: "content_creation", factor: "ai_generated_gameplay_commentary", description: "AI can generate gameplay commentary automatically", mitigation: "Emphasize unique perspective and no-commentary brand authenticity" },
  { category: "content_creation", factor: "ai_video_editing", description: "AI editing tools can automate video production", mitigation: "Develop distinctive editing style and pacing that AI cannot replicate" },
  { category: "content_creation", factor: "ai_thumbnail_generation", description: "AI can generate thumbnails at scale", mitigation: "Build recognizable brand visual language and human creative direction" },
  { category: "seo_optimization", factor: "ai_seo_saturation", description: "AI-optimized titles/descriptions flood the market", mitigation: "Focus on authentic audience connection over algorithmic optimization" },
  { category: "audience_engagement", factor: "ai_chat_moderation", description: "AI chatbots can handle community engagement", mitigation: "Maintain genuine human community interactions for key moments" },
  { category: "audience_engagement", factor: "ai_content_recommendations", description: "Platforms may favor AI-generated content recommendations", mitigation: "Build direct audience relationships through memberships and newsletters" },
  { category: "monetization", factor: "ai_sponsored_content", description: "Brands may prefer AI creators for cost efficiency", mitigation: "Demonstrate human trust premium in sponsor negotiations" },
  { category: "monetization", factor: "ai_merchandise_design", description: "AI can design and market merchandise", mitigation: "Offer creator-authenticated merchandise with provenance" },
  { category: "platform_risk", factor: "platform_ai_content_policy", description: "Platforms may demonetize or deprioritize AI content", mitigation: "Maintain clear AI disclosure and human creative direction" },
  { category: "competitive", factor: "ai_content_cloning", description: "AI can clone creator style and content patterns", mitigation: "Build brand identity and community that transcends content style" },
];

export function assessDisplacementRisk(
  channelMetrics: {
    humanContentRatio?: number;
    audienceRetention?: number;
    communityEngagement?: number;
    brandRecognition?: number;
    revenueStreams?: number;
    directAudienceReach?: number;
  }
): DisplacementRiskReport {
  const factors: DisplacementRiskFactor[] = RISK_FACTORS.map((rf) => {
    let score = 0.5;

    if (rf.category === "content_creation") {
      score = 1.0 - (channelMetrics.humanContentRatio ?? 0.7);
    } else if (rf.category === "audience_engagement") {
      score = 1.0 - (channelMetrics.communityEngagement ?? 0.5);
    } else if (rf.category === "monetization") {
      const diversification = Math.min(1, (channelMetrics.revenueStreams ?? 1) / 5);
      score = 1.0 - diversification;
    } else if (rf.category === "platform_risk") {
      score = 1.0 - (channelMetrics.directAudienceReach ?? 0.3);
    } else if (rf.category === "competitive") {
      score = 1.0 - (channelMetrics.brandRecognition ?? 0.5);
    }

    const riskLevel: DisplacementRiskFactor["riskLevel"] =
      score >= 0.75 ? "critical" : score >= 0.5 ? "high" : score >= 0.25 ? "medium" : "low";

    return { ...rf, score, riskLevel };
  });

  const overallScore = factors.reduce((sum, f) => sum + f.score, 0) / factors.length;
  const overallRisk: DisplacementRiskReport["overallRisk"] =
    overallScore >= 0.75 ? "critical" : overallScore >= 0.5 ? "high" : overallScore >= 0.25 ? "medium" : "low";

  const humanValueMoat = 1.0 - overallScore;

  const recommendations: string[] = [];
  const criticalFactors = factors.filter((f) => f.riskLevel === "critical" || f.riskLevel === "high");
  for (const cf of criticalFactors.slice(0, 3)) {
    recommendations.push(cf.mitigation);
  }
  if (humanValueMoat < 0.4) {
    recommendations.push("Urgently strengthen human value moat — build community, develop unique expertise, create irreplaceable creator identity");
  }

  return {
    overallRisk,
    overallScore,
    factors,
    humanValueMoat,
    recommendations,
    assessedAt: new Date(),
  };
}

export async function assessAndEmit(
  userId: string,
  channelMetrics: Parameters<typeof assessDisplacementRisk>[0]
): Promise<DisplacementRiskReport> {
  const report = assessDisplacementRisk(channelMetrics);

  if (report.overallRisk === "high" || report.overallRisk === "critical") {
    try {
      await emitDomainEvent(userId, "ai_displacement.risk_elevated", {
        overallRisk: report.overallRisk,
        overallScore: report.overallScore,
        humanValueMoat: report.humanValueMoat,
        criticalFactors: report.factors.filter((f) => f.riskLevel === "critical").length,
      }, "ai-displacement-risk", "channel");
    } catch (_) {}
  }

  return report;
}
