import { growthRepo } from "./repository.js";
import { moneyRepo } from "../money/repository.js";
import { contentRepo } from "../content/repository.js";
import { aiRoute, aiRouteJSON } from "../../ai/router.js";
import { createLogger } from "../../core/logger.js";
import { z } from "zod";

const log = createLogger("growth");

export class GrowthService {
  async getUnifiedDashboard(userId: string): Promise<Record<string, unknown>> {
    const [snapshot, revenueData, videos, competitors, trends] = await Promise.all([
      growthRepo.latestSnapshot(userId),
      moneyRepo.getRevenueSummary(userId),
      contentRepo.listVideos(userId, { limit: 5 }),
      growthRepo.listCompetitors(userId),
      growthRepo.listTrends(userId),
    ]);

    return {
      analytics: snapshot,
      revenue: revenueData,
      recentVideos: videos.items,
      competitors: competitors.slice(0, 5),
      trends: trends.slice(0, 10),
    };
  }

  async generateGrowthPlan(userId: string): Promise<string> {
    const snapshot = await growthRepo.latestSnapshot(userId);
    const competitors = await growthRepo.listCompetitors(userId);

    const context = snapshot
      ? `Subscribers: ${snapshot.subscriberCount}, Views: ${snapshot.totalViews}, Watch hours: ${snapshot.watchHoursTotal?.toFixed(0)}`
      : "No analytics data yet — channel is new";

    const compContext = competitors.length > 0
      ? `Tracking ${competitors.length} competitors including ${competitors[0].channelName} (${competitors[0].subscriberCount?.toLocaleString()} subs)`
      : "No competitors tracked";

    return aiRoute({
      task: "content-strategy",
      background: true,
      system: "You are a YouTube growth strategist specializing in gaming channels.",
      prompt: `Create a 30-day growth plan for a PS5 no-commentary gaming channel.\n\nCurrent stats: ${context}\nCompetitive landscape: ${compContext}\n\nProvide 5 specific, actionable strategies with expected impact.`,
    });
  }

  async detectTrends(userId: string, game: string): Promise<void> {
    const result = await aiRouteJSON(
      {
        task: "competitive-analysis",
        background: true,
        prompt: `What are the top 5 trending topics and content opportunities for "${game}" on YouTube right now in 2026? Return: {"trends": [{"signal": "...", "score": 8, "category": "gameplay"}, ...]}`,
      },
      (raw) => z.object({ trends: z.array(z.object({ signal: z.string(), score: z.number(), category: z.string().optional() })) }).parse(raw),
    );

    await Promise.all(result.trends.map((t) =>
      growthRepo.saveTrend({ userId, ...t }),
    ));

    log.info("Trends detected", { userId, count: result.trends.length });
  }
}

export const growthService = new GrowthService();
