import { appendEvent } from "../kernel/creator-intelligence-graph";

export interface TrustSignal {
  source: "comment" | "like_ratio" | "share" | "subscription" | "report" | "survey" | "watch_time" | "return_visit";
  weight: number;
  value: number;
  timestamp: Date;
}

export interface TrustLoopState {
  contentId: string;
  signals: TrustSignal[];
  trustScore: number;
  trustTrend: "rising" | "stable" | "declining";
  feedbackActions: string[];
  loopCycleCount: number;
  lastCycleAt: Date;
}

export interface CommunityTrustReport {
  overallTrustScore: number;
  contentScores: { contentId: string; score: number; trend: string }[];
  actionsTaken: string[];
  alertsTriggered: string[];
  recommendations: string[];
  reportedAt: Date;
}

const SIGNAL_WEIGHTS: Record<string, number> = {
  comment: 0.15,
  like_ratio: 0.2,
  share: 0.15,
  subscription: 0.2,
  report: -0.3,
  survey: 0.25,
  watch_time: 0.15,
  return_visit: 0.2,
};

const trustStates = new Map<string, TrustLoopState>();

export function ingestTrustSignal(contentId: string, source: TrustSignal["source"], value: number): TrustLoopState {
  let state = trustStates.get(contentId);
  if (!state) {
    state = {
      contentId,
      signals: [],
      trustScore: 0.5,
      trustTrend: "stable",
      feedbackActions: [],
      loopCycleCount: 0,
      lastCycleAt: new Date(),
    };
    trustStates.set(contentId, state);
  }

  const weight = SIGNAL_WEIGHTS[source] ?? 0.1;
  const signal: TrustSignal = { source, weight, value, timestamp: new Date() };
  state.signals.push(signal);

  if (state.signals.length > 100) state.signals = state.signals.slice(-100);

  recalculateTrust(state);
  return state;
}

function recalculateTrust(state: TrustLoopState): void {
  if (state.signals.length === 0) return;

  const recentSignals = state.signals.slice(-50);
  let weightedSum = 0;
  let totalWeight = 0;

  for (const s of recentSignals) {
    const ageMs = Date.now() - s.timestamp.getTime();
    const decayFactor = Math.max(0.1, 1 - ageMs / (30 * 24 * 60 * 60 * 1000));
    const effectiveWeight = Math.abs(s.weight) * decayFactor;
    weightedSum += s.value * s.weight * decayFactor;
    totalWeight += effectiveWeight;
  }

  const newScore = totalWeight > 0 ? Math.max(0, Math.min(1, 0.5 + weightedSum / totalWeight * 0.5)) : 0.5;
  const previousScore = state.trustScore;
  state.trustScore = newScore;

  const delta = newScore - previousScore;
  if (delta > 0.05) state.trustTrend = "rising";
  else if (delta < -0.05) state.trustTrend = "declining";
  else state.trustTrend = "stable";

  state.feedbackActions = [];
  if (state.trustTrend === "declining") {
    state.feedbackActions.push("Increase community engagement responses");
    state.feedbackActions.push("Review recent content for audience alignment");
    if (state.trustScore < 0.3) {
      state.feedbackActions.push("ALERT: Trust critically low — consider direct audience communication");
    }
  } else if (state.trustTrend === "rising" && state.trustScore > 0.7) {
    state.feedbackActions.push("Trust is strong — consider launching community-driven content");
  }

  state.loopCycleCount++;
  state.lastCycleAt = new Date();
}

export function runTrustLoop(contentId: string): TrustLoopState | undefined {
  const state = trustStates.get(contentId);
  if (state) recalculateTrust(state);
  return state;
}

export function generateCommunityTrustReport(): CommunityTrustReport {
  const contentScores: CommunityTrustReport["contentScores"] = [];
  const alertsTriggered: string[] = [];
  const recommendations: string[] = [];
  const actionsTaken: string[] = [];
  let totalScore = 0;
  let count = 0;

  for (const [contentId, state] of trustStates) {
    contentScores.push({ contentId, score: state.trustScore, trend: state.trustTrend });
    totalScore += state.trustScore;
    count++;

    if (state.trustTrend === "declining") {
      alertsTriggered.push(`Trust declining for ${contentId} (score: ${state.trustScore.toFixed(2)})`);
    }
    if (state.trustScore < 0.3) {
      alertsTriggered.push(`CRITICAL: Trust below 0.3 for ${contentId}`);
    }

    actionsTaken.push(...state.feedbackActions);
  }

  const overallTrustScore = count > 0 ? totalScore / count : 0.5;

  if (overallTrustScore < 0.4) recommendations.push("Overall community trust is low — prioritize engagement");
  if (alertsTriggered.length > 3) recommendations.push("Multiple trust alerts — conduct community health review");
  if (overallTrustScore > 0.7) recommendations.push("Strong community trust — leverage for growth initiatives");

  appendEvent("community.trust_report_generated", "audience", "global", {
    overallTrustScore,
    contentCount: count,
    alertCount: alertsTriggered.length,
  }, "community-trust-loop");

  return {
    overallTrustScore,
    contentScores: contentScores.sort((a, b) => a.score - b.score),
    actionsTaken,
    alertsTriggered,
    recommendations,
    reportedAt: new Date(),
  };
}

export function getTrustState(contentId: string): TrustLoopState | undefined {
  return trustStates.get(contentId);
}
