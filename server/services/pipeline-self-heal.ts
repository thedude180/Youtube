import { db } from "../db";
import { contentPipeline, youtubePushBacklog } from "@shared/schema";
import { and, eq, lt, or, like, isNull } from "drizzle-orm";
import { createLogger } from "../lib/logger";

const logger = createLogger("pipeline-self-heal");

const STUCK_PROCESSING_THRESHOLD_MS = 30 * 60_000;

const TRANSIENT_PIPELINE_ERRORS = [
  "%AI queue full%",
  "%queue full%",
  "%request dropped%",
  "%AI slot deferred%",
  "%chat priority window%",
  "%Connection terminated%",
  "%Query read timeout%",
  "%ECONNRESET%",
  "%ETIMEDOUT%",
  "%socket hang%",
  "%401%",
  "%429%",
];

export async function runPipelineSelfHeal(): Promise<void> {
  const stuckCutoff = new Date(Date.now() - STUCK_PROCESSING_THRESHOLD_MS);

  // 1. Reset pipelines stuck in "processing" for > 30 min OR with no startedAt
  const stuckResult = await db
    .update(contentPipeline)
    .set({ status: "pending", errorMessage: null, startedAt: null })
    .where(
      and(
        eq(contentPipeline.status, "processing"),
        or(
          isNull(contentPipeline.startedAt),
          lt(contentPipeline.startedAt, stuckCutoff)
        )!
      )!
    );
  const stuckCount = (stuckResult as any)?.rowCount ?? 0;

  // 2. Reset "error" pipelines with transient AI / network errors → pending
  const errorConditions = TRANSIENT_PIPELINE_ERRORS.map(p =>
    like(contentPipeline.errorMessage, p)
  );
  const errorResult = await db
    .update(contentPipeline)
    .set({ status: "pending", errorMessage: null, startedAt: null })
    .where(
      and(
        eq(contentPipeline.status, "error"),
        or(...errorConditions)!
      )!
    );
  const errorCount = (errorResult as any)?.rowCount ?? 0;

  // 3. Reset YouTube push backlog items stuck on transient errors
  const backlogResult = await db
    .update(youtubePushBacklog)
    .set({ status: "queued", lastError: null, attempts: 0 })
    .where(
      and(
        eq(youtubePushBacklog.status, "failed"),
        or(
          like(youtubePushBacklog.lastError, "%Connection terminated%"),
          like(youtubePushBacklog.lastError, "%Query read timeout%"),
          like(youtubePushBacklog.lastError, "%ETIMEDOUT%"),
          like(youtubePushBacklog.lastError, "%ECONNRESET%"),
          like(youtubePushBacklog.lastError, "%socket hang%")
        )!
      )!
    );
  const backlogCount = (backlogResult as any)?.rowCount ?? 0;

  if (stuckCount > 0 || errorCount > 0 || backlogCount > 0) {
    logger.info(
      `[self-heal] Recovered ${stuckCount} stuck pipelines, ${errorCount} error pipelines, ${backlogCount} backlog items`
    );
  } else {
    logger.info("[self-heal] All clear — no stuck or errored pipelines found");
  }
}

export function initPipelineSelfHeal(): NodeJS.Timeout {
  const INTERVAL_MS = 2 * 60 * 60_000;
  const jitter = Math.random() * 5 * 60_000;

  const run = () => {
    runPipelineSelfHeal().catch(err => {
      logger.warn("[self-heal] Periodic run failed", { error: err?.message });
    });
  };

  run();
  const handle = setInterval(run, INTERVAL_MS + jitter);
  logger.info(`[self-heal] Initialized — runs every ~2h`);
  return handle;
}
