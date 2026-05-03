import { queue } from "../../core/job-queue.js";
import { videoService } from "./service.js";
import { createLogger } from "../../core/logger.js";

const log = createLogger("video-worker");

export function registerVideoWorkers(): void {
  queue.work<{ downloadId: number; userId: string }>(
    "video.download",
    { teamSize: 1, teamConcurrency: 1 }, // serial — don't saturate bandwidth
    async ({ data }) => {
      log.info("Processing download", { downloadId: data.downloadId });
      await videoService.processDownload(data.downloadId, data.userId);
    },
  );

  log.info("Video workers registered");
}
