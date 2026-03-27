import { emitDomainEvent } from "../kernel/index";

export interface AuthenticitySignal {
  source: string;
  signalType: "originality" | "transparency" | "consistency" | "engagement_quality" | "community_trust";
  rawScore: number;
  amplifiedScore: number;
  amplificationFactor: number;
  timestamp: Date;
}

export interface AmplificationResult {
  signals: AuthenticitySignal[];
  compositeScore: number;
  amplifiedComposite: number;
  recommendations: string[];
}

const AMPLIFICATION_WEIGHTS: Record<string, number> = {
  originality: 1.4,
  transparency: 1.3,
  consistency: 1.2,
  engagement_quality: 1.1,
  community_trust: 1.5,
};

export function amplifyAuthenticitySignals(
  contentId: string,
  rawSignals: { type: AuthenticitySignal["signalType"]; score: number; source: string }[]
): AmplificationResult {
  const signals: AuthenticitySignal[] = rawSignals.map((s) => {
    const factor = AMPLIFICATION_WEIGHTS[s.type] || 1.0;
    return {
      source: s.source,
      signalType: s.type,
      rawScore: s.score,
      amplifiedScore: Math.min(1.0, s.score * factor),
      amplificationFactor: factor,
      timestamp: new Date(),
    };
  });

  const compositeScore = rawSignals.length > 0
    ? rawSignals.reduce((sum, s) => sum + s.score, 0) / rawSignals.length
    : 0;

  const amplifiedComposite = signals.length > 0
    ? signals.reduce((sum, s) => sum + s.amplifiedScore, 0) / signals.length
    : 0;

  const recommendations: string[] = [];
  if (compositeScore < 0.5) {
    recommendations.push("Authenticity is low — consider adding more original commentary or behind-the-scenes context");
  }
  const lowSignals = signals.filter((s) => s.rawScore < 0.3);
  for (const low of lowSignals) {
    recommendations.push(`Improve ${low.signalType} (score: ${low.rawScore.toFixed(2)}) from ${low.source}`);
  }

  return { signals, compositeScore, amplifiedComposite, recommendations };
}

export async function amplifyAndEmit(
  userId: string,
  contentId: string,
  rawSignals: { type: AuthenticitySignal["signalType"]; score: number; source: string }[]
): Promise<AmplificationResult> {
  const result = amplifyAuthenticitySignals(contentId, rawSignals);

  if (result.amplifiedComposite > 0.7) {
    try {
      await emitDomainEvent(userId, "authenticity.high_signal_detected", {
        contentId,
        compositeScore: result.compositeScore,
        amplifiedComposite: result.amplifiedComposite,
        signalCount: result.signals.length,
      }, "authenticity-signal-amplifier", contentId);
    } catch (_) {}
  }

  return result;
}

export interface LiveAuthenticityAssessment {
  streamId: string;
  realTimeScore: number;
  gameplayAuthenticity: number;
  interactionAuthenticity: number;
  technicalAuthenticity: number;
  alerts: string[];
  enhancementSuggestions: string[];
  assessedAt: Date;
}

export function assessLiveAuthenticity(
  streamId: string,
  liveMetrics: {
    isOriginalGameplay: boolean;
    hasUniqueCommentary: boolean;
    chatInteractionRate: number;
    viewerRetentionRate: number;
    isRebroadcast: boolean;
    hasWatermark: boolean;
    webcamActive: boolean;
    micActive: boolean;
    customOverlays: boolean;
    viewBotSuspicion: number;
  }
): LiveAuthenticityAssessment {
  let gameplayAuthenticity = 0;
  if (liveMetrics.isOriginalGameplay) gameplayAuthenticity += 0.4;
  if (!liveMetrics.isRebroadcast) gameplayAuthenticity += 0.3;
  if (liveMetrics.hasWatermark) gameplayAuthenticity += 0.1;
  if (liveMetrics.customOverlays) gameplayAuthenticity += 0.2;

  let interactionAuthenticity = 0;
  interactionAuthenticity += Math.min(0.4, liveMetrics.chatInteractionRate * 0.4);
  interactionAuthenticity += Math.min(0.3, liveMetrics.viewerRetentionRate * 0.3);
  interactionAuthenticity += (1 - liveMetrics.viewBotSuspicion) * 0.3;

  let technicalAuthenticity = 0.3;
  if (liveMetrics.micActive) technicalAuthenticity += 0.2;
  if (liveMetrics.webcamActive) technicalAuthenticity += 0.2;
  if (liveMetrics.customOverlays) technicalAuthenticity += 0.15;
  if (liveMetrics.hasUniqueCommentary) technicalAuthenticity += 0.15;
  technicalAuthenticity = Math.min(1, technicalAuthenticity);

  const realTimeScore = gameplayAuthenticity * 0.4 + interactionAuthenticity * 0.35 + technicalAuthenticity * 0.25;

  const alerts: string[] = [];
  if (liveMetrics.isRebroadcast) alerts.push("Rebroadcast detected — may violate platform policies");
  if (liveMetrics.viewBotSuspicion > 0.5) alerts.push("Possible view bot activity detected");
  if (liveMetrics.chatInteractionRate < 0.1) alerts.push("Very low chat interaction — may appear inauthentic");

  const enhancementSuggestions: string[] = [];
  if (!liveMetrics.customOverlays) enhancementSuggestions.push("Add branded overlays for stream identity");
  if (liveMetrics.chatInteractionRate < 0.3) enhancementSuggestions.push("Increase chat engagement — respond to more viewer messages");
  if (!liveMetrics.hasWatermark) enhancementSuggestions.push("Add subtle watermark to prevent content theft");
  if (realTimeScore > 0.8) enhancementSuggestions.push("Authenticity is excellent — highlight this in channel branding");

  return {
    streamId, realTimeScore, gameplayAuthenticity,
    interactionAuthenticity, technicalAuthenticity,
    alerts, enhancementSuggestions, assessedAt: new Date(),
  };
}
