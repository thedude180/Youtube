import { sanitizeForPrompt, sanitizeObjectForPrompt } from "../lib/ai-attack-shield";
import { db } from "../db";
import { dailyBriefings, autonomousActionLog, growthPlans, revenueStrategies } from "@shared/schema";
import { eq, and, gte, sql } from "drizzle-orm";
import { createLogger } from "../lib/logger";
import { getOpenAIClient } from "../lib/openai";
import { routeNotification } from "./notification-system";

const logger = createLogger("daily-briefing");

export class DailyBriefing {
  /**
   * Generates and sends a daily briefing to the user.
   * Summarizes last 24h of autonomous actions, growth plans, and revenue strategies.
   */
  async generateAndSend(userId: string): Promise<void> {
    try {
      logger.info(`Generating daily briefing for user ${userId}`);

      const twentyFourHoursAgo = new Date(Date.now() - 24 * 60 * 60 * 1000);

      // 1. Fetch data from the last 24h
      const actions = await db
        .select()
        .from(autonomousActionLog)
        .where(
          and(
            eq(autonomousActionLog.userId, userId),
            gte(autonomousActionLog.createdAt, twentyFourHoursAgo)
          )
        );

      const growth = await db
        .select()
        .from(growthPlans)
        .where(
          and(
            eq(growthPlans.userId, userId),
            gte(growthPlans.generatedAt, twentyFourHoursAgo)
          )
        )
        .limit(1);

      const revenue = await db
        .select()
        .from(revenueStrategies)
        .where(
          and(
            eq(revenueStrategies.userId, userId),
            gte(revenueStrategies.generatedAt, twentyFourHoursAgo)
          )
        )
        .limit(1);

      if (actions.length === 0 && growth.length === 0 && revenue.length === 0) {
        logger.info(`No new activity for user ${userId} in the last 24h. Skipping briefing.`);
        return;
      }

      // 2. Call AI to generate briefing
      const openai = getOpenAIClient();
      const prompt = `
        You are an AI Chief Operating Officer for a social media creator. 
        Your task is to generate a concise, professional daily briefing based on the following activity from the last 24 hours.

        Autonomous Actions Taken:
        ${actions.map(a => `- [${sanitizeForPrompt(a.engine)}] ${sanitizeForPrompt(a.action)}: ${a.reasoning || 'No reasoning provided'}`).join('\n')}

        Latest Growth Plan:
        ${growth[0] ? JSON.stringify(sanitizeObjectForPrompt(growth[0].plan)) : 'No new growth plan generated.'}

        Latest Revenue Strategy:
        ${revenue[0] ? JSON.stringify(sanitizeObjectForPrompt(revenue[0].strategy)) : 'No new revenue strategy generated.'}

        Format the briefing with:
        1. A high-level executive summary (2-3 sentences)
        2. Key wins/milestones from the last 24h
        3. Strategic focus for the next 24h
        4. Any required approvals or attention items

        Keep it professional, encouraging, and highly concise.
      `;

      const response = await openai.chat.completions.create({
        model: "gpt-4o-mini",
        messages: [{ role: "system", content: "You are an expert AI COO." }, { role: "user", content: prompt }],
        max_completion_tokens: 1000,
      });

      const briefingText = response.choices[0]?.message?.content || "Briefing generation failed.";

      // 3. Save to DB
      const [saved] = await db.insert(dailyBriefings).values({
        userId,
        briefingDate: new Date(),
        overnightSummary: briefingText,
        actionItems: [
          `Actions logged: ${actions.length}`,
          growth.length > 0 ? "Growth plan available" : "No growth plan yet",
          revenue.length > 0 ? "Revenue strategy available" : "No revenue strategy yet",
        ],
        metadata: {
          metrics: {
            actionCount: actions.length,
            hasGrowthPlan: growth.length > 0 ? 1 : 0,
            hasRevenueStrategy: revenue.length > 0 ? 1 : 0,
          }
        },
      }).returning();

      const { storage } = await import("../storage");
      await storage.createNotification({
        userId,
        type: "system",
        title: "Your Daily Autonomous Briefing is Ready",
        message: "Your AI COO has analyzed the last 24h of activity. Check your dashboard for the full report.",
        severity: "info",
      });
      await routeNotification(userId, {
        title: "Your Daily Autonomous Briefing is Ready",
        message: "Your AI COO has analyzed the last 24h of activity. Check your dashboard for the full report.",
        severity: "info",
        category: "system"
      });

      logger.info(`Daily briefing generated and sent for user ${userId}`);
    } catch (err: any) {
      logger.error(`Failed to generate daily briefing for user ${userId}: ${sanitizeForPrompt(err.message)}`);
    }
  }

  /**
   * Schedules the daily briefing to run at 9am every day.
   * Pattern: check every hour, if it's 9am and not yet run today, run it.
   */
  scheduleAt9am() {
    setInterval(async () => {
      const now = new Date();
      if (now.getHours() === 9 && now.getMinutes() === 0) {
        logger.info("Running scheduled daily briefings (9 AM)");
        const activeUsers = await db.execute(sql`SELECT DISTINCT user_id FROM user_autonomous_settings WHERE autonomous_mode = true`);
        for (const row of activeUsers.rows) {
          await this.generateAndSend(row.user_id as string);
        }
      }
    }, 60_000); // Check every minute
  }
}

export const dailyBriefing = new DailyBriefing();
