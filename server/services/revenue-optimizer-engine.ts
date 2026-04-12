import { db } from "../db";
import { users, videos, channels, discoveredStrategies, contentPerformanceLoops } from "@shared/schema";
import { eq, and, desc, gte, sql } from "drizzle-orm";
import { createLogger } from "../lib/logger";
import { createEngineStore, registerUserQueries, getUserData, invalidateUserData } from "../lib/engine-store";
import { recordEngineKnowledge, getMasterKnowledgeForPrompt } from "./knowledge-mesh";
import { executeRoutedAICall } from "./ai-model-router";

const logger = createLogger("revenue-optimizer");

const REVENUE_CYCLE_MS = 120 * 60_000;

const revStore = createEngineStore("revenue-optimizer", 15 * 60_000);

function ensureUserRegistered(userId: string) {
  registerUserQueries(revStore, userId, {
    channels: () => db.select().from(channels)
      .where(eq(channels.userId, userId)),
    recent_videos: () => db.select().from(videos)
      .where(and(
        eq(videos.channelId, sql`(SELECT id FROM channels WHERE user_id = ${userId} LIMIT 1)`),
        gte(videos.publishedAt, new Date(Date.now() - 90 * 86400_000)),
      ))
      .orderBy(desc(videos.publishedAt)).limit(50),
    strategies: () => db.select().from(discoveredStrategies)
      .where(and(eq(discoveredStrategies.userId, userId), eq(discoveredStrategies.isActive, true)))
      .orderBy(desc(discoveredStrategies.effectiveness)).limit(20),
    attribution_results: () => db.select().from(contentPerformanceLoops)
      .where(and(
        eq(contentPerformanceLoops.userId, userId),
        eq(contentPerformanceLoops.attributionComplete, true),
      ))
      .orderBy(desc(contentPerformanceLoops.createdAt)).limit(30),
  });
}

export function initRevenueOptimizerEngine(): ReturnType<typeof setInterval> {
  logger.info("Revenue Optimizer Engine initialized — RPM-aware content decisions");

  setTimeout(() => {
    runRevenueOptimizationCycle().catch(err => logger.error("Initial revenue optimization failed", { err: String(err) }));
  }, 300_000);

  return setInterval(() => {
    runRevenueOptimizationCycle().catch(err => logger.error("Revenue optimization cycle failed", { err: String(err) }));
  }, REVENUE_CYCLE_MS);
}

export async function runRevenueOptimizationCycle(): Promise<void> {
  const allUsers = await db.select({ id: users.id }).from(users).limit(50);
  for (const user of allUsers) {
    try {
      await optimizeRevenueForUser(user.id);
    } catch (err) {
      logger.error(`Revenue optimization failed for user ${user.id.substring(0, 8)}`, { err: String(err) });
    }
  }
}

async function optimizeRevenueForUser(userId: string): Promise<void> {
  ensureUserRegistered(userId);
  const recentVideos = await getUserData(revStore, userId, "recent_videos") as any[];
  const attributionResults = await getUserData(revStore, userId, "attribution_results") as any[];
  const strategies = await getUserData(revStore, userId, "strategies") as any[];
  const masterWisdom = await getMasterKnowledgeForPrompt(userId, 5);

  if (!recentVideos?.length || recentVideos.length < 3) return;

  const gamePerformance: Record<string, { totalViews: number; count: number; avgWatchTime: number; titles: string[] }> = {};
  for (const v of recentVideos) {
    const meta = (v.metadata as any) || {};
    const game = meta.gameName || v.title?.split(" ")[0] || "unknown";
    if (!gamePerformance[game]) {
      gamePerformance[game] = { totalViews: 0, count: 0, avgWatchTime: 0, titles: [] };
    }
    gamePerformance[game].totalViews += meta.viewCount || 0;
    gamePerformance[game].count++;
    gamePerformance[game].avgWatchTime += meta.stats?.avgWatchTime || 0;
    gamePerformance[game].titles.push(v.title || "");
  }

  for (const game of Object.keys(gamePerformance)) {
    if (gamePerformance[game].count > 0) {
      gamePerformance[game].avgWatchTime = Math.round(gamePerformance[game].avgWatchTime / gamePerformance[game].count);
    }
  }

  const sortedGames = Object.entries(gamePerformance)
    .sort((a, b) => (b[1].totalViews / b[1].count) - (a[1].totalViews / a[1].count));

  const topGame = sortedGames[0];
  const worstGame = sortedGames[sortedGames.length - 1];

  if (!topGame || !worstGame || sortedGames.length < 2) return;

  const topAvgViews = Math.round(topGame[1].totalViews / topGame[1].count);
  const worstAvgViews = Math.round(worstGame[1].totalViews / worstGame[1].count);

  if (topAvgViews <= worstAvgViews * 1.3) return;

  try {
    const analysisPrompt = `You are a gaming channel revenue strategist. Analyze this content performance data:

TOP PERFORMER: "${topGame[0]}" — ${topGame[1].count} videos, avg ${topAvgViews} views, avg watch time ${topGame[1].avgWatchTime}s
WORST PERFORMER: "${worstGame[0]}" — ${worstGame[1].count} videos, avg ${worstAvgViews} views, avg watch time ${worstGame[1].avgWatchTime}s

ALL GAMES RANKED:
${sortedGames.map(([game, data]) => `  ${game}: ${data.count} videos, avg ${Math.round(data.totalViews / data.count)} views`).join("\n")}

Recent attribution scores: ${attributionResults?.slice(0, 5).map((a: any) => `${a.platform}:${a.performanceScore}/100`).join(", ") || "none yet"}

${masterWisdom}

Output JSON with revenue optimization recommendations:
{
  "shiftStrategy": "brief description of what content to prioritize",
  "doubleDown": ["game/content to increase"],
  "reduceOrTest": ["game/content to reduce or A/B test"],
  "estimatedImpact": "expected improvement",
  "confidence": 50-100
}`;

    const aiResult = await executeRoutedAICall({
      task: "revenue_optimization",
      systemPrompt: "You optimize content strategy for maximum revenue. Return valid JSON only.",
      userPrompt: analysisPrompt,
      userId,
      maxTokens: 800,
      responseFormat: "json",
    });

    const resultText = typeof aiResult === "string" ? aiResult : (aiResult as any)?.content || "";
    let parsed: any;
    try {
      parsed = JSON.parse(resultText.replace(/```json?\n?/g, "").replace(/```/g, "").trim());
    } catch {
      return;
    }

    await recordEngineKnowledge(
      "revenue-optimizer", userId, "revenue_strategy",
      "content_revenue_optimization",
      `Revenue shift: ${parsed.shiftStrategy}. Double down: ${parsed.doubleDown?.join(", ")}. Reduce: ${parsed.reduceOrTest?.join(", ")}. Expected: ${parsed.estimatedImpact}`,
      `Top: ${topGame[0]} (avg ${topAvgViews} views). Worst: ${worstGame[0]} (avg ${worstAvgViews} views). ${sortedGames.length} games analyzed.`,
      parsed.confidence || 60,
    );

    if (parsed.doubleDown?.length) {
      for (const game of parsed.doubleDown) {
        const existingStrategy = strategies?.find((s: any) =>
          s.title?.toLowerCase().includes(game.toLowerCase()) && s.category === "revenue"
        );
        if (!existingStrategy) {
          await db.insert(discoveredStrategies).values({
            userId,
            title: `Revenue: Prioritize ${game} content`,
            category: "revenue",
            description: parsed.shiftStrategy,
            sourceEngine: "revenue-optimizer",
            effectiveness: parsed.confidence || 60,
            isActive: true,
          });
        }
      }
    }

    logger.info(`Revenue optimization: ${parsed.shiftStrategy}`, { userId: userId.substring(0, 8) });
    invalidateUserData(revStore, userId, "strategies");
  } catch (err) {
    logger.error("Revenue optimization AI call failed", { err: String(err) });
  }
}
