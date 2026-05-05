import { queue } from "../../core/job-queue.js";
import { videoService } from "./service.js";
import { createLogger } from "../../core/logger.js";

const log = createLogger("video-worker");

export function registerVideoWorkers(): void {
  queue.work<{ downloadId: number; userId: string }>(
    "video.download",
    { localConcurrency: 1, batchSize: 1 },
    async (jobs) => {
      for (const job of jobs) {
        const { downloadId, userId } = job.data;
        log.info("Processing download", { downloadId });
        await videoService.processDownload(downloadId, userId);
      }
    },
  );

  log.info("Video workers registered");
}
