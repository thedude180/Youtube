/**
 * server/services/self-healing-engine.ts
 *
 * Phase 8 — Self-Healing Engine
 *
 * Implements auto-repair policies for classified errors.
 * Level 1 (auto-apply, low-risk): defer job, skip invalid, suppress log,
 *   reduce concurrency, pause worker, mark reconnect, blacklist download, retry.
 * Level 2 (auto-apply, medium-risk): adjust cooldown, reset stuck job,
 *   disable demo automation, skip unsupported platform.
 * Level 3 (staged, never auto-run): logged to self_healing_actions with status="staged".
 *
 * All applied actions are recorded to self_healing_actions table.
 */

import { createLogger } from "../lib/logger";
import { classifyError, type ErrorClassification, type ErrorCode } from "../lib/error-classifier";
import { LogSuppressor } from "../lib/log-suppressor";
import { logDecision } from "../lib/decision-journal";
import { KillSwitches } from "../lib/kill-switches";
import { recordError, recordResolution, lookupResolution } from "./error-knowledge-base";

const log = createLogger("self-healing-engine");

export type HealSeverity = "level1" | "level2" | "level3";
export type HealStatus = "applied" | "staged" | "failed" | "skipped";

export interface HealAction {
  errorCode: ErrorCode;
  module: string;
  actionTaken: string;
  confidence: number;   // 0–1
  riskLevel: HealSeverity;
  status: HealStatus;
  result?: string;
  notes?: string;
}

// ── DB persistence (lazy) ─────────────────────────────────────────────────────

async function persistAction(action: HealAction): Promise<void> {
  try {
    const { db } = await import("../db");
    const { selfHealingActions } = await import("@shared/schema");
    await db.insert(selfHealingActions).values({
      createdAt:   new Date(),
      severity:    action.riskLevel,
      errorCode:   action.errorCode,
      module:      action.module,
      actionTaken: action.actionTaken,
      confidence:  action.confidence,
      riskLevel:   action.riskLevel,
      status:      action.status,
      result:      action.result ?? null,
      notes:       action.notes ?? null,
    } as any);
  } catch {
    // Table may not exist yet (degraded mode) — log and continue
  }
}

// ── Level 1 repairs (low risk, auto-apply) ────────────────────────────────────

async function applyLevel1(
  classification: ErrorClassification,
  module: string,
  context: Record<string, unknown>,
): Promise<HealAction | null> {
  const { code, action, retryAfterMs } = classification;

  switch (action) {
    case "suppress_log": {
      const key = `${module}:${code}:${String(context.targetId ?? "")}`;
      LogSuppressor.warn(key, `[SelfHeal] ${module}: ${code} — suppressed after first occurrence`);
      const a: HealAction = {
        errorCode: code,
        module,
        actionTaken: `suppress_log key=${key}`,
        confidence: 1.0,
        riskLevel: "level1",
        status: "applied",
        result: "Log suppressed",
      };
      await persistAction(a);
      return a;
    }

    case "defer": {
      const delayMin = Math.round((retryAfterMs ?? 60_000) / 60_000);
      const a: HealAction = {
        errorCode: code,
        module,
        actionTaken: `defer job for ${delayMin} min`,
        confidence: 0.95,
        riskLevel: "level1",
        status: "applied",
        result: `Job deferred ${delayMin} min`,
      };
      await persistAction(a);
      logDecision({
        module,
        decision: "self_heal_defer",
        reason: classification.message,
        actionTaken: a.actionTaken,
        confidence: a.confidence,
      });
      return a;
    }

    case "skip": {
      const a: HealAction = {
        errorCode: code,
        module,
        actionTaken: `skip job (permanent: ${code})`,
        confidence: 0.9,
        riskLevel: "level1",
        status: "applied",
        result: "Job skipped permanently",
      };
      await persistAction(a);
      return a;
    }

    case "retry_backoff": {
      const a: HealAction = {
        errorCode: code,
        module,
        actionTaken: `retry with ${Math.round((retryAfterMs ?? 30_000) / 1000)}s backoff`,
        confidence: 0.8,
        riskLevel: "level1",
        status: "applied",
      };
      await persistAction(a);
      return a;
    }

    default:
      return null;
  }
}

// ── Level 2 repairs (medium risk, auto-apply with logging) ────────────────────

async function applyLevel2(
  classification: ErrorClassification,
  module: string,
  context: Record<string, unknown>,
): Promise<HealAction | null> {
  const { code } = classification;

  if (code === "YOUTUBE_QUOTA_EXCEEDED") {
    // Bulk-update queued jobs to deferred (done by quota tracker — just log here)
    const a: HealAction = {
      errorCode: code,
      module,
      actionTaken: "activate quota circuit breaker, defer all queued YouTube jobs",
      confidence: 1.0,
      riskLevel: "level2",
      status: "applied",
      result: "Quota breaker tripped, jobs deferred to midnight Pacific",
    };
    await persistAction(a);
    logDecision({
      module,
      decision: "self_heal_quota",
      reason: classification.message,
      actionTaken: a.actionTaken,
      confidence: 1.0,
    });
    return a;
  }

  if (code === "YOUTUBE_TOKEN_MISSING") {
    const a: HealAction = {
      errorCode: code,
      module,
      actionTaken: `mark channel needs_reconnect, suspend automation for channelId=${context.channelId ?? "unknown"}`,
      confidence: 0.95,
      riskLevel: "level2",
      status: "applied",
      notes: "User must reconnect YouTube OAuth",
    };
    await persistAction(a);
    logDecision({
      module,
      channelId: String(context.channelId ?? ""),
      decision: "self_heal_reconnect",
      reason: classification.message,
      actionTaken: a.actionTaken,
      confidence: 0.95,
      rollbackAvailable: true,
    });
    return a;
  }

  if (code === "PRODUCTION_GUARD") {
    const a: HealAction = {
      errorCode: code,
      module,
      actionTaken: `disable automation for demo userId=${context.userId ?? "unknown"}`,
      confidence: 1.0,
      riskLevel: "level2",
      status: "applied",
    };
    await persistAction(a);
    return a;
  }

  if (code === "UNSUPPORTED_PLATFORM") {
    const a: HealAction = {
      errorCode: code,
      module,
      actionTaken: `skip all jobs for platform=${context.platform ?? "unknown"}`,
      confidence: 1.0,
      riskLevel: "level2",
      status: "applied",
      result: "YouTube-only mode enforced",
    };
    await persistAction(a);
    return a;
  }

  return null;
}

// ── Level 3 repairs (high risk, staged only) ──────────────────────────────────

async function stageLevel3(
  classification: ErrorClassification,
  module: string,
  context: Record<string, unknown>,
): Promise<HealAction | null> {
  if (!classification.human_required) return null;

  const a: HealAction = {
    errorCode: classification.code,
    module,
    actionTaken: `staged: ${classification.action} — human review required`,
    confidence: 0,
    riskLevel: "level3",
    status: "staged",
    notes: `Auto-repair blocked: ${classification.message}`,
  };
  await persistAction(a);
  log.warn(`[SelfHeal] Level 3 action staged for ${module}: ${classification.code} — human review needed`);

  // Teach the brain about Level 3 failures — these are hard blockers the AI
  // should factor into future strategy (e.g. token missing = avoid dependent tasks).
  const userId = String(context.userId ?? "");
  if (userId && userId !== "dev_bypass_user") {
    import("./youtube-learning-brain").then(({ recordNegativePattern }) =>
      recordNegativePattern(userId, module, classification.code,
        `Level 3 blocked: ${classification.message.slice(0, 200)}`)
    ).catch(() => {});
  }

  return a;
}

// ── Public API ─────────────────────────────────────────────────────────────────

export const SelfHealingEngine = {
  /**
   * Classify an error and attempt appropriate auto-repair.
   * Returns the action taken (or null if no repair was applied).
   */
  async heal(
    err: unknown,
    module: string,
    context: Record<string, unknown> = {},
  ): Promise<HealAction | null> {
    // Skip if kill switch is active
    const killSwitchActive = await KillSwitches.isEnabled("self_healing");
    if (killSwitchActive) return null;

    const classification = classifyError(err, {
      module,
      userId: String(context.userId ?? ""),
      channelId: String(context.channelId ?? ""),
      jobId: context.jobId != null ? String(context.jobId) : undefined,
    });

    log.info(
      `[SelfHeal] ${module}: classified as ${classification.code} (severity=${classification.severity}, action=${classification.action})`,
    );

    // ── Knowledge base: check for a proven fix before applying default policy ──
    // If the KB has seen this exact module:errorCode pattern before and has a
    // high-confidence resolution, log it so the repair decision is informed.
    const knownFix = await lookupResolution(module, classification.code);
    if (knownFix && knownFix.confidence >= 0.5 && knownFix.successfulAction) {
      log.info(
        `[SelfHeal] KB hit — ${knownFix.fingerprint}: seen ${knownFix.occurrenceCount}x, ` +
        `confidence=${knownFix.confidence.toFixed(2)}, proven action="${knownFix.successfulAction}"`,
      );
    }

    // Level 1 — try first
    const l1 = await applyLevel1(classification, module, context);
    if (l1) {
      // Record the event + resolution to the knowledge base
      await recordError(err, module, context, l1.actionTaken);
      if (l1.status === "applied") {
        await recordResolution(module, classification.code, "auto_heal", l1.actionTaken);
      }
      return l1;
    }

    // Level 2 — medium risk
    const l2 = await applyLevel2(classification, module, context);
    if (l2) {
      await recordError(err, module, context, l2.actionTaken);
      if (l2.status === "applied") {
        await recordResolution(module, classification.code, "auto_heal", l2.actionTaken);
      }
      return l2;
    }

    // Level 3 — stage for human review
    if (classification.human_required) {
      const l3 = await stageLevel3(classification, module, context);
      await recordError(err, module, context, l3?.actionTaken ?? "staged");
      return l3;
    }

    // No repair applied — still record the raw event so the pattern accumulates
    await recordError(err, module, context);

    // Record unmapped errors as negative patterns so the brain learns about
    // recurring unclassified failures that the engine can't auto-fix yet.
    const userId = String(context.userId ?? "");
    if (userId && userId !== "dev_bypass_user") {
      import("./youtube-learning-brain").then(({ recordNegativePattern }) =>
        recordNegativePattern(userId, module, classification.code,
          `Unresolved error (no repair policy): ${classification.message.slice(0, 200)}`)
      ).catch(() => {});
    }

    return null;
  },

  /**
   * Shorthand: heal and return repair action string or null.
   */
  async tryHeal(err: unknown, module: string, ctx?: Record<string, unknown>): Promise<string | null> {
    const result = await this.heal(err, module, ctx ?? {});
    return result?.actionTaken ?? null;
  },

  /**
   * Get recent self-healing actions for dashboard.
   */
  async getRecentActions(limit = 20): Promise<HealAction[]> {
    try {
      const { db } = await import("../db");
      const { selfHealingActions } = await import("@shared/schema");
      const { desc } = await import("drizzle-orm");
      const rows = await db
        .select()
        .from(selfHealingActions)
        .orderBy(desc(selfHealingActions.createdAt))
        .limit(limit);
      return rows.map(r => ({
        errorCode: r.errorCode as ErrorCode,
        module: r.module,
        actionTaken: r.actionTaken,
        confidence: r.confidence ?? 0,
        riskLevel: r.riskLevel as HealSeverity,
        status: r.status as HealStatus,
        result: r.result ?? undefined,
        notes: r.notes ?? undefined,
      }));
    } catch {
      return [];
    }
  },
};

export default SelfHealingEngine;
