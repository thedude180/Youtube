import { db } from "../db";
import {
  contentPipeline,
  youtubePushBacklog,
  streamEditJobs,
  contentClips,
  studioVideos,
  autopilotQueue,
  jobs,
  contentVaultBackups,
} from "@shared/schema";
import { and, eq, lt, or, like, isNull, isNotNull, sql } from "drizzle-orm";
import { createLogger } from "../lib/logger";
import { refreshExpiringTokens } from "../token-refresh";
import { processBacklog } from "./youtube-push-backlog";

const logger = createLogger("pipeline-self-heal");

// ─── Thresholds ──────────────────────────────────────────────────────────────
const STUCK_PIPELINE_MS       = 30  * 60_000;
const STUCK_STREAM_JOB_MS     = 45  * 60_000;
const STUCK_CLIP_MS           = 30  * 60_000;
const STUCK_STUDIO_MS         = 30  * 60_000;
const STUCK_AUTOPILOT_MS      = 30  * 60_000;
const STUCK_JOBS_MS           = 30  * 60_000;
const STUCK_VAULT_DOWNLOAD_MS = 60  * 60_000;
const MAX_STREAM_JOB_RETRIES  = 5;
const MAIN_INTERVAL_MS        = 20  * 60_000;
const DEEP_INTERVAL_MS        = 6   * 60 * 60_000;

// ─── Transient error patterns shared across tables ───────────────────────────
const TRANSIENT_DB = [
  "%Connection terminated%",
  "%Query read timeout%",
  "%ETIMEDOUT%",
  "%ECONNRESET%",
  "%socket hang%",
  "%timeout exceeded%",
  "%terminating connection%",
  "%connection pool%",
  "%connect ETIMEDOUT%",
];

const TRANSIENT_AI = [
  "%AI queue full%",
  "%queue full%",
  "%request dropped%",
  "%AI slot deferred%",
  "%chat priority window%",
  "%429%",
  "%rate limit%",
  "%Rate limit%",
  "%overloaded%",
];

const TRANSIENT_NET = [
  "%fetch failed%",
  "%ENOTFOUND%",
  "%EHOSTUNREACH%",
  "%network error%",
  "%Network Error%",
  "%getaddrinfo%",
  "%socket timeout%",
  "%read ECONNRESET%",
  "%write ECONNRESET%",
];

const ALL_TRANSIENT = [...TRANSIENT_DB, ...TRANSIENT_AI, ...TRANSIENT_NET];

function transientConditions<T extends { errorMessage: any }>(table: T): ReturnType<typeof like>[] {
  return ALL_TRANSIENT.map(p => like((table as any).errorMessage, p));
}

// ─── Heal 1: content_pipeline ────────────────────────────────────────────────
async function healContentPipeline(): Promise<[number, number]> {
  const stuckCutoff = new Date(Date.now() - STUCK_PIPELINE_MS);

  const stuck = await db
    .update(contentPipeline)
    .set({ status: "pending", errorMessage: null, startedAt: null })
    .where(
      and(
        eq(contentPipeline.status, "processing"),
        or(isNull(contentPipeline.startedAt), lt(contentPipeline.startedAt, stuckCutoff))!
      )!
    );

  const errored = await db
    .update(contentPipeline)
    .set({ status: "pending", errorMessage: null, startedAt: null })
    .where(
      and(
        eq(contentPipeline.status, "error"),
        or(...transientConditions(contentPipeline))!
      )!
    );

  return [(stuck as any)?.rowCount ?? 0, (errored as any)?.rowCount ?? 0];
}

// ─── Heal 2: youtube_push_backlog ────────────────────────────────────────────
async function healPushBacklog(): Promise<number> {
  const patterns = [...TRANSIENT_DB, ...TRANSIENT_NET].map(p =>
    like(youtubePushBacklog.lastError, p)
  );

  const res = await db
    .update(youtubePushBacklog)
    .set({ status: "queued", lastError: null, attempts: 0 })
    .where(
      and(
        eq(youtubePushBacklog.status, "failed"),
        or(...patterns)!
      )!
    );

  return (res as any)?.rowCount ?? 0;
}

// ─── Heal 3: stream_edit_jobs ────────────────────────────────────────────────
async function healStreamEditJobs(): Promise<[number, number, number]> {
  const stuckCutoff = new Date(Date.now() - STUCK_STREAM_JOB_MS);

  // 3a. Stuck in processing > 45 min
  const stuckRes = await db
    .update(streamEditJobs)
    .set({
      status: "queued",
      errorMessage: null,
      startedAt: null,
      progress: 0,
      currentStage: "Re-queued (self-heal)",
    })
    .where(
      and(
        eq(streamEditJobs.status, "processing"),
        or(isNull(streamEditJobs.startedAt), lt(streamEditJobs.startedAt, stuckCutoff))!
      )!
    );

  // 3b. Errored with transient DB / net errors — retry up to MAX_STREAM_JOB_RETRIES
  const transientPatterns = [...TRANSIENT_DB, ...TRANSIENT_NET].map(p =>
    like(streamEditJobs.errorMessage, p)
  );
  const erroredTransient = await db
    .update(streamEditJobs)
    .set({
      status: "queued",
      errorMessage: null,
      startedAt: null,
      progress: 0,
      currentStage: "Re-queued (self-heal)",
    })
    .where(
      and(
        eq(streamEditJobs.status, "error"),
        or(...transientPatterns)!
      )!
    );

  // 3c. "Source video file not found" — vault needs to re-download first
  const missingFile = await db
    .update(streamEditJobs)
    .set({
      status: "queued",
      errorMessage: null,
      startedAt: null,
      progress: 0,
      downloadFirst: true,
      currentStage: "Re-queued (vault retry)",
    })
    .where(
      and(
        eq(streamEditJobs.status, "error"),
        like(streamEditJobs.errorMessage, "%Source video file not found%")
      )!
    );

  return [
    (stuckRes as any)?.rowCount ?? 0,
    (erroredTransient as any)?.rowCount ?? 0,
    (missingFile as any)?.rowCount ?? 0,
  ];
}

// ─── Heal 4: content_clips ───────────────────────────────────────────────────
async function healContentClips(): Promise<number> {
  const cutoff = new Date(Date.now() - STUCK_CLIP_MS);
  const res = await db
    .update(contentClips)
    .set({ status: "pending" })
    .where(
      and(
        eq(contentClips.status, "processing"),
        lt(contentClips.createdAt, cutoff)
      )!
    );
  return (res as any)?.rowCount ?? 0;
}

// ─── Heal 5: studio_videos ───────────────────────────────────────────────────
async function healStudioVideos(): Promise<number> {
  const cutoff = new Date(Date.now() - STUCK_STUDIO_MS);
  const res = await db
    .update(studioVideos)
    .set({ status: "pending" })
    .where(
      and(
        eq(studioVideos.status, "processing"),
        lt(studioVideos.updatedAt, cutoff)
      )!
    );
  return (res as any)?.rowCount ?? 0;
}

// ─── Heal 6: autopilot_queue ─────────────────────────────────────────────────
async function healAutopilotQueue(): Promise<number> {
  const cutoff = new Date(Date.now() - STUCK_AUTOPILOT_MS);
  const res = await db
    .update(autopilotQueue)
    .set({ status: "pending" })
    .where(
      and(
        eq(autopilotQueue.status, "processing"),
        lt(autopilotQueue.createdAt, cutoff)
      )!
    );
  return (res as any)?.rowCount ?? 0;
}

// ─── Heal 7: jobs table ──────────────────────────────────────────────────────
async function healJobsTable(): Promise<number> {
  const cutoff = new Date(Date.now() - STUCK_JOBS_MS);

  // Only reset jobs with transient errors, not permanent failures
  const patterns = ALL_TRANSIENT.map(p => like(jobs.errorMessage, p));
  const errored = await db
    .update(jobs)
    .set({ status: "pending", errorMessage: null, startedAt: null, progress: 0 })
    .where(
      and(
        eq(jobs.status, "failed"),
        isNotNull(jobs.errorMessage),
        or(...patterns)!
      )!
    );

  // Also reset jobs stuck in "processing" for too long
  const stuck = await db
    .update(jobs)
    .set({ status: "pending", startedAt: null, progress: 0 })
    .where(
      and(
        eq(jobs.status, "processing"),
        or(isNull(jobs.startedAt), lt(jobs.startedAt, cutoff))!
      )!
    );

  return ((errored as any)?.rowCount ?? 0) + ((stuck as any)?.rowCount ?? 0);
}

// ─── Heal 8: content_vault_backups ───────────────────────────────────────────
async function healVaultBackups(): Promise<[number, number]> {
  const downloadCutoff = new Date(Date.now() - STUCK_VAULT_DOWNLOAD_MS);

  // 8a. Stuck in "downloading" for > 1 hour
  const stuckDownload = await db
    .update(contentVaultBackups)
    .set({ status: "indexed" })
    .where(
      and(
        eq(contentVaultBackups.status, "downloading"),
        lt(contentVaultBackups.createdAt, downloadCutoff)
      )!
    );

  // 8b. "Failed" vault entries with transient download errors → retry
  const transientVaultPatterns = [...TRANSIENT_DB, ...TRANSIENT_NET].map(p =>
    like(contentVaultBackups.downloadError, p)
  );
  const failedTransient = await db
    .update(contentVaultBackups)
    .set({ status: "indexed", downloadError: null })
    .where(
      and(
        eq(contentVaultBackups.status, "failed"),
        isNotNull(contentVaultBackups.downloadError),
        or(...transientVaultPatterns)!
      )!
    );

  return [
    (stuckDownload as any)?.rowCount ?? 0,
    (failedTransient as any)?.rowCount ?? 0,
  ];
}

// ─── Heal 9: token proactive refresh ─────────────────────────────────────────
async function healTokens(): Promise<void> {
  try {
    const result = await refreshExpiringTokens();
    if (result.refreshed > 0) {
      logger.info(`[self-heal] Proactively refreshed ${result.refreshed} expiring token(s)`);
    }
    if (result.failed > 0) {
      logger.warn(`[self-heal] ${result.failed} token refresh(es) failed — will retry next cycle`);
    }
  } catch (err: any) {
    logger.warn("[self-heal] Token refresh probe failed", { error: err?.message });
  }
}

// ─── Heal 10: proactive backlog drain ────────────────────────────────────────
async function healBacklogDrain(): Promise<void> {
  try {
    const result = await processBacklog();
    if (result.processed > 0) {
      logger.info(`[self-heal] Backlog drain: ${result.processed} items processed`);
    }
  } catch (err: any) {
    logger.warn("[self-heal] Backlog drain probe failed", { error: err?.message });
  }
}

// ─── Main heal run ────────────────────────────────────────────────────────────
export async function runPipelineSelfHeal(deep = false): Promise<void> {
  const t0 = Date.now();
  let totalRecovered = 0;

  // Run all heals in parallel where safe (read-then-write each table independently)
  const [
    [pipelineStuck, pipelineErrored],
    backlogFixed,
    [editStuck, editTransient, editMissing],
    clipsFixed,
    studioFixed,
    autopilotFixed,
    jobsFixed,
  ] = await Promise.all([
    healContentPipeline(),
    healPushBacklog(),
    healStreamEditJobs(),
    healContentClips(),
    healStudioVideos(),
    healAutopilotQueue(),
    healJobsTable(),
  ]);

  totalRecovered = pipelineStuck + pipelineErrored + backlogFixed +
    editStuck + editTransient + editMissing +
    clipsFixed + studioFixed + autopilotFixed + jobsFixed;

  // Vault heal runs in both main and deep cycles
  const [vaultStuck, vaultFailed] = await healVaultBackups();
  totalRecovered += vaultStuck + vaultFailed;

  // Token refresh + backlog drain run every cycle
  await Promise.all([healTokens(), healBacklogDrain()]);

  const elapsed = Date.now() - t0;

  if (totalRecovered > 0) {
    logger.info(
      `[self-heal] Recovered ${totalRecovered} items in ${elapsed}ms — ` +
      `pipeline[stuck:${pipelineStuck} err:${pipelineErrored}] ` +
      `backlog[${backlogFixed}] ` +
      `editJobs[stuck:${editStuck} transient:${editTransient} missing:${editMissing}] ` +
      `clips[${clipsFixed}] studio[${studioFixed}] ` +
      `autopilot[${autopilotFixed}] jobs[${jobsFixed}] ` +
      `vault[stuck:${vaultStuck} failed:${vaultFailed}]`
    );
  } else {
    logger.info(`[self-heal] All clear in ${elapsed}ms — no stuck or errored items found`);
  }

  if (deep) {
    await runDeepAudit();
  }
}

// ─── Deep audit (startup + every 6h) ─────────────────────────────────────────
async function runDeepAudit(): Promise<void> {
  try {
    const [overdueResult, stalledStageResult, pendingVaultResult] = await Promise.all([
      db.execute(sql`
        SELECT COUNT(*)::int AS count FROM autopilot_queue
        WHERE status = 'pending'
          AND scheduled_at IS NOT NULL
          AND scheduled_at < NOW() - INTERVAL '2 hours'
      `),
      db.execute(sql`
        SELECT COUNT(*)::int AS count FROM stream_edit_jobs
        WHERE status = 'queued' AND current_stage = 'Failed'
      `),
      db.execute(sql`
        SELECT COUNT(*)::int AS count FROM content_vault_backups WHERE status = 'indexed'
      `),
    ]);

    const overdueCount  = Number((overdueResult.rows[0] as any)?.count ?? 0);
    const stalledStage  = Number((stalledStageResult.rows[0] as any)?.count ?? 0);
    const pendingVault  = Number((pendingVaultResult.rows[0] as any)?.count ?? 0);

    if (overdueCount > 0) {
      logger.warn(`[self-heal] Deep audit: ${overdueCount} autopilot item(s) overdue by >2h — engine may be stalled`);
    }
    if (stalledStage > 0) {
      logger.info(`[self-heal] Deep audit: ${stalledStage} stream_edit_jobs stage=Failed/status=queued — will retry normally`);
    }
    logger.info(`[self-heal] Deep audit: ${pendingVault} vault entries awaiting download`);
    logger.info("[self-heal] Deep audit complete");
  } catch (err: any) {
    logger.warn("[self-heal] Deep audit failed", { error: err?.message });
  }
}

// ─── Init ─────────────────────────────────────────────────────────────────────
export function initPipelineSelfHeal(): void {
  const jitter = () => Math.random() * 2 * 60_000; // up to 2 min jitter

  // Run immediately on startup (deep audit)
  runPipelineSelfHeal(true).catch(err => {
    logger.warn("[self-heal] Startup run failed", { error: err?.message });
  });

  // Main heal loop: every 20 minutes
  setInterval(() => {
    runPipelineSelfHeal(false).catch(err => {
      logger.warn("[self-heal] Periodic run failed", { error: err?.message });
    });
  }, MAIN_INTERVAL_MS + jitter());

  // Deep audit: every 6 hours
  setInterval(() => {
    runPipelineSelfHeal(true).catch(err => {
      logger.warn("[self-heal] Deep run failed", { error: err?.message });
    });
  }, DEEP_INTERVAL_MS + jitter());

  logger.info("[self-heal] Initialized — main loop every 20min, deep audit every 6h");
}
