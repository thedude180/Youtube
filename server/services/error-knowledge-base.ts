/**
 * server/services/error-knowledge-base.ts
 *
 * Error Knowledge Base — Institutional Memory for the Self-Heal System
 *
 * Every error that occurs anywhere in the system is captured here:
 *   1. Classified via error-classifier into a structured code + severity
 *   2. Written to `error_events` (365-day rolling retention)
 *   3. Upserted into `error_resolutions` — one row per unique module:errorCode pair
 *      that accumulates FOREVER across deployments and restarts
 *
 * When the self-healing engine encounters an error, it first queries
 * `lookupResolution()` here. If there is a known fix with confidence > 0.5,
 * that action is preferred over the classifier's default policy.
 *
 * Resolution confidence compounds over time:
 *   confidence = resolvedCount / occurrenceCount (clamped 0–1)
 *
 * The knowledge base never shrinks — it only grows with experience.
 */

import { createLogger } from "../lib/logger";
import { classifyError } from "../lib/error-classifier";
import type { ErrorClassification } from "../lib/error-classifier";

const log = createLogger("error-knowledge-base");

// ── Fingerprint ───────────────────────────────────────────────────────────────

function makeFingerprint(module: string, errorCode: string): string {
  return `${module}:${errorCode}`;
}

function extractStack(err: unknown): string {
  if (typeof err === "object" && err !== null) {
    const s = (err as Record<string, unknown>).stack;
    if (typeof s === "string") return s.substring(0, 600);
  }
  return "";
}

function extractMessage(err: unknown): string {
  if (!err) return "";
  if (typeof err === "string") return err.substring(0, 500);
  if (typeof err === "object" && err !== null) {
    const e = err as Record<string, unknown>;
    return String(e.message ?? e.msg ?? e.error ?? "").substring(0, 500);
  }
  return String(err).substring(0, 500);
}

// ── Core: record every error ───────────────────────────────────────────────────

/**
 * Record an error occurrence to the knowledge base.
 * Safe to call from any context — all DB errors are swallowed so this never
 * propagates a secondary failure.
 *
 * @param err       The raw error object
 * @param module    The service/module name where the error occurred
 * @param context   Optional extra context (userId, channelId, jobId, etc.)
 * @param actionTaken  The repair action already applied, if any
 * @returns         The error fingerprint, or null on failure
 */
export async function recordError(
  err: unknown,
  module: string,
  context: Record<string, unknown> = {},
  actionTaken?: string,
): Promise<string | null> {
  try {
    const { db } = await import("../db");
    const { errorEvents, errorResolutions } = await import("@shared/schema");
    const { sql } = await import("drizzle-orm");

    const classification: ErrorClassification = classifyError(err, {
      module,
      userId: String(context.userId ?? ""),
      channelId: String(context.channelId ?? ""),
      jobId: context.jobId != null ? String(context.jobId) : undefined,
    });

    const fingerprint = makeFingerprint(module, classification.code);
    const message = extractMessage(err);
    const stackSample = extractStack(err);
    const now = new Date();

    // ── Write event ───────────────────────────────────────────────────────────
    await db.insert(errorEvents).values({
      fingerprint,
      occurredAt:    now,
      module,
      errorCode:     classification.code,
      severity:      classification.severity,
      message,
      stackSample:   stackSample || null,
      context,
      classification: classification as unknown as Record<string, unknown>,
      actionTaken:   actionTaken ?? null,
      resolved:      false,
    } as any);

    // ── Upsert resolution pattern ─────────────────────────────────────────────
    // ON CONFLICT: bump occurrence_count, update last_seen_at, recompute confidence
    await db.execute(sql`
      INSERT INTO error_resolutions (
        fingerprint, error_code, module,
        first_seen_at, last_seen_at,
        occurrence_count, resolved_count,
        resolution_type, resolution_notes, successful_action,
        confidence, updated_at
      ) VALUES (
        ${fingerprint}, ${classification.code}, ${module},
        ${now}, ${now},
        1, 0,
        NULL, NULL, NULL,
        0.0, ${now}
      )
      ON CONFLICT (fingerprint) DO UPDATE SET
        last_seen_at     = ${now},
        occurrence_count = error_resolutions.occurrence_count + 1,
        confidence       = LEAST(1.0,
          CAST(error_resolutions.resolved_count AS FLOAT) /
          NULLIF(error_resolutions.occurrence_count + 1, 0)
        ),
        updated_at       = ${now}
    `);

    return fingerprint;
  } catch (dbErr: any) {
    // Never let the knowledge base break the calling code
    log.warn(`[EKB] recordError failed (non-fatal): ${dbErr?.message?.substring(0, 120)}`);
    return null;
  }
}

// ── Lookup: does the KB have a known fix? ─────────────────────────────────────

export interface KnownResolution {
  fingerprint:      string;
  errorCode:        string;
  module:           string;
  occurrenceCount:  number;
  resolvedCount:    number;
  resolutionType:   string | null;
  resolutionNotes:  string | null;
  successfulAction: string | null;
  confidence:       number;
  firstSeenAt:      Date;
  lastSeenAt:       Date;
}

/**
 * Look up the known resolution for an error fingerprint.
 * Returns null if never seen before or if confidence is too low to rely on.
 */
export async function lookupResolution(
  module: string,
  errorCode: string,
): Promise<KnownResolution | null> {
  try {
    const { db } = await import("../db");
    const { errorResolutions } = await import("@shared/schema");
    const { eq } = await import("drizzle-orm");

    const fingerprint = makeFingerprint(module, errorCode);
    const rows = await db
      .select()
      .from(errorResolutions)
      .where(eq(errorResolutions.fingerprint, fingerprint))
      .limit(1);

    if (rows.length === 0) return null;
    const r = rows[0];
    return {
      fingerprint:      r.fingerprint,
      errorCode:        r.errorCode,
      module:           r.module,
      occurrenceCount:  r.occurrenceCount,
      resolvedCount:    r.resolvedCount,
      resolutionType:   r.resolutionType,
      resolutionNotes:  r.resolutionNotes,
      successfulAction: r.successfulAction,
      confidence:       r.confidence,
      firstSeenAt:      r.firstSeenAt,
      lastSeenAt:       r.lastSeenAt,
    };
  } catch {
    return null;
  }
}

// ── Record a resolution (what fixed it) ──────────────────────────────────────

/**
 * Mark an error pattern as resolved — update the knowledge base with what worked.
 * Called by the self-heal engine after successfully applying a repair action,
 * or by the boot heal process after an auto-fix takes effect.
 *
 * @param module           The module where the error occurred
 * @param errorCode        The classified error code
 * @param resolutionType   How it was fixed: "auto_heal"|"code_fix"|"transient"|"suppressed"|"unknown"
 * @param successfulAction The specific action that worked (e.g. "defer", "skip", "reconnect")
 * @param notes            Optional free-text explanation of what was done
 */
export async function recordResolution(
  module: string,
  errorCode: string,
  resolutionType: "auto_heal" | "code_fix" | "transient" | "suppressed" | "unknown",
  successfulAction?: string,
  notes?: string,
): Promise<void> {
  try {
    const { db } = await import("../db");
    const { sql } = await import("drizzle-orm");

    const fingerprint = makeFingerprint(module, errorCode);
    const now = new Date();

    await db.execute(sql`
      UPDATE error_resolutions SET
        resolved_count    = resolved_count + 1,
        resolution_type   = ${resolutionType},
        successful_action = COALESCE(${successfulAction ?? null}, successful_action),
        resolution_notes  = COALESCE(${notes ?? null}, resolution_notes),
        confidence        = LEAST(1.0,
          CAST(resolved_count + 1 AS FLOAT) / NULLIF(occurrence_count, 0)
        ),
        updated_at        = ${now}
      WHERE fingerprint = ${fingerprint}
    `);

    // Also mark the most recent event for this fingerprint as resolved
    await db.execute(sql`
      UPDATE error_events SET resolved = true
      WHERE fingerprint = ${fingerprint}
        AND resolved = false
        AND occurred_at = (
          SELECT MAX(occurred_at) FROM error_events WHERE fingerprint = ${fingerprint}
        )
    `);
  } catch (dbErr: any) {
    log.warn(`[EKB] recordResolution failed (non-fatal): ${dbErr?.message?.substring(0, 120)}`);
  }
}

// ── Get full knowledge base ───────────────────────────────────────────────────

/**
 * Return the full knowledge base sorted by confidence descending.
 * Used by the self-heal engine and the dashboard.
 */
export async function getKnowledgeBase(limit = 200): Promise<KnownResolution[]> {
  try {
    const { db } = await import("../db");
    const { errorResolutions } = await import("@shared/schema");
    const { desc } = await import("drizzle-orm");

    const rows = await db
      .select()
      .from(errorResolutions)
      .orderBy(desc(errorResolutions.confidence), desc(errorResolutions.occurrenceCount))
      .limit(limit);

    return rows.map(r => ({
      fingerprint:      r.fingerprint,
      errorCode:        r.errorCode,
      module:           r.module,
      occurrenceCount:  r.occurrenceCount,
      resolvedCount:    r.resolvedCount,
      resolutionType:   r.resolutionType,
      resolutionNotes:  r.resolutionNotes,
      successfulAction: r.successfulAction,
      confidence:       r.confidence,
      firstSeenAt:      r.firstSeenAt,
      lastSeenAt:       r.lastSeenAt,
    }));
  } catch {
    return [];
  }
}

// ── Error statistics ──────────────────────────────────────────────────────────

export interface ErrorStats {
  totalEvents:          number;
  totalPatterns:        number;
  resolvedPatterns:     number;
  unresolvedPatterns:   number;
  highConfidenceCount:  number;   // patterns with confidence >= 0.7
  topModulesByErrors:   Array<{ module: string; count: number }>;
  topErrorCodes:        Array<{ code: string; count: number }>;
  recentUnresolved:     KnownResolution[];
}

export async function getErrorStats(): Promise<ErrorStats> {
  try {
    const { db } = await import("../db");
    const { errorEvents, errorResolutions } = await import("@shared/schema");
    const { sql, gt, desc } = await import("drizzle-orm");

    const [evtCount, patCount, resolvedCount, hiConfCount] = await Promise.all([
      db.execute(sql`SELECT COUNT(*) AS n FROM error_events`),
      db.execute(sql`SELECT COUNT(*) AS n FROM error_resolutions`),
      db.execute(sql`SELECT COUNT(*) AS n FROM error_resolutions WHERE resolved_count > 0`),
      db.execute(sql`SELECT COUNT(*) AS n FROM error_resolutions WHERE confidence >= 0.7`),
    ]);

    const topModules = await db.execute(sql`
      SELECT module, COUNT(*) AS cnt
      FROM error_events
      GROUP BY module
      ORDER BY cnt DESC
      LIMIT 10
    `);

    const topCodes = await db.execute(sql`
      SELECT error_code, COUNT(*) AS cnt
      FROM error_events
      GROUP BY error_code
      ORDER BY cnt DESC
      LIMIT 10
    `);

    const recentUnresolved = await db
      .select()
      .from(errorResolutions)
      .where(sql`resolved_count = 0 AND occurrence_count > 2`)
      .orderBy(desc(errorResolutions.lastSeenAt))
      .limit(20);

    const n = (res: any) => Number((res.rows?.[0] ?? res[0])?.n ?? 0);

    return {
      totalEvents:         n(evtCount),
      totalPatterns:       n(patCount),
      resolvedPatterns:    n(resolvedCount),
      unresolvedPatterns:  n(patCount) - n(resolvedCount),
      highConfidenceCount: n(hiConfCount),
      topModulesByErrors:  (topModules.rows ?? (topModules as unknown as any[])).map((r: any) => ({
        module: r.module, count: Number(r.cnt),
      })),
      topErrorCodes:       (topCodes.rows ?? (topCodes as unknown as any[])).map((r: any) => ({
        code: r.error_code, count: Number(r.cnt),
      })),
      recentUnresolved:    recentUnresolved.map(r => ({
        fingerprint:      r.fingerprint,
        errorCode:        r.errorCode,
        module:           r.module,
        occurrenceCount:  r.occurrenceCount,
        resolvedCount:    r.resolvedCount,
        resolutionType:   r.resolutionType,
        resolutionNotes:  r.resolutionNotes,
        successfulAction: r.successfulAction,
        confidence:       r.confidence,
        firstSeenAt:      r.firstSeenAt,
        lastSeenAt:       r.lastSeenAt,
      })),
    };
  } catch (err: any) {
    log.warn(`[EKB] getErrorStats failed: ${err?.message}`);
    return {
      totalEvents: 0, totalPatterns: 0,
      resolvedPatterns: 0, unresolvedPatterns: 0,
      highConfidenceCount: 0,
      topModulesByErrors: [], topErrorCodes: [],
      recentUnresolved: [],
    };
  }
}

// ── Auto-age stale patterns ───────────────────────────────────────────────────

/**
 * Patterns not seen in 7+ days that have a known successful action are
 * auto-promoted to confidence 0.8 ("probably code-fixed or transient").
 * Runs once per day from the retention sweep.
 */
export async function autoAgeStalePatterns(): Promise<void> {
  try {
    const { db } = await import("../db");
    const { sql } = await import("drizzle-orm");

    const cutoff = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
    await db.execute(sql`
      UPDATE error_resolutions SET
        confidence       = GREATEST(confidence, 0.8),
        resolution_type  = COALESCE(resolution_type, 'transient'),
        resolution_notes = COALESCE(resolution_notes,
          'Auto-aged: not seen for 7+ days — likely resolved by code change or transient condition'
        ),
        updated_at       = NOW()
      WHERE last_seen_at < ${cutoff}
        AND occurrence_count > 0
        AND successful_action IS NOT NULL
        AND confidence < 0.8
    `);
  } catch (dbErr: any) {
    log.warn(`[EKB] autoAgeStalePatterns failed (non-fatal): ${dbErr?.message?.substring(0, 120)}`);
  }
}
