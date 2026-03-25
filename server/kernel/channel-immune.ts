export type ThreatType = "copyright_strike" | "community_strike" | "spam_attack" | "bot_subscribers" | "negative_seo" | "content_theft" | "impersonation";

export interface ThreatDetection {
  threatType: ThreatType;
  severity: "low" | "medium" | "high" | "critical";
  description: string;
  recommended: string;
  autoMitigate: boolean;
}

export interface ImmuneStatus {
  overallHealth: number;
  activeThreats: ThreatDetection[];
  lastScan: Date;
  immunityScore: number;
}

const threatHistoryByUser = new Map<string, ThreatDetection[]>();

function getUserThreats(userId: string): ThreatDetection[] {
  if (!threatHistoryByUser.has(userId)) {
    threatHistoryByUser.set(userId, []);
  }
  return threatHistoryByUser.get(userId)!;
}

export function detectThreat(indicators: {
  suddenSubscriberDrop?: number;
  copyrightClaims?: number;
  communityStrikes?: number;
  spamCommentRate?: number;
  duplicateContentReports?: number;
}, userId = "system"): ThreatDetection[] {
  const threats: ThreatDetection[] = [];

  if (indicators.copyrightClaims && indicators.copyrightClaims > 0) {
    threats.push({
      threatType: "copyright_strike",
      severity: indicators.copyrightClaims >= 2 ? "critical" : "high",
      description: `${indicators.copyrightClaims} copyright claim(s) detected`,
      recommended: "Review flagged content immediately and file counter-notification if valid fair use",
      autoMitigate: false,
    });
  }

  if (indicators.communityStrikes && indicators.communityStrikes > 0) {
    threats.push({
      threatType: "community_strike",
      severity: indicators.communityStrikes >= 2 ? "critical" : "high",
      description: `${indicators.communityStrikes} community guideline strike(s)`,
      recommended: "Review and appeal if warranted within 30-day window",
      autoMitigate: false,
    });
  }

  if (indicators.spamCommentRate && indicators.spamCommentRate > 0.3) {
    threats.push({
      threatType: "spam_attack",
      severity: indicators.spamCommentRate > 0.6 ? "high" : "medium",
      description: `Spam comment rate at ${(indicators.spamCommentRate * 100).toFixed(0)}%`,
      recommended: "Enable stricter comment moderation and report spam accounts",
      autoMitigate: true,
    });
  }

  if (indicators.suddenSubscriberDrop && indicators.suddenSubscriberDrop > 1000) {
    threats.push({
      threatType: "bot_subscribers",
      severity: "medium",
      description: `Sudden subscriber drop of ${indicators.suddenSubscriberDrop}`,
      recommended: "YouTube may be purging bot accounts — this is normal and healthy",
      autoMitigate: false,
    });
  }

  const userThreats = getUserThreats(userId);
  userThreats.push(...threats);
  return threats;
}

export function getImmuneStatus(userId = "system"): ImmuneStatus {
  const userThreats = getUserThreats(userId);
  const recentThreats = userThreats.slice(-10);
  const criticalCount = recentThreats.filter(t => t.severity === "critical").length;
  const highCount = recentThreats.filter(t => t.severity === "high").length;

  const immunityScore = Math.max(0, 1 - (criticalCount * 0.3 + highCount * 0.15));

  return {
    overallHealth: immunityScore,
    activeThreats: recentThreats,
    lastScan: new Date(),
    immunityScore,
  };
}
