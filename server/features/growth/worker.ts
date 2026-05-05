import { queue } from "../../core/job-queue.js";
import { growthService } from "./service.js";
import { sseEmit } from "../../core/sse.js";
import { createLogger } from "../../core/logger.js";

const log = createLogger("growth-worker");

export function registerGrowthWorkers(): void {
  queue.work<{ userId: string }>(
    "growth.generate-plan",
    { localConcurrency: 1 },
    async (jobs) => {
      for (const job of jobs) {
        const { userId } = job.data;
        log.info("Generating growth plan", { userId });
        const plan = await growthService.generateGrowthPlan(userId);
        sseEmit(userId, "growth:plan-ready", { plan });
      }
    },
  );

  queue.work<{ userId: string; game: string }>(
    "growth.detect-trends",
    { localConcurrency: 2 },
    async (jobs) => {
      for (const job of jobs) {
        const { userId, game } = job.data;
        log.info("Detecting trends", { userId, game });
        await growthService.detectTrends(userId, game);
        sseEmit(userId, "growth:trends-updated", { game });
      }
    },
  );

  log.info("Growth workers registered");
}
