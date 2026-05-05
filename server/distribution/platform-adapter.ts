import { db } from "../db";
import { distributionEvents, PLATFORMS } from "@shared/schema";
import type { Platform } from "@shared/schema";
import { eq, desc, and } from "drizzle-orm";
import { createLogger } from "../lib/logger";

const logger = createLogger("platform-adapter");

export type DistributionRequest = {
  userId: string;
  platform: Platform;
  contentId: string;
  contentType: "video" | "short" | "post" | "live";
  title: string;
  description?: string;
  content?: string;
  tags?: string[];
  hasDisclosure?: boolean;
  copyrightCleared?: boolean;
  metadata?: Record<string, any>;
};

type PublishResult = {
  success: boolean;
  platform: string;
  postId?: string;
  postUrl?: string;
  error?: string;
  skipped?: boolean;
};

export type AdapterResult = {
  allowed: boolean;
  eventId: number;
  publishResult: PublishResult | null;
  trustCheck: { remaining: number; blocked: boolean };
  capabilityCheck: { probeResult: string };
  policyCheck: { passed: boolean; issues: string[] };
  connectionHealth: { status: string; latencyMs: number };
};

const TRUST_COSTS: Record<string, number> = {
  video: 10,
  short: 5,
  post: 2,
  live: 15,
};

export async function distributeContent(req: DistributionRequest): Promise<AdapterResult> {
  const trustCost = TRUST_COSTS[req.contentType] || 5;

  const { getConnectionHealth, recordConnectionSuccess, recordConnectionFailure } = await import("./connection-health");
  const connectionHealth = getConnectionHealth(req.platform);

  if (connectionHealth.status === "open") {
    const [event] = await db.insert(distributionEvents).values({
      userId: req.userId,
      platform: req.platform,
      contentId: req.contentId,
      eventType: `publish_${req.contentType}`,
      status: "blocked",
      trustBudgetCost: trustCost,
      capabilityProbeResult: "skipped",
      policyGateResult: "skipped",
      errorMessage: "circuit breaker open",
      metadata: { title: req.title, tags: req.tags, contentType: req.contentType },
    }).returning();

    const { recordDistributionLearning } = await import("./distribution-learning");
    await recordDistributionLearning(req.userId, req.platform, `publish_${req.contentType}`, {
      allowed: false, trustCost, policyIssues: ["circuit breaker open"], connectionStatus: "open",
    }).catch(() => {});

    return {
      allowed: false,
      eventId: event.id,
      publishResult: null,
      trustCheck: { remaining: 0, blocked: false },
      capabilityCheck: { probeResult: "skipped" },
      policyCheck: { passed: false, issues: ["circuit breaker open"] },
      connectionHealth,
    };
  }

  let trustCheck = { remaining: 0, blocked: true };
  try {
    const { checkTrustBudget } = await import("../kernel/trust-budget");
    trustCheck = await checkTrustBudget(req.userId, `distribution:${req.platform}`, trustCost);
  } catch {
    trustCheck = { remaining: 0, blocked: true };
  }

  let capabilityCheck = { probeResult: "error" };
  try {
    const { probeCapability } = await import("../kernel/capability-probe");
    const probe = await probeCapability(req.platform, `${req.platform}:publish`, undefined, req.userId);
    capabilityCheck = { probeResult: probe.probeResult };
  } catch {
    capabilityCheck = { probeResult: "error" };
  }

  const { checkPublishingGates } = await import("./publishing-gates");
  const policyCheck = await checkPublishingGates(req.userId, req.platform, {
    title: req.title,
    description: req.description,
    tags: req.tags,
    hasDisclosure: req.hasDisclosure,
    copyrightCleared: req.copyrightCleared,
  });

  try {
    const { detectComplianceDrift } = await import("../services/compliance-drift-detector");
    await detectComplianceDrift();
  } catch {}

  try {
    const { runPolicyPreFlight } = await import("../services/policy-preflight");
    const preFlightResult = await runPolicyPreFlight(req.userId, req.platform, {
      contentId: parseInt(req.contentId, 10) || undefined,
      title: req.title,
      description: req.description,
      tags: req.tags,
      hasAiContent: req.metadata?.hasAiContent,
      hasSponsoredContent: req.metadata?.hasSponsoredContent,
      hasAffiliateLinks: req.metadata?.hasAffiliateLinks,
      originTypes: req.metadata?.originTypes,
    });
    if (!preFlightResult.passed) {
      policyCheck.passed = false;
      policyCheck.issues.push(...preFlightResult.blockers);
    }
    if (preFlightResult.recommendations.length > 0) {
      policyCheck.issues.push(...preFlightResult.recommendations.map(r => `[pre-flight] ${r}`));
    }
  } catch (preFlightErr: unknown) {
    // Fail-open: a transient error in the pre-flight (DB timeout, AI service down)
    // must NOT silently kill a publish job.  Log it and continue so the content
    // can still be distributed.  Genuine compliance violations are caught when
    // the preflight actually runs successfully and returns blockers.
    const msg = preFlightErr instanceof Error ? preFlightErr.message : "unknown error";
    logger.warn(`[PlatformAdapter] Pre-flight gate threw — failing open: ${msg}`);
  }

  let safetyGateAllowed = true;
  try {
    const { runDistributionSafetyGate } = await import("./distribution-safety-gate");
    const safetyResult = await runDistributionSafetyGate({
      userId: req.userId,
      platform: req.platform,
      title: req.title,
      description: req.description,
      tags: req.tags,
    });
    safetyGateAllowed = safetyResult.allowed;
    if (!safetyGateAllowed) {
      policyCheck.passed = false;
      policyCheck.issues.push(...safetyResult.recommendations);
    }
  } catch {}

  const allowed = !trustCheck.blocked
    && capabilityCheck.probeResult !== "error"
    && policyCheck.passed;

  const errorParts: string[] = [];
  if (trustCheck.blocked) errorParts.push("trust budget exhausted");
  if (capabilityCheck.probeResult === "error") errorParts.push("capability probe failed");
  if (!policyCheck.passed) errorParts.push(`policy: ${policyCheck.issues.join(", ")}`);

  let publishResult: PublishResult | null = null;
  let actualPublishLatencyMs = 0;

  if (allowed && req.content) {
    const startTime = Date.now();
    try {
      const { executePublish } = await import("../platform-publisher");
      publishResult = await executePublish(
        req.userId,
        req.platform,
        req.content,
        {
          ...req.metadata,
          title: req.title,
          description: req.description,
          tags: req.tags,
          hasDisclosure: req.hasDisclosure,
          copyrightCleared: req.copyrightCleared,
        }
      );
      actualPublishLatencyMs = Date.now() - startTime;
      if (publishResult.success) {
        recordConnectionSuccess(req.platform, actualPublishLatencyMs);
      } else if (!publishResult.skipped) {
        recordConnectionFailure(req.platform, actualPublishLatencyMs);
      }
    } catch (err: any) {
      actualPublishLatencyMs = Date.now() - startTime;
      recordConnectionFailure(req.platform, actualPublishLatencyMs);
      publishResult = {
        success: false,
        platform: req.platform,
        error: err?.message || "Publisher execution failed",
      };
    }
  }

  let status: string;
  if (!allowed) {
    status = "blocked";
  } else if (!publishResult) {
    status = "approved";
  } else if (publishResult.success) {
    status = "published";
  } else {
    status = "failed";
  }

  const [event] = await db.insert(distributionEvents).values({
    userId: req.userId,
    platform: req.platform,
    contentId: req.contentId,
    eventType: `publish_${req.contentType}`,
    status,
    trustBudgetCost: trustCost,
    capabilityProbeResult: capabilityCheck.probeResult,
    policyGateResult: policyCheck.passed ? "passed" : "blocked",
    errorMessage: errorParts.length > 0 ? errorParts.join("; ") : (publishResult && !publishResult.success ? publishResult.error : null),
    metadata: {
      title: req.title,
      tags: req.tags,
      contentType: req.contentType,
      publishPostId: publishResult?.postId,
      publishLatencyMs: actualPublishLatencyMs > 0 ? actualPublishLatencyMs : undefined,
    },
    publishedAt: publishResult?.success ? new Date() : null,
  }).returning();

  const { recordDistributionLearning } = await import("./distribution-learning");
  await recordDistributionLearning(req.userId, req.platform, `publish_${req.contentType}`, {
    allowed,
    trustCost,
    policyIssues: policyCheck.issues,
    connectionStatus: connectionHealth.status,
    publishSuccess: publishResult?.success,
    publishLatencyMs: actualPublishLatencyMs > 0 ? actualPublishLatencyMs : undefined,
  }).catch(() => {});

  return {
    allowed,
    eventId: event.id,
    publishResult,
    trustCheck,
    capabilityCheck,
    policyCheck,
    connectionHealth,
  };
}

export async function getDistributionHistory(
  userId: string,
  platform?: string,
  limit: number = 50
): Promise<any[]> {
  let query = db.select().from(distributionEvents)
    .where(
      platform
        ? and(eq(distributionEvents.userId, userId), eq(distributionEvents.platform, platform))
        : eq(distributionEvents.userId, userId)
    )
    .orderBy(desc(distributionEvents.createdAt))
    .limit(limit);
  return query;
}

export async function getDistributionStats(userId: string): Promise<{
  totalEvents: number;
  approved: number;
  blocked: number;
  byPlatform: Record<string, { total: number; approved: number; blocked: number }>;
}> {
  const events = await db.select().from(distributionEvents)
    .where(eq(distributionEvents.userId, userId))
    .orderBy(desc(distributionEvents.createdAt))
    .limit(500);

  const byPlatform: Record<string, { total: number; approved: number; blocked: number }> = {};
  let approved = 0;
  let blocked = 0;

  for (const e of events) {
    if (!byPlatform[e.platform]) byPlatform[e.platform] = { total: 0, approved: 0, blocked: 0 };
    byPlatform[e.platform].total++;
    if (e.status === "blocked") {
      blocked++;
      byPlatform[e.platform].blocked++;
    } else {
      approved++;
      byPlatform[e.platform].approved++;
    }
  }

  return { totalEvents: events.length, approved, blocked, byPlatform };
}

export function getSupportedPlatforms(): Platform[] {
  return ["youtube"];
}
