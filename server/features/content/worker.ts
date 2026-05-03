import { queue } from "../../core/job-queue.js";
import { contentService } from "./service.js";
import { sseEmit } from "../../core/sse.js";
import { createLogger } from "../../core/logger.js";

const log = createLogger("content-worker");

export function registerContentWorkers(): void {
  queue.work<{ videoId: number; userId: string }>(
    "content.generate-metadata",
    { teamSize: 2, teamConcurrency: 2 },
    async ({ data }) => {
      log.info("Generating metadata", { videoId: data.videoId });
      const result = await contentService.generateMetadata(data.videoId, data.userId);
      sseEmit(data.userId, "content:metadata-ready", { videoId: data.videoId, ...result });
    },
  );

  queue.work<{ userId: string; game: string; count: number }>(
    "content.generate-ideas",
    { teamSize: 1 },
    async ({ data }) => {
      log.info("Generating ideas", { userId: data.userId, game: data.game });
      await contentService.generateContentIdeas(data.userId, data.game, data.count);
      sseEmit(data.userId, "content:ideas-ready", { game: data.game });
    },
  );

  queue.work<{ videoId: number; userId: string }>(
    "content.seo-audit",
    { teamSize: 2 },
    async ({ data }) => {
      log.info("Running SEO audit", { videoId: data.videoId });
      const result = await contentService.runSEOAudit(data.videoId, data.userId);
      sseEmit(data.userId, "content:seo-done", { videoId: data.videoId, ...result });
    },
  );

  log.info("Content workers registered");
}
