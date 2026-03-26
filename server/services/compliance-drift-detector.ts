import { db } from "../db";
import { complianceDriftEvents, complianceRules } from "@shared/schema";
import { eq, and, desc } from "drizzle-orm";
import { createLogger } from "../lib/logger";
import { getPolicyPack, getPolicyPackHash, getSupportedPlatforms } from "./policy-packs";

const logger = createLogger("compliance-drift-detector");

const lastKnownHashes = new Map<string, string>();

export interface DriftDetectionResult {
  platform: string;
  driftsDetected: number;
  changes: Array<{
    category: string;
    field: string;
    oldValue: string;
    newValue: string;
    severity: string;
  }>;
}

export async function detectComplianceDrift(): Promise<DriftDetectionResult[]> {
  const results: DriftDetectionResult[] = [];
  const platforms = getSupportedPlatforms();

  for (const platform of platforms) {
    try {
      const result = await detectPlatformDrift(platform);
      results.push(result);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      logger.warn("Drift detection failed for platform", { platform, error: msg.substring(0, 200) });
    }
  }

  logger.info("Compliance drift detection completed", {
    platforms: results.length,
    totalDrifts: results.reduce((sum, r) => sum + r.driftsDetected, 0),
  });

  return results;
}

async function detectPlatformDrift(platform: string): Promise<DriftDetectionResult> {
  const pack = getPolicyPack(platform);
  if (!pack) {
    return { platform, driftsDetected: 0, changes: [] };
  }

  const currentHash = getPolicyPackHash(platform);
  const previousHash = lastKnownHashes.get(platform);

  if (previousHash && previousHash === currentHash) {
    return { platform, driftsDetected: 0, changes: [] };
  }

  const existingRules = await db.select().from(complianceRules)
    .where(and(eq(complianceRules.platform, platform), eq(complianceRules.isActive, true)))
    .orderBy(desc(complianceRules.lastUpdated));

  const changes: Array<{ field: string; oldValue: string; newValue: string }> = [];
  const driftChanges: DriftDetectionResult["changes"] = [];

  for (const packRule of pack.rules) {
    const existingRule = existingRules.find(r => r.ruleName === packRule.id);
    if (!existingRule) {
      const change = { field: `rule:${packRule.id}`, oldValue: "not_present", newValue: packRule.description };
      changes.push(change);
      driftChanges.push({
        category: packRule.category,
        field: change.field,
        oldValue: change.oldValue,
        newValue: change.newValue,
        severity: packRule.severity,
      });
    } else if (existingRule.severity !== packRule.severity) {
      const change = { field: `severity:${packRule.id}`, oldValue: existingRule.severity, newValue: packRule.severity };
      changes.push(change);
      driftChanges.push({
        category: packRule.category,
        field: change.field,
        oldValue: change.oldValue,
        newValue: change.newValue,
        severity: packRule.severity,
      });
    }
  }

  const packLimitsStr = JSON.stringify(pack.limits);
  const oldLimitsStr = previousHash ? "previous_limits" : "unknown";
  if (previousHash && currentHash !== previousHash) {
    changes.push({ field: "limits_hash", oldValue: previousHash, newValue: currentHash });
    driftChanges.push({
      category: "platform_limits",
      field: "policy_pack_version",
      oldValue: previousHash,
      newValue: currentHash,
      severity: "medium",
    });
  }

  if (changes.length > 0) {
    const severity = driftChanges.some(c => c.severity === "critical") ? "critical"
      : driftChanges.some(c => c.severity === "warning") ? "high"
      : "medium";

    await db.insert(complianceDriftEvents).values({
      platform,
      ruleCategory: driftChanges[0]?.category || "general",
      driftType: previousHash ? "policy_update" : "initial_baseline",
      previousHash: previousHash || null,
      currentHash,
      changesDetected: changes,
      severity,
      status: "detected",
    });
  }

  lastKnownHashes.set(platform, currentHash);

  return {
    platform,
    driftsDetected: changes.length,
    changes: driftChanges,
  };
}

export async function getDriftEvents(filters?: {
  platform?: string;
  status?: string;
  limit?: number;
}): Promise<(typeof complianceDriftEvents.$inferSelect)[]> {
  const conditions = [];
  if (filters?.platform) conditions.push(eq(complianceDriftEvents.platform, filters.platform));
  if (filters?.status) conditions.push(eq(complianceDriftEvents.status, filters.status));

  const query = db.select().from(complianceDriftEvents)
    .orderBy(desc(complianceDriftEvents.detectedAt))
    .limit(filters?.limit || 50);

  if (conditions.length > 0) {
    return query.where(conditions.length === 1 ? conditions[0] : and(...conditions));
  }

  return query;
}

export async function resolveDriftEvent(eventId: number): Promise<boolean> {
  const existing = await db.select().from(complianceDriftEvents)
    .where(eq(complianceDriftEvents.id, eventId))
    .limit(1);
  if (existing.length === 0) return false;

  await db.update(complianceDriftEvents)
    .set({ status: "resolved", resolvedAt: new Date() })
    .where(eq(complianceDriftEvents.id, eventId));
  return true;
}

export async function getDriftSummary(): Promise<{
  totalEvents: number;
  unresolvedCount: number;
  byPlatform: Record<string, number>;
  bySeverity: Record<string, number>;
  lastDetected: Date | null;
}> {
  const events = await db.select().from(complianceDriftEvents)
    .orderBy(desc(complianceDriftEvents.detectedAt));

  const byPlatform: Record<string, number> = {};
  const bySeverity: Record<string, number> = {};
  let unresolvedCount = 0;

  for (const event of events) {
    byPlatform[event.platform] = (byPlatform[event.platform] || 0) + 1;
    bySeverity[event.severity] = (bySeverity[event.severity] || 0) + 1;
    if (event.status !== "resolved") unresolvedCount++;
  }

  return {
    totalEvents: events.length,
    unresolvedCount,
    byPlatform,
    bySeverity,
    lastDetected: events.length > 0 ? events[0].detectedAt : null,
  };
}
