/**
 * fast-learner.ts
 *
 * THE PAIN REFLEX — closes the failure→learning gap from 24h to <10 minutes.
 *
 * A human yanks their hand from fire in 50ms.  It does not wait 24 hours for
 * the brain's daily review cycle.  This engine detects failure patterns in
 * real time and immediately writes blocking rules that every service can check
 * before acting — without touching a line of service code beyond a single
 * checkFastBlock() call.
 *
 * ┌──────────────────────────────────────────────────────────────────────────┐
 * │  DETECTION PATTERNS (run every 10 minutes)                               │
 * │                                                                          │
 * │  1. CONTENT_TYPE  — same contentType fails 3+ times in 2h               │
 * │       → block that contentType from queuing for 4h                       │
 * │                                                                          │
 * │  2. SOURCE_VIDEO  — same source_video_id causes 3+ failures in 2h       │
 * │       → block new clips from that source for 6h                          │
 * │                                                                          │
 * │  3. ERROR_STORM   — same error text appears 5+ times in 30min           │
 * │       → log incident immediately (systemic — needs investigation)        │
 * └──────────────────────────────────────────────────────────────────────────┘
 *
 * Blocks written to:  service_state("fast-learner", "blocks")  (array)
 * Check with:         checkFastBlock(type, target) — importable, never throws
 * Brain Step 9v:      promotes surviving long-lived blocks → masterKnowledgeBank
 */

import { db }                      from "../db";
import { sql }                     from "drizzle-orm";
import { createLogger }            from "../lib/logger";
import { getState, setStateAsync } from "../lib/service-state";
import { logSystemIncident }       from "../lib/incident-log";

const logger = createLogger("fast-learner");

const REAL_USER_ID = "7210ff92-76dd-4d0a-80bb-9eb5be27508b";

const SCAN_INTERVAL_MS = 10 * 60_000;   // every 10 min
const INITIAL_DELAY_MS  = 8 * 60_000;   // first scan T+8min after init

// Thresholds
const CT_FAIL_THRESHOLD  = 3;     // content-type failures in window
const CT_WINDOW_HOURS    = 2;
const CT_BLOCK_HOURS     = 4;

const SV_FAIL_THRESHOLD  = 3;     // source-video failures in window
const SV_WINDOW_HOURS    = 2;
const SV_BLOCK_HOURS     = 6;

const ERR_STORM_THRESHOLD  = 5;   // same error text occurrences
const ERR_STORM_WINDOW_MIN = 30;

// ── Types ──────────────────────────────────────────────────────────────────

export type FastBlockType = "CONTENT_TYPE" | "SOURCE_VIDEO" | "ERROR_PATTERN";

export interface FastBlock {
  id:            string;
  type:          FastBlockType;
  target:        string;
  reason:        string;
  detectedCount: number;
  windowMs:      number;
  createdAt:     string;
  expiresAt:     string;
  promoted:      boolean;
}

// ── Persistence ────────────────────────────────────────────────────────────

async function readBlocks(): Promise<FastBlock[]> {
  const stored = await getState<{ blocks: FastBlock[] }>("fast-learner", "blocks");
  return stored?.blocks ?? [];
}

async function writeBlocks(blocks: FastBlock[]): Promise<void> {
  await setStateAsync("fast-learner", "blocks", { blocks } as unknown as Record<string, unknown>);
}

function pruneExpired(blocks: FastBlock[]): FastBlock[] {
  const now = Date.now();
  return blocks.filter(b => new Date(b.expiresAt).getTime() > now);
}

function blockId(type: FastBlockType, target: string): string {
  return `${type}::${target}`;
}

// ── Public: check before acting ────────────────────────────────────────────

/**
 * Returns true if the (type, target) pair is currently blocked.
 * ALWAYS fails open (returns false) if service_state is unavailable.
 *
 * Example usage:
 *   if (await checkFastBlock("SOURCE_VIDEO", String(sourceVideoId))) return;
 */
export async function checkFastBlock(type: FastBlockType, target: string): Promise<boolean> {
  try {
    const blocks = await readBlocks();
    const now = Date.now();
    return blocks.some(b =>
      b.type === type &&
      b.target === target &&
      new Date(b.expiresAt).getTime() > now,
    );
  } catch {
    return false;
  }
}

// ── Public: expose active blocks for brain / dashboard ────────────────────

export async function getActiveBlocks(): Promise<FastBlock[]> {
  const blocks = await readBlocks();
  const now = Date.now();
  return blocks.filter(b => new Date(b.expiresAt).getTime() > now);
}

export async function markBlockPromoted(blockId: string): Promise<void> {
  const blocks = await readBlocks();
  const updated = blocks.map(b => b.id === blockId ? { ...b, promoted: true } : b);
  await writeBlocks(updated);
}

// ── Detection 1: content-type failure pattern ──────────────────────────────

async function detectContentTypeBlocks(existing: FastBlock[]): Promise<FastBlock[]> {
  const rows = await db.execute(sql`
    SELECT content_type, COUNT(*)::int AS fail_count
    FROM   autopilot_queue
    WHERE  status      = 'permanent_fail'
      AND  user_id     = ${REAL_USER_ID}
      AND  updated_at  > NOW() - INTERVAL '${sql.raw(String(CT_WINDOW_HOURS))} hours'
      AND  content_type IS NOT NULL
    GROUP  BY content_type
    HAVING COUNT(*) >= ${CT_FAIL_THRESHOLD}
  `);

  const newBlocks: FastBlock[] = [];
  for (const row of (rows as any).rows ?? []) {
    const ct    = String(row.content_type);
    const count = Number(row.fail_count);
    const id    = blockId("CONTENT_TYPE", ct);
    const now   = Date.now();

    if (existing.some(b => b.id === id && new Date(b.expiresAt).getTime() > now)) continue;

    const expiresAt = new Date(now + CT_BLOCK_HOURS * 3_600_000).toISOString();
    newBlocks.push({
      id, type: "CONTENT_TYPE", target: ct, promoted: false,
      detectedCount: count,
      windowMs:      CT_WINDOW_HOURS * 3_600_000,
      reason:        `${count} permanent_fail items with contentType="${ct}" in last ${CT_WINDOW_HOURS}h`,
      createdAt:     new Date(now).toISOString(),
      expiresAt,
    });

    logger.warn(
      `[fast-learner] ⛔ NEW BLOCK — contentType="${ct}" ` +
      `(${count} fails/${CT_WINDOW_HOURS}h) → blocked ${CT_BLOCK_HOURS}h until ${expiresAt.slice(11, 16)} UTC`,
    );
  }
  return newBlocks;
}

// ── Detection 2: source video failure pattern ──────────────────────────────

async function detectSourceVideoBlocks(existing: FastBlock[]): Promise<FastBlock[]> {
  const rows = await db.execute(sql`
    SELECT source_video_id, COUNT(*)::int AS fail_count
    FROM   autopilot_queue
    WHERE  status           = 'permanent_fail'
      AND  user_id          = ${REAL_USER_ID}
      AND  updated_at       > NOW() - INTERVAL '${sql.raw(String(SV_WINDOW_HOURS))} hours'
      AND  source_video_id IS NOT NULL
    GROUP  BY source_video_id
    HAVING COUNT(*) >= ${SV_FAIL_THRESHOLD}
  `);

  const newBlocks: FastBlock[] = [];
  for (const row of (rows as any).rows ?? []) {
    const svId  = String(row.source_video_id);
    const count = Number(row.fail_count);
    const id    = blockId("SOURCE_VIDEO", svId);
    const now   = Date.now();

    if (existing.some(b => b.id === id && new Date(b.expiresAt).getTime() > now)) continue;

    const expiresAt = new Date(now + SV_BLOCK_HOURS * 3_600_000).toISOString();
    newBlocks.push({
      id, type: "SOURCE_VIDEO", target: svId, promoted: false,
      detectedCount: count,
      windowMs:      SV_WINDOW_HOURS * 3_600_000,
      reason:        `${count} permanent_fail items from source_video_id=${svId} in last ${SV_WINDOW_HOURS}h`,
      createdAt:     new Date(now).toISOString(),
      expiresAt,
    });

    logger.warn(
      `[fast-learner] ⛔ NEW BLOCK — source_video_id=${svId} ` +
      `(${count} fails/${SV_WINDOW_HOURS}h) → blocked ${SV_BLOCK_HOURS}h until ${expiresAt.slice(11, 16)} UTC`,
    );
  }
  return newBlocks;
}

// ── Detection 3: error storm ───────────────────────────────────────────────

async function detectErrorStorms(): Promise<string[]> {
  const rows = await db.execute(sql`
    SELECT SUBSTRING(error_message, 1, 80) AS err_snippet, COUNT(*)::int AS err_count
    FROM   autopilot_queue
    WHERE  status        = 'permanent_fail'
      AND  user_id       = ${REAL_USER_ID}
      AND  updated_at    > NOW() - INTERVAL '${sql.raw(String(ERR_STORM_WINDOW_MIN))} minutes'
      AND  error_message IS NOT NULL
      AND  error_message <> ''
    GROUP  BY SUBSTRING(error_message, 1, 80)
    HAVING COUNT(*) >= ${ERR_STORM_THRESHOLD}
  `);

  const patterns: string[] = [];
  for (const row of (rows as any).rows ?? []) {
    const snippet = String(row.err_snippet ?? "");
    const count   = Number(row.err_count ?? 0);
    patterns.push(snippet);
    logger.warn(
      `[fast-learner] ⚡ ERROR STORM — "${snippet.slice(0, 60)}…" ` +
      `appeared ${count}x in last ${ERR_STORM_WINDOW_MIN}min`,
    );
  }
  return patterns;
}

// ── Main scan ──────────────────────────────────────────────────────────────

async function runScan(): Promise<void> {
  const t0 = Date.now();

  let existing = await readBlocks();
  existing = pruneExpired(existing);

  const [ctBlocks, svBlocks, errorStorms] = await Promise.all([
    detectContentTypeBlocks(existing).catch((): FastBlock[] => []),
    detectSourceVideoBlocks(existing).catch((): FastBlock[] => []),
    detectErrorStorms().catch((): string[] => []),
  ]);

  const newBlocks = [...ctBlocks, ...svBlocks];

  if (newBlocks.length > 0) {
    const merged = [...existing, ...newBlocks];
    await writeBlocks(merged);

    for (const b of newBlocks) {
      logSystemIncident({
        category:       "publisher_loop",
        service:        "fast-learner",
        severity:       "medium",
        status:         "active",
        rootCause:      b.reason,
        fixDescription:
          `Fast-learner auto-blocked ${b.type}="${b.target}" for ` +
          `${b.type === "CONTENT_TYPE" ? CT_BLOCK_HOURS : SV_BLOCK_HOURS}h.`,
        lesson:
          `Repeated permanent_fail on the same ${b.type} target signals a structural problem, ` +
          `not a transient error.  Blocking prevents quota waste and queue pollution. ` +
          `After expiry, if the pattern recurs, the root cause is likely: ` +
          `(1) source video format incompatible with the encoder; ` +
          `(2) content type requiring capabilities not available; ` +
          `(3) focus-game filter mismatch — off-brand content reaching the queue. ` +
          `The brain will promote this block to a permanent rule if it reappears 3+ times.`,
        tags: ["fast-block", b.type.toLowerCase(), b.target],
      });
    }
  }

  if (errorStorms.length > 0) {
    logSystemIncident({
      category:       "publisher_loop",
      service:        "fast-learner/error-storm",
      severity:       "high",
      status:         "active",
      rootCause:
        `${errorStorms.length} error pattern(s) each appeared ≥${ERR_STORM_THRESHOLD}× ` +
        `in the last ${ERR_STORM_WINDOW_MIN} minutes: "${errorStorms[0]?.slice(0, 80) ?? "unknown"}"`,
      fixDescription:
        "Fast-learner detected a systemic error storm. Investigate the error pattern immediately.",
      lesson:
        `An error storm (same error ≥${ERR_STORM_THRESHOLD}×/${ERR_STORM_WINDOW_MIN}min) is systemic. ` +
        `Common causes: ffmpeg binary missing after Nix update; YouTube auth token expired; ` +
        `a change in the upload flow that broke a required field; quota exhaustion misrouted as a content error. ` +
        `When an error storm is detected: (1) read the exact error text; ` +
        `(2) grep for that text in service logs; (3) verify ffmpeg + OAuth token are intact.`,
      tags: ["error-storm", "fast-learner", "systemic"],
    });
  }

  const activeCount = (existing.length + newBlocks.length);
  logger.info(
    `[fast-learner] Scan (${Date.now() - t0}ms) — ` +
    `${newBlocks.length} new block(s), ${activeCount} active, ` +
    `${errorStorms.length} error storm(s)`,
  );
}

// ── Init ───────────────────────────────────────────────────────────────────

export function initFastLearner(): void {
  logger.info(
    `[fast-learner] Initializing — first scan in ${INITIAL_DELAY_MS / 60_000}min, ` +
    `then every ${SCAN_INTERVAL_MS / 60_000}min`,
  );

  setTimeout(() => {
    runScan().catch(err =>
      logger.debug(`[fast-learner] Scan error: ${(err as Error)?.message?.slice(0, 80)}`),
    );

    const jitter = () => SCAN_INTERVAL_MS + Math.floor(Math.random() * 60_000);
    const next = () => setTimeout(() => {
      runScan().catch(err =>
        logger.debug(`[fast-learner] Scan error: ${(err as Error)?.message?.slice(0, 80)}`),
      );
      next();
    }, jitter());
    next();
  }, INITIAL_DELAY_MS);
}
