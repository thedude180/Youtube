import { db } from "../db";
import { discoveredStrategies, systemImprovements, crossChannelInsights, videos, channels, users, learningInsights, studioVideos } from "@shared/schema";
import { eq, and, desc, gte, sql, inArray, lt } from "drizzle-orm";
import { createLogger } from "../lib/logger";
import { executeRoutedAICall } from "./ai-model-router";
import { recordLearningEvent } from "../learning-engine";

const logger = createLogger("self-improvement-engine");

const IMPROVEMENT_CYCLE_MS = 6 * 60 * 60_000;
const BACK_CATALOG_BATCH = 15;
const TREND_SCAN_TOPICS = [
  "YouTube algorithm changes 2026 gaming channels",
  "YouTube SEO best practices gaming no commentary",
  "YouTube thumbnail CTR optimization techniques",
  "YouTube Shorts strategy gaming clips viral",
  "YouTube retention hooks first 30 seconds",
  "YouTube gaming channel growth strategies",
  "PS5 gaming trending topics popular games",
  "YouTube analytics metrics to track for growth",
];

let improvementTimer: ReturnType<typeof setInterval> | null = null;

export function initSelfImprovementEngine(): ReturnType<typeof setInterval> {
  logger.info("Self-Improvement Engine initialized — continuous evolution active");

  setTimeout(() => {
    runImprovementCycle().catch(err =>
      logger.error("Initial improvement cycle failed", { error: String(err).slice(0, 200) })
    );
  }, 600_000);

  improvementTimer = setInterval(() => {
    runImprovementCycle().catch(err =>
      logger.error("Scheduled improvement cycle failed", { error: String(err).slice(0, 200) })
    );
  }, IMPROVEMENT_CYCLE_MS);

  return improvementTimer;
}

export async function runImprovementCycle(): Promise<void> {
  logger.info("Self-improvement cycle starting");

  try {
    const allUsers = await db.select({ id: users.id }).from(users).limit(50);

    for (const user of allUsers) {
      try {
        await runUserImprovementCycle(user.id);
      } catch (err) {
        logger.error("Improvement cycle failed for user", { userId: user.id, error: String(err).slice(0, 200) });
      }
    }

    logger.info("Self-improvement cycle complete");
  } catch (err) {
    logger.error("Self-improvement cycle failed", { error: String(err).slice(0, 200) });
  }
}

async function runUserImprovementCycle(userId: string): Promise<void> {
  const userChannels = await db.select().from(channels)
    .where(and(eq(channels.userId, userId), eq(channels.platform, "youtube")));
  if (userChannels.length === 0) return;

  await scanWebForStrategies(userId);
  await analyzeCrossChannelPerformance(userId, userChannels);
  await sweepBackCatalog(userId, userChannels);
  await evolveStrategies(userId);

  logger.info("User improvement cycle complete", { userId, channelCount: userChannels.length });
}

export async function onNewContentDetected(userId: string, videoIdOrExternalId: number | string, triggerType: "stream_ended" | "upload_detected" | "manual_upload"): Promise<void> {
  logger.info("New content trigger — running improvement cascade", { userId, videoId: videoIdOrExternalId, triggerType });

  try {
    let videoId: number;
    if (typeof videoIdOrExternalId === "string") {
      const parsed = parseInt(videoIdOrExternalId, 10);
      if (!isNaN(parsed)) {
        videoId = parsed;
      } else {
        const [found] = await db.select({ videoId: studioVideos.videoId }).from(studioVideos)
          .where(eq(studioVideos.youtubeId, videoIdOrExternalId)).limit(1);
        if (!found?.videoId) {
          logger.warn("Video not found by YouTube ID for self-improvement", { youtubeId: videoIdOrExternalId });
          return;
        }
        videoId = found.videoId;
      }
    } else {
      videoId = videoIdOrExternalId;
    }

    const userChannels = await db.select().from(channels)
      .where(and(eq(channels.userId, userId), eq(channels.platform, "youtube")));

    await analyzeAndLearnFromContent(userId, videoId);

    if (userChannels.length > 1) {
      await propagateInsightsToChannels(userId, videoId, userChannels);
    }

    await identifyBackCatalogOpportunities(userId, videoId);

    await db.insert(systemImprovements).values({
      userId,
      improvementType: "content_cascade",
      area: "pipeline",
      beforeState: "new content detected",
      afterState: "learning extracted, cross-channel propagated, catalog opportunities flagged",
      triggerEvent: triggerType,
      engineSource: "self-improvement-engine",
      appliedAcrossChannels: userChannels.length > 1,
      channelIds: userChannels.map(c => String(c.id)),
    });
  } catch (err) {
    logger.error("New content improvement cascade failed", { userId, videoId, error: String(err).slice(0, 200) });
  }
}

async function scanWebForStrategies(userId: string): Promise<void> {
  const topicIndex = Math.floor((Date.now() / IMPROVEMENT_CYCLE_MS) % TREND_SCAN_TOPICS.length);
  const topic = TREND_SCAN_TOPICS[topicIndex];

  try {
    const wikiUrl = `https://en.wikipedia.org/w/api.php?action=query&list=search&srsearch=${encodeURIComponent(topic)}&format=json&srlimit=3&utf8=1`;
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 10000);
    const resp = await fetch(wikiUrl, {
      signal: controller.signal,
      headers: { "User-Agent": "CreatorOS/1.0 (self-improvement)" },
    });
    clearTimeout(timeout);

    let webContext = "";
    if (resp.ok) {
      const data = await resp.json() as any;
      const results = data?.query?.search || [];
      webContext = results.map((r: any) =>
        `${r.title}: ${(r.snippet || "").replace(/<[^>]*>/g, "").slice(0, 200)}`
      ).join("\n");
    }

    const aiResult = await executeRoutedAICall(
      { taskType: "strategy_scan", userId, priority: "low" },
      `You are an elite YouTube growth strategist specializing in no-commentary PS5 gaming channels. Analyze the following web research and extract 2-3 actionable, specific strategies that could improve channel performance. Each strategy must be concrete and implementable — not generic advice.`,
      `Research topic: "${topic}"\n\nWeb findings:\n${webContext || "No web data available — use your expertise."}\n\nFor each strategy, return JSON array: [{"strategyType": "seo|thumbnail|retention|shorts|distribution|engagement|monetization", "title": "short title", "description": "detailed actionable steps", "applicableTo": ["vod", "shorts", "livestream", "back_catalog"]}]`
    );

    try {
      const strategies = JSON.parse(aiResult.content || "[]");
      if (Array.isArray(strategies)) {
        for (const strategy of strategies.slice(0, 3)) {
          if (!strategy.title || !strategy.description || !strategy.strategyType) continue;

          const existing = await db.select({ id: discoveredStrategies.id }).from(discoveredStrategies)
            .where(eq(discoveredStrategies.title, strategy.title)).limit(1);
          if (existing.length > 0) continue;

          await db.insert(discoveredStrategies).values({
            userId,
            strategyType: strategy.strategyType,
            title: strategy.title,
            description: strategy.description,
            source: "web-scan",
            applicableTo: strategy.applicableTo || [],
            metadata: { topic, webContext: webContext.slice(0, 500) } as any,
          });
        }
      }
    } catch {
      logger.debug("Strategy parse failed — skipping", { topic });
    }

    logger.info("Web strategy scan complete", { topic, userId });
  } catch (err) {
    logger.warn("Web strategy scan failed", { topic, error: String(err).slice(0, 200) });
  }
}

async function analyzeCrossChannelPerformance(userId: string, userChannels: any[]): Promise<void> {
  if (userChannels.length < 2) return;

  const channelIds = userChannels.map(c => c.id);

  for (const channel of userChannels) {
    const topVideos = await db.select().from(videos)
      .where(and(
        eq(videos.channelId, channel.id),
        sql`${videos.viewCount} > 0`
      ))
      .orderBy(desc(videos.viewCount))
      .limit(5);

    if (topVideos.length === 0) continue;

    const avgViews = topVideos.reduce((sum, v) => sum + (v.viewCount || 0), 0) / topVideos.length;
    const topTitles = topVideos.map(v => v.title).join(" | ");
    const topGames = [...new Set(topVideos.map(v => (v.metadata as any)?.gameName).filter(Boolean))];

    const otherChannelIds = channelIds.filter(id => id !== channel.id);
    if (otherChannelIds.length === 0) continue;

    try {
      const aiResult = await executeRoutedAICall(
        { taskType: "cross_channel_analysis", userId, priority: "low" },
        "You are a multi-channel YouTube growth strategist. Analyze performance patterns from one channel and generate specific, actionable insights that could be applied to related channels.",
        `Source channel top performers (avg ${Math.round(avgViews)} views):\nTitles: ${topTitles}\nGames: ${topGames.join(", ")}\n\nGenerate 2 cross-channel insights. Return JSON array: [{"insightType": "title_pattern|game_selection|upload_timing|thumbnail_style|content_format", "insight": "specific actionable insight", "evidence": {"avgViews": ${Math.round(avgViews)}, "topGames": ${JSON.stringify(topGames)}}, "confidenceScore": 50-100}]`
      );

      const insights = JSON.parse(aiResult.content || "[]");
      if (Array.isArray(insights)) {
        for (const insight of insights.slice(0, 2)) {
          if (!insight.insight || !insight.insightType) continue;
          await db.insert(crossChannelInsights).values({
            userId,
            sourceChannelId: channel.id,
            insightType: insight.insightType,
            insight: insight.insight,
            evidence: insight.evidence || {},
            confidenceScore: Math.min(100, Math.max(0, insight.confidenceScore || 50)),
            propagatedTo: otherChannelIds.map(String),
          });
        }
      }
    } catch {
      logger.debug("Cross-channel analysis parse failed", { channelId: channel.id });
    }
  }

  logger.info("Cross-channel analysis complete", { userId, channelCount: userChannels.length });
}

async function sweepBackCatalog(userId: string, userChannels: any[]): Promise<void> {
  const channelIds = userChannels.map(c => c.id);
  const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60_000);
  const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60_000);

  const underperformers = await db.select().from(videos)
    .where(and(
      inArray(videos.channelId, channelIds),
      sql`${videos.publishedAt} < ${sevenDaysAgo}`,
      sql`${videos.viewCount} > 0`,
    ))
    .orderBy(sql`${videos.viewCount} ASC`)
    .limit(BACK_CATALOG_BATCH);

  if (underperformers.length === 0) return;

  const avgViews = underperformers.reduce((sum, v) => sum + (v.viewCount || 0), 0) / underperformers.length;

  const strategies = await db.select().from(discoveredStrategies)
    .where(and(
      eq(discoveredStrategies.isActive, true),
      sql`'back_catalog' = ANY(${discoveredStrategies.applicableTo})`
    ))
    .orderBy(desc(discoveredStrategies.effectiveness))
    .limit(5);

  const strategyContext = strategies.map(s => `- ${s.title}: ${s.description.slice(0, 150)}`).join("\n");

  for (const video of underperformers.slice(0, 5)) {
    const meta = (video.metadata as any) || {};
    if (meta.selfImprovementReviewedAt) {
      const lastReview = new Date(meta.selfImprovementReviewedAt);
      if (lastReview > thirtyDaysAgo) continue;
    }

    try {
      const aiResult = await executeRoutedAICall(
        { taskType: "catalog_improvement", userId, priority: "low" },
        "You are a YouTube content optimization specialist. Review this underperforming video and suggest specific improvements based on proven strategies.",
        `Video: "${video.title}" (${video.viewCount} views, ${video.type})\nGame: ${meta.gameName || "Unknown"}\nDescription: ${(video.description || "").slice(0, 200)}\n\nProven strategies available:\n${strategyContext || "None yet — use best practices."}\n\nReturn JSON: {"improvements": [{"area": "title|description|tags|thumbnail", "current": "current state", "suggested": "improvement", "expectedImpact": "low|medium|high"}], "repurposeIdeas": ["idea1", "idea2"]}`
      );

      const result = JSON.parse(aiResult.content || "{}");
      const improvements = result.improvements || [];

      await db.update(videos).set({
        metadata: {
          ...meta,
          selfImprovementReviewedAt: new Date().toISOString(),
          pendingImprovements: improvements,
          repurposeIdeas: result.repurposeIdeas || [],
        },
      }).where(eq(videos.id, video.id));

      if (improvements.length > 0) {
        await db.insert(systemImprovements).values({
          userId,
          improvementType: "back_catalog_review",
          area: "content_optimization",
          beforeState: `"${video.title}" — ${video.viewCount} views`,
          afterState: `${improvements.length} improvements identified`,
          triggerEvent: "scheduled_sweep",
          engineSource: "self-improvement-engine",
          measuredImpact: { videoId: video.id, improvements: improvements.length } as any,
        });
      }
    } catch {
      logger.debug("Catalog improvement analysis failed", { videoId: video.id });
    }
  }

  logger.info("Back catalog sweep complete", { userId, reviewed: Math.min(5, underperformers.length), totalUnderperformers: underperformers.length });
}

async function evolveStrategies(userId: string): Promise<void> {
  const strategies = await db.select().from(discoveredStrategies)
    .where(and(
      eq(discoveredStrategies.isActive, true),
      sql`${discoveredStrategies.timesApplied} > 0`
    ))
    .limit(20);

  for (const strategy of strategies) {
    const successRate = strategy.timesApplied > 0
      ? Math.round((strategy.timesSucceeded / strategy.timesApplied) * 100)
      : 0;

    await db.update(discoveredStrategies).set({
      effectiveness: successRate,
    }).where(eq(discoveredStrategies.id, strategy.id));

    if (strategy.timesApplied >= 5 && successRate < 20) {
      await db.update(discoveredStrategies).set({
        isActive: false,
      }).where(eq(discoveredStrategies.id, strategy.id));
      logger.info("Strategy deactivated — low effectiveness", { title: strategy.title, successRate });
    }
  }
}

async function analyzeAndLearnFromContent(userId: string, videoId: number): Promise<void> {
  const [video] = await db.select().from(videos).where(eq(videos.id, videoId));
  if (!video) return;

  const meta = (video.metadata as any) || {};

  const channelVideos = await db.select().from(videos)
    .where(and(
      eq(videos.channelId, video.channelId!),
      sql`${videos.viewCount} > 0`
    ))
    .orderBy(desc(videos.viewCount))
    .limit(10);

  const channelAvgViews = channelVideos.length > 0
    ? channelVideos.reduce((sum, v) => sum + (v.viewCount || 0), 0) / channelVideos.length
    : 0;

  const topTitlePatterns = channelVideos.slice(0, 3).map(v => v.title).join(" | ");
  const topGames = [...new Set(channelVideos.map(v => (v.metadata as any)?.gameName).filter(Boolean))];

  const activeStrategies = await db.select().from(discoveredStrategies)
    .where(eq(discoveredStrategies.isActive, true))
    .orderBy(desc(discoveredStrategies.effectiveness))
    .limit(5);

  const strategyList = activeStrategies.map(s => `${s.title} (${s.effectiveness}% effective)`).join(", ");

  try {
    const aiResult = await executeRoutedAICall(
      { taskType: "content_learning", userId, priority: "medium" },
      "You are a YouTube analytics expert. Extract learnings from new content relative to the channel's history.",
      `New content: "${video.title}" (${video.type}, game: ${meta.gameName || "Unknown"})\nChannel avg views: ${Math.round(channelAvgViews)}\nTop performing titles: ${topTitlePatterns}\nTop games: ${topGames.join(", ")}\nActive strategies: ${strategyList || "None yet"}\n\nReturn JSON: {"learnings": [{"area": "title|game_selection|timing|format|thumbnail", "finding": "specific finding", "confidence": 50-100, "actionItem": "what to do next time"}], "strategyUpdates": [{"strategyTitle": "existing strategy title", "outcome": "success|failure"}]}`
    );

    const result = JSON.parse(aiResult.content || "{}");

    if (result.learnings && Array.isArray(result.learnings)) {
      for (const learning of result.learnings) {
        await recordLearningEvent(userId, "self-improvement-engine", {
          type: "content_analysis",
          area: learning.area,
          finding: learning.finding,
          confidence: learning.confidence || 50,
          actionItem: learning.actionItem,
          videoId,
        });
      }
    }

    if (result.strategyUpdates && Array.isArray(result.strategyUpdates)) {
      for (const update of result.strategyUpdates) {
        if (!update.strategyTitle) continue;
        const isSuccess = update.outcome === "success";
        await db.update(discoveredStrategies).set({
          timesApplied: sql`${discoveredStrategies.timesApplied} + 1`,
          timesSucceeded: isSuccess ? sql`${discoveredStrategies.timesSucceeded} + 1` : discoveredStrategies.timesSucceeded,
          lastAppliedAt: new Date(),
        }).where(eq(discoveredStrategies.title, update.strategyTitle));
      }
    }
  } catch {
    logger.debug("Content learning analysis failed", { videoId });
  }
}

async function propagateInsightsToChannels(userId: string, videoId: number, userChannels: any[]): Promise<void> {
  const [video] = await db.select().from(videos).where(eq(videos.id, videoId));
  if (!video) return;

  const meta = (video.metadata as any) || {};
  const sourceChannelId = video.channelId;
  const otherChannels = userChannels.filter(c => c.id !== sourceChannelId);

  if (otherChannels.length === 0) return;

  try {
    const aiResult = await executeRoutedAICall(
      { taskType: "cross_propagation", userId, priority: "low" },
      "You are a multi-channel content strategist. Generate insights from source content that could benefit other channels in the same creator's network.",
      `Source video: "${video.title}" on channel ${sourceChannelId}\nGame: ${meta.gameName || "Unknown"}\nType: ${video.type}\n\nOther channels to propagate to: ${otherChannels.map(c => `${c.id} (${c.channelName || "unnamed"})`).join(", ")}\n\nReturn JSON array of max 2 insights: [{"insightType": "content_idea|game_crossover|audience_bridge|format_reuse", "insight": "specific actionable insight for other channels", "confidenceScore": 50-100}]`
    );

    const insights = JSON.parse(aiResult.content || "[]");
    if (Array.isArray(insights)) {
      for (const insight of insights.slice(0, 2)) {
        if (!insight.insight || !insight.insightType) continue;
        await db.insert(crossChannelInsights).values({
          userId,
          sourceChannelId: sourceChannelId!,
          insightType: insight.insightType,
          insight: insight.insight,
          confidenceScore: Math.min(100, Math.max(0, insight.confidenceScore || 50)),
          propagatedTo: otherChannels.map(c => String(c.id)),
        });
      }
    }
  } catch {
    logger.debug("Cross-channel propagation failed", { videoId });
  }
}

async function identifyBackCatalogOpportunities(userId: string, newVideoId: number): Promise<void> {
  const [newVideo] = await db.select().from(videos).where(eq(videos.id, newVideoId));
  if (!newVideo) return;

  const meta = (newVideo.metadata as any) || {};
  const gameName = meta.gameName;
  if (!gameName || gameName === "Unknown") return;

  const sameGameVideos = await db.select().from(videos)
    .where(and(
      eq(videos.channelId, newVideo.channelId!),
      sql`${videos.id} != ${newVideoId}`,
      sql`(${videos.metadata}->>'gameName')::text = ${gameName}`,
    ))
    .orderBy(desc(videos.publishedAt))
    .limit(10);

  if (sameGameVideos.length === 0) return;

  const catalogTitles = sameGameVideos.map(v => `"${v.title}" (${v.viewCount} views)`).join("\n");

  try {
    const aiResult = await executeRoutedAICall(
      { taskType: "catalog_opportunity", userId, priority: "low" },
      "You are a content repurposing specialist. Identify opportunities to boost old content based on new content being published for the same game.",
      `New video just published: "${newVideo.title}" (${gameName})\n\nExisting catalog for ${gameName}:\n${catalogTitles}\n\nIdentify 1-2 old videos that could benefit from refreshed titles, thumbnails, or being linked/referenced in the new video's end screen. Return JSON: {"opportunities": [{"videoTitle": "existing video title", "action": "refresh_title|refresh_thumbnail|add_endscreen|create_playlist", "reason": "why this helps"}]}`
    );

    const result = JSON.parse(aiResult.content || "{}");
    if (result.opportunities && Array.isArray(result.opportunities)) {
      for (const opp of result.opportunities.slice(0, 2)) {
        await db.insert(systemImprovements).values({
          userId,
          improvementType: "catalog_opportunity",
          area: "back_catalog",
          beforeState: `Old ${gameName} content sitting idle`,
          afterState: `${opp.action}: ${opp.reason}`,
          triggerEvent: "new_content_same_game",
          engineSource: "self-improvement-engine",
          measuredImpact: { newVideoId, action: opp.action, targetTitle: opp.videoTitle } as any,
        });
      }
    }
  } catch {
    logger.debug("Catalog opportunity analysis failed", { newVideoId, gameName });
  }
}

export async function getImprovementStats(userId: string): Promise<{
  strategiesDiscovered: number;
  strategiesActive: number;
  improvementsMade: number;
  crossChannelInsightsCount: number;
  topStrategies: Array<{ title: string; effectiveness: number; timesApplied: number }>;
}> {
  const [stratCount] = await db.select({ count: sql<number>`count(*)` }).from(discoveredStrategies)
    .where(eq(discoveredStrategies.userId, userId));
  const [activeCount] = await db.select({ count: sql<number>`count(*)` }).from(discoveredStrategies)
    .where(and(eq(discoveredStrategies.userId, userId), eq(discoveredStrategies.isActive, true)));
  const [impCount] = await db.select({ count: sql<number>`count(*)` }).from(systemImprovements)
    .where(eq(systemImprovements.userId, userId));
  const [cciCount] = await db.select({ count: sql<number>`count(*)` }).from(crossChannelInsights)
    .where(eq(crossChannelInsights.userId, userId));

  const topStrats = await db.select({
    title: discoveredStrategies.title,
    effectiveness: discoveredStrategies.effectiveness,
    timesApplied: discoveredStrategies.timesApplied,
  }).from(discoveredStrategies)
    .where(and(eq(discoveredStrategies.userId, userId), eq(discoveredStrategies.isActive, true)))
    .orderBy(desc(discoveredStrategies.effectiveness))
    .limit(5);

  return {
    strategiesDiscovered: Number(stratCount?.count || 0),
    strategiesActive: Number(activeCount?.count || 0),
    improvementsMade: Number(impCount?.count || 0),
    crossChannelInsightsCount: Number(cciCount?.count || 0),
    topStrategies: topStrats.map(s => ({
      title: s.title,
      effectiveness: s.effectiveness || 0,
      timesApplied: s.timesApplied,
    })),
  };
}
