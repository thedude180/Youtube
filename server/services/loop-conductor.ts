/**
 * loop-conductor.ts
 *
 * THE CENTRAL NERVOUS SYSTEM — closes all four open loops simultaneously.
 *
 * Runs every 30 minutes.  Reads the state of every subsystem, applies
 * targeted interventions, feeds performance data back into the mining
 * engine, and writes a snapshot the brain reads in its daily cycle.
 *
 * ┌─────────────────────────────────────────────────────────────────────┐
 * │                    THE FOUR CLOSED LOOPS                           │
 * ├─────────────────────────────────────────────────────────────────────┤
 * │                                                                     │
 * │  LOOP 1 — Content performance → source video revival score          │
 * │    Short crosses views threshold → total_revival_score +15          │
 * │    → back-catalog engine mines that source first → better clips     │
 * │    → published to YouTube → higher views → loop back                │
 * │                                                                     │
 * │  LOOP 2 — System health → immediate intervention                    │
 * │    Publishing stalled + quota available → emergency self-heal       │
 * │    → stuck items reset → publishers unblock → completions resume    │
 * │    → velocity detected as healthy → no more heals needed            │
 * │                                                                     │
 * │  LOOP 3 — Brain config → service-aware decisions                    │
 * │    Brain writes quota_safe_window / best_short_duration             │
 * │    → loop conductor reads it → applies timing constraints           │
 * │    → better decisions → fewer incidents → brain learns less stress  │
 * │                                                                     │
 * │  LOOP 4 — Snapshot → brain daily synthesis                          │
 * │    Full state written to service_state("loop-conductor","snapshot") │
 * │    → brain Step 9u reads it → writes masterKnowledgeBank principle  │
 * │    → principle flows into every AI prompt → smarter decisions       │
 * │                                                                     │
 * └─────────────────────────────────────────────────────────────────────┘
 */

import { db }              from "../db";
import { sql }             from "drizzle-orm";
import { createLogger }    from "../lib/logger";
import { getState, setState } from "../lib/service-state";
import { logSystemIncident } from "../lib/incident-log";

const logger = createLogger("loop-conductor");

const REAL_USER_ID = "7210ff92-76dd-4d0a-80bb-9eb5be27508b";

// ── Thresholds ─────────────────────────────────────────────────────────────
const VIRAL_VIEWS_THRESHOLD    = 500;   // Short crosses this → boost source video
const REVIVAL_BOOST_POINTS     = 15;   // Points added to total_revival_score per viral Short
const REVIVAL_SCORE_CAP        = 100;  // Maximum revival score
const STALL_HEAL_COOLDOWN_MS   = 2 * 60 * 60_000;  // Emergency heal at most once per 2h
const INITIAL_DELAY_MS         = 5 * 60_000;        // 5min after init before first cycle
const INTERVAL_MS              = 30 * 60_000;       // Every 30min
const CRITICAL_ENGINES = [
  "shorts-clip-publisher",
  "long-form-clip-publisher",
  "back-catalog-runner",
  "youtube-ai-orchestrator",
  "youtube-grinder",
];

// ── Types ──────────────────────────────────────────────────────────────────
interface HighPerformer {
  metricId:       number;
  sourceVideoId:  number;
  views:          number;
  performanceScore: number;
  youtubeVideoId: string;
}

interface BrainConfig {
  quotaSafeEndUtcHour:  number;
  bestShortDurationSec: number;
  bestPublishWindow:    string;
}

interface SystemState {
  publishingCompletions4h: number;
  pendingShortsCount:      number;
  pendingLongFormCount:    number;
  permanentFailLast1h:     number;
  vaultStuckCount:         number;
  quotaUsedToday:          number;
  quotaLimit:              number;
  quotaBreakerTripped:     boolean;
  deadEngineCount:         number;
  activeIncidentCount:     number;
  highPerformers:          HighPerformer[];
  brainConfig:             BrainConfig;
  healthScore:             number;
  computedAt:              string;
}

// Track when we last triggered an emergency heal (in-memory debounce)
let _lastEmergencyHealAt = 0;

// ── Step 1: Gather full system state in parallel ───────────────────────────
async function gatherSystemState(): Promise<SystemState> {
  const engineList = CRITICAL_ENGINES.map(e => `'${e}'`).join(",");

  const [
    completions,
    queueDepths,
    failSpike,
    vaultStuck,
    quotaRow,
    incidentCount,
    highPerformers,
    brainQuota,
    brainDuration,
    brainWindow,
  ] = await Promise.all([

    // Publishing completions in last 4h
    db.execute(sql`
      SELECT COUNT(*)::int AS count
      FROM autopilot_queue
      WHERE status    = 'completed'
        AND updated_at > NOW() - INTERVAL '4 hours'
    `),

    // Queue depth (pending Shorts + long-form)
    db.execute(sql`
      SELECT
        SUM(CASE WHEN content_type IN ('youtube_short','auto-clip','vod-short','platform_short')
              THEN 1 ELSE 0 END)::int                               AS shorts,
        SUM(CASE WHEN content_type IN ('long-form-clip','long-form','vod_long_form','long-form-compilation')
              THEN 1 ELSE 0 END)::int                               AS longform
      FROM autopilot_queue
      WHERE status  = 'scheduled'
        AND user_id = ${REAL_USER_ID}
    `),

    // New permanent_fail items in last 1h
    db.execute(sql`
      SELECT COUNT(*)::int AS count
      FROM autopilot_queue
      WHERE status     = 'permanent_fail'
        AND updated_at > NOW() - INTERVAL '1 hour'
    `),

    // Vault entries stuck in 'indexed' for >2h
    db.execute(sql`
      SELECT COUNT(*)::int AS count
      FROM content_vault_backups
      WHERE status     = 'indexed'
        AND created_at < NOW() - INTERVAL '2 hours'
    `),

    // Today's quota usage
    db.execute(sql`
      SELECT units_used, quota_limit
      FROM youtube_quota_usage
      WHERE user_id = ${REAL_USER_ID}
        AND date    = TO_CHAR(NOW() AT TIME ZONE 'UTC', 'YYYY-MM-DD')
      ORDER BY id DESC LIMIT 1
    `),

    // Active incidents in last 24h
    db.execute(sql`
      SELECT COUNT(*)::int AS count
      FROM system_incident_log
      WHERE status     = 'active'
        AND created_at > NOW() - INTERVAL '24 hours'
    `),

    // High-performing Shorts not yet boosted (views >= threshold, last 7d)
    db.execute(sql`
      SELECT id, source_video_id, views, performance_score, youtube_video_id
      FROM   youtube_output_metrics
      WHERE  user_id      = ${REAL_USER_ID}
        AND  content_type IN ('youtube_short','auto-clip','vod-short','platform_short')
        AND  views         >= ${VIRAL_VIEWS_THRESHOLD}
        AND  source_video_id IS NOT NULL
        AND  (metadata->>'revivalScoreBoosted') IS NULL
        AND  published_at  > NOW() - INTERVAL '7 days'
      ORDER BY views DESC
      LIMIT 50
    `),

    // Brain operational config: quota safe window
    getState<Record<string, unknown>>('brain', 'quota_safe_window'),

    // Brain operational config: best short duration
    getState<Record<string, unknown>>('brain', 'best_short_duration'),

    // Brain operational config: best publish window
    getState<Record<string, unknown>>('brain', 'best_publish_window'),
  ]);

  // Parse results
  const quotaData = (quotaRow as any)?.rows?.[0];

  // Quota breaker state (synchronous function, dynamic import to avoid circular dep)
  let quotaBreakerTripped = false;
  try {
    const { isQuotaBreakerTripped } = await import("./youtube-quota-tracker");
    quotaBreakerTripped = isQuotaBreakerTripped();
  } catch { /* ignore — breaker state unavailable */ }

  // Dead engines: error status + failure_count >= 3 + stale > 35min
  let deadEngineCount = 0;
  try {
    const deadResult = await db.execute(sql`
      SELECT COUNT(*)::int AS count
      FROM   engine_heartbeats
      WHERE  engine_name   = ANY(ARRAY[${sql.raw(engineList)}]::text[])
        AND  status        = 'error'
        AND  failure_count >= 3
        AND  last_run_at   < NOW() - INTERVAL '35 minutes'
    `);
    deadEngineCount = Number((deadResult as any)?.rows?.[0]?.count ?? 0);
  } catch { /* ignore */ }

  // Parse high performers
  const performers: HighPerformer[] = ((highPerformers as any)?.rows ?? [])
    .map((r: any) => ({
      metricId:       Number(r.id),
      sourceVideoId:  Number(r.source_video_id),
      views:          Number(r.views ?? 0),
      performanceScore: Number(r.performance_score ?? 0),
      youtubeVideoId: String(r.youtube_video_id ?? ""),
    }))
    .filter((p: HighPerformer) => p.sourceVideoId > 0 && p.views >= VIRAL_VIEWS_THRESHOLD);

  // Brain config with safe defaults
  const bq = brainQuota as any;
  const bd = brainDuration as any;
  const bw = brainWindow as any;
  const brainConfig: BrainConfig = {
    quotaSafeEndUtcHour:  bq?.safeBatchEndUtcHour  ?? 15,
    bestShortDurationSec: bd?.targetSec            ?? 45,
    bestPublishWindow:    bw?.window               ?? "evening",
  };

  const state: SystemState = {
    publishingCompletions4h: Number((completions as any)?.rows?.[0]?.count    ?? 0),
    pendingShortsCount:      Number((queueDepths as any)?.rows?.[0]?.shorts   ?? 0),
    pendingLongFormCount:    Number((queueDepths as any)?.rows?.[0]?.longform ?? 0),
    permanentFailLast1h:     Number((failSpike   as any)?.rows?.[0]?.count    ?? 0),
    vaultStuckCount:         Number((vaultStuck  as any)?.rows?.[0]?.count    ?? 0),
    quotaUsedToday:          Number(quotaData?.units_used  ?? 0),
    quotaLimit:              Number(quotaData?.quota_limit ?? 10_000),
    quotaBreakerTripped,
    deadEngineCount,
    activeIncidentCount: Number((incidentCount as any)?.rows?.[0]?.count ?? 0),
    highPerformers:      performers,
    brainConfig,
    healthScore:         0,   // computed below
    computedAt:          new Date().toISOString(),
  };

  // Compute health score (0–100)
  let score = 100;
  if (state.quotaBreakerTripped)           score -= 30;
  if (state.publishingCompletions4h === 0) score -= 25;
  if (state.permanentFailLast1h > 20)      score -= 15;
  if (state.vaultStuckCount > 50)          score -= 10;
  if (state.deadEngineCount > 0)           score -= 10;
  if (state.activeIncidentCount > 5)       score -= 10;
  state.healthScore = Math.max(0, score);

  return state;
}

// ── Loop 1: Content performance → revival score feedback ──────────────────
// For each high-performing Short that hasn't been boosted yet:
//   1. Bump total_revival_score on the source back_catalog_video (+15, capped 100)
//   2. Mark the metric row as boosted (metadata.revivalScoreBoosted = true)
//   3. Log to system_incident_log → brain learns which sources produce viral content
async function applyRevivalBoosts(state: SystemState): Promise<number> {
  if (state.highPerformers.length === 0) return 0;

  let boosted = 0;
  for (const hp of state.highPerformers) {
    try {
      await db.execute(sql`
        UPDATE back_catalog_videos
        SET    total_revival_score = LEAST(
                 COALESCE(total_revival_score, 50) + ${REVIVAL_BOOST_POINTS},
                 ${REVIVAL_SCORE_CAP}
               ),
               updated_at = NOW()
        WHERE  id = ${hp.sourceVideoId}
      `);

      await db.execute(sql`
        UPDATE youtube_output_metrics
        SET    metadata = jsonb_set(
                 COALESCE(metadata, '{}'),
                 '{revivalScoreBoosted}',
                 'true'
               )
        WHERE  id = ${hp.metricId}
      `);

      boosted++;
    } catch (err: any) {
      logger.debug(
        `[loop-conductor] Revival boost failed for source_id=${hp.sourceVideoId}: ` +
        `${err?.message?.slice(0, 60)}`,
      );
    }
  }

  if (boosted > 0) {
    const examples = state.highPerformers
      .slice(0, 3)
      .map(hp => `src=${hp.sourceVideoId} → ${hp.views} views`)
      .join("; ");

    logger.info(
      `[loop-conductor] LOOP 1: Boosted revival score for ${boosted} source video(s) ` +
      `(${examples})`,
    );

    // Feed pattern to brain via system_incident_log
    logSystemIncident({
      category:       "other",
      service:        "loop-conductor/revival-boost",
      severity:       "low",
      status:         "resolved",
      rootCause:
        `${boosted} source video(s) produced Shorts with ≥${VIRAL_VIEWS_THRESHOLD} views. ` +
        `total_revival_score boosted +${REVIVAL_BOOST_POINTS} pts to prioritise future mining. ` +
        `Examples: ${examples}`,
      fixDescription: "Auto-applied revival score boost. Back-catalog engine will mine these sources sooner.",
      lesson:
        `Source videos whose Shorts exceed ${VIRAL_VIEWS_THRESHOLD} views should be mined repeatedly — ` +
        `each one proven to produce viral content for this channel. ` +
        `total_revival_score boost ensures back-catalog engine returns to these videos ` +
        `instead of moving on to untested sources. ` +
        `Pattern: identify which game segments, timestamps, and pacing styles produced the viral clips.`,
      tags: ["revival-score", "viral-short", "performance-feedback", "content-loop"],
    });
  }

  return boosted;
}

// ── Loop 2: Publishing stall → immediate intervention ─────────────────────
// When the pipeline is stalled (0 completions in 4h) and quota is available,
// trigger an emergency deep self-heal instead of waiting 20min for the next
// self-heal cycle.  Rate-limited to once per 2h to avoid storm.
async function applyPublishingHeal(state: SystemState): Promise<boolean> {
  if (state.publishingCompletions4h > 0)  return false;  // Pipeline is moving — no action needed
  if (state.quotaBreakerTripped)           return false;  // Quota exhausted — heal won't help
  if (Date.now() - _lastEmergencyHealAt < STALL_HEAL_COOLDOWN_MS) return false;  // Cooldown active

  logger.warn(
    `[loop-conductor] LOOP 2: Publishing stalled (0 completions/4h, quota available at ` +
    `${state.quotaUsedToday}/${state.quotaLimit}) — triggering emergency self-heal`,
  );

  _lastEmergencyHealAt = Date.now();

  try {
    const { runPipelineSelfHeal } = await import("./pipeline-self-heal");
    // Fire-and-forget: don't block the loop cycle on the heal
    runPipelineSelfHeal(true).catch(err => {
      logger.debug(
        `[loop-conductor] Emergency self-heal error: ${err?.message?.slice(0, 80)}`,
      );
    });

    logSystemIncident({
      category:       "publisher_loop",
      service:        "loop-conductor/emergency-heal",
      severity:       "high",
      status:         "resolved",
      rootCause:
        `Publishing stalled: 0 completions in last 4h while quota available ` +
        `(${state.quotaUsedToday}/${state.quotaLimit} units). ` +
        `Emergency deep self-heal triggered by loop conductor.`,
      fixDescription: "Triggered runPipelineSelfHeal(true) to reset stuck items and unblock publishers.",
      lesson:
        "When publishing completions drop to zero for 4h while quota is available, " +
        "the pipeline is stuck — not quota-blocked. " +
        "Root causes: item stuck in 'processing', publisher hot-loop on no-token channel, " +
        "or Wave timing convergence crash that left items in an unrecoverable state. " +
        "Emergency self-heal resets all stuck items and gives publishers a clean slate. " +
        "If this happens daily at the same UTC hour, investigate Wave startup timing.",
      tags: ["stalled", "publishing", "emergency-heal", "zero-velocity"],
    });

    return true;
  } catch (err: any) {
    logger.debug(
      `[loop-conductor] Emergency self-heal import error: ${err?.message?.slice(0, 80)}`,
    );
    return false;
  }
}

// ── Loop 3+4: Write full snapshot for brain + dashboard ───────────────────
// Persists the complete system state to service_state so:
//   - Brain Step 9u reads it during daily synthesis → masterKnowledgeBank principle
//   - Dashboard API can expose it for observability
//   - Operators can query service_state to understand current system health
function writeSnapshot(
  state:   SystemState,
  boosts:  number,
  healed:  boolean,
): void {
  setState("loop-conductor", "snapshot", {
    healthScore:             state.healthScore,
    publishingCompletions4h: state.publishingCompletions4h,
    pendingShortsCount:      state.pendingShortsCount,
    pendingLongFormCount:    state.pendingLongFormCount,
    permanentFailLast1h:     state.permanentFailLast1h,
    vaultStuckCount:         state.vaultStuckCount,
    quotaUsedToday:          state.quotaUsedToday,
    quotaLimit:              state.quotaLimit,
    quotaBreakerTripped:     state.quotaBreakerTripped,
    deadEngineCount:         state.deadEngineCount,
    activeIncidentCount:     state.activeIncidentCount,
    highPerformersFound:     state.highPerformers.length,
    revivalBoostsApplied:    boosts,
    emergencyHealTriggered:  healed,
    brainConfig:             state.brainConfig as unknown as Record<string, unknown>,
    computedAt:              state.computedAt,
  });

  setState("loop-conductor", "last_cycle", {
    healthScore: state.healthScore,
    cycleAt:     state.computedAt,
    boosts,
    healed,
  });
}

// ── Main cycle ─────────────────────────────────────────────────────────────
export async function runLoopCycle(): Promise<void> {
  const t0 = Date.now();
  logger.info("[loop-conductor] ── Cycle start — reading all subsystem states");

  try {
    const state = await gatherSystemState();

    const statusLine =
      `health=${state.healthScore}/100 | ` +
      `publishing=${state.publishingCompletions4h} completions/4h | ` +
      `queue=${state.pendingShortsCount}S+${state.pendingLongFormCount}LF | ` +
      `quota=${state.quotaUsedToday}/${state.quotaLimit}${state.quotaBreakerTripped ? " [TRIPPED]" : ""} | ` +
      `viral Shorts to boost=${state.highPerformers.length}`;

    logger.info(`[loop-conductor] State: ${statusLine}`);

    // Apply both loops in parallel (they touch different tables)
    const [boosts, healed] = await Promise.all([
      applyRevivalBoosts(state).catch(() => 0),
      applyPublishingHeal(state).catch(() => false),
    ]);

    // Persist snapshot (fire-and-forget)
    writeSnapshot(state, boosts, healed as boolean);

    const ms = Date.now() - t0;
    logger.info(
      `[loop-conductor] ── Cycle complete (${ms}ms) | ` +
      `health=${state.healthScore}/100, boosts=${boosts}, heal=${healed}`,
    );
  } catch (err: any) {
    logger.error(
      `[loop-conductor] Cycle error: ${err?.message?.slice(0, 120)}`,
    );
  }
}

// ── Init ───────────────────────────────────────────────────────────────────
export function initLoopConductor(): void {
  logger.info(`[loop-conductor] Initializing — first cycle in ${INITIAL_DELAY_MS / 60_000}min`);

  setTimeout(() => {
    runLoopCycle();
    const jitter = () => INTERVAL_MS + Math.floor(Math.random() * 120_000); // 30–32min
    const scheduleNext = () => {
      setTimeout(() => {
        runLoopCycle();
        scheduleNext();
      }, jitter());
    };
    scheduleNext();
  }, INITIAL_DELAY_MS);
}
