import { queue } from "../../core/job-queue.js";
import { pipelineService } from "./service.js";
import { createLogger } from "../../core/logger.js";

const log = createLogger("pipeline-worker");

export function registerPipelineWorkers(): void {
  queue.work<{ runId: number }>(
    "pipeline.execute",
    { localConcurrency: 2 },
    async (jobs) => {
      for (const job of jobs) {
        const { runId } = job.data;
        log.info("Executing pipeline run", { runId });
        await pipelineService.executePipeline(runId);
      }
    },
  );

  log.info("Pipeline workers registered");
}
