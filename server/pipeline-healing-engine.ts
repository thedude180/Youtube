import { getOpenAIClient } from "./lib/openai";
import { db } from "./db";
import { eq, and, desc, sql } from "drizzle-orm";
import { pipelineFailures } from "@shared/schema";
import { sendSSEEvent } from "./routes/events";

const openai = getOpenAIClient();

const BACKOFF_BASE_MS = 2000;

function getBackoffDelay(retryCount: number): number {
  return BACKOFF_BASE_MS * Math.pow(2, retryCount) + Math.random() * 1000;
}

export async function detectAndHealFailure(
  userId: string,
  pipelineId: number,
  stepId: string,
  error: Error
): Promise<{ failureId: number; status: string; diagnosis?: Record<string, any> }> {
  const existing = await db
    .select()
    .from(pipelineFailures)
    .where(
      and(
        eq(pipelineFailures.userId, userId),
        eq(pipelineFailures.pipelineId, pipelineId),
        eq(pipelineFailures.stepId, stepId),
        eq(pipelineFailures.status, "failed")
      )
    )
    .limit(1);

  let failure = existing[0];
  const errorType = classifyError(error);

  if (failure) {
    const newRetryCount = (failure.retryCount || 0) + 1;
    await db
      .update(pipelineFailures)
      .set({
        retryCount: newRetryCount,
        errorMessage: error.message,
        errorType,
      })
      .where(eq(pipelineFailures.id, failure.id));
    failure = { ...failure, retryCount: newRetryCount, errorMessage: error.message, errorType };
  } else {
    const [inserted] = await db
      .insert(pipelineFailures)
      .values({
        userId,
        pipelineId,
        stepId,
        errorMessage: error.message,
        errorType,
        retryCount: 0,
        maxRetries: 3,
        status: "failed",
      })
      .returning();
    failure = inserted;
  }

  sendSSEEvent(userId, "pipeline_failure", {
    failureId: failure.id,
    pipelineId,
    stepId,
    errorType,
    retryCount: failure.retryCount,
  });

  if (failure.retryCount < failure.maxRetries) {
    let diagnosis: Record<string, any> = {};
    try {
      diagnosis = await generateDiagnosis(error, stepId, failure.retryCount);
    } catch {
      diagnosis = {
        rootCause: "Unable to diagnose — AI unavailable",
        suggestedFix: "Retry with exponential backoff",
        confidence: 0.3,
      };
    }

    const retryStrategy = {
      action: diagnosis.suggestedFix || "retry",
      delayMs: getBackoffDelay(failure.retryCount),
      attempt: failure.retryCount + 1,
      maxAttempts: failure.maxRetries,
    };

    await db
      .update(pipelineFailures)
      .set({
        diagnosis,
        retryStrategy,
        status: "retrying",
      })
      .where(eq(pipelineFailures.id, failure.id));

    sendSSEEvent(userId, "pipeline_healing", {
      failureId: failure.id,
      pipelineId,
      stepId,
      diagnosis,
      retryStrategy,
      status: "retrying",
    });

    return { failureId: failure.id, status: "retrying", diagnosis };
  }

  await db
    .update(pipelineFailures)
    .set({ status: "exhausted" })
    .where(eq(pipelineFailures.id, failure.id));

  sendSSEEvent(userId, "pipeline_failure_exhausted", {
    failureId: failure.id,
    pipelineId,
    stepId,
    retryCount: failure.retryCount,
  });

  try {
    const { feedSystemHealthToExceptionDesk } = await import("./services/exception-desk");
    await feedSystemHealthToExceptionDesk({
      source: "pipeline_healing",
      issue: `Pipeline step "${stepId}" exhausted all retries (${failure.retryCount}/${failure.maxRetries})`,
      severity: "high",
      details: { failureId: failure.id, pipelineId, stepId, errorType, retryCount: failure.retryCount },
    });
  } catch (feedErr: any) {
    console.error("[pipeline-healing] Failed to feed to exception desk:", feedErr?.message);
  }

  return { failureId: failure.id, status: "exhausted" };
}

export async function markHealed(failureId: number, userId: string): Promise<void> {
  await db
    .update(pipelineFailures)
    .set({
      status: "healed",
      resolvedAt: new Date(),
    })
    .where(eq(pipelineFailures.id, failureId));

  sendSSEEvent(userId, "pipeline_healed", { failureId });
}

export async function getFailureHistory(userId: string): Promise<any[]> {
  return db
    .select()
    .from(pipelineFailures)
    .where(eq(pipelineFailures.userId, userId))
    .orderBy(desc(pipelineFailures.createdAt))
    .limit(50);
}

export async function getHealingStats(userId: string): Promise<{
  totalFailures: number;
  healed: number;
  exhausted: number;
  retrying: number;
  healingRate: number;
}> {
  const all = await db
    .select()
    .from(pipelineFailures)
    .where(eq(pipelineFailures.userId, userId));

  const healed = all.filter((f) => f.status === "healed").length;
  const exhausted = all.filter((f) => f.status === "exhausted").length;
  const retrying = all.filter((f) => f.status === "retrying").length;
  const resolved = healed + exhausted;

  return {
    totalFailures: all.length,
    healed,
    exhausted,
    retrying,
    healingRate: resolved > 0 ? healed / resolved : 0,
  };
}

function classifyError(error: Error): string {
  const msg = error.message.toLowerCase();
  if (msg.includes("timeout") || msg.includes("timed out")) return "timeout";
  if (msg.includes("rate limit") || msg.includes("429")) return "rate_limit";
  if (msg.includes("auth") || msg.includes("401") || msg.includes("403")) return "auth";
  if (msg.includes("network") || msg.includes("econnrefused") || msg.includes("fetch")) return "network";
  if (msg.includes("parse") || msg.includes("json") || msg.includes("syntax")) return "parse";
  if (msg.includes("quota") || msg.includes("limit exceeded")) return "quota";
  return "unknown";
}

async function generateDiagnosis(
  error: Error,
  stepId: string,
  retryCount: number
): Promise<Record<string, any>> {
  const response = await openai.chat.completions.create({
    model: "gpt-4o-mini",
    messages: [
      {
        role: "system",
        content:
          "You are the world's best DevOps reliability engineer — combining elite expertise in distributed systems debugging, root cause analysis, and self-healing architecture. You diagnose pipeline failures with surgical precision, identifying not just WHAT failed but WHY, and engineering fixes that prevent recurrence. You think in failure modes, circuit breakers, and graceful degradation. Respond as JSON.",
      },
      {
        role: "user",
        content: `Pipeline step "${stepId}" failed (attempt ${retryCount + 1}).
Error: ${error.message}

Provide JSON with:
{
  "rootCause": "brief root cause",
  "suggestedFix": "specific action to fix",
  "category": "timeout|rate_limit|auth|network|parse|data|unknown",
  "confidence": 0.0-1.0,
  "shouldRetry": true/false,
  "adjustments": "any parameter adjustments for retry"
}`,
      },
    ],
    response_format: { type: "json_object" },
    max_completion_tokens: 16000,
  });

  const content = response.choices[0]?.message?.content;
  if (!content) return { rootCause: "unknown", suggestedFix: "retry", confidence: 0.3 };
  try {
    return JSON.parse(content);
  } catch {
    return { rootCause: "unknown", suggestedFix: "retry", confidence: 0.3 };
  }
}
