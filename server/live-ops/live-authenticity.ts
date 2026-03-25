export function checkLiveAuthenticity(
  streamData: {
    title: string;
    viewerCount: number;
    chatActivityRate: number;
    isPreRecordedContent: boolean;
  },
): { authentic: boolean; score: number; flags: string[] } {
  const flags: string[] = [];
  let score = 1.0;

  if (streamData.isPreRecordedContent) {
    flags.push("Content appears pre-recorded, not live gameplay");
    score -= 0.4;
  }

  const clickbait = /\b(INSANE|IMPOSSIBLE|UNBELIEVABLE|YOU WON'T BELIEVE)\b/i;
  if (clickbait.test(streamData.title)) {
    flags.push("Title uses inauthentic clickbait language");
    score -= 0.2;
  }

  if (streamData.viewerCount > 100 && streamData.chatActivityRate < 0.01) {
    flags.push("Suspicious: high viewer count but extremely low chat activity");
    score -= 0.3;
  }

  score = Math.max(0, score);
  return { authentic: flags.length === 0, score, flags };
}

export function amplifyAuthenticitySignal(
  streamMetrics: {
    avgSessionDuration: number;
    chatInteractionRate: number;
    organicViewerGrowth: boolean;
    consistentSchedule: boolean;
  },
): { signal: number; factors: string[] } {
  let signal = 0.5;
  const factors: string[] = [];

  if (streamMetrics.avgSessionDuration > 60) {
    signal += 0.15;
    factors.push("Long average session duration indicates engaged audience");
  }

  if (streamMetrics.chatInteractionRate > 0.05) {
    signal += 0.15;
    factors.push("High chat interaction rate shows genuine community");
  }

  if (streamMetrics.organicViewerGrowth) {
    signal += 0.1;
    factors.push("Organic viewer growth pattern detected");
  }

  if (streamMetrics.consistentSchedule) {
    signal += 0.1;
    factors.push("Consistent streaming schedule builds trust");
  }

  return { signal: Math.min(1, signal), factors };
}
