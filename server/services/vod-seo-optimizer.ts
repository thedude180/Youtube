import { isAutonomousMode, logAutonomousAction } from "../lib/autonomous";
import { withCreatorVoice } from "./creator-dna-builder";
import { storage } from "../storage";
import { createLogger } from "../lib/logger";
import { safeParseJSON } from "../lib/safe-json";
import { executeRoutedAICall } from "./ai-model-router";
import { sanitizeForPrompt } from "../lib/ai-attack-shield";
import { buildDescription, reformatRawDescription, type DescriptionParts } from "../lib/description-formatter";

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
      const safeGameName = sanitizeForPrompt(gameName || "", 100);
      const gameContext = safeGameName && safeGameName !== "Unknown" && safeGameName !== "Gaming"
        ? `Game/Category: ${safeGameName}\n\nCRITICAL: The detected game is "${safeGameName}". The optimized title and description MUST reference "${safeGameName}" — do NOT substitute a different game name.`
        : `Game/Category: Unknown\n\nThe game has not been confidently identified. Do NOT guess or fabricate a game name. Use generic gaming terms instead.`;

      const seoLearnings = await getSEOLearnings(userId);
      const visualContext = await getThumbnailVisualContext(userId, gameName || "");

      const basePrompt = `You are an SEO expert for a YouTube PS5 gaming channel. Optimize the following video metadata and return STRUCTURED JSON — each description section is a SEPARATE field so they can be assembled with proper line breaks.

Current Title: ${sanitizeForPrompt(video.title, 200)}
Current Description: ${sanitizeForPrompt(video.description || "None", 500)}
${gameContext}${seoLearnings}${visualContext}

Return a JSON object with EXACTLY these keys:
1. "optimizedTitle": Catchy, high-CTR title (max 100 chars)
2. "hookLines": Array of 1-2 short punchy sentences that open the description and appear in search previews. Each line is a separate array element. Max 25 words each. No timestamps here.
3. "bodyParagraph": 2-3 sentences (one paragraph) describing what happens in the video with relevant keywords. No timestamps. No social links.
4. "chapters": Array of { "time": "M:SS", "label": "Short chapter name" } — estimate 5-10 chapters based on the video. Use real-looking timestamps spread across the video duration.
5. "ctaLine": One sentence asking viewers to subscribe / comment / share. Natural, not pushy.
6. "hashtags": Array of 3-5 hashtag strings (include the # sign) relevant to the game and content.
7. "tags": Array of 15-20 YouTube search tags (no # sign, plain keywords).
8. "titleHook": 1-sentence summary of the curiosity gap or emotional hook in the title.

RULES:
- hookLines, bodyParagraph, chapters, ctaLine, and hashtags are SEPARATE fields — do NOT combine them into one string.
- Do NOT include social links or website URLs in any field — they are added automatically.
- Do NOT use placeholder text like "[TIMESTAMPS]" or "[YOUR LINK HERE]".
- Ensure tone is energetic and matches gaming content.`;

      const prompt = await withCreatorVoice(userId, basePrompt);

      const aiResult = await executeRoutedAICall(
        { taskType: "vod_seo", userId, priority: "medium" },
        "You are an SEO expert for YouTube. Respond with valid JSON only.",
        prompt
      );

      const optimized = safeParseJSON(aiResult.content, {} as any);

      // Build the description from structured fields so formatting is always correct.
      // If the AI returned the legacy flat string, reformat it as a fallback.
      let finalDescription: string;
      if (optimized.hookLines || optimized.bodyParagraph || optimized.chapters) {
        const parts: DescriptionParts = {
          hookLines: Array.isArray(optimized.hookLines) ? optimized.hookLines : [optimized.hookLines || ""].filter(Boolean),
          bodyParagraph: optimized.bodyParagraph || "",
          chapters: Array.isArray(optimized.chapters) ? optimized.chapters : [],
          ctaLine: optimized.ctaLine || "",
          hashtags: Array.isArray(optimized.hashtags) ? optimized.hashtags : [],
        };
        finalDescription = buildDescription(parts);
      } else if (optimized.optimizedDescription) {
        // Legacy fallback: reformat the flat string
        finalDescription = reformatRawDescription(optimized.optimizedDescription);
      } else {
        finalDescription = video.description || "";
      }

      logger.info(`[VODSEOOptimizer] Applying optimized metadata to video ${videoId}`);
      
      await storage.updateVideo(videoId, {
        title: optimized.optimizedTitle || video.title,
        description: finalDescription,
        metadata: {
          ...video.metadata,
          tags: optimized.tags || video.metadata?.tags || [],
          aiOptimized: true,
          aiOptimizedAt: new Date().toISOString(),
          seoTitleHook: optimized.titleHook || null,
        } as any
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
