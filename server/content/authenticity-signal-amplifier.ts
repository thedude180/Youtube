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
