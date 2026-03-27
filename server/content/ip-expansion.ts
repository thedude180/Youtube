import { emitDomainEvent } from "../kernel/index";

export type AdaptationType =
  | "short_form" | "long_form" | "compilation" | "highlights"
  | "tutorial" | "reaction" | "commentary" | "podcast_clip"
  | "merchandise" | "licensing" | "localized" | "accessibility";

export interface IPExpansionTag {
  contentId: string;
  adaptationType: AdaptationType;
  sourceFormat: string;
  targetFormat: string;
  estimatedEffort: "low" | "medium" | "high";
  revenueOpportunity: "low" | "medium" | "high";
  status: "identified" | "in_progress" | "completed" | "declined";
  metadata: Record<string, any>;
}

export interface IPExpansionAnalysis {
  contentId: string;
  adaptations: IPExpansionTag[];
  totalOpportunities: number;
  highValueCount: number;
  recommendations: string[];
}

const ADAPTATION_RULES: { type: AdaptationType; sourceFormats: string[]; effort: IPExpansionTag["estimatedEffort"]; revenue: IPExpansionTag["revenueOpportunity"]; targetFormat: string }[] = [
  { type: "short_form", sourceFormats: ["long_video", "vod"], effort: "low", revenue: "medium", targetFormat: "youtube_short" },
  { type: "highlights", sourceFormats: ["long_video", "vod", "stream_vod"], effort: "low", revenue: "medium", targetFormat: "highlight_reel" },
  { type: "compilation", sourceFormats: ["long_video", "vod"], effort: "medium", revenue: "high", targetFormat: "compilation_video" },
  { type: "tutorial", sourceFormats: ["long_video", "vod"], effort: "medium", revenue: "medium", targetFormat: "tutorial_video" },
  { type: "podcast_clip", sourceFormats: ["long_video", "vod", "stream_vod"], effort: "low", revenue: "low", targetFormat: "audio_clip" },
  { type: "localized", sourceFormats: ["long_video", "short_video", "vod"], effort: "high", revenue: "high", targetFormat: "localized_video" },
  { type: "merchandise", sourceFormats: ["long_video", "short_video"], effort: "high", revenue: "high", targetFormat: "merch_design" },
  { type: "licensing", sourceFormats: ["long_video", "vod"], effort: "low", revenue: "high", targetFormat: "licensed_clip" },
  { type: "accessibility", sourceFormats: ["long_video", "short_video", "vod", "stream_vod"], effort: "medium", revenue: "low", targetFormat: "accessible_version" },
];

export function analyzeIPExpansion(
  contentId: string,
  sourceFormat: string,
  existingAdaptations: AdaptationType[] = []
): IPExpansionAnalysis {
  const adaptations: IPExpansionTag[] = [];

  for (const rule of ADAPTATION_RULES) {
    if (!rule.sourceFormats.includes(sourceFormat)) continue;
    if (existingAdaptations.includes(rule.type)) continue;

    adaptations.push({
      contentId,
      adaptationType: rule.type,
      sourceFormat,
      targetFormat: rule.targetFormat,
      estimatedEffort: rule.effort,
      revenueOpportunity: rule.revenue,
      status: "identified",
      metadata: {},
    });
  }

  const highValueCount = adaptations.filter((a) => a.revenueOpportunity === "high").length;

  const recommendations: string[] = [];
  if (highValueCount > 0) {
    recommendations.push(`${highValueCount} high-revenue adaptation${highValueCount > 1 ? "s" : ""} available for this content`);
  }
  const lowEffort = adaptations.filter((a) => a.estimatedEffort === "low");
  if (lowEffort.length > 0) {
    recommendations.push(`Quick wins: ${lowEffort.map((a) => a.adaptationType).join(", ")}`);
  }

  return {
    contentId,
    adaptations,
    totalOpportunities: adaptations.length,
    highValueCount,
    recommendations,
  };
}

export async function analyzeAndEmit(
  userId: string,
  contentId: string,
  sourceFormat: string,
  existingAdaptations: AdaptationType[] = []
): Promise<IPExpansionAnalysis> {
  const analysis = analyzeIPExpansion(contentId, sourceFormat, existingAdaptations);

  if (analysis.highValueCount > 0) {
    try {
      await emitDomainEvent(userId, "ip_expansion.opportunities_detected", {
        contentId,
        totalOpportunities: analysis.totalOpportunities,
        highValueCount: analysis.highValueCount,
      }, "ip-expansion", contentId);
    } catch (_) {}
  }

  return analysis;
}
