export function getOptimalMonetizationWindow(
  streamDurationMinutes: number,
  viewerCount: number,
  peakViewerCount: number,
): { window: string; confidence: number; reason: string } {
  if (viewerCount >= peakViewerCount * 0.9 && viewerCount >= 50) {
    return {
      window: "now",
      confidence: 0.9,
      reason: "Currently near peak viewership — optimal moment for monetization action",
    };
  }

  if (streamDurationMinutes >= 30 && streamDurationMinutes <= 60 && viewerCount >= 25) {
    return {
      window: "within_15min",
      confidence: 0.7,
      reason: "Mid-stream engagement window — audience is warmed up",
    };
  }

  if (streamDurationMinutes < 15) {
    return {
      window: "wait",
      confidence: 0.8,
      reason: "Too early — let audience settle before monetization actions",
    };
  }

  if (viewerCount < peakViewerCount * 0.5) {
    return {
      window: "wait_for_recovery",
      confidence: 0.6,
      reason: "Viewer count is declining — wait for recovery before monetization",
    };
  }

  return {
    window: "standard",
    confidence: 0.5,
    reason: "Standard timing — no strong signal for immediate action",
  };
}

export function scoreMonetizationTiming(
  action: string,
  streamDurationMinutes: number,
  viewerCount: number,
): { score: number; recommendation: string } {
  let score = 0.5;

  if (action === "membership_drive") {
    if (viewerCount >= 100) score += 0.3;
    if (streamDurationMinutes >= 30) score += 0.1;
    if (streamDurationMinutes > 120) score -= 0.2;
  }

  if (action === "superchat_thank") {
    score = 0.8;
  }

  if (action === "merch_mention") {
    if (viewerCount >= 200) score += 0.3;
    if (streamDurationMinutes >= 45) score += 0.1;
    if (streamDurationMinutes < 20) score -= 0.3;
  }

  score = Math.max(0, Math.min(1, score));
  const recommendation = score >= 0.7 ? "go" : score >= 0.4 ? "wait" : "skip";

  return { score, recommendation };
}
