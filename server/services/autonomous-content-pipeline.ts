import { db } from "../db";
import {
  videos, channels, discoveredStrategies, autonomousActions,
  systemImprovements, memoryConsolidation, studioVideos,
} from "@shared/schema";
import { eq, and, desc, gt, sql, gte } from "drizzle-orm";
import { createLogger } from "../lib/logger";
import { safeParseJSON } from "../lib/safe-json";
import { executeRoutedAICall } from "./ai-model-router";
import { buildKnowledgeContext, getApplicableStrategies } from "./knowledge-context-builder";
import { isAutonomousMode, logAutonomousAction } from "../lib/autonomous";
import { recordLearningEvent } from "../learning-engine";
import { getIntelligenceContext, formatIntelligenceBlock } from "./intelligence-context";
import { intelligenceSignals } from "@shared/schema";

const logger = createLogger("autonomous-pipeline");

// Q4 revenue intelligence — gaming RPMs are 3-5x higher Oct-Dec vs January
function getQ4Context(): string {
  const now = new Date();
  const month = now.getMonth(); // 0-indexed
  if (month >= 9 && month <= 11) {
    const names = ["October", "November", "December"];
    return `CRITICAL: We are in Q4 (${names[month - 9]}). Gaming ad RPMs are 3-5x higher than January. Scheduling advice MUST prioritize publishing THIS content NOW rather than deferring. High-effort optimized content published in Q4 earns significantly more revenue.`;
  }
  if (month === 8) {
    return `NOTE: Q4 begins next month (October). High-quality content should be planned and scheduled to publish in October-December when gaming RPMs are 3-5x higher than January.`;
  }
  return `NOTE: Q4 (October-December) has 3-5x higher gaming ad RPMs. Reserve your highest-quality content for Q4 scheduling windows.`;
}

// Surface detection: determine the primary YouTube recommendation surface to target
function detectTargetSurface(title: string, type: string, meta: Record<string, any>): string {
  const t = title.toLowerCase();
  const tags: string[] = (meta.tags || []).map((s: string) => s.toLowerCase());
  const allText = `${t} ${tags.join(" ")}`;

  if (type === "short" || type === "shorts") return "Shorts";
  if (/how to|guide|tutorial|tips|trick|best way|walkthrough/.test(allText)) return "Search";
  if (/live|stream|vod|highlights|recap|replay/.test(allText)) return "Suggested";
  return "Home + Suggested";
}

// Surface-specific instruction block injected into the AI prompt
function getSurfaceInstructions(surface: string): string {
  const guides: Record<string, string> = {
    "Search": "TARGET SURFACE: SEARCH — Semantic NLP alignment matters. Title must answer the exact query. Description should include related terms viewers search. YouTube tracks query satisfaction: if viewers bounce in 10s you get demoted for that term. Prioritize informational keywords over engagement bait.",
    "Suggested": "TARGET SURFACE: SUGGESTED (Up Next) — Optimize for session chaining. The title/thumbnail should pair naturally with popular gaming videos viewers just finished. Mention the game prominently. Session continuation after this video is the key signal.",
    "Shorts": "TARGET SURFACE: SHORTS FEED — Swipe-away ratio in first second is the master metric. First frame determines everything — no logo intros, no slow builds, lead with the payoff. Completion rate beats total watch time. Create replay-worthy moments. 30-60 seconds is the discovery sweet spot.",
    "Home + Suggested": "TARGET SURFACE: HOME + SUGGESTED — Niche consistency signals matter. CTR is gate 1 (below 2% = suppressed). Thumbnail must stand out in a grid of similar gaming content. High CTR + low retention triggers clickbait suppression — the title must deliver on its promise.",
  };
  return guides[surface] || guides["Home + Suggested"];
}

export async function runFullContentOptimization(userId: string, videoId: number): Promise<void> {
  logger.info("Autonomous content pipeline triggered", { userId, videoId });

  try {
    const video = await db.select().from(videos).where(eq(videos.id, videoId)).limit(1);
    if (!video[0]) {
      logger.warn("Video not found for autonomous pipeline", { videoId });
      return;
    }
    const v = video[0];
    const meta = (v.metadata as any) || {};

    if (meta.autonomousPipelineCompleted) {
      logger.debug("Video already processed by autonomous pipeline", { videoId });
      return;
    }

    const knowledge = await buildKnowledgeContext(userId);
    const vodStrategies = await getApplicableStrategies(userId, "vod");
    const shortsStrategies = await getApplicableStrategies(userId, "shorts");

    const principles = await db.select({
      principle: memoryConsolidation.corePrinciple,
      category: memoryConsolidation.consolidationType,
    }).from(memoryConsolidation)
      .where(and(eq(memoryConsolidation.userId, userId), eq(memoryConsolidation.isActive, true)))
      .orderBy(desc(memoryConsolidation.confidenceScore))
      .limit(5);

    const principleBlock = principles.map(p => `• [${p.category}] ${p.principle}`).join("\n");

    const channelVideos = await db.select().from(videos)
      .where(and(eq(videos.channelId, v.channelId!), sql`(${videos.metadata}->>'viewCount')::int > 0`))
      .orderBy(sql`(${videos.metadata}->>'viewCount')::int DESC`)
      .limit(5);

    const topPerformers = channelVideos.map(cv =>
      `"${cv.title}" — ${(cv.metadata as any)?.viewCount || 0} views`
    ).join("\n");

    const gameName = meta.gameName || "Gaming";

    if (gameName && gameName !== "Gaming" && gameName !== "Unknown" && gameName !== "Uncategorized") {
      try {
        const { persistGameToDatabase } = await import("./web-game-lookup");
        await persistGameToDatabase(gameName, "content-pipeline");
      } catch (err: any) {
        logger.warn(`Content pipeline game persist failed for "${gameName}": ${err.message}`);
      }
    }

    const q4Context = getQ4Context();
    const targetSurface = detectTargetSurface(v.title || "", v.type || "", meta);
    const surfaceInstructions = getSurfaceInstructions(targetSurface);

    const intelCtx = await getIntelligenceContext(userId);
    const intelBlock = formatIntelligenceBlock(intelCtx);

    const aiResult = await executeRoutedAICall(
      { taskType: "autonomous_full_optimize", userId, priority: "high" },
      `You are the autonomous content brain of a YouTube gaming empire. You have learned from hundreds of data points and competitive analysis. Your job is to take new content and make it the BEST version it can be — applying every proven strategy, every core principle, every competitive insight. Think like a human creator who has been doing this for 10 years and knows exactly what works.

${knowledge}${intelBlock ? `\n\n${intelBlock}` : ""}`,
      `NEW CONTENT TO OPTIMIZE:
Title: "${v.title}"
Type: ${v.type}
Game: ${gameName}
Description: ${(v.description || "").slice(0, 500)}
Current tags: ${(meta.tags || []).join(", ")}

CHANNEL TOP PERFORMERS (model after these):
${topPerformers || "No data yet"}

PROVEN STRATEGIES FOR VODs:
${vodStrategies || "No proven strategies yet — use best practices"}

CORE PRINCIPLES:
${principleBlock || "No principles yet — use industry best practices"}

${surfaceInstructions}

REVENUE & SCHEDULING INTELLIGENCE:
${q4Context}

2026 SATISFACTION MODEL (replaces watch time as primary signal):
- YouTube surveys viewers after every watch: "Was this worth your time?"
- Satisfaction score = repeat views + session continuation + comment sentiment + likes
- Clickbait-then-stall ACTIVELY suppresses: high CTR + low satisfaction = algorithmic penalty
- Optimized title MUST deliver exactly what it promises within the first 30 seconds
- Comments in the first 2 hours: responding to 50+ correlates with 15-20% higher reach
- Hype feature: remind creator to ask community to Hype within 7 days (eligible if under 500K subs)

Generate the BEST possible version of this content. Apply every insight you have.

CRITICAL YOUTUBE POLICY REQUIREMENTS (April 2026):
1. AI DISCLOSURE: ALL AI-assisted content must be labeled. Since this description is AI-generated, you MUST include the following line at the bottom of the description: "AI Disclosure: AI tools were used to assist in editing, optimization, and/or description generation for this content."
2. NO-COMMENTARY ELIGIBILITY: For no-commentary gameplay, YouTube now requires transformative elements for monetization. You MUST include at least 2 of these in the description: chapter timestamps, strategic gameplay analysis/tips, curated highlight callouts, game-specific context/lore, or performance commentary notes.
3. UPLOAD LIMITS: Automated uploads are now limited — do not suggest rapid posting schedules.

Return JSON:
{
  "optimizedTitle": "title that maximizes CTR using proven patterns (max 100 chars)",
  "optimizedDescription": "SEO-rich description with hooks, keywords, timestamps placeholder, transformative gameplay context, AND AI disclosure footer (max 2000 chars)",
  "optimizedTags": ["15-20 highly targeted tags"],
  "thumbnailConcept": "specific visual concept for maximum CTR thumbnail",
  "shortsIdeas": ["3 viral shorts clip ideas from this content"],
  "schedulingAdvice": "best time/day to publish — include Q4 urgency if applicable, surface-specific timing notes",
  "crossPromotionIdeas": ["2 ways to cross-promote with existing content"],
  "seoKeywords": ["5 primary search keywords to target"],
  "strategiesApplied": ["list of strategies used in this optimization"],
  "transformativeElements": ["list of transformative elements included for no-commentary compliance"],
  "targetSurface": "${targetSurface}",
  "confidenceScore": 0-100
}`
    );

    const result = safeParseJSON(aiResult.content, {} as any);
    if (!result.optimizedTitle) {
      logger.warn("Autonomous pipeline returned empty result", { videoId });
      return;
    }

    const AI_DISCLOSURE_FOOTER = "\n\n---\nAI Disclosure: AI tools were used to assist in editing, optimization, and/or description generation for this content.";
    if (result.optimizedDescription && !result.optimizedDescription.toLowerCase().includes("ai disclosure")) {
      result.optimizedDescription = result.optimizedDescription.trimEnd() + AI_DISCLOSURE_FOOTER;
    }

    const beforeSnapshot = {
      title: v.title,
      description: v.description?.slice(0, 200),
      tags: meta.tags || [],
    };

    await db.update(videos).set({
      metadata: {
        ...meta,
        autonomousPipelineCompleted: true,
        autonomousPipelineAt: new Date().toISOString(),
        hasAiContent: true,
        pendingOptimizedTitle: result.optimizedTitle,
        pendingOptimizedDescription: result.optimizedDescription,
        pendingOptimizedTags: result.optimizedTags || [],
        thumbnailConcept: result.thumbnailConcept,
        shortsIdeas: result.shortsIdeas || [],
        schedulingAdvice: result.schedulingAdvice,
        crossPromotionIdeas: result.crossPromotionIdeas || [],
        seoKeywords: result.seoKeywords || [],
        strategiesApplied: result.strategiesApplied || [],
        transformativeElements: result.transformativeElements || [],
        autonomousConfidence: result.confidenceScore || 50,
      },
    }).where(eq(videos.id, videoId));

    const autonomous = await isAutonomousMode(userId);
    if (autonomous && (result.confidenceScore || 0) >= 80) {
      await db.update(videos).set({
        title: result.optimizedTitle,
        description: result.optimizedDescription || v.description,
        metadata: {
          ...meta,
          autonomousPipelineCompleted: true,
          autonomousPipelineAt: new Date().toISOString(),
          tags: result.optimizedTags || meta.tags || [],
          aiOptimized: true,
          hasAiContent: true,
          aiOptimizedAt: new Date().toISOString(),
          thumbnailConcept: result.thumbnailConcept,
          shortsIdeas: result.shortsIdeas || [],
          schedulingAdvice: result.schedulingAdvice,
          crossPromotionIdeas: result.crossPromotionIdeas || [],
          seoKeywords: result.seoKeywords || [],
          strategiesApplied: result.strategiesApplied || [],
          transformativeElements: result.transformativeElements || [],
          autonomousConfidence: result.confidenceScore || 50,
          previousTitle: v.title,
          previousDescription: v.description,
        },
      }).where(eq(videos.id, videoId));

      await logAutonomousAction({
        userId,
        engine: "autonomous-content-pipeline",
        action: "full_content_optimization",
        reasoning: `Applied ${(result.strategiesApplied || []).length} strategies with ${result.confidenceScore}% confidence`,
        payload: { videoId, before: beforeSnapshot, after: { title: result.optimizedTitle, tags: result.optimizedTags } },
        prompt: "autonomous full optimization",
        response: aiResult.content?.slice(0, 500),
      });

      logger.info("Content auto-applied (autonomous mode, high confidence)", { videoId, confidence: result.confidenceScore });
    }

    await db.insert(autonomousActions).values({
      userId,
      actionType: "full_content_optimization",
      targetEntity: "video",
      targetId: String(videoId),
      beforeSnapshot,
      afterSnapshot: {
        title: result.optimizedTitle,
        tags: result.optimizedTags,
        strategies: result.strategiesApplied,
      },
      reasoning: `Applied ${(result.strategiesApplied || []).length} learned strategies to optimize "${v.title}"`,
      confidenceScore: result.confidenceScore || 50,
      status: autonomous && (result.confidenceScore || 0) >= 80 ? "executed" : "staged",
      autoApproved: autonomous && (result.confidenceScore || 0) >= 80,
      executedAt: autonomous && (result.confidenceScore || 0) >= 80 ? new Date() : undefined,
    });

    await db.insert(systemImprovements).values({
      userId,
      improvementType: "autonomous_optimization",
      area: "content_pipeline",
      beforeState: `"${v.title}" — unoptimized`,
      afterState: `"${result.optimizedTitle}" — ${(result.strategiesApplied || []).length} strategies applied, ${result.confidenceScore}% confidence`,
      triggerEvent: "content_detected",
      engineSource: "autonomous-content-pipeline",
      measuredImpact: {
        videoId,
        strategiesApplied: result.strategiesApplied,
        confidence: result.confidenceScore,
        shortsPlanned: (result.shortsIdeas || []).length,
      },
    });

    if ((result.strategiesApplied || []).length > 0) {
      for (const stratName of result.strategiesApplied) {
        await db.update(discoveredStrategies).set({
          timesApplied: sql`${discoveredStrategies.timesApplied} + 1`,
          lastAppliedAt: new Date(),
        }).where(and(
          eq(discoveredStrategies.userId, userId),
          eq(discoveredStrategies.title, stratName),
        ));
      }
    }

    await recordLearningEvent(userId, "autonomous-content-pipeline", "content_optimized", { videoId, strategiesApplied: result.strategiesApplied || [], confidence: result.confidenceScore || 50, optimizedTitle: result.optimizedTitle });

    // Feed processed content back as intelligence signal so the engine learns what topics are being acted on
    if (gameName && gameName !== "Gaming" && gameName !== "Unknown") {
      db.insert(intelligenceSignals).values({
        userId,
        source: "content_pipeline",
        category: "content_processed",
        title: `Optimized: ${result.optimizedTitle || v.title}`,
        score: result.confidenceScore ? result.confidenceScore * 0.8 : 40,
        metadata: {
          game: gameName,
          surface: targetSurface,
          strategiesApplied: (result.strategiesApplied || []).length,
          seoKeywords: result.seoKeywords || [],
        },
        processed: true,
        expiresAt: new Date(Date.now() + 7 * 86400_000),
      }).onConflictDoNothing().catch(() => {});
    }

    logger.info("Autonomous content pipeline complete", {
      videoId,
      strategies: (result.strategiesApplied || []).length,
      confidence: result.confidenceScore,
      autoApplied: autonomous && (result.confidenceScore || 0) >= 80,
      targetSurface,
    });

    // Fire a Hype notification via Discord so ET knows to ask the community to Hype this
    // video within the 7-day window (eligible for channels 500-500K subs, free Explore boost)
    try {
      const { sendHypeNotification } = await import("./youtube-hype-notifier");
      const youtubeVideoId = (v.metadata as any)?.youtubeVideoId || (v.metadata as any)?.youtubeId || undefined;
      await sendHypeNotification({
        userId,
        videoId,
        videoTitle: result.optimizedTitle || v.title || "",
        youtubeVideoId,
      });
    } catch (hypeErr: any) {
      logger.debug("Hype notifier skipped", { videoId, reason: hypeErr?.message?.slice(0, 60) });
    }
  } catch (err) {
    logger.error("Autonomous content pipeline failed", { videoId, error: String(err).slice(0, 200) });
  }
}

export async function runPerformanceFeedbackLoop(userId: string): Promise<void> {
  logger.info("Performance feedback loop — measuring impact of applied strategies");

  try {
    const executedActions = await db.select().from(autonomousActions)
      .where(and(
        eq(autonomousActions.userId, userId),
        eq(autonomousActions.status, "executed"),
        sql`${autonomousActions.impactMeasured} IS NULL`,
        sql`${autonomousActions.executedAt} < NOW() - INTERVAL '24 hours'`,
      ))
      .limit(10);

    for (const action of executedActions) {
      if (!action.targetId) continue;

      const videoId = parseInt(action.targetId, 10);
      if (isNaN(videoId)) continue;

      const [video] = await db.select().from(videos).where(eq(videos.id, videoId));
      if (!video) continue;

      const before = (action.beforeSnapshot as any) || {};
      const meta = (video.metadata as any) || {};
      const currentViews = meta.viewCount || 0;

      const improvement = {
        viewsAfterOptimization: currentViews,
        daysSinceAction: Math.round((Date.now() - new Date(action.executedAt!).getTime()) / (24 * 60 * 60_000)),
      };

      await db.update(autonomousActions).set({
        impactMeasured: improvement,
      }).where(eq(autonomousActions.id, action.id));

      const strategiesApplied = (action.afterSnapshot as any)?.strategies || [];
      for (const stratName of strategiesApplied) {
        if (currentViews > 0) {
          await db.update(discoveredStrategies).set({
            timesSucceeded: sql`${discoveredStrategies.timesSucceeded} + 1`,
          }).where(and(
            eq(discoveredStrategies.userId, userId),
            eq(discoveredStrategies.title, stratName),
          ));
        }
      }

      await recordLearningEvent(userId, "autonomous-content-pipeline", "impact_measured", { videoId, views: currentViews, daysSinceOptimization: improvement.daysSinceAction,
        strategiesApplied,
      })
    }

    logger.info("Performance feedback loop complete", { userId, measured: executedActions.length });
  } catch (err) {
    logger.warn("Performance feedback loop failed", { error: String(err).slice(0, 200) });
  }
}
