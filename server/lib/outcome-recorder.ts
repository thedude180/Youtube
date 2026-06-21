/**
 * outcome-recorder.ts
 *
 * Universal, single-call outcome recorder for every service and process.
 *
 * The learning brain reads `learningInsights` in its daily cycle and
 * synthesises everything written here into masterKnowledgeBank.
 * This closes the feedback loop for every operational service that
 * currently only logs to console.
 *
 * Design rules:
 *  • One import, one call: `await recordOutcome({ engine, userId, ... })`
 *  • Always silent on failure — never worth crashing a service over.
 *  • category format:  "{engine}:{type}"  e.g. "pre-seo:cycle_complete"
 *  • The brain's cross-engine intake reads patterns by category prefix.
 */

import { db } from "../db";
import { learningInsights } from "@shared/schema";
import { createLogger } from "./logger";

const logger = createLogger("outcome-recorder");

export interface OutcomeMetrics {
  [key: string]: number | string | boolean | null | undefined;
}

/**
 * Record a structured service outcome to learningInsights.
 *
 * @param engine         - Service name (e.g. "pre-seo", "shorts-publisher")
 * @param userId         - User the outcome belongs to
 * @param category       - Outcome type (e.g. "cycle_complete", "hot_streak", "pipeline_health")
 * @param summary        - Human-readable 1-line description of what happened
 * @param metrics        - Key/value pairs (counts, scores, durations, etc.)
 * @param confidence     - 0.0-1.0 confidence in the finding (default 0.65)
 * @param recommendation - Optional action the system should take as a result
 */
export async function recordOutcome(opts: {
  engine: string;
  userId: string;
  category: string;
  summary: string;
  metrics?: OutcomeMetrics;
  confidence?: number;
  recommendation?: string;
}): Promise<void> {
  try {
    const {
      engine, userId, category, summary,
      metrics = {}, confidence = 0.65,
      recommendation = "Monitor and continue",
    } = opts;

    const evidence = Object.entries(metrics)
      .filter(([, v]) => v !== undefined && v !== null)
      .map(([k, v]) => `${k}: ${v}`)
      .slice(0, 10); // cap at 10 evidence items

    await db.insert(learningInsights).values({
      userId,
      category: `${engine}:${category}`,
      pattern: summary.slice(0, 200),
      confidence,
      sampleSize: 1,
      data: {
        finding:         summary,
        evidence,
        recommendation,
        platform:        "youtube",
        lastValidated:   new Date().toISOString(),
      },
    });
  } catch (err: any) {
    // Never propagate — outcome recording must never crash a service
    logger.debug(`[OutcomeRecorder] Non-fatal write failure for ${opts.engine}: ${err?.message?.slice(0, 100)}`);
  }
}

/**
 * Convenience: record only when something noteworthy happened.
 * No-ops silently when published + failed + stuck are all zero.
 */
export async function recordPublishOutcome(opts: {
  engine: string;
  userId: string;
  published: number;
  failed: number;
  skipped: number;
  gameName?: string | null;
  contentType?: string;
  quotaExhausted?: boolean;
}): Promise<void> {
  const { published, failed, skipped, quotaExhausted } = opts;
  if (published === 0 && failed === 0) return; // nothing interesting happened

  const status  = published > 0 ? "published" : failed > 0 ? "failed" : "skipped";
  const summary = `${opts.engine}: ${published} published, ${failed} failed, ${skipped} skipped` +
    (opts.gameName ? ` (game: ${opts.gameName})` : "") +
    (quotaExhausted ? " — quota exhausted" : "");

  const confidence = published > 0 && failed === 0 ? 0.8
    : failed > 0 && published === 0 ? 0.55
    : 0.65;

  const recommendation = quotaExhausted
    ? "Quota exhausted — system will resume at midnight Pacific. No action needed."
    : failed > 0 && published === 0
      ? `All ${failed} publish attempt(s) failed — check OAuth token and video vault`
      : published > 0
        ? `Pipeline healthy — ${published} video(s) published successfully`
        : "Monitor for retry";

  await recordOutcome({
    engine:  opts.engine,
    userId:  opts.userId,
    category: `publish_${status}`,
    summary,
    metrics: {
      published,
      failed,
      skipped,
      contentType: opts.contentType ?? "unknown",
      gameName:    opts.gameName ?? "unknown",
      quotaExhausted: quotaExhausted ? 1 : 0,
    },
    confidence,
    recommendation,
  });
}
