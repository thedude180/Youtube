import { db } from "../db";
import { revenueRecords, revenueSyncLog, reconciliationActions, reconciliationReports } from "@shared/schema";
import { eq, and, desc, gte, lte, lt, sql, isNull, ne } from "drizzle-orm";

export const RECONCILIATION_STATUSES = [
  "verified",
  "estimated",
  "disputed",
  "delayed",
  "unresolved",
  "unverified",
] as const;

export type ReconciliationStatus = typeof RECONCILIATION_STATUSES[number];

export interface ReconciliationResult {
  recordId: number;
  previousStatus: ReconciliationStatus;
  newStatus: ReconciliationStatus;
  gapAmount: number | null;
  source: string;
  notes: string;
}

export interface ReconciliationReport {
  period: string;
  generatedAt: string;
  totalRecords: number;
  verifiedRecords: number;
  estimatedRecords: number;
  disputedRecords: number;
  delayedRecords: number;
  unresolvedRecords: number;
  totalVerifiedAmount: number;
  totalEstimatedAmount: number;
  totalGapAmount: number;
  variancePercent: number;
  unresolvedGaps: Array<{
    recordId: number;
    platform: string;
    source: string;
    amount: number;
    gapAmount: number;
  }>;
  needsHumanAction: boolean;
  humanActionItems: string[];
  platformBreakdown: Record<string, {
    verified: number;
    estimated: number;
    gap: number;
    recordCount: number;
  }>;
}

export interface RevenueTruthSummary {
  totalRevenue: number;
  verifiedRevenue: number;
  estimatedRevenue: number;
  verificationRate: number;
  confidenceLabel: "high" | "medium" | "low" | "unverified";
  byPlatform: Record<string, {
    total: number;
    verified: number;
    estimated: number;
    verificationRate: number;
  }>;
  bySource: Record<string, {
    total: number;
    verified: number;
    status: ReconciliationStatus;
  }>;
}

const HUMAN_ACTION_GAP_THRESHOLD = 100;

function parseStatus(raw: string | null | undefined): ReconciliationStatus {
  const s = raw as ReconciliationStatus;
  if (RECONCILIATION_STATUSES.includes(s)) return s;
  return "unverified";
}

export async function reconcileRevenueRecords(
  userId: string,
  options: {
    startDate?: Date;
    endDate?: Date;
    platform?: string;
  } = {}
): Promise<ReconciliationResult[]> {
  const conditions = [eq(revenueRecords.userId, userId)];

  if (options.startDate) {
    conditions.push(gte(revenueRecords.recordedAt, options.startDate));
  }
  if (options.endDate) {
    conditions.push(lte(revenueRecords.recordedAt, options.endDate));
  }
  if (options.platform) {
    conditions.push(eq(revenueRecords.platform, options.platform));
  }

  const records = await db.select().from(revenueRecords)
    .where(and(...conditions))
    .orderBy(desc(revenueRecords.recordedAt));

  const results: ReconciliationResult[] = [];

  for (const record of records) {
    const previousStatus = parseStatus(record.reconciliationStatus);
    let newStatus: ReconciliationStatus;
    let gapAmount: number | null = null;
    let notes = "";

    if (record.syncSource === "auto" && record.externalId) {
      newStatus = "verified";
      notes = `Verified via ${record.syncSource} sync with external ID ${record.externalId}`;
    } else if (record.syncSource === "auto-estimated") {
      newStatus = "estimated";
      notes = "Revenue estimated from platform metrics, not verified payout data";
    } else if (record.syncSource === "manual") {
      newStatus = "estimated";
      notes = "Manually entered revenue — not yet reconciled against payout data";
    } else {
      newStatus = "unverified";
      notes = "No sync source or external verification available";
    }

    if (record.reconciliationGapAmount && Math.abs(record.reconciliationGapAmount) > 0) {
      gapAmount = record.reconciliationGapAmount;
      if (Math.abs(gapAmount) > HUMAN_ACTION_GAP_THRESHOLD) {
        newStatus = "unresolved";
        notes = `Gap of $${Math.abs(gapAmount).toFixed(2)} exceeds threshold — needs human review`;
      } else if (Math.abs(gapAmount) > 0) {
        newStatus = "disputed";
        notes = `Minor discrepancy of $${Math.abs(gapAmount).toFixed(2)} detected`;
      }
    }

    if (previousStatus !== newStatus) {
      await db.update(revenueRecords)
        .set({
          reconciliationStatus: newStatus,
          reconciliationSource: record.syncSource || "system",
          reconciliationVerifiedAt: newStatus === "verified" ? new Date() : null,
          reconciliationNotes: notes,
        })
        .where(eq(revenueRecords.id, record.id));
    }

    results.push({
      recordId: record.id,
      previousStatus,
      newStatus,
      gapAmount,
      source: record.syncSource || "unknown",
      notes,
    });
  }

  return results;
}

export async function verifyRevenueRecord(
  userId: string,
  recordId: number,
  verificationData: {
    verifiedAmount: number;
    source: string;
    notes?: string;
  }
): Promise<ReconciliationResult> {
  const [record] = await db.select().from(revenueRecords)
    .where(and(eq(revenueRecords.id, recordId), eq(revenueRecords.userId, userId)))
    .limit(1);

  if (!record) {
    throw new Error(`Revenue record ${recordId} not found for user ${userId}`);
  }

  const gapAmount = record.amount - verificationData.verifiedAmount;
  let newStatus: ReconciliationStatus = "verified";
  let notes = verificationData.notes || "";

  if (Math.abs(gapAmount) > HUMAN_ACTION_GAP_THRESHOLD) {
    newStatus = "disputed";
    notes = `Verified amount $${verificationData.verifiedAmount.toFixed(2)} differs from recorded $${record.amount.toFixed(2)} by $${Math.abs(gapAmount).toFixed(2)}`;
  } else if (Math.abs(gapAmount) > 0.01) {
    notes = `Minor gap of $${Math.abs(gapAmount).toFixed(2)} — within acceptable threshold`;
  }

  await db.update(revenueRecords)
    .set({
      reconciliationStatus: newStatus,
      reconciliationSource: verificationData.source,
      reconciliationVerifiedAt: new Date(),
      reconciliationGapAmount: gapAmount !== 0 ? gapAmount : null,
      reconciliationNotes: notes,
    })
    .where(eq(revenueRecords.id, recordId));

  return {
    recordId,
    previousStatus: parseStatus(record.reconciliationStatus),
    newStatus,
    gapAmount: gapAmount !== 0 ? gapAmount : null,
    source: verificationData.source,
    notes,
  };
}

export async function generateReconciliationReport(
  userId: string,
  period?: string
): Promise<ReconciliationReport> {
  const now = new Date();
  const targetPeriod = period || `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;

  const startDate = new Date(`${targetPeriod}-01T00:00:00Z`);
  const endDate = new Date(startDate);
  endDate.setMonth(endDate.getMonth() + 1);

  const records = await db.select().from(revenueRecords)
    .where(and(
      eq(revenueRecords.userId, userId),
      gte(revenueRecords.recordedAt, startDate),
      lt(revenueRecords.recordedAt, endDate),
    ))
    .orderBy(desc(revenueRecords.recordedAt));

  let totalVerifiedAmount = 0;
  let totalEstimatedAmount = 0;
  let totalGapAmount = 0;
  let verifiedCount = 0;
  let estimatedCount = 0;
  let disputedCount = 0;
  let delayedCount = 0;
  let unresolvedCount = 0;

  const platformBreakdown: Record<string, {
    verified: number;
    estimated: number;
    gap: number;
    recordCount: number;
  }> = {};

  const unresolvedGaps: ReconciliationReport["unresolvedGaps"] = [];
  const humanActionItems: string[] = [];

  for (const record of records) {
    const status = parseStatus(record.reconciliationStatus);
    const amount = record.amount || 0;

    if (!platformBreakdown[record.platform]) {
      platformBreakdown[record.platform] = { verified: 0, estimated: 0, gap: 0, recordCount: 0 };
    }
    platformBreakdown[record.platform].recordCount++;

    switch (status) {
      case "verified":
        verifiedCount++;
        totalVerifiedAmount += amount;
        platformBreakdown[record.platform].verified += amount;
        break;
      case "estimated":
      case "unverified":
        estimatedCount++;
        totalEstimatedAmount += amount;
        platformBreakdown[record.platform].estimated += amount;
        break;
      case "disputed":
        disputedCount++;
        totalEstimatedAmount += amount;
        if (record.reconciliationGapAmount) {
          totalGapAmount += Math.abs(record.reconciliationGapAmount);
          platformBreakdown[record.platform].gap += Math.abs(record.reconciliationGapAmount);
        }
        break;
      case "delayed":
        delayedCount++;
        totalEstimatedAmount += amount;
        break;
      case "unresolved":
        unresolvedCount++;
        totalEstimatedAmount += amount;
        if (record.reconciliationGapAmount) {
          totalGapAmount += Math.abs(record.reconciliationGapAmount);
          platformBreakdown[record.platform].gap += Math.abs(record.reconciliationGapAmount);
        }
        if (record.reconciliationGapAmount && Math.abs(record.reconciliationGapAmount) > HUMAN_ACTION_GAP_THRESHOLD) {
          unresolvedGaps.push({
            recordId: record.id,
            platform: record.platform,
            source: record.source,
            amount,
            gapAmount: record.reconciliationGapAmount,
          });
          humanActionItems.push(
            `Review ${record.platform} ${record.source} record #${record.id}: gap of $${Math.abs(record.reconciliationGapAmount).toFixed(2)}`
          );
        }
        break;
    }
  }

  const totalRevenue = totalVerifiedAmount + totalEstimatedAmount;
  const variancePercent = totalRevenue > 0
    ? (totalGapAmount / totalRevenue) * 100
    : 0;

  const needsHumanAction = unresolvedGaps.length > 0 || variancePercent > 10;

  if (variancePercent > 10) {
    humanActionItems.push(
      `Overall revenue variance is ${variancePercent.toFixed(1)}% — review reconciliation across all platforms`
    );
  }

  return {
    period: targetPeriod,
    generatedAt: now.toISOString(),
    totalRecords: records.length,
    verifiedRecords: verifiedCount,
    estimatedRecords: estimatedCount,
    disputedRecords: disputedCount,
    delayedRecords: delayedCount,
    unresolvedRecords: unresolvedCount,
    totalVerifiedAmount,
    totalEstimatedAmount,
    totalGapAmount,
    variancePercent,
    unresolvedGaps,
    needsHumanAction,
    humanActionItems,
    platformBreakdown,
  };
}

export async function getRevenueTruthSummary(userId: string): Promise<RevenueTruthSummary> {
  const records = await db.select().from(revenueRecords)
    .where(eq(revenueRecords.userId, userId))
    .orderBy(desc(revenueRecords.recordedAt));

  let totalRevenue = 0;
  let verifiedRevenue = 0;
  let estimatedRevenue = 0;

  const byPlatform: RevenueTruthSummary["byPlatform"] = {};
  const bySource: RevenueTruthSummary["bySource"] = {};

  for (const record of records) {
    const amount = record.amount || 0;
    const status = parseStatus(record.reconciliationStatus);
    totalRevenue += amount;

    if (status === "verified") {
      verifiedRevenue += amount;
    } else {
      estimatedRevenue += amount;
    }

    if (!byPlatform[record.platform]) {
      byPlatform[record.platform] = { total: 0, verified: 0, estimated: 0, verificationRate: 0 };
    }
    byPlatform[record.platform].total += amount;
    if (status === "verified") {
      byPlatform[record.platform].verified += amount;
    } else {
      byPlatform[record.platform].estimated += amount;
    }

    if (!bySource[record.source]) {
      bySource[record.source] = { total: 0, verified: 0, status };
    }
    bySource[record.source].total += amount;
    if (status === "verified") {
      bySource[record.source].verified += amount;
    }
  }

  for (const platform of Object.keys(byPlatform)) {
    const p = byPlatform[platform];
    p.verificationRate = p.total > 0 ? (p.verified / p.total) * 100 : 0;
  }

  const verificationRate = totalRevenue > 0 ? (verifiedRevenue / totalRevenue) * 100 : 0;

  let confidenceLabel: RevenueTruthSummary["confidenceLabel"];
  if (verificationRate >= 80) confidenceLabel = "high";
  else if (verificationRate >= 50) confidenceLabel = "medium";
  else if (verificationRate > 0) confidenceLabel = "low";
  else confidenceLabel = "unverified";

  return {
    totalRevenue,
    verifiedRevenue,
    estimatedRevenue,
    verificationRate,
    confidenceLabel,
    byPlatform,
    bySource,
  };
}

export async function flagDelayedReconciliation(
  userId: string,
  daysThreshold: number = 30
): Promise<number> {
  const cutoffDate = new Date();
  cutoffDate.setDate(cutoffDate.getDate() - daysThreshold);

  const resultUnverified = await db.update(revenueRecords)
    .set({
      reconciliationStatus: "delayed",
      reconciliationNotes: `No verification received within ${daysThreshold} days of recording`,
    })
    .where(and(
      eq(revenueRecords.userId, userId),
      eq(revenueRecords.reconciliationStatus, "unverified"),
      lte(revenueRecords.recordedAt, cutoffDate),
    ))
    .returning();

  const resultEstimated = await db.update(revenueRecords)
    .set({
      reconciliationStatus: "delayed",
      reconciliationNotes: `Estimated revenue not verified within ${daysThreshold} days — flagged for review`,
    })
    .where(and(
      eq(revenueRecords.userId, userId),
      eq(revenueRecords.reconciliationStatus, "estimated"),
      lte(revenueRecords.recordedAt, cutoffDate),
    ))
    .returning();

  return resultUnverified.length + resultEstimated.length;
}

export async function getReconciliationHistory(
  userId: string,
  limit: number = 20
): Promise<Array<{
  id: number;
  platform: string;
  source: string;
  amount: number;
  status: string;
  gapAmount: number | null;
  verifiedAt: Date | null;
  notes: string | null;
}>> {
  const records = await db.select({
    id: revenueRecords.id,
    platform: revenueRecords.platform,
    source: revenueRecords.source,
    amount: revenueRecords.amount,
    status: revenueRecords.reconciliationStatus,
    gapAmount: revenueRecords.reconciliationGapAmount,
    verifiedAt: revenueRecords.reconciliationVerifiedAt,
    notes: revenueRecords.reconciliationNotes,
  })
    .from(revenueRecords)
    .where(and(
      eq(revenueRecords.userId, userId),
      ne(revenueRecords.reconciliationStatus, "unverified"),
    ))
    .orderBy(desc(revenueRecords.reconciliationVerifiedAt))
    .limit(limit);

  return records.map(r => ({
    ...r,
    status: r.status || "unverified",
  }));
}

export async function routeUnresolvedToActionQueue(
  userId: string,
  unresolvedGaps: Array<{ recordId: number; platform: string; source: string; amount: number; gapAmount: number }>
): Promise<number> {
  let created = 0;
  for (const gap of unresolvedGaps) {
    const existing = await db.select().from(reconciliationActions)
      .where(and(
        eq(reconciliationActions.userId, userId),
        eq(reconciliationActions.revenueRecordId, gap.recordId),
        eq(reconciliationActions.status, "pending"),
      ))
      .limit(1);

    if (existing.length === 0) {
      await db.insert(reconciliationActions).values({
        userId,
        revenueRecordId: gap.recordId,
        actionType: "review_gap",
        priority: Math.abs(gap.gapAmount) > 500 ? "high" : "medium",
        status: "pending",
        description: `Review ${gap.platform} ${gap.source} record #${gap.recordId}: gap of $${Math.abs(gap.gapAmount).toFixed(2)}`,
        platform: gap.platform,
        amount: gap.amount,
        gapAmount: gap.gapAmount,
        metadata: { source: gap.source },
      });
      created++;
    }
  }
  return created;
}

export async function getActionQueue(
  userId: string,
  status?: string
): Promise<Array<{
  id: number;
  actionType: string;
  priority: string;
  status: string;
  description: string;
  platform: string | null;
  amount: number | null;
  gapAmount: number | null;
  createdAt: Date | null;
}>> {
  const conditions = [eq(reconciliationActions.userId, userId)];
  if (status) conditions.push(eq(reconciliationActions.status, status));

  return db.select().from(reconciliationActions)
    .where(and(...conditions))
    .orderBy(desc(reconciliationActions.createdAt))
    .limit(50);
}

export async function resolveAction(
  userId: string,
  actionId: number,
  resolution: string
): Promise<boolean> {
  const result = await db.update(reconciliationActions)
    .set({
      status: "resolved",
      resolution,
      resolvedAt: new Date(),
      resolvedBy: userId,
    })
    .where(and(
      eq(reconciliationActions.id, actionId),
      eq(reconciliationActions.userId, userId),
    ))
    .returning();
  return result.length > 0;
}

export async function storeReconciliationReport(
  userId: string,
  period: string,
  reportData: Record<string, unknown>
): Promise<number> {
  const [report] = await db.insert(reconciliationReports).values({
    userId,
    period,
    reportData,
  }).returning();
  return report.id;
}

export async function getStoredReports(
  userId: string,
  limit: number = 12
): Promise<Array<{ id: number; period: string; generatedAt: Date | null; reportData: Record<string, unknown> }>> {
  return db.select().from(reconciliationReports)
    .where(eq(reconciliationReports.userId, userId))
    .orderBy(desc(reconciliationReports.generatedAt))
    .limit(limit);
}

export async function runMonthlyReconciliation(userId: string): Promise<{
  report: ReconciliationReport;
  reportId: number;
  actionsCreated: number;
}> {
  const now = new Date();
  const prevMonth = new Date(now.getFullYear(), now.getMonth() - 1, 1);
  const period = `${prevMonth.getFullYear()}-${String(prevMonth.getMonth() + 1).padStart(2, "0")}`;

  await reconcileRevenueRecords(userId, {
    startDate: prevMonth,
    endDate: new Date(now.getFullYear(), now.getMonth(), 1),
  });

  await flagDelayedReconciliation(userId, 30);

  const report = await generateReconciliationReport(userId, period);

  const reportPayload: Record<string, unknown> = {
    period: report.period,
    generatedAt: report.generatedAt,
    totalRecords: report.totalRecords,
    verifiedRecords: report.verifiedRecords,
    estimatedRecords: report.estimatedRecords,
    disputedRecords: report.disputedRecords,
    delayedRecords: report.delayedRecords,
    unresolvedRecords: report.unresolvedRecords,
    totalVerifiedAmount: report.totalVerifiedAmount,
    totalEstimatedAmount: report.totalEstimatedAmount,
    totalGapAmount: report.totalGapAmount,
    variancePercent: report.variancePercent,
    unresolvedGaps: report.unresolvedGaps,
    needsHumanAction: report.needsHumanAction,
    humanActionItems: report.humanActionItems,
    platformBreakdown: report.platformBreakdown,
  };
  const reportId = await storeReconciliationReport(userId, period, reportPayload);

  let actionsCreated = 0;
  if (report.unresolvedGaps.length > 0) {
    actionsCreated = await routeUnresolvedToActionQueue(userId, report.unresolvedGaps);
  }

  for (const item of report.humanActionItems) {
    const isVarianceItem = item.includes("Overall revenue variance");
    if (isVarianceItem) {
      await db.insert(reconciliationActions).values({
        userId,
        actionType: "review_variance",
        priority: "high",
        status: "pending",
        description: item,
        metadata: { source: "monthly_reconciliation", period },
      });
      actionsCreated++;
    }
  }

  return { report, reportId, actionsCreated };
}
