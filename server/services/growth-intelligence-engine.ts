import { db } from "../db";
import { 
  growthPlans, 
  channels, 
  videos, 
  contentInsights 
} from "@shared/schema";
import { eq, desc, and, gte, sql } from "drizzle-orm";
import { executeRoutedAICall } from "./ai-model-router";
import { withCreatorVoice } from "./creator-dna-builder";
import { isAutonomousMode, logAutonomousAction } from "../lib/autonomous";
import { routeNotification } from "./notification-system";
import { storage } from "../storage";

export class GrowthIntelligenceEngine {
  private engineName = "GrowthIntelligenceEngine";

  /**
   * Runs the daily growth intelligence cycle for a user.
   * @AUTONOMOUS: Analyzes channel performance and trends to generate growth plans.
   */
  async dailyGrowthCycle(userId: string): Promise<void> {
    const autonomous = await isAutonomousMode(userId);
    if (!autonomous) return;

    console.log(`[GrowthIntelligenceEngine] Starting daily cycle for user ${userId}`);

    try {
      // 1. Gather Data
      const userChannels = await storage.getChannelsByUser(userId);
      const recentVideos = await storage.getVideosByUser(userId, 1, 10);
      const insights = await db
        .select()
        .from(contentInsights)
        .where(eq(contentInsights.status, "active"))
        .limit(10);

      const channelData = userChannels.map(c => ({
        platform: c.platform,
        subscribers: c.subscriberCount,
        views: c.viewCount,
        videoCount: c.videoCount
      }));

      const videoData = recentVideos.map(v => ({
        title: v.title,
        stats: v.metadata?.stats,
        publishedAt: v.publishedAt
      }));

      // 2. AI Analysis (Claude Opus for deep strategic growth planning)
      const basePrompt = `Analyze the following channel data, recent video performance, and system insights to generate a 7-day growth plan.

DATA:
- Channels: ${JSON.stringify(channelData)}
- Recent Videos: ${JSON.stringify(videoData)}
- Active Insights: ${JSON.stringify(insights)}

TASKS:
1. Identify the single biggest growth lever for this creator right now.
2. Generate 3 viral content ideas tailored to their niche.
3. Provide a 7-day checklist of growth-focused tasks.

Return ONLY valid JSON matching this structure:
{
  "mainFocus": "Primary goal for the week",
  "contentIdeas": [
    {
      "title": "Viral Hook Title",
      "format": "Short/Long/Live",
      "reasoning": "Why it will trend"
    }
  ],
  "sevenDayPlan": [
    { "day": 1, "task": "Task description" },
    { "day": 2, "task": "Task description" }
  ],
  "growthScore": 0.75
}`;

      const fullPrompt = await withCreatorVoice(userId, basePrompt);

      const result = await executeRoutedAICall(
        { taskType: "growth_planning", userId, priority: "high" },
        "You are a world-class Growth Strategist for digital creators. Respond with valid JSON only.",
        fullPrompt
      );

      const growthPlanResult = JSON.parse(result.content || "{}");

      // 3. Save Growth Plan
      await db.insert(growthPlans).values({
        userId,
        plan: growthPlanResult,
        generatedAt: new Date()
      });

      // 4. Log Action
      await logAutonomousAction({
        userId,
        engine: this.engineName,
        action: "generate_growth_plan",
        reasoning: "Daily growth intelligence cycle triggered",
        payload: growthPlanResult,
        prompt: fullPrompt,
        response: result.content
      });

      // 5. Enqueue Content Idea Jobs (if applicable)
      if (growthPlanResult.contentIdeas?.length > 0) {
        for (const idea of growthPlanResult.contentIdeas) {
          await storage.createJob({
            type: "content_idea_generation",
            payload: {
              userId,
              idea,
              source: this.engineName
            }
          });
        }
      }

      // 6. Notify User
      await routeNotification(userId, {
        title: "New 7-Day Growth Plan",
        message: `I've mapped out your path to ${growthPlanResult.mainFocus || "growth"} for the next week.`,
        severity: "info",
        category: "content"
      });

    } catch (err: any) {
      console.error(`[GrowthIntelligenceEngine] Error in daily cycle for user ${userId}:`, err);
    }
  }

  /**
   * Schedules the daily cycle to run at 7 AM for all autonomous users.
   */
  scheduleAt7am(): void {
    console.log("[GrowthIntelligenceEngine] Scheduling daily cycle at 7 AM.");
    setInterval(async () => {
      const now = new Date();
      if (now.getHours() === 7 && now.getMinutes() === 0) {
        try {
          const result = await db.execute(sql`
            SELECT user_id FROM user_autonomous_settings
            WHERE autonomous_mode = true
              AND (paused_until IS NULL OR paused_until < NOW())
          `);
          for (const row of (result as any).rows ?? []) {
            await this.dailyGrowthCycle(row.user_id as string).catch((err: any) =>
              console.error(`[GrowthEngine] Daily cycle error for ${row.user_id}:`, err)
            );
          }
        } catch (err: any) {
          console.error("[GrowthEngine] Failed to fetch autonomous users:", err);
        }
      }
    }, 60_000);
  }
}

export const growthEngine = new GrowthIntelligenceEngine();
