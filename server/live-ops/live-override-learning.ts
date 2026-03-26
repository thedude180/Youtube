const liveOverrides: {
  userId: string;
  streamId: string;
  actionType: string;
  originalValue: any;
  overrideValue: any;
  reason: string;
  timestamp: Date;
}[] = [];

export function recordLiveOverride(
  userId: string,
  streamId: string,
  actionType: string,
  originalValue: any,
  overrideValue: any,
  reason: string,
): void {
  liveOverrides.push({
    userId,
    streamId,
    actionType,
    originalValue,
    overrideValue,
    reason,
    timestamp: new Date(),
  });

  import("../services/learning-governance").then(({ recordOverrideLearning }) => {
    recordOverrideLearning(userId, actionType, { original: originalValue }, { override: overrideValue }, reason).catch(() => {});
  }).catch(() => {});
}

export function getLiveOverridePatterns(userId: string): {
  patterns: { actionType: string; count: number; commonReason: string }[];
  totalOverrides: number;
  suggestions: string[];
} {
  const userOverrides = liveOverrides.filter(o => o.userId === userId);

  const byType = new Map<string, { count: number; reasons: string[] }>();
  for (const o of userOverrides) {
    if (!byType.has(o.actionType)) byType.set(o.actionType, { count: 0, reasons: [] });
    const entry = byType.get(o.actionType)!;
    entry.count++;
    entry.reasons.push(o.reason);
  }

  const patterns = Array.from(byType.entries()).map(([actionType, data]) => {
    const reasonCounts = new Map<string, number>();
    for (const r of data.reasons) {
      reasonCounts.set(r, (reasonCounts.get(r) || 0) + 1);
    }
    const commonReason = Array.from(reasonCounts.entries()).sort(([, a], [, b]) => b - a)[0]?.[0] || "unknown";

    return { actionType, count: data.count, commonReason };
  }).sort((a, b) => b.count - a.count);

  const suggestions: string[] = [];
  for (const p of patterns) {
    if (p.count >= 3) {
      suggestions.push(`Consider adjusting default ${p.actionType} behavior — overridden ${p.count} times (common reason: ${p.commonReason})`);
    }
  }

  return { patterns, totalOverrides: userOverrides.length, suggestions };
}
