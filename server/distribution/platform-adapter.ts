import { db } from "../db";
import { distributionEvents, PLATFORMS } from "@shared/schema";
import type { Platform } from "@shared/schema";
import { eq, desc, and } from "drizzle-orm";

type DistributionRequest = {
  userId: string;
  platform: Platform;
  contentId: string;
  contentType: "video" | "short" | "post" | "live";
  title: string;
  description?: string;
  tags?: string[];
  hasDisclosure?: boolean;
  copyrightCleared?: boolean;
  metadata?: Record<string, any>;
};

type AdapterResult = {
  allowed: boolean;
  eventId: number;
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

  let trustCheck = { remaining: 100, blocked: false };
  try {
    const { checkTrustBudget } = await import("../kernel/trust-budget");
    trustCheck = await checkTrustBudget(req.userId, `distribution:${req.platform}`, trustCost);
  } catch {
    trustCheck = { remaining: 100, blocked: false };
  }

  let capabilityCheck = { probeResult: "verified" };
  try {
    const { probeCapability } = await import("../kernel/capability-probe");
    const probe = await probeCapability(req.platform, `${req.platform}:publish`, undefined, req.userId);
    capabilityCheck = { probeResult: probe.probeResult };
  } catch {
    capabilityCheck = { probeResult: "skipped" };
  }

  const { checkPublishingGates } = await import("./publishing-gates");
  const policyCheck = await checkPublishingGates(req.userId, req.platform, {
    title: req.title,
    description: req.description,
    tags: req.tags,
    hasDisclosure: req.hasDisclosure,
    copyrightCleared: req.copyrightCleared,
  });

  const { getConnectionHealth } = await import("./connection-health");
  const connectionHealth = getConnectionHealth(req.platform);

  const allowed = !trustCheck.blocked
    && capabilityCheck.probeResult !== "error"
    && policyCheck.passed
    && connectionHealth.status !== "open";

  const status = allowed ? "approved" : "blocked";
  const errorParts: string[] = [];
  if (trustCheck.blocked) errorParts.push("trust budget exhausted");
  if (capabilityCheck.probeResult === "error") errorParts.push("capability probe failed");
  if (!policyCheck.passed) errorParts.push(`policy: ${policyCheck.issues.join(", ")}`);
  if (connectionHealth.status === "open") errorParts.push("circuit breaker open");

  const [event] = await db.insert(distributionEvents).values({
    userId: req.userId,
    platform: req.platform,
    contentId: req.contentId,
    eventType: `publish_${req.contentType}`,
    status,
    trustBudgetCost: trustCost,
    capabilityProbeResult: capabilityCheck.probeResult,
    policyGateResult: policyCheck.passed ? "passed" : "blocked",
    errorMessage: errorParts.length > 0 ? errorParts.join("; ") : null,
    metadata: {
      title: req.title,
      tags: req.tags,
      contentType: req.contentType,
    },
    publishedAt: allowed ? new Date() : null,
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
    if (e.status === "approved") {
      approved++;
      byPlatform[e.platform].approved++;
    } else {
      blocked++;
      byPlatform[e.platform].blocked++;
    }
  }

  return { totalEvents: events.length, approved, blocked, byPlatform };
}

export function getSupportedPlatforms(): Platform[] {
  return [...PLATFORMS];
}
