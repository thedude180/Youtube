import { createLogger } from "../lib/logger";

const logger = createLogger("platform-health-scorer");

export interface PlatformHealthScore {
  platform: string;
  score: number;
  status: "healthy" | "degraded" | "failing" | "critical";
  tokenHealth: "healthy" | "expiring_soon" | "failed_refresh" | "invalid" | "unknown";
  rateLimitHeadroom: number;
  errorRate24h: number;
  webhookHealth: "active" | "inactive" | "unknown";
  issues: string[];
  recommendations: string[];
}

export interface FabricHealthReport {
  overallScore: number;
  status: "all_systems_go" | "degraded" | "partial_outage" | "critical";
  platforms: PlatformHealthScore[];
  criticalPlatforms: string[];
  actionItems: { priority: number; platform: string; action: string }[];
  reportedAt: Date;
}

const PLATFORM_RATE_LIMIT_PROFILES: Record<string, { dailyQuota?: number; perMinuteLimit?: number; perSecondLimit?: number }> = {
  youtube: { dailyQuota: 10000, perSecondLimit: 10 },
  tiktok: { dailyQuota: 1000, perMinuteLimit: 60 },
  instagram: { perMinuteLimit: 200 },
  twitch: { perMinuteLimit: 800 },
  kick: { perSecondLimit: 20 },
  discord: { perSecondLimit: 50 },
  gmail: { perSecondLimit: 250 },
  stripe: { perSecondLimit: 100 },
  reddit: { perMinuteLimit: 60 },
  rumble: { perMinuteLimit: 30 },
};

const TOKEN_EXPIRY_HOURS: Record<string, number> = {
  youtube: 1,
  tiktok: 2,
  instagram: 24 * 60,
  twitch: 4,
  kick: 4,
  reddit: 1,
  discord: 99999,
  gmail: 1,
  stripe: 99999,
  rumble: 24,
};

const recentErrors: Record<string, { count: number; lastError: Date }> = {};
const tokenTimestamps: Record<string, Date> = {};

export function recordPlatformError(platform: string) {
  if (!recentErrors[platform]) recentErrors[platform] = { count: 0, lastError: new Date() };
  recentErrors[platform].count++;
  recentErrors[platform].lastError = new Date();
}

export function recordTokenRefresh(platform: string) {
  tokenTimestamps[platform] = new Date();
}

function getErrorRate24h(platform: string): number {
  const entry = recentErrors[platform];
  if (!entry) return 0;
  const hoursAgo24 = Date.now() - 24 * 60 * 60 * 1000;
  if (entry.lastError.getTime() < hoursAgo24) return 0;
  return Math.min(entry.count / 100, 1);
}

function getTokenHealth(platform: string, tokenExpiresAt?: Date): PlatformHealthScore["tokenHealth"] {
  if (!tokenExpiresAt) return "unknown";
  const now = Date.now();
  const expiresIn = tokenExpiresAt.getTime() - now;
  if (expiresIn < 0) return "invalid";
  if (expiresIn < 60 * 60 * 1000) return "expiring_soon";
  return "healthy";
}

export function scorePlatform(platform: string, options?: {
  tokenExpiresAt?: Date;
  hasRefreshToken?: boolean;
  recentErrorCount?: number;
  webhookActive?: boolean;
  quotaUsedToday?: number;
}): PlatformHealthScore {
  const issues: string[] = [];
  const recommendations: string[] = [];
  let score = 100;

  const errorRate = options?.recentErrorCount !== undefined
    ? Math.min(options.recentErrorCount / 50, 1)
    : getErrorRate24h(platform);

  if (errorRate > 0.5) { issues.push("High error rate in last 24h"); score -= 40; }
  else if (errorRate > 0.2) { issues.push("Elevated error rate"); score -= 20; }

  const tokenHealth = getTokenHealth(platform, options?.tokenExpiresAt);
  if (tokenHealth === "invalid") { issues.push("Token invalid or expired"); score -= 50; recommendations.push("Reconnect " + platform + " account"); }
  else if (tokenHealth === "expiring_soon") { issues.push("Token expiring within 1 hour"); score -= 20; recommendations.push("Refresh " + platform + " token"); }
  else if (tokenHealth === "unknown" && platform !== "discord" && platform !== "stripe") { issues.push("Token expiry unknown"); score -= 5; }

  if (!options?.hasRefreshToken && platform !== "discord" && platform !== "stripe") {
    issues.push("No refresh token stored"); score -= 15; recommendations.push("Re-authenticate " + platform + " to obtain refresh token");
  }

  const webhookPlatforms = ["youtube", "twitch", "stripe", "discord"];
  if (webhookPlatforms.includes(platform)) {
    if (options?.webhookActive === false) { issues.push("Webhook inactive or failing"); score -= 25; recommendations.push("Re-register " + platform + " webhook endpoint"); }
    else if (options?.webhookActive === undefined) { issues.push("Webhook status unknown"); score -= 5; }
  }

  const rateLimitProfile = PLATFORM_RATE_LIMIT_PROFILES[platform];
  let rateLimitHeadroom = 1;
  if (rateLimitProfile?.dailyQuota && options?.quotaUsedToday !== undefined) {
    rateLimitHeadroom = 1 - (options.quotaUsedToday / rateLimitProfile.dailyQuota);
    if (rateLimitHeadroom < 0.1) { issues.push("Quota near exhaustion"); score -= 30; recommendations.push("Defer non-critical " + platform + " operations"); }
    else if (rateLimitHeadroom < 0.3) { issues.push("Quota headroom low"); score -= 10; }
  }

  score = Math.max(0, Math.min(100, score));
  const status: PlatformHealthScore["status"] =
    score >= 80 ? "healthy" :
    score >= 60 ? "degraded" :
    score >= 30 ? "failing" : "critical";

  if (recommendations.length === 0 && status === "healthy") {
    recommendations.push("No action needed — platform healthy");
  }

  return {
    platform,
    score,
    status,
    tokenHealth,
    rateLimitHeadroom,
    errorRate24h: errorRate,
    webhookHealth: options?.webhookActive === true ? "active" : options?.webhookActive === false ? "inactive" : "unknown",
    issues,
    recommendations,
  };
}

export function generateFabricHealthReport(platformScores: PlatformHealthScore[]): FabricHealthReport {
  const overallScore = platformScores.length > 0
    ? Math.round(platformScores.reduce((s, p) => s + p.score, 0) / platformScores.length)
    : 100;

  const criticalPlatforms = platformScores.filter(p => p.status === "critical" || p.status === "failing").map(p => p.platform);

  const status: FabricHealthReport["status"] =
    criticalPlatforms.length === 0 && overallScore >= 80 ? "all_systems_go" :
    criticalPlatforms.length === 0 ? "degraded" :
    criticalPlatforms.includes("youtube") || criticalPlatforms.includes("stripe") ? "critical" : "partial_outage";

  const actionItems: FabricHealthReport["actionItems"] = [];
  platformScores.forEach(p => {
    p.recommendations.forEach((rec, i) => {
      if (rec !== "No action needed — platform healthy") {
        actionItems.push({ priority: p.score < 30 ? 1 : p.score < 60 ? 2 : 3, platform: p.platform, action: rec });
      }
    });
  });
  actionItems.sort((a, b) => a.priority - b.priority);

  return { overallScore, status, platforms: platformScores, criticalPlatforms, actionItems, reportedAt: new Date() };
}

const CORE_PLATFORMS = ["youtube", "tiktok", "twitch", "kick", "discord", "stripe", "gmail"];

export function getQuickFabricHealth(): FabricHealthReport {
  const scores = CORE_PLATFORMS.map(p => scorePlatform(p));
  return generateFabricHealthReport(scores);
}
