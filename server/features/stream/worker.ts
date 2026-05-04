import { queue } from "../../core/job-queue.js";
import { streamService } from "./service.js";
import { createLogger } from "../../core/logger.js";

const log = createLogger("stream-worker");

export function registerStreamWorkers(): void {
  queue.work<{ userId: string; streamId: number; title: string; game: string }>(
    "stream.announce-live",
    { localConcurrency: 3 },
    async (jobs) => {
      for (const job of jobs) {
        const { userId, streamId, title, game } = job.data;
        log.info("Announcing live stream", { userId, streamId });
        await streamService.announceLive(streamId, userId, title, game);
      }
    },
  );

  log.info("Stream workers registered");
}
