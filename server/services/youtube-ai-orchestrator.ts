/**
 * youtube-ai-orchestrator.ts
 *
 * Central AI Orchestrator for all YouTube operations in CreatorOS.
 * Runs as a top-level autonomous controller — decides what to run, when to
 * run it, what to queue, and what needs manual review.
 *
 * YouTube-only. All non-YouTube platforms are permanently disabled — this
 * orchestrator will never queue, publish to, or interact with any other service.
 *
 * Auto-approved operations (run silently):
 *   catalog import, scoring, queue Shorts/long-form up to daily caps,
 *   metadata cleanup (within cap), learning cycles, monetization audits,
 *   internal linking, transient-failure retries
 *
 * Requires approval (flagged in decision log, never silently executed):
 *   delete anything, mass metadata beyond cap, monetization-risk changes,
 *   copyright-uncertain content, immediate public outside normal schedule,
 *   disabling any system, OAuth/token changes
 *
 * Schedule:
 *   - First run: 10–20 min after production boot (jittered)
 *   - Light cycle: every 4 h
 *   - Full strategic cycle: every 22–24 h
 */

import { db } from "../db";
import { channels, autopilotQueue } from "@shared/schema";
import { eq, and, isNotNull, inArray, sql } from "drizzle-orm";
import { createLogger } from "../lib/logger";
import { isQuotaBreakerTripped } from "./youtube-quota-tracker";

import {
  runBackCatalogImport,
  scanExistingChannelVideos,
  rankBackCatalogOpportunities,
  queueBackCatalogRevivalWork,
  getBackCatalogStatus,
} from "./youtube-back-catalog-engine";
import { runDailyLearningCycle, getLearningSummary } from "./youtube-learning-brain";
import { auditBatchForUser } from "./youtube-monetization-readiness";
import { buildInternalLinkingPlan } from "./youtube-internal-linking-engine";

const logger = createLogger("youtube-ai-orchestrator");

const DEV_BYPASS_USER = "dev_bypass_user";

// ── Types ─────────────────────────────────────────────────────────────────────

export type YouTubeAITaskName =
  | "sync_channel_catalog"
  | "scan_back_catalog"
  | "rank_back_catalog_opportunities"
  | "queue_back_catalog_revival"
  | "optimize_existing_video_metadata"
  | "queue_shorts"
  | "queue_long_form"
  | "run_learning_cycle"
  | "run_monetization_readiness"
  | "build_internal_linking_plan"
  | "check_failed_jobs"
  | "retry_safe_failures"
  | "generate_daily_report";

export interface YouTubeAITask {
  name: YouTubeAITaskName;
  priority: number;
  allowedToRun: boolean;
  requiresApproval: boolean;
  reason: string;
  estimatedQuotaCost: number;
}

export interface YouTubeAIExecutionPlan {
  userId: string;
  generatedAt: string;
  mode: "auto-safe";
  fullCycle: boolean;
  tasks: YouTubeAITask[];
}

export interface YouTubeAICycleResult {
  userId: string;
  cycleId: string;
  startedAt: string;
  completedAt: string;
  tasksRun: string[];
  tasksSkipped: string[];
  tasksApprovalRequired: string[];
  shortsQueued: number;
  longFormQueued: number;
  metadataUpdated: number;
  learningComplete: boolean;
  errors: string[];
}

// ── State ────────────────────────────────────────────────────────────────────

let startupTimer: ReturnType<typeof setTimeout> | null = null;
let lightInterval: ReturnType<typeof setInterval> | null = null;
let fullInterval: ReturnType<typeof setInterval> | null = null;

const activeCycles = new Set<string>(); // userIds currently mid-cycle
let globalPaused = false;
let lastFullCycleAt: Date | null = null;
const dailyReports = new Map<string, { report: string; generatedAt: Date }>();
const decisionLog: Array<{ ts: string; userId: string; task: string; outcome: string; approvalRequired: boolean }> = [];

// ── Timing ────────────────────────────────────────────────────────────────────

function jitter(baseMs: number, rangeMs = baseMs * 0.1): number {
  return baseMs + Math.floor(Math.random() * rangeMs);
}

const STARTUP_DELAY_MS = jitter(10 * 60_000, 10 * 60_000); // 10–20 min
const LIGHT_CYCLE_MS = jitter(4 * 60 * 60_000, 30 * 60_000);  // ~4 h
const FULL_CYCLE_MS  = jitter(22 * 60 * 60_000, 2 * 60 * 60_000); // 22–24 h

// ── Eligible users ────────────────────────────────────────────────────────────

async function getEligibleUserIds(): Promise<string[]> {
  const rows = await db
    .select({ userId: channels.userId })
    .from(channels)
    .where(and(eq(channels.platform, "youtube"), isNotNull(channels.accessToken)));

  return [...new Set(
    rows.map(r => r.userId).filter((id): id is string => !!id && id !== DEV_BYPASS_USER),
  )];
}

// ── Decision plan builder ─────────────────────────────────────────────────────

async function buildExecutionPlan(userId: string, fullCycle: boolean): Promise<YouTubeAIExecutionPlan> {
  const quotaOk = !isQuotaBreakerTripped();

  const catalogStatus = await getBackCatalogStatus(userId).catch(() => null);
  const queueBacklog = await db
    .select({ count: sql<number>`COUNT(*)` })
    .from(autopilotQueue)
    .where(and(
      eq(autopilotQueue.userId, userId),
      inArray(autopilotQueue.status, ["scheduled", "pending"]),
      inArray(autopilotQueue.targetPlatform as any, ["youtube", "youtubeshorts"]),
    ));
  const backlogCount = Number(queueBacklog[0]?.count ?? 0);

  const tasks: YouTubeAITask[] = [
    {
      name: "sync_channel_catalog",
      priority: 10,
      allowedToRun: quotaOk && fullCycle,
      requiresApproval: false,
      reason: fullCycle ? (quotaOk ? "Full cycle — sync catalog" : "Quota breaker active") : "Light cycle — skipping",
      estimatedQuotaCost: 5,
    },
    {
      name: "scan_back_catalog",
      priority: 9,
      allowedToRun: quotaOk && fullCycle && (catalogStatus?.totalVideos ?? 0) > 0,
      requiresApproval: false,
      reason: (catalogStatus?.totalVideos ?? 0) === 0 ? "Catalog empty — run import first" : "Scan for new opportunities",
      estimatedQuotaCost: 2,
    },
    {
      name: "rank_back_catalog_opportunities",
      priority: 8,
      allowedToRun: quotaOk && (catalogStatus?.totalVideos ?? 0) > 0,
      requiresApproval: false,
      reason: "Rank revival opportunities by score",
      estimatedQuotaCost: 1,
    },
    {
      name: "queue_back_catalog_revival",
      priority: 8,
      allowedToRun: quotaOk && (catalogStatus?.totalVideos ?? 0) > 0,
      requiresApproval: false,
      reason: "Queue Shorts + long-form up to daily caps",
      estimatedQuotaCost: 3,
    },
    {
      name: "queue_shorts",
      priority: 7,
      allowedToRun: quotaOk && backlogCount < 500,
      requiresApproval: false,
      reason: backlogCount >= 500 ? "Queue backlog healthy — skipping" : "Queue back catalog Shorts (3/day cap enforced)",
      estimatedQuotaCost: 2,
    },
    {
      name: "queue_long_form",
      priority: 7,
      allowedToRun: quotaOk && backlogCount < 500,
      requiresApproval: false,
      reason: backlogCount >= 500 ? "Queue backlog healthy — skipping" : "Queue long-form clips (1/day cap enforced)",
      estimatedQuotaCost: 2,
    },
    {
      name: "run_learning_cycle",
      priority: 6,
      allowedToRun: fullCycle,
      requiresApproval: false,
      reason: fullCycle ? "Full cycle — run daily learning" : "Light cycle — skipping learning",
      estimatedQuotaCost: 5,
    },
    {
      name: "run_monetization_readiness",
      priority: 5,
      allowedToRun: fullCycle && (catalogStatus?.totalVideos ?? 0) > 0,
      requiresApproval: false,
      reason: "Audit back catalog for monetization status",
      estimatedQuotaCost: 2,
    },
    {
      name: "build_internal_linking_plan",
      priority: 4,
      allowedToRun: fullCycle && (catalogStatus?.totalVideos ?? 0) > 5,
      requiresApproval: false,
      reason: "Build playlist + end-screen link suggestions",
      estimatedQuotaCost: 1,
    },
    {
      name: "check_failed_jobs",
      priority: 6,
      allowedToRun: true,
      requiresApproval: false,
      reason: "Check for retryable failed queue items",
      estimatedQuotaCost: 0,
    },
    {
      name: "retry_safe_failures",
      priority: 5,
      allowedToRun: quotaOk,
      requiresApproval: false,
      reason: "Retry transient-only failures (quota temp, yt-dlp, ffmpeg, AI unavailable)",
      estimatedQuotaCost: 1,
    },
    {
      name: "generate_daily_report",
      priority: 3,
      allowedToRun: fullCycle,
      requiresApproval: false,
      reason: "Generate plain-English daily summary",
      estimatedQuotaCost: 2,
    },
  ];

  return {
    userId,
    generatedAt: new Date().toISOString(),
    mode: "auto-safe",
    fullCycle,
    tasks: tasks.sort((a, b) => b.priority - a.priority),
  };
}

// ── Task executor ─────────────────────────────────────────────────────────────

async function executeTask(
  taskName: YouTubeAITaskName,
  userId: string,
  result: YouTubeAICycleResult,
): Promise<void> {
  logger.info(`[YouTubeAI] Running task: ${taskName}`);

  const log = (outcome: string, approvalRequired = false) => {
    decisionLog.unshift({ ts: new Date().toISOString(), userId, task: taskName, outcome, approvalRequired });
    if (decisionLog.length > 200) decisionLog.splice(200);
  };

  try {
    switch (taskName) {

      case "sync_channel_catalog": {
        const r = await runBackCatalogImport(userId);
        log(`Imported ${r.imported} videos, skipped ${r.skipped}`);
        result.tasksRun.push(taskName);
        break;
      }

      case "scan_back_catalog": {
        await scanExistingChannelVideos(userId);
        log("Catalog scanned and scored");
        result.tasksRun.push(taskName);
        break;
      }

      case "rank_back_catalog_opportunities": {
        const opps = await rankBackCatalogOpportunities(userId, 50);
        log(`Ranked ${opps.length} opportunities`);
        result.tasksRun.push(taskName);
        break;
      }

      case "queue_back_catalog_revival":
      case "queue_shorts":
      case "queue_long_form": {
        // Unified: queueBackCatalogRevivalWork handles Shorts + long-form + metadata
        // respecting all daily caps internally
        const r = await queueBackCatalogRevivalWork(userId);
        result.shortsQueued += r.shortsQueued ?? 0;
        result.longFormQueued += r.longFormQueued ?? 0;
        result.metadataUpdated += r.metadataQueued ?? 0;
        log(`Queued ${r.shortsQueued} Shorts, ${r.longFormQueued} long-form, ${r.metadataQueued} metadata`);
        if (!result.tasksRun.includes("queue_back_catalog_revival")) {
          result.tasksRun.push("queue_back_catalog_revival");
        }
        // Deduplicate — only queue once even if both task names hit this case
        if (!result.tasksRun.includes(taskName)) result.tasksRun.push(taskName);
        break;
      }

      case "run_learning_cycle": {
        const report = await runDailyLearningCycle(userId);
        result.learningComplete = !!report;
        log(report ? `Learning cycle complete — ${report.newInsights?.length ?? 0} insights, best bucket: ${report.bestDurationBucket}` : "Learning cycle skipped");
        result.tasksRun.push(taskName);
        break;
      }

      case "run_monetization_readiness": {
        const r = await auditBatchForUser(userId, 50);
        const needsReview = r.reports.filter(rep => rep.status === "reused_content_risk" || rep.status === "advertiser_suitability_review");
        if (needsReview.length > 0) {
          log(`${needsReview.length} video(s) require monetization review`, true);
          result.tasksApprovalRequired.push(`${taskName}: ${needsReview.length} video(s) need review`);
        } else {
          log(`Monetization audit complete — ${r.reports.length} videos audited`);
        }
        result.tasksRun.push(taskName);
        break;
      }

      case "build_internal_linking_plan": {
        const plan = await buildInternalLinkingPlan(userId);
        log(`Internal linking plan built — ${plan.playlistSuggestions?.length ?? 0} playlists, ${plan.descriptionLinkBlocks?.length ?? 0} link blocks`);
        result.tasksRun.push(taskName);
        break;
      }

      case "check_failed_jobs": {
        const failed = await db
          .select({ count: sql<number>`COUNT(*)` })
          .from(autopilotQueue)
          .where(and(
            eq(autopilotQueue.userId, userId),
            inArray(autopilotQueue.status, ["failed"]),
            inArray(autopilotQueue.targetPlatform as any, ["youtube", "youtubeshorts"]),
          ));
        const count = Number(failed[0]?.count ?? 0);
        log(`Found ${count} failed YouTube queue items`);
        result.tasksRun.push(taskName);
        break;
      }

      case "retry_safe_failures": {
        // Retry only transient errors — quota temp, file issues, AI unavailable
        const SAFE_PATTERNS = [
          "%quota%temporary%",
          "%yt-dlp%",
          "%ffmpeg%transient%",
          "%AI unavailable%",
          "%ECONNRESET%",
          "%ETIMEDOUT%",
          "%503%",
          "%502%",
        ];
        let retried = 0;
        for (const pattern of SAFE_PATTERNS) {
          try {
            const res = await db.execute(sql`
              UPDATE autopilot_queue
              SET status = 'pending', error_message = NULL, updated_at = NOW()
              WHERE user_id = ${userId}
                AND status = 'failed'
                AND target_platform IN ('youtube', 'youtubeshorts')
                AND error_message ILIKE ${pattern}
                AND (metadata->>'retryCount')::int < 3
                  OR (metadata->>'retryCount') IS NULL
            `);
            retried += (res as any)?.rowCount ?? 0;
          } catch {}
        }
        log(`Retried ${retried} transient failures`);
        result.tasksRun.push(taskName);
        break;
      }

      case "generate_daily_report": {
        const status = await getBackCatalogStatus(userId).catch(() => null);
        const learning = await getLearningSummary(userId).catch(() => null);
        const scheduledCount = await db
          .select({ count: sql<number>`COUNT(*)` })
          .from(autopilotQueue)
          .where(and(
            eq(autopilotQueue.userId, userId),
            eq(autopilotQueue.status, "scheduled"),
            inArray(autopilotQueue.targetPlatform as any, ["youtube", "youtubeshorts"]),
          ));

        const report = [
          `=== YouTube AI Daily Report — ${new Date().toLocaleDateString()} ===`,
          `Back catalog: ${status?.totalVideos ?? 0} indexed videos`,
          `VODs over 60 min: ${status?.over60Min ?? 0}`,
          `Shorts queued today: ${result.shortsQueued}`,
          `Long-form queued today: ${result.longFormQueued}`,
          `Metadata updated today: ${result.metadataUpdated}`,
          `Scheduled in queue: ${Number(scheduledCount[0]?.count ?? 0)}`,
          `Learning cycle: ${result.learningComplete ? "completed" : "skipped"}`,
          `Top learning insight: ${learning?.topInsight ?? "none yet"}`,
          `Approval required: ${result.tasksApprovalRequired.length > 0 ? result.tasksApprovalRequired.join("; ") : "none"}`,
          `Tasks run: ${result.tasksRun.join(", ")}`,
          `Errors: ${result.errors.length > 0 ? result.errors.join("; ") : "none"}`,
        ].join("\n");

        dailyReports.set(userId, { report, generatedAt: new Date() });
        log("Daily report generated");
        result.tasksRun.push(taskName);
        break;
      }

      default:
        result.tasksSkipped.push(taskName);
        break;
    }
  } catch (err: any) {
    const msg = `${taskName}: ${err?.message?.slice(0, 200) ?? "unknown error"}`;
    result.errors.push(msg);
    log(`FAILED — ${err?.message?.slice(0, 100)}`);
    logger.error(`[YouTubeAI] Task failed: ${msg}`);
  }
}

// ── Core cycle ────────────────────────────────────────────────────────────────

export async function runYouTubeAICycle(userId: string, reason = "scheduled", fullCycle = false): Promise<YouTubeAICycleResult> {
  if (activeCycles.has(userId)) {
    logger.warn(`[YouTubeAI] Cycle already active for ${userId.slice(0, 8)} — skipping`);
    return {
      userId, cycleId: "skipped", startedAt: new Date().toISOString(),
      completedAt: new Date().toISOString(), tasksRun: [], tasksSkipped: ["all — already running"],
      tasksApprovalRequired: [], shortsQueued: 0, longFormQueued: 0, metadataUpdated: 0,
      learningComplete: false, errors: ["Already running"],
    };
  }

  if (isQuotaBreakerTripped()) {
    logger.warn(`[YouTubeAI] Skipped for ${userId.slice(0, 8)} — quota breaker active`);
    return {
      userId, cycleId: "skipped", startedAt: new Date().toISOString(),
      completedAt: new Date().toISOString(), tasksRun: [], tasksSkipped: ["all — quota breaker"],
      tasksApprovalRequired: [], shortsQueued: 0, longFormQueued: 0, metadataUpdated: 0,
      learningComplete: false, errors: [],
    };
  }

  activeCycles.add(userId);
  const cycleId = `${Date.now()}-${userId.slice(0, 6)}`;
  const startedAt = new Date().toISOString();
  logger.info(`[YouTubeAI] Starting cycle for user ${userId.slice(0, 8)} — reason: ${reason}, full: ${fullCycle}`);

  const result: YouTubeAICycleResult = {
    userId, cycleId, startedAt, completedAt: "",
    tasksRun: [], tasksSkipped: [], tasksApprovalRequired: [],
    shortsQueued: 0, longFormQueued: 0, metadataUpdated: 0,
    learningComplete: false, errors: [],
  };

  try {
    const plan = await buildExecutionPlan(userId, fullCycle);
    logger.info(`[YouTubeAI] Plan generated: ${plan.tasks.filter(t => t.allowedToRun).length} task(s) to run`);

    // Deduplicate queue_back_catalog_revival / queue_shorts / queue_long_form
    // — they all call queueBackCatalogRevivalWork, so only run once
    let queueRevivalRan = false;

    for (const task of plan.tasks) {
      if (!task.allowedToRun) {
        result.tasksSkipped.push(`${task.name} (${task.reason})`);
        continue;
      }
      if (task.requiresApproval) {
        result.tasksApprovalRequired.push(`${task.name}: ${task.reason}`);
        logger.info(`[YouTubeAI] Approval required: ${task.name}`);
        continue;
      }
      if (
        (task.name === "queue_shorts" || task.name === "queue_long_form") &&
        queueRevivalRan
      ) {
        // Already ran queue_back_catalog_revival which handles both
        result.tasksSkipped.push(`${task.name} (handled by queue_back_catalog_revival)`);
        continue;
      }
      if (task.name === "queue_back_catalog_revival") queueRevivalRan = true;

      await executeTask(task.name, userId, result);

      // Re-check quota between tasks
      if (isQuotaBreakerTripped()) {
        logger.warn("[YouTubeAI] Quota breaker tripped mid-cycle — halting remaining tasks");
        result.errors.push("Quota breaker tripped mid-cycle");
        break;
      }
    }
  } finally {
    activeCycles.delete(userId);
    result.completedAt = new Date().toISOString();
  }

  logger.info(`[YouTubeAI] Cycle complete for ${userId.slice(0, 8)} — ran: ${result.tasksRun.length}, skipped: ${result.tasksSkipped.length}, errors: ${result.errors.length}`);
  if (result.shortsQueued > 0) logger.info(`[YouTubeAI] Queued Shorts: ${result.shortsQueued}`);
  if (result.longFormQueued > 0) logger.info(`[YouTubeAI] Queued long-form: ${result.longFormQueued}`);
  if (result.metadataUpdated > 0) logger.info(`[YouTubeAI] Metadata updates: ${result.metadataUpdated}`);
  if (result.tasksApprovalRequired.length > 0) {
    logger.warn(`[YouTubeAI] Approval required: ${result.tasksApprovalRequired.join("; ")}`);
  }

  if (fullCycle) lastFullCycleAt = new Date();
  return result;
}

export async function runYouTubeAIForAllEligibleUsers(fullCycle = false): Promise<void> {
  if (globalPaused) {
    logger.info("[YouTubeAI] Skipped — orchestrator is paused");
    return;
  }
  if (isQuotaBreakerTripped()) {
    logger.warn("[YouTubeAI] Skipped — quota breaker active");
    return;
  }

  const userIds = await getEligibleUserIds();
  if (userIds.length === 0) {
    logger.info("[YouTubeAI] No eligible users found (no connected YouTube channels)");
    return;
  }

  logger.info(`[YouTubeAI] Eligible users found: ${userIds.length}`);

  for (const uid of userIds) {
    await runYouTubeAICycle(uid, fullCycle ? "full-daily-cycle" : "light-cycle", fullCycle)
      .catch(err => logger.error(`[YouTubeAI] Unhandled cycle error for ${uid.slice(0, 8)}: ${err?.message}`));
  }
}

// ── Force-run ──────────────────────────────────────────────────────────────────

export async function forceYouTubeAICycle(userId: string): Promise<YouTubeAICycleResult> {
  logger.info(`[YouTubeAI] Force-run triggered for ${userId.slice(0, 8)}`);
  return runYouTubeAICycle(userId, "force-run", true);
}

// ── Status ────────────────────────────────────────────────────────────────────

export async function getYouTubeAIOrchestratorStatus(userId: string) {
  const catalogStatus = await getBackCatalogStatus(userId).catch(() => null);
  const learning = await getLearningSummary(userId).catch(() => null);
  const scheduledQ = await db
    .select({ count: sql<number>`COUNT(*)` })
    .from(autopilotQueue)
    .where(and(
      eq(autopilotQueue.userId, userId),
      inArray(autopilotQueue.status, ["scheduled", "pending"]),
      inArray(autopilotQueue.targetPlatform as any, ["youtube", "youtubeshorts"]),
    ));

  return {
    mode: globalPaused ? "paused" : "auto-safe",
    quotaBreakerActive: isQuotaBreakerTripped(),
    activeCycleRunning: activeCycles.has(userId),
    lastFullCycleAt: lastFullCycleAt?.toISOString() ?? null,
    nextFullCycleEta: lastFullCycleAt
      ? new Date(lastFullCycleAt.getTime() + FULL_CYCLE_MS).toISOString()
      : null,
    queueBacklog: Number(scheduledQ[0]?.count ?? 0),
    backCatalog: catalogStatus,
    learningSummary: learning,
    approvalRequired: decisionLog.filter(d => d.userId === userId && d.approvalRequired).slice(0, 10),
    dailyReport: dailyReports.get(userId) ?? null,
  };
}

// ── Init / Stop ───────────────────────────────────────────────────────────────

export function initYouTubeAIOrchestrator(): void {
  if (process.env.NODE_ENV === "test") {
    logger.info("[YouTubeAI] Skipped — NODE_ENV=test");
    return;
  }

  const isProd = process.env.NODE_ENV === "production" || !!process.env.REPLIT_DEPLOYMENT;
  const disabled = process.env.DISABLE_YOUTUBE_AI_ORCHESTRATOR === "true";
  const devEnabled = process.env.ENABLE_YOUTUBE_AI_ORCHESTRATOR === "true";

  if (disabled) {
    logger.info("[YouTubeAI] Orchestrator disabled via DISABLE_YOUTUBE_AI_ORCHESTRATOR=true");
    return;
  }
  if (!isProd && !devEnabled) {
    logger.info("[YouTubeAI] Orchestrator skipped — development mode (set ENABLE_YOUTUBE_AI_ORCHESTRATOR=true to enable locally)");
    return;
  }

  logger.info(`[YouTubeAI] Orchestrator started — first run in ${Math.round(STARTUP_DELAY_MS / 60_000)} min, light every ${Math.round(LIGHT_CYCLE_MS / 3_600_000)} h, full every ${Math.round(FULL_CYCLE_MS / 3_600_000)} h`);

  // ── Startup full cycle ───────────────────────────────────────────────────
  startupTimer = setTimeout(async () => {
    logger.info("[YouTubeAI] Startup delay complete — running first full cycle");
    await runYouTubeAIForAllEligibleUsers(true).catch(
      err => logger.error("[YouTubeAI] Startup cycle error:", err?.message),
    );

    // ── Light cycle (every ~4h) ────────────────────────────────────────────
    lightInterval = setInterval(async () => {
      logger.info("[YouTubeAI] Light cycle — checking queue and retrying failures");
      await runYouTubeAIForAllEligibleUsers(false).catch(
        err => logger.error("[YouTubeAI] Light cycle error:", err?.message),
      );
    }, LIGHT_CYCLE_MS);

    // ── Full strategic cycle (every ~22–24h) ───────────────────────────────
    fullInterval = setInterval(async () => {
      logger.info("[YouTubeAI] Full daily cycle — running complete strategy");
      await runYouTubeAIForAllEligibleUsers(true).catch(
        err => logger.error("[YouTubeAI] Full cycle error:", err?.message),
      );
    }, FULL_CYCLE_MS);
  }, STARTUP_DELAY_MS);
}

export function stopYouTubeAIOrchestrator(): void {
  if (startupTimer) { clearTimeout(startupTimer); startupTimer = null; }
  if (lightInterval) { clearInterval(lightInterval); lightInterval = null; }
  if (fullInterval)  { clearInterval(fullInterval);  fullInterval = null; }
  globalPaused = false;
  logger.info("[YouTubeAI] Orchestrator stopped");
}

export function pauseYouTubeAIOrchestrator(): void {
  globalPaused = true;
  logger.info("[YouTubeAI] Orchestrator paused");
}

export function resumeYouTubeAIOrchestrator(): void {
  globalPaused = false;
  logger.info("[YouTubeAI] Orchestrator resumed");
}

export function getDecisionLog(userId: string, limit = 50) {
  return decisionLog
    .filter(d => d.userId === userId)
    .slice(0, limit);
}

export function getDailyReport(userId: string) {
  return dailyReports.get(userId) ?? null;
}
