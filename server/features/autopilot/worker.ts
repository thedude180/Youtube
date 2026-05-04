import { queue } from "../../core/job-queue.js";
import { autopilotRepo } from "./repository.js";
import { autopilotService } from "./service.js";
import { sseEmit } from "../../core/sse.js";
import { createLogger } from "../../core/logger.js";

const log = createLogger("autopilot-worker");

export function registerAutopilotWorkers(): void {
  queue.work<{ queueItemId: number; userId: string }>(
    "autopilot.execute-post",
    { localConcurrency: 3, batchSize: 3 },
    async (jobs) => {
      for (const job of jobs) {
        const { queueItemId, userId } = job.data;
        log.info("Executing autopilot post", { queueItemId });

        const item = await autopilotRepo.findById(queueItemId);
        if (!item || item.status === "published" || item.status === "cancelled") {
          log.warn("Queue item not found or already processed", { queueItemId });
          continue;
        }

        await autopilotRepo.updateStatus(queueItemId, "processing");
        await autopilotRepo.incrementAttempts(queueItemId);

        try {
          const platformPostId = await autopilotService.executePost(item);
          await autopilotRepo.updateStatus(queueItemId, "published", {
            platformPostId: platformPostId ?? undefined,
            publishedAt: new Date(),
          });
          sseEmit(userId, "autopilot:post-success", { queueItemId });
          log.info("Post published", { queueItemId, platform: item.platform });
        } catch (err: any) {
          await autopilotRepo.updateStatus(queueItemId, "failed", { lastError: err.message });
          sseEmit(userId, "autopilot:post-failed", { queueItemId, error: err.message });
          log.error("Post failed", { queueItemId, error: err.message });
          throw err;
        }
      }
    },
  );

  log.info("Autopilot workers registered");
}
