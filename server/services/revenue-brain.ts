import { db } from "../db";
import { 
  revenueStrategies, 
  channels, 
  streams, 
  revenueRecords 
} from "@shared/schema";
import { eq, desc, and, gte, sql } from "drizzle-orm";
import { executeRoutedAICall } from "./ai-model-router";
import { withCreatorVoice } from "./creator-dna-builder";
import { isAutonomousMode, logAutonomousAction } from "../lib/autonomous";
import { routeNotification } from "./notification-system";
import { storage } from "../storage";

import { createLogger } from "../lib/logger";

const logger = createLogger("revenue-brain");
export class RevenueBrain {
  private engineName = "RevenueBrain";

  /**
   * Runs the daily revenue optimization cycle for a user.
   * @AUTONOMOUS: Analyzes earnings and creator data to suggest and execute revenue strategies.
   */
  async dailyRevenueCycle(userId: string): Promise<void> {
    const autonomous = await isAutonomousMode(userId);
    if (!autonomous) return;

    logger.info(`[RevenueBrain] Starting daily cycle for user ${userId}`);

    try {
      // 1. Gather Data
      const userChannels = await storage.getChannelsByUser(userId);
      const recentStreams = await db
        .select()
        .from(streams)
        .where(eq(streams.userId, userId))
        .orderBy(desc(streams.startedAt))
        .limit(5);
      
      const last30Days = new Date();
      last30Days.setDate(last30Days.getDate() - 30);
      
      const recentRevenue = await db
        .select()
        .from(revenueRecords)
        .where(
          and(
            eq(revenueRecords.userId, userId),
            gte(revenueRecords.recordedAt, last30Days)
          )
        );

      const channelData = userChannels.map(c => ({
        platform: c.platform,
        subscribers: c.subscriberCount,
        views: c.viewCount,
        niche: c.contentNiche
      }));

      const streamData = recentStreams.map(s => ({
        title: s.title,
        stats: s.streamStats,
        duration: s.endedAt && s.startedAt ? (s.endedAt.getTime() - s.startedAt.getTime()) / 60000 : 0
      }));

      const revenueSummary = recentRevenue.reduce((acc, rec) => {
        acc.total += rec.amount;
        acc[rec.platform] = (acc[rec.platform] || 0) + rec.amount;
        return acc;
      }, { total: 0 } as Record<string, number>);

      // 2. AI Analysis (Claude Opus for complex revenue strategy reasoning)
      const basePrompt = `Analyze the following revenue and channel data to generate a 24-hour revenue optimization strategy.

DATA:
- Channels: ${JSON.stringify(channelData)}
- Recent Streams: ${JSON.stringify(streamData)}
- 30-Day Revenue: ${JSON.stringify(revenueSummary)}

TASKS:
1. Identify missing revenue opportunities (sponsorships, merch, digital products).
2. Suggest 3 specific, actionable "Plays" for today.
3. For each Play, decide if it can be "auto" executed or needs "approval".

Return ONLY valid JSON matching this structure:
{
  "summary": "1-sentence business outlook",
  "strategies": [
    {
      "title": "Strategy Name",
      "description": "What to do",
      "expectedImpact": "high/medium/low",
      "actionType": "auto/approval",
      "reasoning": "Why this works"
    }
  ],
  "monetizationHealth": 0.85
}`;

      const fullPrompt = await withCreatorVoice(userId, basePrompt);

      const result = await executeRoutedAICall(
        { taskType: "revenue_strategy", userId, priority: "high" },
        "You are a high-level Business Manager for a top-tier content creator. Respond with valid JSON only.",
        fullPrompt
      );

      const strategyResult = JSON.parse(result.content || "{}");

      // 3. Save Strategy
      await db.insert(revenueStrategies).values({
        userId,
        strategy: strategyResult,
        generatedAt: new Date()
      });

      // 4. Log and Execute 'auto' actions
      for (const strat of strategyResult.strategies || []) {
        await logAutonomousAction({
          userId,
          engine: this.engineName,
          action: `revenue_strategy_${strat.actionType}`,
          reasoning: strat.reasoning,
          payload: strat,
          prompt: fullPrompt,
          response: result.content
        });

        if (strat.actionType === "auto") {
          logger.info(`[RevenueBrain] Auto-executing strategy: ${strat.title}`);
          // Implementation for specific auto-actions would go here (e.g. enabling a feature, adjusting prices)
        }
      }

      // 5. Notify User
      await routeNotification(userId, {
        title: "Daily Revenue Strategy Ready",
        message: strategyResult.summary || "I've analyzed your revenue and prepared today's growth plays.",
        severity: "info",
        category: "money"
      });

    } catch (err: any) {
      logger.error(`[RevenueBrain] Error in daily cycle for user ${userId}:`, err);
    }
  }

  /**
   * Schedules the daily cycle to run at 8 AM for all autonomous users.
   */
  scheduleAt8am(): void {
    logger.info("[RevenueBrain] Scheduling daily cycle at 8 AM.");
    setInterval(async () => {
      const now = new Date();
      if (now.getHours() === 8 && now.getMinutes() === 0) {
        try {
          const result = await db.execute(sql`
            SELECT user_id FROM user_autonomous_settings
            WHERE autonomous_mode = true
              AND (paused_until IS NULL OR paused_until < NOW())
          `);
          for (const row of (result as any).rows ?? []) {
            await this.dailyRevenueCycle(row.user_id as string).catch((err: any) =>
              logger.error(`[RevenueBrain] Daily cycle error for ${row.user_id}:`, err)
            );
          }
        } catch (err: any) {
          logger.error("[RevenueBrain] Failed to fetch autonomous users:", err);
        }
      }
    }, 60_000);
  }
}

export const revenueBrain = new RevenueBrain();
