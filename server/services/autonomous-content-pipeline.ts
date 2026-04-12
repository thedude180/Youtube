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

const logger = createLogger("autonomous-pipeline");

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

    const aiResult = await executeRoutedAICall(
      { taskType: "autonomous_full_optimize", userId, priority: "high" },
      `You are the autonomous content brain of a YouTube gaming empire. You have learned from hundreds of data points and competitive analysis. Your job is to take new content and make it the BEST version it can be — applying every proven strategy, every core principle, every competitive insight. Think like a human creator who has been doing this for 10 years and knows exactly what works.

${knowledge}`,
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
  "schedulingAdvice": "best time/day to publish based on patterns (respect max 3 videos + 6 shorts per day limit)",
  "crossPromotionIdeas": ["2 ways to cross-promote with existing content"],
  "seoKeywords": ["5 primary search keywords to target"],
  "strategiesApplied": ["list of strategies used in this optimization"],
  "transformativeElements": ["list of transformative elements included for no-commentary compliance"],
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
      } as any,
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

    await recordLearningEvent(userId, "autonomous-content-pipeline", {
      type: "content_optimized",
      videoId,
      strategiesApplied: result.strategiesApplied || [],
      confidence: result.confidenceScore || 50,
      optimizedTitle: result.optimizedTitle,
    });

    logger.info("Autonomous content pipeline complete", {
      videoId,
      strategies: (result.strategiesApplied || []).length,
      confidence: result.confidenceScore,
      autoApplied: autonomous && (result.confidenceScore || 0) >= 80,
    });
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

      await recordLearningEvent(userId, "autonomous-content-pipeline", {
        type: "impact_measured",
        videoId,
        views: currentViews,
        daysSinceOptimization: improvement.daysSinceAction,
        strategiesApplied,
      });
    }

    logger.info("Performance feedback loop complete", { userId, measured: executedActions.length });
  } catch (err) {
    logger.warn("Performance feedback loop failed", { error: String(err).slice(0, 200) });
  }
}
