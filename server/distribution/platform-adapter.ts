import { db } from "../db";
import { distributionEvents, PLATFORMS } from "@shared/schema";
import type { Platform } from "@shared/schema";
import { eq, desc, and } from "drizzle-orm";

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

  const { getConnectionHealth, recordConnectionSuccess, recordConnectionFailure } = await import("./connection-health");
  const connectionHealth = getConnectionHealth(req.platform);

  const allowed = !trustCheck.blocked
    && capabilityCheck.probeResult !== "error"
    && policyCheck.passed
    && connectionHealth.status !== "open";

  const errorParts: string[] = [];
  if (trustCheck.blocked) errorParts.push("trust budget exhausted");
  if (capabilityCheck.probeResult === "error") errorParts.push("capability probe failed");
  if (!policyCheck.passed) errorParts.push(`policy: ${policyCheck.issues.join(", ")}`);
  if (connectionHealth.status === "open") errorParts.push("circuit breaker open");

  let publishResult: PublishResult | null = null;

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
      const latencyMs = Date.now() - startTime;
      if (publishResult.success) {
        recordConnectionSuccess(req.platform, latencyMs);
      } else if (!publishResult.skipped) {
        recordConnectionFailure(req.platform, latencyMs);
      }
    } catch (err: any) {
      const latencyMs = Date.now() - startTime;
      recordConnectionFailure(req.platform, latencyMs);
      publishResult = {
        success: false,
        platform: req.platform,
        error: err?.message || "Publisher execution failed",
      };
    }
  }

  const status = !allowed ? "blocked" : (publishResult?.success ? "published" : "approved");

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
    },
    publishedAt: publishResult?.success ? new Date() : null,
  }).returning();

  const { recordDistributionLearning } = await import("./distribution-learning");
  await recordDistributionLearning(req.userId, req.platform, `publish_${req.contentType}`, {
    allowed,
    trustCost,
    policyIssues: policyCheck.issues,
    connectionStatus: connectionHealth.status,
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
  return [...PLATFORMS];
}
