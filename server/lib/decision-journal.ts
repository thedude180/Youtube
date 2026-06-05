/**
 * server/lib/decision-journal.ts
 *
 * Phase 12 — Decision Journal
 *
 * Logs every important automated decision to the decision_journal table.
 * Wire into: growth changes, self-healing actions, publishing decisions,
 * quota/budget defer decisions.
 *
 * Uses fire-and-forget (no await needed at call sites) to avoid slowing
 * down the calling code path.
 */

import { createLogger } from "./logger";

const log = createLogger("decision-journal");

export interface DecisionEntry {
  module: string;
  userId?: string;
  channelId?: string;
  jobId?: string | number;
  decision: string;
  reason: string;
  inputs?: Record<string, unknown>;
  confidence?: number;         // 0–1
  expectedOutcome?: string;
  actionTaken?: string;
  result?: string;
  rollbackAvailable?: boolean;
}

let _dbReady = false;

// ── Lazy DB access to avoid circular imports ──────────────────────────────────

async function insertDecision(entry: DecisionEntry): Promise<void> {
  try {
    const { db } = await import("../db");
    const { decisionJournal } = await import("@shared/schema");

    await db.insert(decisionJournal).values({
      module:             entry.module,
      userId:             entry.userId ?? null,
      channelId:          entry.channelId ?? null,
      jobId:              entry.jobId != null ? String(entry.jobId) : null,
      decision:           entry.decision,
      reason:             entry.reason,
      inputs:             entry.inputs ?? {},
      confidence:         entry.confidence ?? null,
      expectedOutcome:    entry.expectedOutcome ?? null,
      actionTaken:        entry.actionTaken ?? null,
      result:             entry.result ?? null,
      rollbackAvailable:  entry.rollbackAvailable ?? false,
      timestamp:          new Date(),
    } as any);
    _dbReady = true;
  } catch (err: any) {
    // Table may not exist yet (degraded mode) — fail silently
    if (!_dbReady) {
      log.warn(`[DecisionJournal] DB not ready (decision_journal table may be missing): ${err?.message}`);
    }
  }
}

// ── Public API ─────────────────────────────────────────────────────────────────

/**
 * Log an automated decision. Fire-and-forget — never awaited.
 */
export function logDecision(entry: DecisionEntry): void {
  insertDecision(entry).catch((err) => {
    log.warn(`[DecisionJournal] Failed to persist: ${err?.message}`);
  });
}

/**
 * Async version for callers that want to confirm the write.
 */
export async function logDecisionAsync(entry: DecisionEntry): Promise<void> {
  await insertDecision(entry);
}

/**
 * Convenience shortcuts for common decision types.
 */
export const Journal = {
  quotaDeferred(module: string, jobCount: number, userId?: string): void {
    logDecision({
      module,
      userId,
      decision: "defer_quota",
      reason: "YouTube API daily quota exhausted",
      actionTaken: `Deferred ${jobCount} jobs to midnight Pacific`,
      expectedOutcome: "Jobs retry after quota reset",
      confidence: 1.0,
    });
  },

  budgetDeferred(module: string, userId?: string): void {
    logDecision({
      module,
      userId,
      decision: "defer_budget",
      reason: "AI token hourly budget exhausted",
      actionTaken: "Skipping AI call until next hour",
      expectedOutcome: "Budget resets in < 1h",
      confidence: 1.0,
    });
  },

  channelPaused(channelId: string, reason: string): void {
    logDecision({
      module: "channel-validator",
      channelId,
      decision: "pause_channel",
      reason,
      actionTaken: "Set channel status to needs_reconnect, automationPaused=true",
      expectedOutcome: "User reconnects OAuth",
      rollbackAvailable: true,
      confidence: 1.0,
    });
  },

  selfHealApplied(module: string, action: string, confidence: number, jobId?: string | number): void {
    logDecision({
      module,
      jobId,
      decision: "self_heal",
      reason: "Automatic repair applied by self-healing engine",
      actionTaken: action,
      confidence,
      rollbackAvailable: confidence < 0.9,
    });
  },

  growthExperiment(module: string, hypothesis: string, action: string, confidence: number, userId?: string): void {
    logDecision({
      module,
      userId,
      decision: "growth_experiment",
      reason: hypothesis,
      actionTaken: action,
      confidence,
      rollbackAvailable: true,
    });
  },

  publishDecision(module: string, videoId: string, decision: string, reason: string, userId?: string): void {
    logDecision({
      module,
      userId,
      jobId: videoId,
      decision: "publish",
      reason,
      actionTaken: decision,
      confidence: 1.0,
    });
  },
};

export default Journal;
