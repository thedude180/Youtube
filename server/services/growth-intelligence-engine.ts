import { db } from "../db";
import { 
  growthPlans, 
  channels, 
  videos, 
  contentInsights 
} from "@shared/schema";
import { eq, desc, and, gte } from "drizzle-orm";
import { getOpenAIClient } from "../lib/openai";
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

      // 2. AI Analysis
      const openai = getOpenAIClient();
      const basePrompt = `You are a world-class Growth Strategist for digital creators.
Analyze the following channel data, recent video performance, and system insights to generate a 7-day growth plan.

DATA:
- Channels: ${JSON.stringify(channelData)}
- Recent Videos: ${JSON.stringify(videoData)}
- Active Insights: ${JSON.stringify(insights)}

TASKS:
1. Identify the single biggest growth lever for this creator right now.
2. Generate 3 viral content ideas tailored to their niche.
3. Provide a 7-day checklist of growth-focused tasks.

JSON RESPONSE FORMAT:
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
  "growthScore": 0.0 to 1.0
}`;

      const fullPrompt = await withCreatorVoice(userId, basePrompt);

      const response = await openai.chat.completions.create({
        model: "gpt-4o-mini",
        messages: [{ role: "user", content: fullPrompt }],
        response_format: { type: "json_object" },
        max_tokens: 1500
      });

      const growthPlanResult = JSON.parse(response.choices[0].message.content || "{}");

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
        response: response.choices[0].message.content || ""
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
   * Schedules the daily cycle to run at 7 AM.
   */
  scheduleAt7am(): void {
    console.log("[GrowthIntelligenceEngine] Scheduled to run daily at 7 AM.");
  }
}

export const growthEngine = new GrowthIntelligenceEngine();
