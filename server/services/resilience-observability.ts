import crypto from "crypto";
import { db } from "../db";
import {
  signedActionReceipts,
  featureSunsetRecords,
  capabilityDegradationPlaybooks,
  playbookActivationEvents,
  domainEvents,
  securityEvents,
} from "@shared/schema";
import { eq, and, desc, sql, lte } from "drizzle-orm";
import { createLogger } from "../lib/logger";

const logger = createLogger("resilience-observability");

function getHmacSecretForVerification(): string {
  const secret = process.env.KERNEL_HMAC_SECRET || process.env.SESSION_SECRET;
  if (!secret) {
    throw new Error("KERNEL_HMAC_SECRET or SESSION_SECRET must be set for receipt verification");
  }
  return secret;
}

export interface SafeModeState {
  global: boolean;
  engines: Record<string, boolean>;
  enteredAt: number | null;
  reason: string | null;
  autoRecoveryEnabled: boolean;
}

const safeModeState: SafeModeState = {
  global: false,
  engines: {},
  enteredAt: null,
  reason: null,
  autoRecoveryEnabled: true,
};

const SAFE_MODE_THRESHOLDS = {
  errorRatePerMinute: 20,
  failedJobsPercent: 50,
  memoryUsagePercent: 90,
};

export function getSafeModeState(): SafeModeState {
  return { ...safeModeState, engines: { ...safeModeState.engines } };
}

export function enterSafeMode(reason: string, engine?: string): { activated: boolean; scope: string } {
  if (engine) {
    safeModeState.engines[engine] = true;
    logger.warn(`Safe mode ENTERED for engine: ${engine} — ${reason}`);
    return { activated: true, scope: `engine:${engine}` };
  }
  safeModeState.global = true;
  safeModeState.enteredAt = Date.now();
  safeModeState.reason = reason;
  logger.warn(`GLOBAL safe mode ENTERED — ${reason}`);
  return { activated: true, scope: "global" };
}

export function exitSafeMode(engine?: string): { deactivated: boolean; scope: string } {
  if (engine) {
    const was = safeModeState.engines[engine] ?? false;
    delete safeModeState.engines[engine];
    logger.info(`Safe mode EXITED for engine: ${engine}`);
    return { deactivated: was, scope: `engine:${engine}` };
  }
  const was = safeModeState.global;
  safeModeState.global = false;
  safeModeState.enteredAt = null;
  safeModeState.reason = null;
  Object.keys(safeModeState.engines).forEach((k) => delete safeModeState.engines[k]);
  logger.info("GLOBAL safe mode EXITED");
  return { deactivated: was, scope: "global" };
}

export function isInSafeMode(engine?: string): boolean {
  if (safeModeState.global) return true;
  if (engine) return safeModeState.engines[engine] ?? false;
  return false;
}

export function checkAutoSafeModeEntry(signals: {
  errorRate?: number;
  failedJobsPercent?: number;
  memoryUsagePercent?: number;
}): { triggered: boolean; reason: string | null } {
  if (safeModeState.global) return { triggered: false, reason: null };

  if (signals.errorRate && signals.errorRate > SAFE_MODE_THRESHOLDS.errorRatePerMinute) {
    const reason = `Error rate ${signals.errorRate}/min exceeds threshold ${SAFE_MODE_THRESHOLDS.errorRatePerMinute}`;
    enterSafeMode(reason);
    return { triggered: true, reason };
  }
  if (signals.failedJobsPercent && signals.failedJobsPercent > SAFE_MODE_THRESHOLDS.failedJobsPercent) {
    const reason = `Failed jobs ${signals.failedJobsPercent}% exceeds threshold ${SAFE_MODE_THRESHOLDS.failedJobsPercent}%`;
    enterSafeMode(reason);
    return { triggered: true, reason };
  }
  if (signals.memoryUsagePercent && signals.memoryUsagePercent > SAFE_MODE_THRESHOLDS.memoryUsagePercent) {
    const reason = `Memory usage ${signals.memoryUsagePercent}% exceeds threshold ${SAFE_MODE_THRESHOLDS.memoryUsagePercent}%`;
    enterSafeMode(reason);
    return { triggered: true, reason };
  }
  return { triggered: false, reason: null };
}

export function checkAutoSafeModeExit(signals: {
  errorRate?: number;
  failedJobsPercent?: number;
  memoryUsagePercent?: number;
}): { recovered: boolean } {
  if (!safeModeState.global || !safeModeState.autoRecoveryEnabled) return { recovered: false };

  const belowError = !signals.errorRate || signals.errorRate < SAFE_MODE_THRESHOLDS.errorRatePerMinute * 0.5;
  const belowJobs = !signals.failedJobsPercent || signals.failedJobsPercent < SAFE_MODE_THRESHOLDS.failedJobsPercent * 0.5;
  const belowMem = !signals.memoryUsagePercent || signals.memoryUsagePercent < SAFE_MODE_THRESHOLDS.memoryUsagePercent * 0.8;

  if (belowError && belowJobs && belowMem) {
    exitSafeMode();
    logger.info("Auto-recovery: safe mode exited due to improved conditions");
    return { recovered: true };
  }
  return { recovered: false };
}

export async function executeRollback(receiptId: number, userId: string, reason: string, isAdmin: boolean = false): Promise<{
  success: boolean;
  error?: string;
  receiptId?: number;
  approvalDecision?: string;
}> {
  try {
    const whereClause = isAdmin
      ? eq(signedActionReceipts.id, receiptId)
      : and(eq(signedActionReceipts.id, receiptId), eq(signedActionReceipts.userId, userId));

    const [receipt] = await db
      .select()
      .from(signedActionReceipts)
      .where(whereClause)
      .limit(1);

    if (!receipt) return { success: false, error: "Receipt not found or access denied" };
    if (!receipt.rollbackAvailable) return { success: false, error: "Rollback not available for this action" };
    if (receipt.status === "rolled_back") return { success: false, error: "Action already rolled back" };

    const { evaluateApproval } = await import("./trust-governance");
    const approval = await evaluateApproval(userId, receipt.actionType, 1.0);
    if (approval.decision !== "approved" && !isAdmin) {
      logger.warn(`Rollback for receipt ${receiptId} blocked by approval matrix for ${receipt.actionType}: ${approval.reason}`);
      return { success: false, error: `Rollback requires approval for ${receipt.actionType}: ${approval.reason}`, approvalDecision: approval.decision };
    }

    const effectiveDecision = isAdmin && approval.decision !== "approved" ? "admin-override" : approval.decision;

    await db
      .update(signedActionReceipts)
      .set({
        status: "rolled_back",
        rollbackMetadata: {
          ...((receipt.rollbackMetadata as Record<string, unknown>) || {}),
          rolledBackAt: Date.now(),
          rolledBackBy: userId,
          reason,
          approvalDecision: effectiveDecision,
          approvalRuleId: approval.ruleId,
          adminOverride: isAdmin && approval.decision !== "approved",
        },
      })
      .where(eq(signedActionReceipts.id, receiptId));

    return { success: true, receiptId, approvalDecision: effectiveDecision };
  } catch (err: any) {
    logger.error(`Rollback failed for receipt ${receiptId}: ${err.message}`);
    return { success: false, error: err.message };
  }
}

export interface BlastRadiusLimits {
  maxItems: number;
  maxExecutionMs: number;
  maxApiCalls: number;
}

const DEFAULT_BLAST_RADIUS: BlastRadiusLimits = {
  maxItems: 50,
  maxExecutionMs: 30_000,
  maxApiCalls: 100,
};

export class BlastRadiusLimiter {
  private limits: BlastRadiusLimits;

  constructor(limits?: Partial<BlastRadiusLimits>) {
    this.limits = { ...DEFAULT_BLAST_RADIUS, ...limits };
  }

  getLimits(): BlastRadiusLimits {
    return { ...this.limits };
  }

  createExecutionContext(): BlastRadiusContext {
    return new BlastRadiusContext(this.limits);
  }
}

export class BlastRadiusContext {
  private limits: BlastRadiusLimits;
  private itemsProcessed = 0;
  private apiCallsMade = 0;
  private startTime = Date.now();
  private aborted = false;
  private abortReason: string | null = null;

  constructor(limits: BlastRadiusLimits) {
    this.limits = { ...limits };
  }

  recordItem(): { allowed: boolean; reason?: string } {
    if (this.aborted) return { allowed: false, reason: this.abortReason || "Aborted" };
    this.itemsProcessed++;
    if (this.itemsProcessed > this.limits.maxItems) {
      this.aborted = true;
      this.abortReason = `Max items exceeded: ${this.itemsProcessed}/${this.limits.maxItems}`;
      return { allowed: false, reason: this.abortReason };
    }
    return { allowed: true };
  }

  recordApiCall(): { allowed: boolean; reason?: string } {
    if (this.aborted) return { allowed: false, reason: this.abortReason || "Aborted" };
    this.apiCallsMade++;
    if (this.apiCallsMade > this.limits.maxApiCalls) {
      this.aborted = true;
      this.abortReason = `Max API calls exceeded: ${this.apiCallsMade}/${this.limits.maxApiCalls}`;
      return { allowed: false, reason: this.abortReason };
    }
    return { allowed: true };
  }

  checkTime(): { allowed: boolean; reason?: string } {
    if (this.aborted) return { allowed: false, reason: this.abortReason || "Aborted" };
    const elapsed = Date.now() - this.startTime;
    if (elapsed > this.limits.maxExecutionMs) {
      this.aborted = true;
      this.abortReason = `Max execution time exceeded: ${elapsed}ms/${this.limits.maxExecutionMs}ms`;
      return { allowed: false, reason: this.abortReason };
    }
    return { allowed: true };
  }

  getStatus(): {
    itemsProcessed: number;
    apiCallsMade: number;
    elapsedMs: number;
    aborted: boolean;
    abortReason: string | null;
  } {
    return {
      itemsProcessed: this.itemsProcessed,
      apiCallsMade: this.apiCallsMade,
      elapsedMs: Date.now() - this.startTime,
      aborted: this.aborted,
      abortReason: this.abortReason,
    };
  }
}

export const defaultBlastRadiusLimiter = new BlastRadiusLimiter();

export function createBlastRadiusLimiter(limits: Partial<BlastRadiusLimits>): BlastRadiusLimiter {
  return new BlastRadiusLimiter(limits);
}

export interface HealingValidationResult {
  healed: boolean;
  attempt: number;
  maxAttempts: number;
  escalated: boolean;
  error?: string;
}

export async function validateHealing(
  issueId: string,
  checkFn: () => Promise<boolean>,
  options: { maxAttempts?: number; baseDelayMs?: number } = {}
): Promise<HealingValidationResult> {
  const maxAttempts = options.maxAttempts ?? 3;
  const baseDelayMs = options.baseDelayMs ?? 500;

  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    try {
      const resolved = await checkFn();
      if (resolved) {
        logger.info(`Healing validated for issue ${issueId} on attempt ${attempt}`);
        return { healed: true, attempt, maxAttempts, escalated: false };
      }
    } catch (err: any) {
      logger.warn(`Healing check attempt ${attempt} failed for ${issueId}: ${err.message}`);
    }

    if (attempt < maxAttempts) {
      const delay = baseDelayMs * Math.pow(2, attempt - 1);
      await new Promise((r) => setTimeout(r, delay));
    }
  }

  logger.error(`Healing FAILED for ${issueId} after ${maxAttempts} attempts — escalating`);
  try {
    const { createException } = await import("./exception-desk");
    await createException({
      severity: "high",
      category: "self_healing_failure",
      source: "healing_validation",
      title: `Self-healing failed: ${issueId}`,
      description: `Issue ${issueId} not resolved after ${maxAttempts} healing attempts`,
      metadata: { issueId, maxAttempts },
    });
  } catch {}
  return { healed: false, attempt: maxAttempts, maxAttempts, escalated: true };
}

let correlationIdCounter = 0;

export function generateCorrelationId(): string {
  correlationIdCounter++;
  return `cid-${Date.now()}-${correlationIdCounter}-${crypto.randomBytes(4).toString("hex")}`;
}

const correlationStore = new Map<string, { parentId?: string; metadata: Record<string, any>; createdAt: number }>();

export function startCorrelation(
  correlationId: string,
  metadata: Record<string, any> = {},
  parentId?: string
): void {
  correlationStore.set(correlationId, { parentId, metadata, createdAt: Date.now() });
  if (correlationStore.size > 5000) {
    const oldest = [...correlationStore.entries()].sort((a, b) => a[1].createdAt - b[1].createdAt);
    for (let i = 0; i < 1000; i++) correlationStore.delete(oldest[i][0]);
  }
}

export function getCorrelation(correlationId: string) {
  return correlationStore.get(correlationId) ?? null;
}

export function endCorrelation(correlationId: string): void {
  correlationStore.delete(correlationId);
}

export function getActiveCorrelationCount(): number {
  return correlationStore.size;
}

interface PerfMetric {
  name: string;
  value: number;
  unit: string;
  timestamp: number;
  tags: Record<string, string>;
}

const metricsBuffer: PerfMetric[] = [];
const MAX_METRICS = 2000;

export function recordMetric(name: string, value: number, unit: string, tags: Record<string, string> = {}): void {
  metricsBuffer.push({ name, value, unit, timestamp: Date.now(), tags });
  if (metricsBuffer.length > MAX_METRICS) metricsBuffer.splice(0, metricsBuffer.length - MAX_METRICS);
}

export function getMetrics(name?: string, since?: number): PerfMetric[] {
  let results = [...metricsBuffer];
  if (name) results = results.filter((m) => m.name === name);
  if (since) results = results.filter((m) => m.timestamp >= since);
  return results;
}

export function getMetricsSummary(): Record<string, { count: number; avg: number; min: number; max: number; unit: string }> {
  const grouped: Record<string, PerfMetric[]> = {};
  for (const m of metricsBuffer) {
    if (!grouped[m.name]) grouped[m.name] = [];
    grouped[m.name].push(m);
  }
  const summary: Record<string, { count: number; avg: number; min: number; max: number; unit: string }> = {};
  for (const [name, metrics] of Object.entries(grouped)) {
    const values = metrics.map((m) => m.value);
    summary[name] = {
      count: values.length,
      avg: values.reduce((a, b) => a + b, 0) / values.length,
      min: Math.min(...values),
      max: Math.max(...values),
      unit: metrics[0].unit,
    };
  }
  return summary;
}

export interface DependencyHealthStatus {
  name: string;
  status: "healthy" | "degraded" | "down" | "unknown";
  lastCheckedAt: number;
  latencyMs: number | null;
  error: string | null;
}

const dependencyHealthMap = new Map<string, DependencyHealthStatus>();

const CRITICAL_DEPENDENCIES = ["openai", "anthropic", "youtube_api", "stripe", "postgresql", "gmail"];

export function updateDependencyHealth(name: string, status: DependencyHealthStatus["status"], latencyMs?: number, error?: string): void {
  dependencyHealthMap.set(name, {
    name,
    status,
    lastCheckedAt: Date.now(),
    latencyMs: latencyMs ?? null,
    error: error ?? null,
  });
}

export function getDependencyHealth(name?: string): DependencyHealthStatus[] {
  if (name) {
    const entry = dependencyHealthMap.get(name);
    return entry ? [entry] : [];
  }
  return [...dependencyHealthMap.values()];
}

export function getAllDependencyHealth(): Record<string, DependencyHealthStatus> {
  const result: Record<string, DependencyHealthStatus> = {};
  for (const dep of CRITICAL_DEPENDENCIES) {
    result[dep] = dependencyHealthMap.get(dep) || {
      name: dep,
      status: "unknown",
      lastCheckedAt: 0,
      latencyMs: null,
      error: null,
    };
  }
  return result;
}

export function verifyReceiptIntegrity(receipt: {
  userId: string;
  actionType: string;
  executionKey: string;
  payload: Record<string, any>;
  result: Record<string, any>;
  hmacSignature: string;
}): { valid: boolean; tampered: boolean } {
  const sigData = JSON.stringify({
    userId: receipt.userId,
    actionType: receipt.actionType,
    executionKey: receipt.executionKey,
    payload: receipt.payload,
    result: receipt.result,
  });
  try {
    const secret = getHmacSecretForVerification();
    const expected = crypto.createHmac("sha256", secret).update(sigData).digest("hex");
    const valid = crypto.timingSafeEqual(Buffer.from(receipt.hmacSignature, "hex"), Buffer.from(expected, "hex"));
    return { valid, tampered: !valid };
  } catch (err: any) {
    logger.error(`Receipt integrity check failed: ${err.message}`);
    return { valid: false, tampered: true };
  }
}

export async function verifyReceiptChainIntegrity(userId: string, limit: number = 50): Promise<{
  total: number;
  valid: number;
  tampered: number;
  results: Array<{ receiptId: number; valid: boolean }>;
}> {
  const receipts = await db
    .select()
    .from(signedActionReceipts)
    .where(eq(signedActionReceipts.userId, userId))
    .orderBy(desc(signedActionReceipts.createdAt))
    .limit(limit);

  let validCount = 0;
  let tamperedCount = 0;
  const results: Array<{ receiptId: number; valid: boolean }> = [];

  for (const r of receipts) {
    const check = verifyReceiptIntegrity({
      userId: r.userId,
      actionType: r.actionType,
      executionKey: r.executionKey,
      payload: (r.payload as Record<string, any>) || {},
      result: (r.result as Record<string, any>) || {},
      hmacSignature: r.hmacSignature,
    });
    if (check.valid) validCount++;
    else tamperedCount++;
    results.push({ receiptId: r.id, valid: check.valid });
  }

  return { total: receipts.length, valid: validCount, tampered: tamperedCount, results };
}

export async function initiateFeatureSunset(
  featureKey: string,
  reason: string,
  migrationPath?: string,
  gracePeriodDays: number = 30
): Promise<number> {
  const sunsetDate = new Date(Date.now() + gracePeriodDays * 24 * 60 * 60 * 1000);
  const [record] = await db
    .insert(featureSunsetRecords)
    .values({
      featureKey,
      sunsetReason: reason,
      sunsetPhase: "announced",
      announcedAt: new Date(),
      migrationPath: migrationPath || null,
      metadata: { gracePeriodDays, sunsetDate: sunsetDate.toISOString(), usageCount: 0 },
    })
    .returning({ id: featureSunsetRecords.id });
  logger.info(`Feature sunset initiated: ${featureKey} — grace period ${gracePeriodDays} days`);
  return record.id;
}

export async function advanceFeatureSunset(featureKey: string): Promise<{
  success: boolean;
  newPhase: string;
  error?: string;
}> {
  const [record] = await db
    .select()
    .from(featureSunsetRecords)
    .where(eq(featureSunsetRecords.featureKey, featureKey))
    .orderBy(desc(featureSunsetRecords.createdAt))
    .limit(1);

  if (!record) return { success: false, newPhase: "", error: "Feature sunset record not found" };

  const phaseOrder = ["announced", "deprecated", "disabled", "removed"];
  const currentIdx = phaseOrder.indexOf(record.sunsetPhase);
  if (currentIdx < 0 || currentIdx >= phaseOrder.length - 1) {
    return { success: false, newPhase: record.sunsetPhase, error: "Already at final phase" };
  }

  const newPhase = phaseOrder[currentIdx + 1];
  const updates: Record<string, any> = { sunsetPhase: newPhase };
  if (newPhase === "deprecated") updates.deprecatedAt = new Date();
  if (newPhase === "removed") updates.removedAt = new Date();

  await db.update(featureSunsetRecords).set(updates).where(eq(featureSunsetRecords.id, record.id));
  logger.info(`Feature sunset advanced: ${featureKey} → ${newPhase}`);
  return { success: true, newPhase };
}

export async function getFeatureSunsetStatus(featureKey?: string): Promise<any[]> {
  if (featureKey) {
    return db
      .select()
      .from(featureSunsetRecords)
      .where(eq(featureSunsetRecords.featureKey, featureKey))
      .orderBy(desc(featureSunsetRecords.createdAt))
      .limit(1);
  }
  return db.select().from(featureSunsetRecords).orderBy(desc(featureSunsetRecords.createdAt)).limit(50);
}

export async function processAutoSunsets(): Promise<{ processed: number; disabled: number }> {
  const now = new Date();
  const records = await db
    .select()
    .from(featureSunsetRecords)
    .where(eq(featureSunsetRecords.sunsetPhase, "deprecated"));

  let disabled = 0;
  for (const record of records) {
    const meta = (record.metadata as any) || {};
    if (meta.sunsetDate && new Date(meta.sunsetDate) <= now) {
      await db
        .update(featureSunsetRecords)
        .set({ sunsetPhase: "disabled" })
        .where(eq(featureSunsetRecords.id, record.id));
      disabled++;
      logger.info(`Auto-sunset: feature ${record.featureKey} disabled after grace period`);
    }
  }
  return { processed: records.length, disabled };
}

export function trackFeatureUsage(featureKey: string): void {
  recordMetric(`feature_usage.${featureKey}`, 1, "count", { feature: featureKey });
}

const FULL_PLAYBOOK_SEEDS = [
  {
    capabilityName: "openai",
    degradationLevel: "api_degraded",
    playbookName: "OpenAI API Degradation",
    steps: [
      { order: 1, action: "detect", description: "Monitor OpenAI API response latency and error rates" },
      { order: 2, action: "contain", description: "Switch to cached AI responses where available" },
      { order: 3, action: "fallback", description: "Route requests to Anthropic fallback if configured" },
      { order: 4, action: "pause_automations", description: "Pause AI-dependent automations (smart-edit, content-ideas)" },
      { order: 5, action: "safe_mode", description: "Continue with manual-only content operations" },
      { order: 6, action: "notify_user", description: "Surface AI degradation in System Pulse HUD" },
      { order: 7, action: "recover", description: "Resume when OpenAI latency returns below 3s for 5 minutes" },
      { order: 8, action: "verify", description: "Run one AI call end-to-end to confirm recovery" },
      { order: 9, action: "audit", description: "Log playbook activation and recovery as domain events" },
    ],
    autoActivate: true,
  },
  {
    capabilityName: "anthropic",
    degradationLevel: "api_degraded",
    playbookName: "Anthropic API Degradation",
    steps: [
      { order: 1, action: "detect", description: "Monitor Anthropic API response latency and error rates" },
      { order: 2, action: "contain", description: "Switch to cached AI responses where available" },
      { order: 3, action: "fallback", description: "Route requests to OpenAI primary if Anthropic is fallback" },
      { order: 4, action: "pause_automations", description: "Pause AI automations that rely on Anthropic" },
      { order: 5, action: "safe_mode", description: "Continue with primary model only" },
      { order: 6, action: "notify_user", description: "Surface degradation in System Pulse HUD" },
      { order: 7, action: "recover", description: "Resume when Anthropic API returns stable for 5 minutes" },
      { order: 8, action: "audit", description: "Log playbook activation and recovery" },
    ],
    autoActivate: true,
  },
  {
    capabilityName: "youtube_api",
    degradationLevel: "quota_exceeded",
    playbookName: "YouTube API Quota Exhaustion",
    steps: [
      { order: 1, action: "detect", description: "Monitor YouTube API quota usage against daily limit" },
      { order: 2, action: "contain", description: "Prioritize critical API calls (publish, analytics) over nice-to-have (thumbnails, comments)" },
      { order: 3, action: "pause_automations", description: "Pause automated video publishing, SEO updates, and comment moderation" },
      { order: 4, action: "safe_mode", description: "Allow read-only analytics viewing from cached data" },
      { order: 5, action: "notify_user", description: "Show quota exhaustion warning with reset time" },
      { order: 6, action: "escalate", description: "If quota is at 100%, block all YouTube writes" },
      { order: 7, action: "recover", description: "Resume when daily quota resets at midnight Pacific" },
      { order: 8, action: "verify", description: "Confirm one YouTube API call succeeds before clearing degradation" },
      { order: 9, action: "audit", description: "Log quota incident for cost analysis" },
    ],
    autoActivate: true,
  },
  {
    capabilityName: "stripe",
    degradationLevel: "payment_degraded",
    playbookName: "Stripe Payment Degradation",
    steps: [
      { order: 1, action: "detect", description: "Monitor Stripe webhook delivery and API latency" },
      { order: 2, action: "contain", description: "Queue payment operations for retry; do not fail user requests" },
      { order: 3, action: "pause_automations", description: "Pause automated billing operations and subscription changes" },
      { order: 4, action: "safe_mode", description: "Allow read-only billing dashboard; block payment mutations" },
      { order: 5, action: "notify_user", description: "Surface payment system degradation in billing section" },
      { order: 6, action: "escalate", description: "Alert admin immediately if payment processing fails" },
      { order: 7, action: "recover", description: "Resume when Stripe status page shows operational for 10 minutes" },
      { order: 8, action: "verify", description: "Process one test webhook to confirm recovery" },
      { order: 9, action: "audit", description: "Log payment degradation incident with affected transactions" },
    ],
    autoActivate: true,
  },
  {
    capabilityName: "postgresql",
    degradationLevel: "connection_pool_exhausted",
    playbookName: "PostgreSQL Connection Pool Exhaustion",
    steps: [
      { order: 1, action: "detect", description: "Monitor connection pool utilization and query latency" },
      { order: 2, action: "contain", description: "Kill long-running queries; reduce pool pressure from background jobs" },
      { order: 3, action: "pause_automations", description: "Pause all background engines and batch operations" },
      { order: 4, action: "safe_mode", description: "Allow only essential reads with connection timeouts" },
      { order: 5, action: "notify_user", description: "Surface database degradation in System Pulse HUD" },
      { order: 6, action: "escalate", description: "If pool drops below 5%, alert Exception Desk with critical severity" },
      { order: 7, action: "recover", description: "Resume when pool utilization returns below 60% for 5 minutes" },
      { order: 8, action: "verify", description: "Run one governed workflow end-to-end to confirm recovery" },
      { order: 9, action: "audit", description: "Log connection pool incident with affected queries" },
    ],
    autoActivate: true,
  },
  {
    capabilityName: "gmail",
    degradationLevel: "send_degraded",
    playbookName: "Gmail Send Degradation",
    steps: [
      { order: 1, action: "detect", description: "Monitor Gmail API send success rate and latency" },
      { order: 2, action: "contain", description: "Queue outbound emails for later delivery" },
      { order: 3, action: "pause_automations", description: "Pause automated email campaigns and notifications" },
      { order: 4, action: "safe_mode", description: "Continue with in-app notifications only" },
      { order: 5, action: "notify_user", description: "Show email delivery delay warning" },
      { order: 6, action: "recover", description: "Resume when Gmail API returns success for 3 consecutive sends" },
      { order: 7, action: "verify", description: "Send one test email to confirm recovery" },
      { order: 8, action: "audit", description: "Log email degradation incident" },
    ],
    autoActivate: true,
  },
];

export async function seedFullDegradationPlaybooks(): Promise<{ seeded: number; skipped: number }> {
  let seeded = 0;
  let skipped = 0;
  for (const seed of FULL_PLAYBOOK_SEEDS) {
    const [existing] = await db
      .select({ id: capabilityDegradationPlaybooks.id })
      .from(capabilityDegradationPlaybooks)
      .where(
        and(
          eq(capabilityDegradationPlaybooks.capabilityName, seed.capabilityName),
          eq(capabilityDegradationPlaybooks.degradationLevel, seed.degradationLevel)
        )
      )
      .limit(1);
    if (!existing) {
      await db.insert(capabilityDegradationPlaybooks).values(seed);
      seeded++;
    } else {
      skipped++;
    }
  }
  return { seeded, skipped };
}

export async function activatePlaybook(
  capabilityName: string,
  reason: string,
  activatedBy: string = "system"
): Promise<{ activated: boolean; playbookId?: number; error?: string }> {
  const [playbook] = await db
    .select()
    .from(capabilityDegradationPlaybooks)
    .where(eq(capabilityDegradationPlaybooks.capabilityName, capabilityName))
    .limit(1);

  if (!playbook) return { activated: false, error: `No playbook found for ${capabilityName}` };

  const [event] = await db
    .insert(playbookActivationEvents)
    .values({
      playbookId: playbook.id,
      activatedBy,
      reason,
      status: "active",
      metadata: { capabilityName, steps: playbook.steps },
    })
    .returning({ id: playbookActivationEvents.id });

  updateDependencyHealth(capabilityName, "degraded");
  logger.warn(`Degradation playbook activated: ${playbook.playbookName} — ${reason}`);
  return { activated: true, playbookId: event.id };
}

export async function deactivatePlaybook(capabilityName: string): Promise<{ deactivated: boolean }> {
  const events = await db
    .select()
    .from(playbookActivationEvents)
    .where(eq(playbookActivationEvents.status, "active"));

  let deactivated = false;
  for (const ev of events) {
    const meta = (ev.metadata as any) || {};
    if (meta.capabilityName === capabilityName) {
      await db
        .update(playbookActivationEvents)
        .set({ status: "resolved", deactivatedAt: new Date() })
        .where(eq(playbookActivationEvents.id, ev.id));
      deactivated = true;
    }
  }

  if (deactivated) {
    updateDependencyHealth(capabilityName, "healthy");
    logger.info(`Degradation playbook deactivated for: ${capabilityName}`);
  }
  return { deactivated };
}
