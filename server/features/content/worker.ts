import { queue } from "../../core/job-queue.js";
import { contentService } from "./service.js";
import { sseEmit } from "../../core/sse.js";
import { createLogger } from "../../core/logger.js";

const log = createLogger("content-worker");

export function registerContentWorkers(): void {
  queue.work<{ videoId: number; userId: string }>(
    "content.generate-metadata",
    { localConcurrency: 2, batchSize: 2 },
    async (jobs) => {
      for (const job of jobs) {
        const { videoId, userId } = job.data;
        log.info("Generating metadata", { videoId });
        const result = await contentService.generateMetadata(videoId, userId);
        sseEmit(userId, "content:metadata-ready", { videoId, ...result });
      }
    },
  );

  queue.work<{ userId: string; game: string; count: number }>(
    "content.generate-ideas",
    { localConcurrency: 1 },
    async (jobs) => {
      for (const job of jobs) {
        const { userId, game, count } = job.data;
        log.info("Generating ideas", { userId, game });
        await contentService.generateContentIdeas(userId, game, count);
        sseEmit(userId, "content:ideas-ready", { game });
      }
    },
  );

  queue.work<{ videoId: number; userId: string }>(
    "content.seo-audit",
    { localConcurrency: 2 },
    async (jobs) => {
      for (const job of jobs) {
        const { videoId, userId } = job.data;
        log.info("Running SEO audit", { videoId });
        const result = await contentService.runSEOAudit(videoId, userId);
        sseEmit(userId, "content:seo-done", { videoId, ...result });
      }
    },
  );

  log.info("Content workers registered");
}
