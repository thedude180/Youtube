import { appendEvent } from "../kernel/creator-intelligence-graph";

export interface ReconnectAttempt {
  platform: string;
  attemptedAt: Date;
  success: boolean;
  method: "auto_refresh" | "proactive_refresh" | "user_initiated" | "fallback_credential";
  latencyMs: number;
  errorCode?: string;
}

export interface ReconnectPolicy {
  platform: string;
  maxAutoAttempts: number;
  backoffBaseMs: number;
  backoffMultiplier: number;
  maxBackoffMs: number;
  cooldownAfterFailMs: number;
  preferredWindow: { startHour: number; endHour: number } | null;
}

export interface ReconnectIntelligence {
  platform: string;
  recentAttempts: ReconnectAttempt[];
  successRate: number;
  avgLatencyMs: number;
  currentBackoffMs: number;
  nextAttemptAt: Date | null;
  isInCooldown: boolean;
  recommendation: string;
}

const attemptHistory = new Map<string, ReconnectAttempt[]>();
const cooldowns = new Map<string, Date>();

const DEFAULT_POLICIES: Record<string, ReconnectPolicy> = {
  youtube: { platform: "youtube", maxAutoAttempts: 5, backoffBaseMs: 5000, backoffMultiplier: 2, maxBackoffMs: 3600000, cooldownAfterFailMs: 7200000, preferredWindow: { startHour: 2, endHour: 6 } },
  twitch: { platform: "twitch", maxAutoAttempts: 3, backoffBaseMs: 10000, backoffMultiplier: 2.5, maxBackoffMs: 1800000, cooldownAfterFailMs: 3600000, preferredWindow: null },
  tiktok: { platform: "tiktok", maxAutoAttempts: 3, backoffBaseMs: 15000, backoffMultiplier: 2, maxBackoffMs: 3600000, cooldownAfterFailMs: 7200000, preferredWindow: null },
  kick: { platform: "kick", maxAutoAttempts: 3, backoffBaseMs: 10000, backoffMultiplier: 2, maxBackoffMs: 1800000, cooldownAfterFailMs: 3600000, preferredWindow: null },
  discord: { platform: "discord", maxAutoAttempts: 4, backoffBaseMs: 5000, backoffMultiplier: 1.5, maxBackoffMs: 1200000, cooldownAfterFailMs: 1800000, preferredWindow: null },
};

export function shouldAttemptReconnect(platform: string): { allowed: boolean; reason: string; nextAttemptAt?: Date } {
  const policy = DEFAULT_POLICIES[platform] || DEFAULT_POLICIES.youtube;
  const history = attemptHistory.get(platform) || [];
  const cooldownUntil = cooldowns.get(platform);

  if (cooldownUntil && cooldownUntil > new Date()) {
    return { allowed: false, reason: `Platform in cooldown until ${cooldownUntil.toISOString()}`, nextAttemptAt: cooldownUntil };
  }

  const recentFailures = history.filter(a => !a.success && Date.now() - a.attemptedAt.getTime() < 3600000);
  if (recentFailures.length >= policy.maxAutoAttempts) {
    const cooldownEnd = new Date(Date.now() + policy.cooldownAfterFailMs);
    cooldowns.set(platform, cooldownEnd);
    return { allowed: false, reason: `Max auto attempts (${policy.maxAutoAttempts}) reached in last hour`, nextAttemptAt: cooldownEnd };
  }

  if (policy.preferredWindow) {
    const hour = new Date().getUTCHours();
    if (hour < policy.preferredWindow.startHour || hour > policy.preferredWindow.endHour) {
      const isUrgent = recentFailures.length === 0 && history.filter(a => a.success).length === 0;
      if (!isUrgent) {
        return { allowed: false, reason: `Outside preferred reconnect window (${policy.preferredWindow.startHour}:00-${policy.preferredWindow.endHour}:00 UTC)` };
      }
    }
  }

  return { allowed: true, reason: "Reconnect attempt allowed" };
}

export function recordAttempt(platform: string, success: boolean, method: ReconnectAttempt["method"], latencyMs: number, errorCode?: string): ReconnectAttempt {
  const attempt: ReconnectAttempt = { platform, attemptedAt: new Date(), success, method, latencyMs, errorCode };

  const history = attemptHistory.get(platform) || [];
  history.push(attempt);
  if (history.length > 50) history.splice(0, history.length - 50);
  attemptHistory.set(platform, history);

  if (success) cooldowns.delete(platform);

  appendEvent(success ? "platform.reconnect_success" : "platform.reconnect_failure", "distribution", platform, {
    method, latencyMs, errorCode, recentFailures: history.filter(a => !a.success).length,
  }, "reconnect-intelligence");

  return attempt;
}

export function getReconnectIntelligence(platform: string): ReconnectIntelligence {
  const policy = DEFAULT_POLICIES[platform] || DEFAULT_POLICIES.youtube;
  const history = attemptHistory.get(platform) || [];
  const cooldownUntil = cooldowns.get(platform);

  const successCount = history.filter(a => a.success).length;
  const successRate = history.length > 0 ? successCount / history.length : 1;
  const avgLatencyMs = history.length > 0 ? history.reduce((sum, a) => sum + a.latencyMs, 0) / history.length : 0;

  const recentFailures = history.filter(a => !a.success && Date.now() - a.attemptedAt.getTime() < 3600000).length;
  const currentBackoffMs = Math.min(policy.maxBackoffMs, policy.backoffBaseMs * Math.pow(policy.backoffMultiplier, recentFailures));

  const isInCooldown = cooldownUntil ? cooldownUntil > new Date() : false;
  const nextAttemptAt = isInCooldown ? cooldownUntil! : recentFailures > 0 ? new Date(Date.now() + currentBackoffMs) : null;

  let recommendation = "Connection healthy — no action needed";
  if (isInCooldown) recommendation = "In cooldown — wait for automatic retry or reconnect manually";
  else if (successRate < 0.3) recommendation = "Low success rate — check platform credentials and API status";
  else if (successRate < 0.7) recommendation = "Intermittent failures — monitor closely";

  return { platform, recentAttempts: history.slice(-10), successRate, avgLatencyMs, currentBackoffMs, nextAttemptAt, isInCooldown, recommendation };
}

export function getAllReconnectIntelligence(): ReconnectIntelligence[] {
  return Object.keys(DEFAULT_POLICIES).map(p => getReconnectIntelligence(p));
}
