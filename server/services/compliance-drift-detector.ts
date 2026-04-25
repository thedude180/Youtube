import { db } from "../db";
import { complianceDriftEvents, complianceRules, policyPackBaselines } from "@shared/schema";
import { eq, and, desc, count, sql, ne } from "drizzle-orm";
import { createLogger } from "../lib/logger";
import { getPolicyPack, getPolicyPackHash, getSupportedPlatforms } from "./policy-packs";
import { createHash } from "crypto";

const logger = createLogger("compliance-drift-detector");

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

async function getBaselineHash(platform: string): Promise<string | null> {
  const [baseline] = await db.select().from(policyPackBaselines)
    .where(eq(policyPackBaselines.platform, platform))
    .limit(1);
  return baseline?.policyHash || null;
}

async function setBaselineHash(platform: string, hash: string, version: string): Promise<void> {
  const [existing] = await db.select().from(policyPackBaselines)
    .where(eq(policyPackBaselines.platform, platform))
    .limit(1);

  if (existing) {
    await db.update(policyPackBaselines)
      .set({ policyHash: hash, version, updatedAt: new Date() })
      .where(eq(policyPackBaselines.id, existing.id));
  } else {
    await db.insert(policyPackBaselines).values({ platform, policyHash: hash, version });
  }
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

function computeEffectiveSnapshotHash(packHash: string, dbRules: Array<{ ruleName: string; severity: string; description: string | null }>): string {
  const ruleFingerprint = dbRules
    .sort((a, b) => a.ruleName.localeCompare(b.ruleName))
    .map(r => `${r.ruleName}:${r.severity}:${(r.description || "").slice(0, 50)}`)
    .join("|");
  return createHash("sha256").update(`${packHash}::${ruleFingerprint}`).digest("hex").slice(0, 16);
}

async function detectPlatformDrift(platform: string): Promise<DriftDetectionResult> {
  const pack = getPolicyPack(platform);
  if (!pack) {
    return { platform, driftsDetected: 0, changes: [] };
  }

  const existingRules = await db.select().from(complianceRules)
    .where(and(eq(complianceRules.platform, platform), eq(complianceRules.isActive, true)))
    .orderBy(desc(complianceRules.lastUpdated));

  const packHash = getPolicyPackHash(platform);
  const currentHash = computeEffectiveSnapshotHash(packHash, existingRules);
  const previousHash = await getBaselineHash(platform);

  if (previousHash && previousHash === currentHash) {
    return { platform, driftsDetected: 0, changes: [] };
  }

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

  for (const dbRule of existingRules) {
    const packRule = pack.rules.find(r => r.id === dbRule.ruleName);
    if (!packRule) {
      driftChanges.push({
        category: "db_rule_orphan",
        field: `db_rule:${dbRule.ruleName}`,
        oldValue: dbRule.description || dbRule.ruleName,
        newValue: "not_in_pack",
        severity: "medium",
      });
      changes.push({ field: `db_rule:${dbRule.ruleName}`, oldValue: dbRule.description || dbRule.ruleName, newValue: "not_in_pack" });
    }
  }

  if (previousHash && currentHash !== previousHash) {
    changes.push({ field: "effective_snapshot", oldValue: previousHash, newValue: currentHash });
    driftChanges.push({
      category: "effective_policy_state",
      field: "policy_snapshot_hash",
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

  await setBaselineHash(platform, currentHash, pack.version);

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

/**
 * Auto-resolves detected drift events that are older than MAX_DRIFT_AGE_DAYS.
 *
 * Drifts this old represent stale policy snapshot deltas that were never acted
 * on.  Keeping them as "detected" would permanently block publishing via the
 * pre-flight gate even when the operator has no intention of resolving them.
 * Runs once at server startup and returns how many events were auto-resolved.
 */
export async function autoResolveStaleDetectedDrifts(maxAgeDays = 7): Promise<number> {
  const cutoff = new Date(Date.now() - maxAgeDays * 24 * 60 * 60 * 1000);
  const staleEvents = await db.select({ id: complianceDriftEvents.id })
    .from(complianceDriftEvents)
    .where(
      and(
        eq(complianceDriftEvents.status, "detected"),
        sql`${complianceDriftEvents.detectedAt} < ${cutoff.toISOString()}`
      )
    );

  if (staleEvents.length === 0) return 0;

  await db.update(complianceDriftEvents)
    .set({ status: "resolved", resolvedAt: new Date() })
    .where(
      and(
        eq(complianceDriftEvents.status, "detected"),
        sql`${complianceDriftEvents.detectedAt} < ${cutoff.toISOString()}`
      )
    );

  logger.info("Auto-resolved stale compliance drift events", {
    count: staleEvents.length,
    maxAgeDays,
  });
  return staleEvents.length;
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
  const [[totals], platformRows, severityRows, [latest]] = await Promise.all([
    db.select({
      total: count(),
      unresolved: sql<number>`count(*) filter (where ${complianceDriftEvents.status} != 'resolved')`,
    }).from(complianceDriftEvents),
    db.select({
      platform: complianceDriftEvents.platform,
      cnt: count(),
    }).from(complianceDriftEvents).groupBy(complianceDriftEvents.platform),
    db.select({
      severity: complianceDriftEvents.severity,
      cnt: count(),
    }).from(complianceDriftEvents).groupBy(complianceDriftEvents.severity),
    db.select({
      lastDetected: sql<Date | null>`max(${complianceDriftEvents.detectedAt})`,
    }).from(complianceDriftEvents),
  ]);

  const byPlatform: Record<string, number> = {};
  for (const r of platformRows) byPlatform[r.platform] = r.cnt;
  const bySeverity: Record<string, number> = {};
  for (const r of severityRows) bySeverity[r.severity] = r.cnt;

  return {
    totalEvents: totals?.total ?? 0,
    unresolvedCount: totals?.unresolved ?? 0,
    byPlatform,
    bySeverity,
    lastDetected: latest?.lastDetected ?? null,
  };
}
