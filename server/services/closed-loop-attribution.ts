import { db } from "../db";
import { contentPerformanceLoops, discoveredStrategies, users, videos, channels } from "@shared/schema";
import { eq, and, lte, desc, gte, sql } from "drizzle-orm";
import { createLogger } from "../lib/logger";
import { createEngineStore, registerUserQueries, getUserData, invalidateUserData } from "../lib/engine-store";
import { recordEngineKnowledge, getMasterKnowledgeForPrompt } from "./knowledge-mesh";
import { executeRoutedAICall } from "./ai-model-router";

const logger = createLogger("closed-loop-attribution");

const ATTRIBUTION_CYCLE_MS = 30 * 60_000;
const MEASUREMENT_DELAY_HOURS = 48;

const attrStore = createEngineStore("closed-loop-attribution", 5 * 60_000);

function ensureUserRegistered(userId: string) {
  registerUserQueries(attrStore, userId, {
    pending_loops: () => db.select().from(contentPerformanceLoops)
      .where(and(
        eq(contentPerformanceLoops.userId, userId),
        eq(contentPerformanceLoops.status, "pending"),
        lte(contentPerformanceLoops.checkScheduledAt, new Date()),
      )).limit(20),
    recent_completed: () => db.select().from(contentPerformanceLoops)
      .where(and(
        eq(contentPerformanceLoops.userId, userId),
        eq(contentPerformanceLoops.attributionComplete, true),
      ))
      .orderBy(desc(contentPerformanceLoops.createdAt)).limit(30),
    strategies: () => db.select().from(discoveredStrategies)
      .where(and(eq(discoveredStrategies.userId, userId), eq(discoveredStrategies.isActive, true)))
      .orderBy(desc(discoveredStrategies.effectiveness)).limit(30),
    channels: () => db.select().from(channels)
      .where(eq(channels.userId, userId)),
  });
}

export function initClosedLoopAttribution(): ReturnType<typeof setInterval> {
  logger.info("Closed-Loop Attribution initialized — every strategy gets scored by reality");

  setTimeout(() => {
    runAttributionCycle().catch(err => logger.error("Initial attribution failed", { err: String(err) }));
  }, 150_000);

  return setInterval(() => {
    runAttributionCycle().catch(err => logger.error("Attribution cycle failed", { err: String(err) }));
  }, ATTRIBUTION_CYCLE_MS);
}

export async function runAttributionCycle(): Promise<void> {
  const allUsers = await db.select({ id: users.id }).from(users).limit(50);
  for (const user of allUsers) {
    try {
      await processAttributionForUser(user.id);
    } catch (err) {
      logger.error(`Attribution failed for user ${user.id.substring(0, 8)}`, { err: String(err) });
    }
  }
}

async function processAttributionForUser(userId: string): Promise<void> {
  ensureUserRegistered(userId);
  const pendingLoops = await getUserData(attrStore, userId, "pending_loops") as any[];
  if (!pendingLoops?.length) return;

  const userChannels = await getUserData(attrStore, userId, "channels") as any[];
  const strategies = await getUserData(attrStore, userId, "strategies") as any[];
  const masterWisdom = await getMasterKnowledgeForPrompt(userId, 5);

  for (const loop of pendingLoops) {
    try {
      const videoData = await db.select().from(videos)
        .where(eq(videos.youtubeId, loop.contentId))
        .limit(1);

      const video = videoData[0];
      if (!video) {
        await db.update(contentPerformanceLoops)
          .set({ status: "skipped", checkCompletedAt: new Date() })
          .where(eq(contentPerformanceLoops.id, loop.id));
        continue;
      }

      const actualViews = video.viewCount || 0;
      const actualCtr = typeof video.ctr === "number" ? video.ctr : null;
      const actualRetention = typeof video.averageViewPercentage === "number" ? video.averageViewPercentage : null;

      let performanceScore = 50;
      if (loop.predictedViews && loop.predictedViews > 0) {
        const viewsRatio = actualViews / loop.predictedViews;
        performanceScore = Math.min(100, Math.round(viewsRatio * 50));
      }

      if (actualCtr && loop.predictedCtr && loop.predictedCtr > 0) {
        const ctrRatio = actualCtr / loop.predictedCtr;
        performanceScore = Math.round((performanceScore + Math.min(100, ctrRatio * 50)) / 2);
      }

      const strategy = strategies?.find((s: any) => s.id === loop.strategyId);
      let lessonLearned = "";

      try {
        const prompt = `You are a content performance analyst. A video was published and here are the results:

Title: ${video.title || "Unknown"}
Platform: ${loop.platform}
Predicted views: ${loop.predictedViews || "not set"} → Actual views: ${actualViews}
Predicted CTR: ${loop.predictedCtr ? (loop.predictedCtr * 100).toFixed(1) + "%" : "not set"} → Actual CTR: ${actualCtr ? (actualCtr * 100).toFixed(1) + "%" : "unknown"}
Strategy used: ${loop.strategyUsed || strategy?.title || "none"}
Performance score: ${performanceScore}/100

${masterWisdom}

In 1-2 sentences, what is THE key lesson from this result? Should the strategy be reinforced or adjusted? Be brutally honest.`;

        const aiResult = await executeRoutedAICall({
          task: "performance_attribution",
          systemPrompt: "You extract precise, actionable lessons from content performance data. No fluff.",
          userPrompt: prompt,
          userId,
          maxTokens: 200,
        });
        lessonLearned = typeof aiResult === "string" ? aiResult : (aiResult as any)?.content || "";
      } catch {
        lessonLearned = `Score ${performanceScore}/100. Views: ${actualViews} (predicted: ${loop.predictedViews || "?"}).`;
      }

      await db.update(contentPerformanceLoops)
        .set({
          status: "completed",
          checkCompletedAt: new Date(),
          actualViews,
          actualCtr,
          actualRetention,
          performanceScore,
          attributionComplete: true,
          lessonLearned,
        })
        .where(eq(contentPerformanceLoops.id, loop.id));

      if (loop.strategyId && strategy) {
        const newEffectiveness = Math.round(
          ((strategy.effectiveness || 50) * (strategy.timesApplied || 1) + performanceScore) /
          ((strategy.timesApplied || 1) + 1)
        );
        await db.update(discoveredStrategies)
          .set({
            effectiveness: newEffectiveness,
            timesApplied: sql`${discoveredStrategies.timesApplied} + 1`,
            lastAppliedAt: new Date(),
            isActive: newEffectiveness >= 20,
          })
          .where(eq(discoveredStrategies.id, loop.strategyId));
      }

      await recordEngineKnowledge(
        "closed-loop-attribution", userId, "performance_result",
        `${loop.platform}_${video.title?.substring(0, 30) || "content"}`,
        lessonLearned,
        `views=${actualViews}, ctr=${actualCtr || "?"}, score=${performanceScore}, strategy=${loop.strategyUsed || "none"}`,
        performanceScore,
      );

      logger.info(`Attribution complete: ${video.title?.substring(0, 40)} → score ${performanceScore}`, { userId: userId.substring(0, 8) });
    } catch (err) {
      logger.error(`Attribution failed for loop ${loop.id}`, { err: String(err) });
    }
  }

  invalidateUserData(attrStore, userId, "pending_loops");
  invalidateUserData(attrStore, userId, "recent_completed");
}

export async function schedulePerformanceLoop(
  userId: string,
  contentId: string,
  platform: string,
  strategyUsed?: string,
  strategyId?: number,
  predictedViews?: number,
  predictedCtr?: number,
): Promise<void> {
  try {
    const checkTime = new Date(Date.now() + MEASUREMENT_DELAY_HOURS * 3600_000);
    await db.insert(contentPerformanceLoops).values({
      userId,
      contentId,
      platform,
      publishedAt: new Date(),
      checkScheduledAt: checkTime,
      strategyUsed,
      strategyId,
      predictedViews,
      predictedCtr,
    });
    logger.info(`Performance loop scheduled: ${contentId} on ${platform}, check at ${checkTime.toISOString()}`, { userId: userId.substring(0, 8) });
  } catch (err) {
    logger.error("Failed to schedule performance loop", { err: String(err) });
  }
}
