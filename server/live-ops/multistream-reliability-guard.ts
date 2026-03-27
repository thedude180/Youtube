import { db } from "../db";
import { livePublishAttempts, multistreamDestinations } from "@shared/schema";
import { eq, and, gte, desc } from "drizzle-orm";
import { appendEvent } from "../kernel/creator-intelligence-graph";
import { checkIdempotency, recordIdempotency } from "../kernel/idempotency-ledger";

export interface RetryPolicy {
  platform: string;
  maxRetries: number;
  initialDelayMs: number;
  backoffMultiplier: number;
  maxDelayMs: number;
  circuitBreakerThreshold: number;
}

export interface ReliabilityAssessment {
  destinationId: number;
  platform: string;
  launchAllowed: boolean;
  reason: string;
  retryCount: number;
  circuitBreakerOpen: boolean;
  trustSafe: boolean;
  policySafe: boolean;
}

export interface GuardReport {
  assessments: ReliabilityAssessment[];
  duplicatesBlocked: number;
  circuitBreakersOpen: string[];
  overallReliability: number;
  recommendations: string[];
  reportedAt: Date;
}

const RETRY_POLICIES: Record<string, RetryPolicy> = {
  youtube: { platform: "youtube", maxRetries: 3, initialDelayMs: 5000, backoffMultiplier: 2, maxDelayMs: 60000, circuitBreakerThreshold: 5 },
  twitch: { platform: "twitch", maxRetries: 3, initialDelayMs: 3000, backoffMultiplier: 2, maxDelayMs: 30000, circuitBreakerThreshold: 4 },
  kick: { platform: "kick", maxRetries: 2, initialDelayMs: 5000, backoffMultiplier: 2.5, maxDelayMs: 45000, circuitBreakerThreshold: 3 },
  tiktok: { platform: "tiktok", maxRetries: 2, initialDelayMs: 10000, backoffMultiplier: 2, maxDelayMs: 60000, circuitBreakerThreshold: 3 },
};

const circuitBreakers = new Map<string, { failures: number; openedAt: Date | null; cooldownMs: number }>();

function getCircuitBreaker(platform: string) {
  if (!circuitBreakers.has(platform)) {
    circuitBreakers.set(platform, { failures: 0, openedAt: null, cooldownMs: 120000 });
  }
  return circuitBreakers.get(platform)!;
}

export function isCircuitOpen(platform: string): boolean {
  const cb = getCircuitBreaker(platform);
  if (!cb.openedAt) return false;
  if (Date.now() - cb.openedAt.getTime() > cb.cooldownMs) {
    cb.openedAt = null;
    cb.failures = 0;
    return false;
  }
  return true;
}

export function recordFailure(platform: string): void {
  const cb = getCircuitBreaker(platform);
  const policy = RETRY_POLICIES[platform] || RETRY_POLICIES.youtube;
  cb.failures++;

  if (cb.failures >= policy.circuitBreakerThreshold) {
    cb.openedAt = new Date();
    appendEvent("multistream.circuit_breaker_opened", "live", platform, {
      failures: cb.failures,
      threshold: policy.circuitBreakerThreshold,
    }, "multistream-reliability-guard");
  }
}

export function recordSuccess(platform: string): void {
  const cb = getCircuitBreaker(platform);
  cb.failures = Math.max(0, cb.failures - 1);
}

export async function assessLaunchReliability(
  destinationId: number,
  platform: string,
  sessionId: number
): Promise<ReliabilityAssessment> {
  const idempotencyKey = `guard:${sessionId}:${destinationId}`;
  const idempotencyCheck = checkIdempotency(idempotencyKey);
  if (idempotencyCheck.isDuplicate) {
    return {
      destinationId, platform,
      launchAllowed: false,
      reason: "Duplicate launch blocked by idempotency guard",
      retryCount: 0,
      circuitBreakerOpen: false,
      trustSafe: true,
      policySafe: true,
    };
  }

  const circuitOpen = isCircuitOpen(platform);
  if (circuitOpen) {
    return {
      destinationId, platform,
      launchAllowed: false,
      reason: `Circuit breaker open for ${platform} — too many recent failures`,
      retryCount: 0,
      circuitBreakerOpen: true,
      trustSafe: false,
      policySafe: true,
    };
  }

  const [dest] = await db.select()
    .from(multistreamDestinations)
    .where(eq(multistreamDestinations.id, destinationId))
    .limit(1);

  const retryCount = dest?.retryCount || 0;
  const policy = RETRY_POLICIES[platform] || RETRY_POLICIES.youtube;

  if (retryCount >= policy.maxRetries) {
    return {
      destinationId, platform,
      launchAllowed: false,
      reason: `Max retries (${policy.maxRetries}) exceeded for ${platform}`,
      retryCount,
      circuitBreakerOpen: false,
      trustSafe: false,
      policySafe: true,
    };
  }

  recordIdempotency(idempotencyKey, `${platform}:${destinationId}`, { assessed: true }, 10 * 60 * 1000);

  return {
    destinationId, platform,
    launchAllowed: true,
    reason: "Launch approved — all reliability checks passed",
    retryCount,
    circuitBreakerOpen: false,
    trustSafe: true,
    policySafe: true,
  };
}

export function calculateRetryDelay(platform: string, retryCount: number): number {
  const policy = RETRY_POLICIES[platform] || RETRY_POLICIES.youtube;
  return Math.min(
    policy.maxDelayMs,
    policy.initialDelayMs * Math.pow(policy.backoffMultiplier, retryCount)
  );
}

export function generateGuardReport(): GuardReport {
  const assessments: ReliabilityAssessment[] = [];
  const circuitBreakersOpen: string[] = [];
  let duplicatesBlocked = 0;

  for (const [platform, cb] of circuitBreakers) {
    if (cb.openedAt && Date.now() - cb.openedAt.getTime() <= cb.cooldownMs) {
      circuitBreakersOpen.push(platform);
    }
  }

  const overallReliability = circuitBreakersOpen.length === 0 ? 1 :
    1 - circuitBreakersOpen.length / Object.keys(RETRY_POLICIES).length;

  const recommendations: string[] = [];
  if (circuitBreakersOpen.length > 0) {
    recommendations.push(`Circuit breakers open for: ${circuitBreakersOpen.join(", ")} — investigate platform connectivity`);
  }
  if (overallReliability >= 0.9) {
    recommendations.push("Multistream reliability is excellent — all platforms healthy");
  }

  return {
    assessments,
    duplicatesBlocked,
    circuitBreakersOpen,
    overallReliability,
    recommendations,
    reportedAt: new Date(),
  };
}

export function getRetryPolicies(): Record<string, RetryPolicy> {
  return { ...RETRY_POLICIES };
}
