import { queue } from "../../core/job-queue.js";
import { livestreamPipeline } from "../pipeline/livestream-pipeline.js";
import { createLogger } from "../../core/logger.js";

const log = createLogger("stream-worker");

export function registerStreamWorkers(): void {
  /** Called when stream first goes live — triggers going-live announcement pipeline */
  queue.work<{ streamId: number; userId: string; title: string; game: string }>(
    "pipeline.livestream.going-live",
    { localConcurrency: 3 },
    async (jobs) => {
      for (const job of jobs) {
        const { streamId, userId, title, game } = job.data;
        log.info("Processing going-live event", { streamId, userId });
        await livestreamPipeline.onStreamLive(streamId, userId, title, game);
      }
    },
  );

  /** Called when stream ends — kicks off full post-stream analysis + distribution */
  queue.work<{ streamId: number; userId: string; title: string; game: string; durationSeconds: number }>(
    "pipeline.livestream.post-stream-init",
    { localConcurrency: 2 },
    async (jobs) => {
      for (const job of jobs) {
        const { streamId, userId, title, game, durationSeconds } = job.data;
        log.info("Initiating post-stream pipeline", { streamId, userId });

        // Create a new pipeline run in "analyzing" state, then queue the post-stream job
        const { pipelineRepo } = await import("../pipeline/repository.js");
        const { enqueue } = await import("../../core/job-queue.js");

        const run = await pipelineRepo.createRun({
          userId,
          type: "livestream",
          streamId,
          currentStage: "analyzing",
          contentTitle: title,
          contentGame: game,
          durationSeconds,
          startedAt: new Date(),
        });

        await enqueue("pipeline.livestream.post-stream", { runId: run.id });
        log.info("Post-stream pipeline run created", { runId: run.id, streamId });
      }
    },
  );

  log.info("Stream workers registered");
}
