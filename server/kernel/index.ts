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
import { eq, and } from "drizzle-orm";
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

function getHmacSecret(): string {
  const secret = process.env.KERNEL_HMAC_SECRET || process.env.SESSION_SECRET;
  if (!secret) {
    throw new Error("KERNEL_HMAC_SECRET or SESSION_SECRET must be set — refusing to use hardcoded secret");
  }
  return secret;
}

type CommandHandler = (payload: Record<string, any>) => Promise<Record<string, any>>;
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
  return event.id;
}

function computeHmac(data: string): string {
  return crypto.createHmac("sha256", getHmacSecret()).update(data).digest("hex");
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

  const [receipt] = await db
    .insert(signedActionReceipts)
    .values({
      userId,
      actionType,
      executionKey,
      payload,
      result,
      decisionTheater,
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
    console.error("[kernel] Failed to feed DLQ to exception desk:", feedErr?.message);
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
  } = {}
): Promise<CommandResult> {
  const startMs = Date.now();
  const { userId } = payload;
  const executionKey =
    payload.executionKey || `${actionType}:${userId}:${JSON.stringify(payload)}:${Math.floor(Date.now() / 60000)}`;

  const correlationId = generateCorrelationId();
  startCorrelation(correlationId, { actionType, userId, executionKey });

  try {
    if (isInSafeMode()) {
      await emitDomainEvent(userId, `${actionType}.blocked-safe-mode`, { executionKey }, actionType, executionKey, correlationId);
      return { success: false, reason: "system-in-safe-mode" };
    }

    if (isInSafeMode(actionType)) {
      await emitDomainEvent(userId, `${actionType}.blocked-safe-mode-engine`, { executionKey }, actionType, executionKey, correlationId);
      return { success: false, reason: `engine-${actionType}-in-safe-mode` };
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

    const approval = await checkApprovalViaGovernance(actionType, userId, options.confidence);

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
        console.error("[kernel] Failed to feed approval denial to exception desk:", feedErr?.message);
      }
      return { success: false, reason: approval.reason };
    }

    const budgetCost = options.confidence != null ? Math.ceil((1 - options.confidence) * 10) : 1;
    const budgetResult = await governanceDeductBudget(userId, actionType, budgetCost, `kernel:${actionType}`);
    if (!budgetResult.allowed) {
      await emitDomainEvent(userId, `${actionType}.budget-blocked`, { executionKey, remaining: budgetResult.remaining }, actionType, executionKey, correlationId);
      return { success: false, reason: "trust-budget-exhausted" };
    }

    const handler = commandHandlers.get(actionType);
    if (!handler) {
      await routeToDLQ(actionType, payload, `No handler registered for ${actionType}`, userId);
      return { success: false, error: `No handler registered for ${actionType}` };
    }

    const limiter = options.blastRadiusLimits
      ? createBlastRadiusLimiter(options.blastRadiusLimits)
      : defaultBlastRadiusLimiter;
    const blastCtx = limiter.createExecutionContext();
    const preTimeCheck = blastCtx.checkTime();
    if (!preTimeCheck.allowed) {
      return { success: false, error: `Blast radius limit: ${preTimeCheck.reason}` };
    }

    const itemCheck = blastCtx.recordItem();
    if (!itemCheck.allowed) {
      return { success: false, error: `Blast radius limit: ${itemCheck.reason}` };
    }

    await emitDomainEvent(userId, `${actionType}.started`, { executionKey }, actionType, executionKey, correlationId);

    const result = await handler(payload);

    const elapsed = Date.now() - startMs;
    recordMetric("kernel.command.latency", elapsed, "ms", { actionType });

    const postTimeCheck = blastCtx.checkTime();
    if (!postTimeCheck.allowed) {
      recordMetric("kernel.blast_radius.abort", 1, "count", { actionType, reason: "post_exec_time" });
      await emitDomainEvent(userId, `${actionType}.blast-radius-abort`, { executionKey, reason: postTimeCheck.reason }, actionType, executionKey, correlationId);
      await routeToDLQ(actionType, payload, `Blast radius breach: ${postTimeCheck.reason}`, userId);
      return { success: false, error: `Blast radius breach after execution: ${postTimeCheck.reason}`, correlationId };
    }

    recordMetric("kernel.command.success", 1, "count", { actionType });

    const blastStatus = blastCtx.getStatus();

    const decisionTheater = {
      whatChanged: options.decisionTheater?.whatChanged || actionType,
      whyChanged: options.decisionTheater?.whyChanged || "auto-triggered",
      evidenceUsed: options.decisionTheater?.evidenceUsed || {},
      modelVersion: options.decisionTheater?.modelVersion || "gpt-4o-mini",
      promptVersion: options.decisionTheater?.promptVersion || "1.0",
      confidenceScore: options.confidence ?? null,
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
