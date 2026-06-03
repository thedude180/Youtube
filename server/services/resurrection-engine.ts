/**
 * server/services/resurrection-engine.ts
 *
 * Resurrection Engine — Nothing Stays Dead Forever
 *
 * Scans for "permanently failed" items across the entire pipeline and gives
 * them another chance after a cooldown window. No item is ever truly permanent.
 *
 * Cooldown windows by failure reason:
 *   invalid_keywords   → 24h   (sanitizer fix should be deployed)
 *   format_unavailable → 72h   (YouTube sometimes restores formats)
 *   yt_dlp_timeout     → 6h    (transient throttling)
 *   quota_exceeded     → next quota reset (07:05 UTC)
 *   ffmpeg_timeout     → 24h   (fresh boot, new constraints)
 *   ai_queue_full      → 2h    (saturation clears)
 *   network_timeout    → 4h    (transient)
 *   unknown            → 48h   (conservative default)
 *
 * Runs every 4 hours on a jittered interval.
 */
import { createLogger } from "../lib/logger";
import { setJitteredInterval } from "../lib/timer-utils";
import { db } from "../db";
import { sql } from "drizzle-orm";

const log = createLogger("resurrection-engine");

const MAX_RESURRECTIONS = 10;
const EXTENDED_MAX = 20;
const RUN_INTERVAL_MS = 4 * 60 * 60 * 1000;

function nextQuotaResetMs(): number {
  const now = new Date();
  const reset = new Date(now);
  reset.setUTCHours(7, 5, 0, 0);
  if (reset <= now) reset.setUTCDate(reset.getUTCDate() + 1);
  return reset.getTime() - now.getTime();
}

type FailureReason =
  | "invalid_keywords"
  | "format_unavailable"
  | "yt_dlp_timeout"
  | "quota_exceeded"
  | "ffmpeg_timeout"
  | "ai_queue_full"
  | "network_timeout"
  | "unknown";

function classifyError(errorMessage: string): FailureReason {
  const msg = errorMessage.toLowerCase();
  if (msg.includes("invalid video keywords") || msg.includes("invalid keyword"))
    return "invalid_keywords";
  if (msg.includes("requested format is not available") || msg.includes("format_unavailable"))
    return "format_unavailable";
  if (msg.includes("timed out") && msg.includes("yt-dlp"))
    return "yt_dlp_timeout";
  if (msg.includes("quota") && (msg.includes("exceeded") || msg.includes("cap reached")))
    return "quota_exceeded";
  if (msg.includes("ffmpeg") && msg.includes("timeout"))
    return "ffmpeg_timeout";
  if (msg.includes("ai queue full"))
    return "ai_queue_full";
  if (msg.includes("timeout") || msg.includes("aborted") || msg.includes("econnreset"))
    return "network_timeout";
  return "unknown";
}

function getCooldownMs(reason: FailureReason, resurrectionCount: number): number {
  const multiplier = Math.min(resurrectionCount, 5);
  const baseCooldowns: Record<FailureReason, number> = {
    invalid_keywords:   24 * 60 * 60 * 1000,
    format_unavailable: 72 * 60 * 60 * 1000,
    yt_dlp_timeout:      6 * 60 * 60 * 1000,
    quota_exceeded:     nextQuotaResetMs(),
    ffmpeg_timeout:     24 * 60 * 60 * 1000,
    ai_queue_full:       2 * 60 * 60 * 1000,
    network_timeout:     4 * 60 * 60 * 1000,
    unknown:            48 * 60 * 60 * 1000,
  };
  const base = baseCooldowns[reason];
  if (reason === "quota_exceeded") return base;
  return base * Math.max(1, multiplier);
}

interface ResurrectionTarget {
  table:                  string;
  idColumn:               string;
  statusColumn:           string;
  errorColumn:            string;
  retryAfterColumn:       string;
  resurrectionCountColumn: string;
  attemptsColumn:         string | null;
  failedStatuses:         string[];
  resetStatus:            string;
  label:                  string;
}

const TARGETS: ResurrectionTarget[] = [
  {
    table:                  "youtube_push_backlog",
    idColumn:               "id",
    statusColumn:           "status",
    errorColumn:            "last_error",
    retryAfterColumn:       "retry_after",
    resurrectionCountColumn: "resurrection_count",
    attemptsColumn:         "attempts",
    failedStatuses:         ["permanently_failed", "failed"],
    resetStatus:            "queued",
    label:                  "YouTube push backlog",
  },
  {
    table:                  "content_vault_backups",
    idColumn:               "id",
    statusColumn:           "status",
    errorColumn:            "download_error",
    retryAfterColumn:       "retry_after",
    resurrectionCountColumn: "resurrection_count",
    attemptsColumn:         null,
    failedStatuses:         ["permanently_failed", "failed", "download_failed"],
    resetStatus:            "indexed",
    label:                  "Content vault downloads",
  },
  {
    table:                  "pre_encoder_queue",
    idColumn:               "id",
    statusColumn:           "status",
    errorColumn:            "last_error",
    retryAfterColumn:       "retry_after",
    resurrectionCountColumn: "resurrection_count",
    attemptsColumn:         "attempt_count",
    failedStatuses:         ["permanently_failed", "failed"],
    resetStatus:            "pending",
    label:                  "Pre-encoder queue",
  },
  {
    table:                  "shorts_clip_queue",
    idColumn:               "id",
    statusColumn:           "status",
    errorColumn:            "last_error",
    retryAfterColumn:       "retry_after",
    resurrectionCountColumn: "resurrection_count",
    attemptsColumn:         "attempt_count",
    failedStatuses:         ["permanently_failed", "failed"],
    resetStatus:            "pending",
    label:                  "Shorts clip queue",
  },
  {
    table:                  "video_metadata_sync_queue",
    idColumn:               "id",
    statusColumn:           "status",
    errorColumn:            "last_error",
    retryAfterColumn:       "retry_after",
    resurrectionCountColumn: "resurrection_count",
    attemptsColumn:         "attempt_count",
    failedStatuses:         ["permanently_failed", "failed"],
    resetStatus:            "pending",
    label:                  "Metadata sync queue",
  },
];

async function resurrectTarget(target: ResurrectionTarget): Promise<number> {
  const failedList = target.failedStatuses.map(s => `'${s}'`).join(",");

  const candidates = await db.execute(sql.raw(`
    SELECT
      ${target.idColumn}                                AS id,
      COALESCE(${target.errorColumn}, '')               AS error_message,
      COALESCE(${target.resurrectionCountColumn}, 0)    AS resurrection_count,
      ${target.retryAfterColumn}                        AS retry_after
    FROM ${target.table}
    WHERE ${target.statusColumn} = ANY(ARRAY[${failedList}])
      AND (
        ${target.retryAfterColumn} IS NULL
        OR ${target.retryAfterColumn} <= NOW()
      )
    ORDER BY ${target.retryAfterColumn} ASC NULLS FIRST
    LIMIT 100
  `));

  if (candidates.rows.length === 0) return 0;

  let resurrected = 0;

  for (const row of candidates.rows as any[]) {
    const resCount  = Number(row.resurrection_count ?? 0);
    const errorMsg  = String(row.error_message ?? "");
    const reason    = classifyError(errorMsg);
    const itemId    = row.id;

    if (resCount >= EXTENDED_MAX) {
      await db.execute(sql.raw(`
        UPDATE ${target.table}
        SET
          ${target.statusColumn} = 'archived',
          ${target.errorColumn}  = COALESCE(${target.errorColumn}, '') ||
            ' [Archived after ${EXTENDED_MAX} resurrections — needs manual review]'
        WHERE ${target.idColumn} = '${itemId}'
      `));
      log.warn(
        `[Resurrection] ARCHIVED ${target.label} id=${itemId} after ${resCount} resurrections. ` +
        `Last error: ${errorMsg.slice(0, 100)}`
      );
      continue;
    }

    if (resCount >= MAX_RESURRECTIONS) {
      const retryAfter = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);
      const attemptsClause = target.attemptsColumn
        ? `${target.attemptsColumn} = 0,` : "";
      await db.execute(sql.raw(`
        UPDATE ${target.table}
        SET
          ${target.statusColumn}           = '${target.resetStatus}',
          ${attemptsClause}
          ${target.retryAfterColumn}       = '${retryAfter.toISOString()}',
          ${target.resurrectionCountColumn} = ${resCount + 1}
        WHERE ${target.idColumn} = '${itemId}'
      `));
      log.warn(
        `[Resurrection] Extended cooldown (7 days) for ${target.label} id=${itemId} ` +
        `(${resCount} prior resurrections). Reason: ${reason}`
      );
      resurrected++;
      continue;
    }

    const cooldownMs = getCooldownMs(reason, resCount);
    const retryAfter = new Date(Date.now() + cooldownMs);
    const attemptsClause = target.attemptsColumn
      ? `${target.attemptsColumn} = 0,` : "";

    await db.execute(sql.raw(`
      UPDATE ${target.table}
      SET
        ${target.statusColumn}           = '${target.resetStatus}',
        ${attemptsClause}
        ${target.retryAfterColumn}       = '${retryAfter.toISOString()}',
        ${target.resurrectionCountColumn} = ${resCount + 1}
      WHERE ${target.idColumn} = '${itemId}'
    `));

    const cooldownHours = Math.round(cooldownMs / 1000 / 60 / 60 * 10) / 10;
    log.info(
      `[Resurrection] ✅ Resurrected ${target.label} id=${itemId} | ` +
      `reason=${reason} | resurrection #${resCount + 1} | ` +
      `retry in ${cooldownHours}h at ${retryAfter.toISOString()}`
    );
    resurrected++;
  }

  return resurrected;
}

export async function runResurrectionCycle(): Promise<void> {
  log.info("[Resurrection] Starting resurrection cycle");
  let totalResurrected = 0;

  for (const target of TARGETS) {
    try {
      const count = await resurrectTarget(target);
      if (count > 0) {
        log.info(`[Resurrection] ${target.label}: resurrected ${count} items`);
      }
      totalResurrected += count;
    } catch (err: any) {
      // Table may not exist yet — skip gracefully.
      // Drizzle wraps the real PG error as "Failed query: <SQL>" so also
      // inspect the cause chain and the stack string.
      const msg       = err?.message ?? String(err);
      const causeMsg  = err?.cause?.message ?? "";
      const stack     = err?.stack ?? "";
      const allText   = (msg + causeMsg + stack).toLowerCase();
      if (allText.includes("does not exist") || allText.includes("relation") || allText.includes("failed query")) {
        log.debug(`[Resurrection] Skipping ${target.label} — table/column not ready: ${msg.slice(0, 120)}`);
      } else {
        log.error(`[Resurrection] Error processing ${target.label}:`, err);
      }
    }
  }

  if (totalResurrected > 0) {
    log.info(`[Resurrection] Cycle complete — ${totalResurrected} total items returned to queue`);
  } else {
    log.info("[Resurrection] Cycle complete — nothing to resurrect");
  }
}

let stopResurrection: (() => void) | null = null;

export function startResurrectionEngine(): void {
  if (stopResurrection) {
    log.warn("[Resurrection] Already running");
    return;
  }

  log.info("[Resurrection] Starting — run interval: ~4 hours");

  setTimeout(
    () => runResurrectionCycle().catch(err => log.error("[Resurrection] Startup run error:", err)),
    5 * 60 * 1000
  );

  stopResurrection = setJitteredInterval(
    () => runResurrectionCycle().catch(err => log.error("[Resurrection] Cycle error:", err)),
    RUN_INTERVAL_MS,
  );
}

export function stopResurrectionEngine(): void {
  if (stopResurrection) {
    stopResurrection();
    stopResurrection = null;
    log.info("[Resurrection] Stopped");
  }
}
