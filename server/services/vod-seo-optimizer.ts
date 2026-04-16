import { isAutonomousMode, logAutonomousAction } from "../lib/autonomous";
import { withCreatorVoice } from "./creator-dna-builder";
import { storage } from "../storage";
import { createLogger } from "../lib/logger";
import { safeParseJSON } from "../lib/safe-json";
import { executeRoutedAICall } from "./ai-model-router";

const logger = createLogger("vod-seo-optimizer");

async function getSEOLearnings(userId: string): Promise<string> {
  try {
    const { getEngineKnowledgeForContext } = await import("./knowledge-mesh");
    const insights = await getEngineKnowledgeForContext("vod-seo-optimizer", userId, 8);
    if (insights.length === 0) return "";
    const lines = insights.map(i => `- [${i.confidence}%] ${i.topic}: ${i.insight}`).join("\n");
    return `\n\nSEO LEARNINGS FROM PAST OPTIMIZATIONS (apply these patterns):\n${lines}`;
  } catch {
    return "";
  }
}

async function getThumbnailVisualContext(userId: string, gameName: string): Promise<string> {
  try {
    if (!gameName || gameName === "Unknown" || gameName === "Gaming") return "";
    const { getThumbnailContext } = await import("./thumbnail-intelligence");
    const ctx = await getThumbnailContext(userId, gameName);
    if (!ctx) return "";
    return `\n\nTHUMBNAIL VISUAL INTELLIGENCE (align title hooks with visual strategy):\n${ctx.substring(0, 500)}`;
  } catch {
    return "";
  }
}

async function recordSEOKnowledge(userId: string, videoId: number, originalTitle: string, optimizedTitle: string, gameName: string | undefined): Promise<void> {
  try {
    const { recordEngineKnowledge } = await import("./knowledge-mesh");
    const titleStyle = optimizedTitle.includes("?") ? "question" :
      optimizedTitle.includes("!") ? "exclamatory" :
      optimizedTitle.includes("...") ? "suspense" : "declarative";

    await recordEngineKnowledge(
      "vod-seo-optimizer",
      userId,
      "seo_optimization",
      `title_pattern:${gameName || "general"}`,
      `Optimized "${originalTitle.substring(0, 50)}" → "${optimizedTitle.substring(0, 50)}" (style: ${titleStyle})`,
      `videoId: ${videoId}`,
      60,
      { gameName, titleStyle, optimizedTitle }
    );

    if (gameName && gameName !== "Unknown") {
      await recordEngineKnowledge(
        "vod-seo-optimizer",
        userId,
        "game_seo_pattern",
        `game_keywords:${gameName}`,
        `SEO title for ${gameName}: "${optimizedTitle.substring(0, 70)}" — ${titleStyle} style`,
        `videoId: ${videoId}`,
        55,
        { gameName, titleStyle }
      );
    }
  } catch (err: any) {
    logger.warn(`Failed to record SEO knowledge: ${err.message}`);
  }
}

export class VODSEOOptimizer {
  async optimize(userId: string, videoId: number): Promise<void> {
    const autonomous = await isAutonomousMode(userId);
    if (!autonomous) return;

    try {
      const video = await storage.getVideo(videoId);
      if (!video) {
        logger.error(`[VODSEOOptimizer] Video ${videoId} not found`);
        return;
      }

      logger.info(`[VODSEOOptimizer] Optimizing metadata for video ${videoId}: ${video.title}`);

      const gameName = video.metadata?.gameName;
      const gameContext = gameName && gameName !== "Unknown" && gameName !== "Gaming"
        ? `Game/Category: ${gameName}\n\nCRITICAL: The detected game is "${gameName}". The optimized title and description MUST reference "${gameName}" — do NOT substitute a different game name.`
        : `Game/Category: Unknown\n\nThe game has not been confidently identified. Do NOT guess or fabricate a game name. Use generic gaming terms instead.`;

      const seoLearnings = await getSEOLearnings(userId);
      const visualContext = await getThumbnailVisualContext(userId, gameName || "");

      const basePrompt = `You are an SEO expert for YouTube. Optimize the following video metadata:
Current Title: ${video.title}
Current Description: ${video.description || "None"}
${gameContext}${seoLearnings}${visualContext}

Return a JSON object with:
1. "optimizedTitle": Catchy, high-CTR title (max 100 chars)
2. "optimizedDescription": Engaging description with keywords and timestamps placeholder (max 5000 chars)
3. "tags": Array of 15-20 relevant tags
4. "chapters": Array of { "time": "MM:SS", "label": "Chapter Name" } (estimate 5-8 major chapters)
5. "titleHook": A 1-sentence summary of the curiosity gap or emotional trigger in the title (this helps align thumbnails)

Ensure the tone matches the creator's DNA.`;

      const prompt = await withCreatorVoice(userId, basePrompt);

      const aiResult = await executeRoutedAICall(
        { taskType: "vod_seo", userId, priority: "medium" },
        "You are an SEO expert for YouTube. Respond with valid JSON only.",
        prompt
      );

      const optimized = safeParseJSON(aiResult.content, {} as any);

      logger.info(`[VODSEOOptimizer] Applying optimized metadata to video ${videoId}`);
      
      await storage.updateVideo(videoId, {
        title: optimized.optimizedTitle || video.title,
        description: optimized.optimizedDescription || video.description,
        metadata: {
          ...video.metadata,
          tags: optimized.tags || video.metadata?.tags || [],
          aiOptimized: true,
          aiOptimizedAt: new Date().toISOString(),
          seoRecommendations: optimized.optimizedTitle ? [optimized.optimizedTitle] : [],
          seoTitleHook: optimized.titleHook || null,
        }
      });

      await recordSEOKnowledge(userId, videoId, video.title, optimized.optimizedTitle || video.title, gameName);

      await logAutonomousAction({
        userId,
        engine: "vod-seo-optimizer",
        action: "optimize_metadata",
        reasoning: "Improved SEO title, description, and tags using creator DNA, past SEO learnings, and thumbnail visual intelligence.",
        payload: { videoId, title: optimized.optimizedTitle, titleHook: optimized.titleHook },
        prompt,
        response: aiResult.content,
      });

    } catch (err: any) {
      logger.error(`[VODSEOOptimizer] Error optimizing video ${videoId}: ${err.message}`);
    }
  }
}

export const vodSEOOptimizer = new VODSEOOptimizer();
