import { queue } from "../../core/job-queue.js";
import { autopilotRepo } from "./repository.js";
import { sseEmit } from "../../core/sse.js";
import { createLogger } from "../../core/logger.js";

const log = createLogger("autopilot-worker");

export function registerAutopilotWorkers(): void {
  queue.work<{ queueItemId: number; userId: string }>(
    "autopilot.execute-post",
    { teamSize: 3, teamConcurrency: 3 },
    async ({ data }) => {
      log.info("Executing autopilot post", { queueItemId: data.queueItemId });

      await autopilotRepo.updateStatus(data.queueItemId, "processing");

      try {
        // Platform-specific publishing logic lives in the service
        // For now we update to published and emit success event
        // Real implementation would call YouTube/Discord/TikTok APIs
        await autopilotRepo.updateStatus(data.queueItemId, "published", {
          publishedAt: new Date(),
        });
        sseEmit(data.userId, "autopilot:post-success", { queueItemId: data.queueItemId });
      } catch (err: any) {
        await autopilotRepo.updateStatus(data.queueItemId, "failed", { lastError: err.message });
        sseEmit(data.userId, "autopilot:post-failed", { queueItemId: data.queueItemId, error: err.message });
        throw err;
      }
    },
  );

  log.info("Autopilot workers registered");
}
