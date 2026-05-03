import { queue } from "../../core/job-queue.js";
import { growthService } from "./service.js";
import { sseEmit } from "../../core/sse.js";
import { createLogger } from "../../core/logger.js";

const log = createLogger("growth-worker");

export function registerGrowthWorkers(): void {
  queue.work<{ userId: string }>(
    "growth.generate-plan",
    { teamSize: 1 },
    async ({ data }) => {
      log.info("Generating growth plan", { userId: data.userId });
      const plan = await growthService.generateGrowthPlan(data.userId);
      sseEmit(data.userId, "growth:plan-ready", { plan });
    },
  );

  queue.work<{ userId: string; game: string }>(
    "growth.detect-trends",
    { teamSize: 2 },
    async ({ data }) => {
      log.info("Detecting trends", { userId: data.userId, game: data.game });
      await growthService.detectTrends(data.userId, data.game);
      sseEmit(data.userId, "growth:trends-updated", { game: data.game });
    },
  );

  log.info("Growth workers registered");
}
