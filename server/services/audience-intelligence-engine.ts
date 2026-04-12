import { db } from "../db";
import { users, videos, channels, discoveredStrategies } from "@shared/schema";
import { eq, and, desc, gte, sql } from "drizzle-orm";
import { createLogger } from "../lib/logger";
import { createEngineStore, registerUserQueries, getUserData, invalidateUserData } from "../lib/engine-store";
import { recordEngineKnowledge, getMasterKnowledgeForPrompt } from "./knowledge-mesh";
import { executeRoutedAICall } from "./ai-model-router";

const logger = createLogger("audience-intelligence");

const AUDIENCE_CYCLE_MS = 60 * 60_000;

const audStore = createEngineStore("audience-intelligence", 10 * 60_000);

function ensureUserRegistered(userId: string) {
  registerUserQueries(audStore, userId, {
    channels: () => db.select().from(channels)
      .where(eq(channels.userId, userId)),
    recent_videos: () => db.select().from(videos)
      .where(and(
        eq(videos.channelId, sql`(SELECT id FROM channels WHERE user_id = ${userId} LIMIT 1)`),
        gte(videos.publishedAt, new Date(Date.now() - 30 * 86400_000)),
      ))
      .orderBy(desc(videos.publishedAt)).limit(30),
    strategies: () => db.select().from(discoveredStrategies)
      .where(and(eq(discoveredStrategies.userId, userId), eq(discoveredStrategies.isActive, true)))
      .orderBy(desc(discoveredStrategies.effectiveness)).limit(20),
  });
}

export function initAudienceIntelligenceEngine(): ReturnType<typeof setInterval> {
  logger.info("Audience Intelligence Engine initialized — parsing audience signals");

  setTimeout(() => {
    runAudienceIntelligenceCycle().catch(err => logger.error("Initial audience intelligence failed", { err: String(err) }));
  }, 200_000);

  return setInterval(() => {
    runAudienceIntelligenceCycle().catch(err => logger.error("Audience intelligence cycle failed", { err: String(err) }));
  }, AUDIENCE_CYCLE_MS);
}

export async function runAudienceIntelligenceCycle(): Promise<void> {
  const allUsers = await db.select({ id: users.id }).from(users).limit(50);
  for (const user of allUsers) {
    try {
      await analyzeAudienceForUser(user.id);
    } catch (err) {
      logger.error(`Audience intelligence failed for user ${user.id.substring(0, 8)}`, { err: String(err) });
    }
  }
}

async function analyzeAudienceForUser(userId: string): Promise<void> {
  ensureUserRegistered(userId);
  const recentVideos = await getUserData(audStore, userId, "recent_videos") as any[];
  const masterWisdom = await getMasterKnowledgeForPrompt(userId, 5);

  if (!recentVideos?.length || recentVideos.length < 3) return;

  const engagementSignals: Array<{ title: string; likes: number; comments: number; views: number; retention: number }> = [];

  for (const v of recentVideos) {
    engagementSignals.push({
      title: v.title || "Unknown",
      likes: v.likeCount || 0,
      comments: v.commentCount || 0,
      views: v.viewCount || 0,
      retention: v.averageViewPercentage || 0,
    });
  }

  const sortedByEngagement = [...engagementSignals].sort((a, b) => {
    const aRate = a.views > 0 ? (a.likes + a.comments * 3) / a.views : 0;
    const bRate = b.views > 0 ? (b.likes + b.comments * 3) / b.views : 0;
    return bRate - aRate;
  });

  const topEngaged = sortedByEngagement.slice(0, 5);
  const lowEngaged = sortedByEngagement.slice(-3);

  try {
    const analysisPrompt = `You are an audience behavior analyst for a no-commentary PS5 gaming YouTube channel.

HIGHEST ENGAGEMENT CONTENT (audience loves these):
${topEngaged.map(v => `  "${v.title}" — ${v.views} views, ${v.likes} likes, ${v.comments} comments, ${v.retention}% retention`).join("\n")}

LOWEST ENGAGEMENT CONTENT (audience is cold on these):
${lowEngaged.map(v => `  "${v.title}" — ${v.views} views, ${v.likes} likes, ${v.comments} comments, ${v.retention}% retention`).join("\n")}

${masterWisdom}

Analyze audience behavior patterns. Output JSON:
{
  "audienceWants": ["what topics/formats the audience clearly prefers"],
  "audienceAvoids": ["what topics/formats the audience ignores"],
  "contentGaps": ["opportunities the audience would respond to"],
  "retentionInsights": "what keeps them watching vs leaving",
  "actionableShift": "the ONE biggest content strategy shift to make right now",
  "confidence": 50-100
}`;

    const aiResult = await executeRoutedAICall({
      task: "audience_analysis",
      systemPrompt: "You analyze audience engagement patterns to drive content strategy. Return valid JSON only.",
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
      "audience-intelligence", userId, "audience_signal",
      "engagement_pattern_analysis",
      `Audience wants: ${parsed.audienceWants?.join(", ")}. Shift: ${parsed.actionableShift}`,
      `Gaps: ${parsed.contentGaps?.join(", ")}. Avoids: ${parsed.audienceAvoids?.join(", ")}. Retention: ${parsed.retentionInsights}`,
      parsed.confidence || 60,
    );

    if (parsed.contentGaps?.length) {
      for (const gap of parsed.contentGaps.slice(0, 2)) {
        await db.insert(discoveredStrategies).values({
          userId,
          title: `Audience gap: ${gap}`,
          category: "audience",
          description: `AI detected audience interest gap: ${gap}. ${parsed.retentionInsights || ""}`,
          sourceEngine: "audience-intelligence",
          effectiveness: parsed.confidence || 55,
          isActive: true,
        }).onConflictDoNothing();
      }
    }

    logger.info(`Audience intelligence: ${parsed.actionableShift}`, { userId: userId.substring(0, 8) });
    invalidateUserData(audStore, userId, "strategies");
  } catch (err) {
    logger.error("Audience intelligence AI call failed", { err: String(err) });
  }
}
