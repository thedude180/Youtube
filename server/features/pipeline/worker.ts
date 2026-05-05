import { queue } from "../../core/job-queue.js";
import { livestreamPipeline } from "./livestream-pipeline.js";
import { contentPipeline } from "./content-pipeline.js";
import { createLogger } from "../../core/logger.js";

const log = createLogger("pipeline-worker");

export function registerPipelineWorkers(): void {
  /** Post-stream analysis — runs after stream ends */
  queue.work<{ runId: number }>(
    "pipeline.livestream.post-stream",
    { localConcurrency: 2 },
    async (jobs) => {
      for (const job of jobs) {
        const { runId } = job.data;
        log.info("Running post-stream pipeline", { runId });
        await livestreamPipeline.onStreamEnded(runId);
      }
    },
  );

  /** Full content pipeline for a YouTube video */
  queue.work<{ runId: number }>(
    "pipeline.content.execute",
    { localConcurrency: 2 },
    async (jobs) => {
      for (const job of jobs) {
        const { runId } = job.data;
        log.info("Running content pipeline", { runId });
        await contentPipeline.execute(runId);
      }
    },
  );

  // Legacy: keep pipeline.execute working for any existing queued jobs
  queue.work<{ runId: number }>(
    "pipeline.execute",
    { localConcurrency: 2 },
    async (jobs) => {
      for (const job of jobs) {
        const { runId } = job.data;
        log.info("Running legacy pipeline", { runId });
        await livestreamPipeline.onStreamEnded(runId);
      }
    },
  );

  log.info("Pipeline workers registered (livestream + content)");
}
