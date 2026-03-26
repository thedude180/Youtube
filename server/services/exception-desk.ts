import { db } from "../db";
import { exceptionDeskItems } from "@shared/schema";
import { eq, and, desc, sql, count, inArray } from "drizzle-orm";
import { createLogger } from "../lib/logger";

const logger = createLogger("exception-desk");

export type ExceptionSeverity = "critical" | "high" | "medium" | "low";
export type ExceptionStatus = "open" | "acknowledged" | "resolved" | "auto-resolved";
export type ExceptionCategory =
  | "dlq_failure"
  | "compliance_block"
  | "trust_violation"
  | "approval_denial"
  | "anomaly_detection"
  | "system_health"
  | "prompt_toxicity"
  | "prompt_drift"
  | "trust_decline"
  | "pipeline_failure"
  | "general";

export interface CreateExceptionInput {
  severity: ExceptionSeverity;
  category: ExceptionCategory | string;
  source: string;
  sourceId?: string;
  title: string;
  description: string;
  suggestedResolution?: string;
  userId?: string;
  metadata?: Record<string, unknown>;
}

export async function createException(input: CreateExceptionInput): Promise<typeof exceptionDeskItems.$inferSelect> {
  const [item] = await db.insert(exceptionDeskItems).values({
    severity: input.severity,
    category: input.category,
    source: input.source,
    sourceId: input.sourceId || null,
    title: input.title,
    description: input.description,
    suggestedResolution: input.suggestedResolution || null,
    status: "open",
    userId: input.userId || null,
    metadata: input.metadata || {},
  }).returning();

  logger.info("Exception created", { id: item.id, severity: input.severity, category: input.category, source: input.source });

  return item;
}

export async function getExceptions(filters?: {
  status?: ExceptionStatus;
  severity?: ExceptionSeverity;
  category?: string;
  source?: string;
  userId?: string;
  limit?: number;
  offset?: number;
}): Promise<typeof exceptionDeskItems.$inferSelect[]> {
  const conditions = [];
  if (filters?.status) conditions.push(eq(exceptionDeskItems.status, filters.status));
  if (filters?.severity) conditions.push(eq(exceptionDeskItems.severity, filters.severity));
  if (filters?.category) conditions.push(eq(exceptionDeskItems.category, filters.category));
  if (filters?.source) conditions.push(eq(exceptionDeskItems.source, filters.source));
  if (filters?.userId) conditions.push(eq(exceptionDeskItems.userId, filters.userId));

  const query = db.select().from(exceptionDeskItems)
    .orderBy(desc(exceptionDeskItems.createdAt))
    .limit(filters?.limit || 50)
    .offset(filters?.offset || 0);

  if (conditions.length > 0) {
    return query.where(conditions.length === 1 ? conditions[0] : and(...conditions));
  }

  return query;
}

export async function getExceptionById(id: number): Promise<typeof exceptionDeskItems.$inferSelect | null> {
  const [item] = await db.select().from(exceptionDeskItems)
    .where(eq(exceptionDeskItems.id, id))
    .limit(1);
  return item || null;
}

export async function acknowledgeException(id: number, assignee?: string): Promise<boolean> {
  const existing = await getExceptionById(id);
  if (!existing) return false;

  await db.update(exceptionDeskItems)
    .set({
      status: "acknowledged",
      assignee: assignee || existing.assignee,
      acknowledgedAt: new Date(),
      updatedAt: new Date(),
    })
    .where(eq(exceptionDeskItems.id, id));
  return true;
}

export async function resolveException(id: number, resolution?: string): Promise<boolean> {
  const existing = await getExceptionById(id);
  if (!existing) return false;

  await db.update(exceptionDeskItems)
    .set({
      status: "resolved",
      suggestedResolution: resolution || existing.suggestedResolution,
      resolvedAt: new Date(),
      updatedAt: new Date(),
    })
    .where(eq(exceptionDeskItems.id, id));
  return true;
}

export async function autoResolveException(id: number, resolution: string): Promise<boolean> {
  const existing = await getExceptionById(id);
  if (!existing) return false;

  await db.update(exceptionDeskItems)
    .set({
      status: "auto-resolved",
      suggestedResolution: resolution,
      resolvedAt: new Date(),
      updatedAt: new Date(),
    })
    .where(eq(exceptionDeskItems.id, id));

  logger.info("Exception auto-resolved", { id, resolution: resolution.slice(0, 100) });
  return true;
}

export async function getExceptionStats(): Promise<{
  total: number;
  open: number;
  acknowledged: number;
  resolved: number;
  autoResolved: number;
  bySeverity: Record<string, number>;
  byCategory: Record<string, number>;
  bySource: Record<string, number>;
}> {
  const statusCounts = await db
    .select({ status: exceptionDeskItems.status, cnt: count() })
    .from(exceptionDeskItems)
    .groupBy(exceptionDeskItems.status);

  const severityCounts = await db
    .select({ severity: exceptionDeskItems.severity, cnt: count() })
    .from(exceptionDeskItems)
    .groupBy(exceptionDeskItems.severity);

  const categoryCounts = await db
    .select({ category: exceptionDeskItems.category, cnt: count() })
    .from(exceptionDeskItems)
    .groupBy(exceptionDeskItems.category);

  const sourceCounts = await db
    .select({ source: exceptionDeskItems.source, cnt: count() })
    .from(exceptionDeskItems)
    .groupBy(exceptionDeskItems.source);

  let open = 0, acknowledged = 0, resolved = 0, autoResolved = 0, total = 0;
  for (const row of statusCounts) {
    const c = Number(row.cnt);
    total += c;
    if (row.status === "open") open = c;
    else if (row.status === "acknowledged") acknowledged = c;
    else if (row.status === "resolved") resolved = c;
    else if (row.status === "auto-resolved") autoResolved = c;
  }

  const bySeverity: Record<string, number> = {};
  for (const row of severityCounts) bySeverity[row.severity] = Number(row.cnt);

  const byCategory: Record<string, number> = {};
  for (const row of categoryCounts) byCategory[row.category] = Number(row.cnt);

  const bySource: Record<string, number> = {};
  for (const row of sourceCounts) bySource[row.source] = Number(row.cnt);

  return { total, open, acknowledged, resolved, autoResolved, bySeverity, byCategory, bySource };
}

export async function bulkResolve(ids: number[], resolution: string): Promise<number> {
  if (ids.length === 0) return 0;
  const result = await db.update(exceptionDeskItems)
    .set({
      status: "resolved",
      suggestedResolution: resolution,
      resolvedAt: new Date(),
      updatedAt: new Date(),
    })
    .where(inArray(exceptionDeskItems.id, ids));
  return ids.length;
}

export async function feedDlqToExceptionDesk(dlqItem: {
  id: number;
  jobType: string;
  error: string;
  userId?: string | null;
  priority?: number | null;
  payload?: Record<string, unknown>;
}): Promise<typeof exceptionDeskItems.$inferSelect> {
  const severity: ExceptionSeverity =
    (dlqItem.priority ?? 5) <= 1 ? "critical"
    : (dlqItem.priority ?? 5) <= 3 ? "high"
    : (dlqItem.priority ?? 5) <= 5 ? "medium"
    : "low";

  return createException({
    severity,
    category: "dlq_failure",
    source: "dead_letter_queue",
    sourceId: `dlq:${dlqItem.id}`,
    title: `DLQ: ${dlqItem.jobType} failed`,
    description: dlqItem.error.slice(0, 500),
    suggestedResolution: `Retry or investigate the failed ${dlqItem.jobType} job (DLQ #${dlqItem.id})`,
    userId: dlqItem.userId || undefined,
    metadata: { dlqId: dlqItem.id, jobType: dlqItem.jobType, payload: dlqItem.payload },
  });
}

export async function feedAnomalyToExceptionDesk(anomaly: {
  type: string;
  description: string;
  userId?: string;
  risk: string;
  recurring?: boolean;
  occurrenceCount?: number;
}): Promise<typeof exceptionDeskItems.$inferSelect> {
  const severity: ExceptionSeverity =
    anomaly.risk === "high" ? "critical"
    : anomaly.risk === "medium" ? "high"
    : "medium";

  return createException({
    severity: anomaly.recurring ? "critical" : severity,
    category: "anomaly_detection",
    source: "anomaly_responder",
    title: `Anomaly: ${anomaly.type}`,
    description: anomaly.description.slice(0, 500),
    suggestedResolution: anomaly.recurring
      ? `Recurring anomaly (${anomaly.occurrenceCount || 0}x) — investigate root cause`
      : "Review anomaly details and take corrective action if needed",
    userId: anomaly.userId,
    metadata: { anomalyType: anomaly.type, risk: anomaly.risk, recurring: anomaly.recurring, occurrenceCount: anomaly.occurrenceCount },
  });
}

export async function feedSystemHealthToExceptionDesk(signal: {
  source: string;
  issue: string;
  severity: ExceptionSeverity;
  details?: Record<string, unknown>;
}): Promise<typeof exceptionDeskItems.$inferSelect> {
  return createException({
    severity: signal.severity,
    category: "system_health",
    source: signal.source,
    title: `System Health: ${signal.issue}`,
    description: signal.issue,
    suggestedResolution: "Review system health metrics and investigate the root cause",
    metadata: signal.details,
  });
}

export async function feedTrustDeclineToExceptionDesk(alert: {
  userId: string;
  platform: string;
  currentScore: number;
  threshold: number;
  decline: number;
}): Promise<typeof exceptionDeskItems.$inferSelect> {
  const severity: ExceptionSeverity =
    alert.currentScore < alert.threshold * 0.5 ? "critical"
    : alert.currentScore < alert.threshold * 0.75 ? "high"
    : "medium";

  return createException({
    severity,
    category: "trust_decline",
    source: "trust_monitor",
    title: `Trust Decline: ${alert.platform} score dropped to ${alert.currentScore}`,
    description: `Audience trust on ${alert.platform} dropped by ${alert.decline} points to ${alert.currentScore} (threshold: ${alert.threshold})`,
    suggestedResolution: "Review recent content and engagement metrics to identify the cause of trust decline",
    userId: alert.userId,
    metadata: { platform: alert.platform, currentScore: alert.currentScore, threshold: alert.threshold, decline: alert.decline },
  });
}

export async function feedPromptToxicityToExceptionDesk(detection: {
  outputText: string;
  toxicityScore: number;
  categories: string[];
  model: string;
  promptContext?: string;
}): Promise<typeof exceptionDeskItems.$inferSelect> {
  const severity: ExceptionSeverity =
    detection.toxicityScore >= 0.9 ? "critical"
    : detection.toxicityScore >= 0.7 ? "high"
    : "medium";

  return createException({
    severity,
    category: "prompt_toxicity",
    source: "prompt_toxicity_monitor",
    title: `Toxic AI Output Detected (score: ${detection.toxicityScore.toFixed(2)})`,
    description: `AI model ${detection.model} produced output flagged for: ${detection.categories.join(", ")}. Preview: ${detection.outputText.slice(0, 200)}`,
    suggestedResolution: "Review AI output, adjust prompts or add guardrails to prevent toxic content generation",
    metadata: { toxicityScore: detection.toxicityScore, categories: detection.categories, model: detection.model, promptContext: detection.promptContext },
  });
}

export async function feedPromptDriftToExceptionDesk(detection: {
  model: string;
  driftScore: number;
  expectedPattern: string;
  actualPattern: string;
  context?: string;
}): Promise<typeof exceptionDeskItems.$inferSelect> {
  const severity: ExceptionSeverity =
    detection.driftScore >= 0.8 ? "high"
    : detection.driftScore >= 0.5 ? "medium"
    : "low";

  return createException({
    severity,
    category: "prompt_drift",
    source: "prompt_toxicity_monitor",
    title: `Prompt Drift Detected (score: ${detection.driftScore.toFixed(2)})`,
    description: `AI model ${detection.model} output drifted from expected pattern. Expected: ${detection.expectedPattern.slice(0, 100)}, Actual: ${detection.actualPattern.slice(0, 100)}`,
    suggestedResolution: "Review prompt templates and model configuration; consider re-calibrating prompt instructions",
    metadata: { driftScore: detection.driftScore, model: detection.model, expectedPattern: detection.expectedPattern, actualPattern: detection.actualPattern },
  });
}
