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

const HMAC_SECRET = process.env.KERNEL_HMAC_SECRET || process.env.SESSION_SECRET || "creatoros-kernel-hmac-secret";

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
  aggregateId?: string
): Promise<number> {
  const [event] = await db
    .insert(domainEvents)
    .values({
      userId,
      eventType,
      aggregateType: aggregateType || null,
      aggregateId: aggregateId || null,
      payload,
      metadata: { emittedBy: "kernel", timestamp: Date.now() },
    })
    .returning({ id: domainEvents.id });
  return event.id;
}

function computeHmac(data: string): string {
  return crypto.createHmac("sha256", HMAC_SECRET).update(data).digest("hex");
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
  const sigData = JSON.stringify({ userId, actionType, executionKey, payload, result, ts: Date.now() });
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
  return item.id;
}

async function checkApprovalMatrix(
  actionClass: string,
  userId: string,
  confidence?: number
): Promise<{ approved: boolean; rule: typeof approvalMatrixRules.$inferSelect | null; reason: string }> {
  const [rule] = await db
    .select()
    .from(approvalMatrixRules)
    .where(eq(approvalMatrixRules.actionClass, actionClass))
    .limit(1);

  if (!rule) {
    return { approved: true, rule: null, reason: "no-rule-defined" };
  }

  if (rule.bandClass === "RED") {
    return { approved: false, rule, reason: "red-band-requires-explicit-approval" };
  }

  if (rule.bandClass === "YELLOW") {
    const threshold = rule.confidenceThreshold ?? 0.7;
    if ((confidence ?? 0) < threshold) {
      return { approved: false, rule, reason: `yellow-band-confidence-below-${threshold}` };
    }
  }

  return { approved: true, rule, reason: "auto-approved" };
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
}

export async function routeCommand(
  actionType: string,
  payload: Record<string, any> & { userId: string; executionKey?: string },
  options: {
    confidence?: number;
    decisionTheater?: Record<string, any>;
    rollbackAvailable?: boolean;
  } = {}
): Promise<CommandResult> {
  const { userId } = payload;
  const executionKey =
    payload.executionKey || `${actionType}:${userId}:${JSON.stringify(payload)}:${Math.floor(Date.now() / 60000)}`;

  const alreadyExists = await checkExecutionKeyExists(executionKey);
  if (alreadyExists) {
    const [existing] = await db
      .select({ id: signedActionReceipts.id })
      .from(signedActionReceipts)
      .where(eq(signedActionReceipts.executionKey, executionKey))
      .limit(1);
    return { success: true, reason: "idempotent-skip", existingReceiptId: existing?.id };
  }

  const approval = await checkApprovalMatrix(actionType, userId, options.confidence);

  await db.insert(approvalDecisions).values({
    userId,
    actionClass: actionType,
    ruleId: approval.rule?.id || null,
    decision: approval.approved ? "approved" : "denied",
    decidedBy: "system",
    reason: approval.reason,
    executionKey,
    confidence: options.confidence ?? null,
  });

  if (!approval.approved) {
    await emitDomainEvent(userId, `${actionType}.denied`, { reason: approval.reason, executionKey });
    return { success: false, reason: approval.reason };
  }

  const handler = commandHandlers.get(actionType);
  if (!handler) {
    await routeToDLQ(actionType, payload, `No handler registered for ${actionType}`, userId);
    return { success: false, error: `No handler registered for ${actionType}` };
  }

  await emitDomainEvent(userId, `${actionType}.started`, { executionKey }, actionType, executionKey);

  try {
    const result = await handler(payload);

    const decisionTheater = {
      whatChanged: options.decisionTheater?.whatChanged || actionType,
      whyChanged: options.decisionTheater?.whyChanged || "auto-triggered",
      evidenceUsed: options.decisionTheater?.evidenceUsed || {},
      modelVersion: options.decisionTheater?.modelVersion || "gpt-4o-mini",
      promptVersion: options.decisionTheater?.promptVersion || "1.0",
      confidenceScore: options.confidence ?? null,
      riskLevel: approval.rule?.bandClass || "GREEN",
      rollbackAvailable: options.rollbackAvailable ?? false,
      approvalState: "auto-approved",
      signalCount: options.decisionTheater?.signalCount ?? 0,
      signalRecency: options.decisionTheater?.signalRecency || null,
      outputType: options.decisionTheater?.outputType || "executed",
      uncertainty: options.decisionTheater?.uncertainty || null,
      geographicContext: options.decisionTheater?.geographicContext || null,
    };

    const receiptId = await issueSignedReceipt(
      userId,
      actionType,
      executionKey,
      payload,
      result,
      decisionTheater,
      options.rollbackAvailable ?? false
    );

    await emitDomainEvent(userId, `${actionType}.completed`, { executionKey, receiptId }, actionType, executionKey);

    return { success: true, receiptId, result };
  } catch (err: any) {
    const errorMsg = err?.message || String(err);
    await emitDomainEvent(userId, `${actionType}.failed`, { executionKey, error: errorMsg }, actionType, executionKey);
    await routeToDLQ(actionType, payload, errorMsg, userId);
    return { success: false, error: errorMsg };
  }
}
