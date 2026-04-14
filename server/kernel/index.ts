import { db } from "../db";
import {
  domainEvents,
  signedActionReceipts,
  featureFlags,
  featureFlagAudit,
  deadLetterQueue,
  approvalMatrixRules,
  approvalDecisions,
} from "@shared/schema";
import { eq, and, desc } from "drizzle-orm";
import crypto from "crypto";
import { evaluateApproval, deductTrustBudget as governanceDeductBudget } from "../services/trust-governance";
import {
  isInSafeMode,
  BlastRadiusContext,
  defaultBlastRadiusLimiter,
  createBlastRadiusLimiter,
  validateHealing,
  recordMetric,
  generateCorrelationId,
  startCorrelation,
  endCorrelation,
} from "../services/resilience-observability";
import { createLogger } from "../lib/logger";


const logger = createLogger("index");
function getHmacSecret(): string {
  const secret = process.env.KERNEL_HMAC_SECRET || process.env.SESSION_SECRET;
  if (!secret) {
    throw new Error("KERNEL_HMAC_SECRET or SESSION_SECRET must be set — refusing to use hardcoded secret");
  }
  return secret;
}

export interface KernelExecutionContext {
  blastRadius: BlastRadiusContext;
  correlationId: string;
  trackedFetch: (url: string, init?: any) => Promise<Response>;
}

type CommandHandler = (payload: Record<string, any>, ctx?: KernelExecutionContext) => Promise<Record<string, any>>;
const commandHandlers = new Map<string, CommandHandler>();

export function registerCommand(actionType: string, handler: CommandHandler) {
  commandHandlers.set(actionType, handler);
}

export async function emitDomainEvent(
  userId: string,
  eventType: string,
  payload: Record<string, any> = {},
  aggregateType?: string,
  aggregateId?: string,
  correlationId?: string
): Promise<number> {
  const [event] = await db
    .insert(domainEvents)
    .values({
      userId,
      eventType,
      aggregateType: aggregateType || null,
      aggregateId: aggregateId || null,
      payload: { ...payload, ...(correlationId ? { correlationId } : {}) },
      metadata: { emittedBy: "kernel", timestamp: Date.now(), ...(correlationId ? { correlationId } : {}) },
    })
    .returning({ id: domainEvents.id });

  try {
    const { observeDomainEvent } = require("../services/universal-learning-observer");
    observeDomainEvent(userId, eventType, payload, aggregateType);
  } catch {}

  return event.id;
}

function computeHmac(data: string): string {
  return crypto.createHmac("sha256", getHmacSecret()).update(data).digest("hex");
}

async function getLastChainHash(userId: string): Promise<string> {
  const [last] = await db
    .select({ decisionTheater: signedActionReceipts.decisionTheater })
    .from(signedActionReceipts)
    .where(eq(signedActionReceipts.userId, userId))
    .orderBy(desc(signedActionReceipts.id))
    .limit(1);
  if (last) {
    const theater = (last.decisionTheater as Record<string, any>) || {};
    if (theater.chainIntegrity?.chainHash) {
      return theater.chainIntegrity.chainHash;
    }
  }
  return "genesis";
}

export async function issueSignedReceipt(
  userId: string,
  actionType: string,
  executionKey: string,
  payload: Record<string, any>,
  result: Record<string, any>,
  decisionTheater: Record<string, any> = {},
  rollbackAvailable: boolean = false,
  rollbackMetadata?: Record<string, any>
): Promise<number> {
  const sigData = JSON.stringify({ userId, actionType, executionKey, payload, result });
  const hmacSignature = computeHmac(sigData);

  const prevHash = await getLastChainHash(userId);
  const chainHash = computeHmac(`${prevHash}:${hmacSignature}`);

  const enrichedTheater = {
    ...decisionTheater,
    chainIntegrity: { prevHash, chainHash },
  };

  const [receipt] = await db
    .insert(signedActionReceipts)
    .values({
      userId,
      actionType,
      executionKey,
      payload,
      result,
      decisionTheater: enrichedTheater,
      hmacSignature,
      status: "completed",
      rollbackAvailable,
      rollbackMetadata: rollbackMetadata || null,
    })
    .returning({ id: signedActionReceipts.id });

  return receipt.id;
}

export function verifyReceipt(receipt: {
  userId: string;
  actionType: string;
  executionKey: string;
  payload: Record<string, any>;
  result: Record<string, any>;
  hmacSignature: string;
}): boolean {
  const sigData = JSON.stringify({
    userId: receipt.userId,
    actionType: receipt.actionType,
    executionKey: receipt.executionKey,
    payload: receipt.payload,
    result: receipt.result,
  });
  try {
    const expected = computeHmac(sigData);
    return crypto.timingSafeEqual(Buffer.from(receipt.hmacSignature, "hex"), Buffer.from(expected, "hex"));
  } catch {
    return false;
  }
}

export async function checkFeatureFlag(
  flagKey: string,
  userId?: string
): Promise<boolean> {
  try {
    const [flag] = await db
      .select()
      .from(featureFlags)
      .where(eq(featureFlags.flagKey, flagKey))
      .limit(1);

    if (!flag) return true;

    const enabled = flag.enabled ?? false;

    await db.insert(featureFlagAudit).values({
      flagKey,
      userId: userId || null,
      action: "checked",
      previousValue: null,
      newValue: { enabled, rolloutPercentage: flag.rolloutPercentage },
      reason: "kernel-gate-check",
      performedBy: "kernel",
    });

    return enabled;
  } catch {
    return true;
  }
}

export async function routeToDLQ(
  jobType: string,
  payload: Record<string, any>,
  error: string,
  userId?: string
): Promise<number> {
  const [item] = await db
    .insert(deadLetterQueue)
    .values({
      jobType,
      payload,
      error,
      userId: userId || null,
      status: "pending",
      retryCount: 0,
      maxRetries: 3,
      priority: 5,
    })
    .returning({ id: deadLetterQueue.id });

  try {
    const { feedDlqToExceptionDesk } = await import("../services/exception-desk");
    await feedDlqToExceptionDesk({
      id: item.id,
      jobType,
      error,
      userId,
      priority: 5,
      payload,
    });
  } catch (feedErr: any) {
    logger.error("[kernel] Failed to feed DLQ to exception desk:", feedErr?.message);
  }

  return item.id;
}

async function checkApprovalViaGovernance(
  actionClass: string,
  userId: string,
  confidence?: number
): Promise<{ approved: boolean; decision: string; reason: string; ruleId: number | null }> {
  const result = await evaluateApproval(userId, actionClass, confidence ?? 1.0);
  return {
    approved: result.decision === "approved",
    decision: result.decision,
    reason: result.reason,
    ruleId: result.ruleId,
  };
}

async function checkExecutionKeyExists(executionKey: string): Promise<boolean> {
  const [existing] = await db
    .select({ id: signedActionReceipts.id })
    .from(signedActionReceipts)
    .where(eq(signedActionReceipts.executionKey, executionKey))
    .limit(1);
  return !!existing;
}

export interface CommandResult {
  success: boolean;
  receiptId?: number;
  result?: Record<string, any>;
  error?: string;
  reason?: string;
  existingReceiptId?: number;
  correlationId?: string;
  retryAfterMs?: number;
}

export async function routeCommand(
  actionType: string,
  payload: Record<string, any> & { userId: string; executionKey?: string },
  options: {
    confidence?: number;
    decisionTheater?: Record<string, any>;
    rollbackAvailable?: boolean;
    rollbackMetadata?: Record<string, any>;
    blastRadiusLimits?: { maxItems?: number; maxExecutionMs?: number; maxApiCalls?: number };
    healingCheck?: () => Promise<boolean>;
    correlationId?: string;
  } = {}
): Promise<CommandResult> {
  const startMs = Date.now();
  const { userId } = payload;
  const executionKey =
    payload.executionKey || `${actionType}:${userId}:${JSON.stringify(payload)}:${Math.floor(Date.now() / 60000)}`;

  const correlationId = options.correlationId || generateCorrelationId();
  startCorrelation(correlationId, { actionType, userId, executionKey });

  try {
    if (process.env.NODE_ENV !== "test") {
      try {
        const { checkInternalRateLimit } = await import("../services/internal-rate-limiter");
        const rl = checkInternalRateLimit(userId, actionType);
        if (!rl.allowed) {
          recordMetric("kernel.command.rate_limited", 1, "count", { actionType });
          return { success: false, reason: `internal-rate-limit-exceeded`, correlationId, retryAfterMs: rl.retryAfterMs };
        }
      } catch (err: any) {
        logger.warn("[kernel] internal rate limiter check failed:", err?.message);
      }
    }

    if (isInSafeMode()) {
      recordMetric("kernel.command.blocked", 1, "count", { actionType, reason: "safe-mode-global" });
      await emitDomainEvent(userId, `${actionType}.blocked-safe-mode`, { executionKey }, actionType, executionKey, correlationId);
      return { success: false, reason: "system-in-safe-mode", correlationId };
    }

    if (isInSafeMode(actionType)) {
      recordMetric("kernel.command.blocked", 1, "count", { actionType, reason: "safe-mode-engine" });
      await emitDomainEvent(userId, `${actionType}.blocked-safe-mode-engine`, { executionKey }, actionType, executionKey, correlationId);
      return { success: false, reason: `engine-${actionType}-in-safe-mode`, correlationId };
    }

    const alreadyExists = await checkExecutionKeyExists(executionKey);
    if (alreadyExists) {
      const [existing] = await db
        .select({ id: signedActionReceipts.id })
        .from(signedActionReceipts)
        .where(eq(signedActionReceipts.executionKey, executionKey))
        .limit(1);
      return { success: true, reason: "idempotent-skip", existingReceiptId: existing?.id, correlationId };
    }

    let effectiveConfidence = options.confidence ?? 1.0;
    try {
      const { getGovernedConfidenceForDomain } = await import("../services/learning-governance");
      const domain = inferDomainFromActionType(actionType);
      const gc = await getGovernedConfidenceForDomain(userId, domain);

      if (gc.maturityLevel === "nascent" && gc.signalCount < 5) {
        effectiveConfidence = Math.min(effectiveConfidence, 0.5);
        recordMetric("kernel.governance.maturity_tightened", 1, "count", { actionType, maturityLevel: gc.maturityLevel });
      } else if (gc.maturityLevel === "developing") {
        effectiveConfidence = Math.min(effectiveConfidence, effectiveConfidence * 0.85);
      }

      if (gc.contradictionCount > 0) {
        const penalty = Math.min(0.3, gc.contradictionCount * 0.1);
        effectiveConfidence = effectiveConfidence * (1 - penalty);
        recordMetric("kernel.governance.contradiction_penalty", 1, "count", { actionType, contradictions: String(gc.contradictionCount) });
      }
    } catch (err: any) {
      logger.warn("[kernel] governance confidence lookup failed, using base confidence:", err?.message);
    }

    const approval = await checkApprovalViaGovernance(actionType, userId, effectiveConfidence);

    if (!approval.approved) {
      await emitDomainEvent(userId, `${actionType}.denied`, { reason: approval.reason, decision: approval.decision, executionKey }, actionType, executionKey, correlationId);
      try {
        const { createException } = await import("../services/exception-desk");
        await createException({
          severity: approval.decision === "pending_human" ? "medium" : "high",
          category: "approval_denial",
          source: "kernel_approval_matrix",
          title: `Action ${approval.decision}: ${actionType}`,
          description: `Approval ${approval.decision} for "${actionType}": ${approval.reason}`,
          userId,
          metadata: { actionType, executionKey, reason: approval.reason, decision: approval.decision, correlationId },
        });
      } catch (feedErr: any) {
        logger.error("[kernel] Failed to feed approval denial to exception desk:", feedErr?.message);
      }
      recordMetric("kernel.command.denied", 1, "count", { actionType, decision: approval.decision || "denied" });
      return { success: false, reason: approval.reason, correlationId };
    }

    const budgetCost = options.confidence != null ? Math.ceil((1 - options.confidence) * 10) : 1;
    const budgetResult = await governanceDeductBudget(userId, actionType, budgetCost, `kernel:${actionType}`);
    if (!budgetResult.allowed) {
      recordMetric("kernel.command.blocked", 1, "count", { actionType, reason: "trust-budget-exhausted" });
      await emitDomainEvent(userId, `${actionType}.budget-blocked`, { executionKey, remaining: budgetResult.remaining }, actionType, executionKey, correlationId);
      return { success: false, reason: "trust-budget-exhausted", correlationId };
    }

    const handler = commandHandlers.get(actionType);
    if (!handler) {
      recordMetric("kernel.command.error", 1, "count", { actionType, reason: "no-handler" });
      await routeToDLQ(actionType, payload, `No handler registered for ${actionType}`, userId);
      return { success: false, error: `No handler registered for ${actionType}`, correlationId };
    }

    const limiter = options.blastRadiusLimits
      ? createBlastRadiusLimiter(options.blastRadiusLimits)
      : defaultBlastRadiusLimiter;
    const blastCtx = limiter.createExecutionContext();
    const preTimeCheck = blastCtx.checkTime();
    if (!preTimeCheck.allowed) {
      recordMetric("kernel.blast_radius.blocked", 1, "count", { actionType, reason: "pre_exec_time" });
      return { success: false, error: `Blast radius limit: ${preTimeCheck.reason}`, correlationId };
    }

    const itemCheck = blastCtx.recordItem();
    if (!itemCheck.allowed) {
      recordMetric("kernel.blast_radius.blocked", 1, "count", { actionType, reason: "item_limit" });
      return { success: false, error: `Blast radius limit: ${itemCheck.reason}`, correlationId };
    }

    await emitDomainEvent(userId, `${actionType}.started`, { executionKey }, actionType, executionKey, correlationId);

    const trackedFetch = async (url: string, init?: any): Promise<Response> => {
      const apiCheck = blastCtx.recordApiCall();
      if (!apiCheck.allowed) {
        throw new Error(`Blast radius API call limit reached: ${apiCheck.reason}`);
      }
      return fetch(url, init);
    };

    const execCtx: KernelExecutionContext = { blastRadius: blastCtx, correlationId, trackedFetch };
    const result = await handler(payload, execCtx);

    const elapsed = Date.now() - startMs;
    recordMetric("kernel.command.latency", elapsed, "ms", { actionType });

    const postTimeCheck = blastCtx.checkTime();
    if (!postTimeCheck.allowed) {
      recordMetric("kernel.blast_radius.abort", 1, "count", { actionType, reason: "post_exec_time" });
      await emitDomainEvent(userId, `${actionType}.blast-radius-abort`, { executionKey, reason: postTimeCheck.reason }, actionType, executionKey, correlationId);
      await routeToDLQ(actionType, payload, `Blast radius breach: ${postTimeCheck.reason}`, userId);
      return { success: false, error: `Blast radius breach after execution: ${postTimeCheck.reason}`, correlationId };
    }

    const postApiStatus = blastCtx.getStatus();
    if (postApiStatus.aborted) {
      recordMetric("kernel.blast_radius.abort", 1, "count", { actionType, reason: postApiStatus.abortReason || "post_exec_limit" });
      await emitDomainEvent(userId, `${actionType}.blast-radius-abort`, { executionKey, reason: postApiStatus.abortReason }, actionType, executionKey, correlationId);
      await routeToDLQ(actionType, payload, `Blast radius breach: ${postApiStatus.abortReason}`, userId);
      return { success: false, error: `Blast radius breach: ${postApiStatus.abortReason}`, correlationId };
    }

    recordMetric("kernel.command.success", 1, "count", { actionType });

    const blastStatus = blastCtx.getStatus();

    let governedConfidenceData: { confidence: number; maturityLevel: string } | null = null;
    try {
      const { getGovernedConfidenceForDomain } = await import("../services/learning-governance");
      const domain = inferDomainFromActionType(actionType);
      const gc = await getGovernedConfidenceForDomain(userId, domain);
      governedConfidenceData = { confidence: gc.confidence, maturityLevel: gc.maturityLevel };
    } catch (err: any) { logger.warn("[Kernel] Governed confidence lookup failed:", err?.message || err); }

    const decisionTheater = {
      whatChanged: options.decisionTheater?.whatChanged || actionType,
      whyChanged: options.decisionTheater?.whyChanged || "auto-triggered",
      evidenceUsed: options.decisionTheater?.evidenceUsed || {},
      modelVersion: options.decisionTheater?.modelVersion || "gpt-4o-mini",
      promptVersion: options.decisionTheater?.promptVersion || "1.0",
      confidenceScore: options.confidence ?? null,
      governedConfidence: governedConfidenceData,
      riskLevel: "GREEN",
      rollbackAvailable: options.rollbackAvailable ?? false,
      approvalState: "auto-approved",
      signalCount: options.decisionTheater?.signalCount ?? 0,
      signalRecency: options.decisionTheater?.signalRecency || null,
      outputType: options.decisionTheater?.outputType || "executed",
      uncertainty: options.decisionTheater?.uncertainty || null,
      geographicContext: options.decisionTheater?.geographicContext || null,
      blastRadiusStatus: blastStatus,
      correlationId,
    };

    const receiptId = await issueSignedReceipt(
      userId,
      actionType,
      executionKey,
      payload,
      result,
      decisionTheater,
      options.rollbackAvailable ?? false,
      options.rollbackMetadata
    );

    await emitDomainEvent(userId, `${actionType}.completed`, { executionKey, receiptId }, actionType, executionKey, correlationId);

    if (options.healingCheck) {
      const healingResult = await validateHealing(
        `${actionType}:${executionKey}`,
        options.healingCheck,
        { maxAttempts: 3, baseDelayMs: 500 }
      );
      if (!healingResult.healed) {
        recordMetric("kernel.healing.failed", 1, "count", { actionType });
      }
    }

    return { success: true, receiptId, result, correlationId };
  } catch (err: any) {
    const errorMsg = err?.message || String(err);
    const elapsed = Date.now() - startMs;
    recordMetric("kernel.command.latency", elapsed, "ms", { actionType });
    recordMetric("kernel.command.failure", 1, "count", { actionType });
    await emitDomainEvent(userId, `${actionType}.failed`, { executionKey, error: errorMsg }, actionType, executionKey, correlationId);
    await routeToDLQ(actionType, payload, errorMsg, userId);
    return { success: false, error: errorMsg, correlationId };
  } finally {
    endCorrelation(correlationId);
  }
}

function inferDomainFromActionType(actionType: string): string {
  if (actionType.includes("content") || actionType.includes("video") || actionType.includes("publish") || actionType.includes("seo") || actionType.includes("tags")) return "content";
  if (actionType.includes("revenue") || actionType.includes("monetiz") || actionType.includes("sponsor")) return "revenue";
  if (actionType.includes("audience") || actionType.includes("subscriber") || actionType.includes("community") || actionType.includes("comment")) return "audience";
  if (actionType.includes("distribut") || actionType.includes("platform") || actionType.includes("cross_post") || actionType.includes("notification")) return "distribution";
  return "content";
}
