import { isAutonomousMode, logAutonomousAction } from "../lib/autonomous";
import { withCreatorVoice } from "./creator-dna-builder";
import { storage } from "../storage";
import { createLogger } from "../lib/logger";
import { getOpenAIClient } from "../lib/openai";

const logger = createLogger("vod-seo-optimizer");

export class VODSEOOptimizer {
  /**
   * Optimizes VOD metadata (Title, Description, Tags, Chapters) using AI.
   * @AUTONOMOUS: Direct impact on searchability and CTR.
   */
  async optimize(userId: string, videoId: number): Promise<void> {
    const autonomous = await isAutonomousMode(userId);
    if (!autonomous) return;

    try {
      // 1. Fetch current video data
      const video = await storage.getVideo(videoId);
      if (!video) {
        logger.error(`[VODSEOOptimizer] Video ${videoId} not found`);
        return;
      }

      logger.info(`[VODSEOOptimizer] Optimizing metadata for video ${videoId}: ${video.title}`);

      // 2. Prepare AI Prompt
      const basePrompt = `You are an SEO expert for YouTube. Optimize the following video metadata:
Current Title: ${video.title}
Current Description: ${video.description || "None"}
Game/Category: ${video.metadata?.gameName || "Unknown"}

Return a JSON object with:
1. "optimizedTitle": Catchy, high-CTR title (max 100 chars)
2. "optimizedDescription": Engaging description with keywords and timestamps placeholder (max 5000 chars)
3. "tags": Array of 15-20 relevant tags
4. "chapters": Array of { "time": "MM:SS", "label": "Chapter Name" } (estimate 5-8 major chapters)

Ensure the tone matches the creator's DNA.`;

      const prompt = await withCreatorVoice(userId, basePrompt);

      // 3. Call AI
      const openai = getOpenAIClient();
      const response = await openai.chat.completions.create({
        model: "gpt-4o-mini",
        messages: [{ role: "user", content: prompt }],
        response_format: { type: "json_object" },
        max_tokens: 1500,
      });

      const optimized = JSON.parse(response.choices[0].message.content || "{}");

      // 4. Update via YouTube API (Mocking the update call for now as per instructions)
      // In a real implementation, we would use the youtube client to call videos.update
      logger.info(`[VODSEOOptimizer] Applying optimized metadata to video ${videoId}`);
      
      // Update local DB first
      await storage.updateVideo(videoId, {
        title: optimized.optimizedTitle || video.title,
        description: optimized.optimizedDescription || video.description,
        metadata: {
          ...video.metadata,
          tags: optimized.tags || video.metadata?.tags || [],
          aiOptimized: true,
          aiOptimizedAt: new Date().toISOString(),
          seoRecommendations: optimized.optimizedTitle ? [optimized.optimizedTitle] : []
        }
      });

      // 5. Log autonomous action
      await logAutonomousAction({
        userId,
        engine: "vod-seo-optimizer",
        action: "optimize_metadata",
        reasoning: "Improved SEO title, description, and tags based on creator DNA and content analysis.",
        payload: { videoId, title: optimized.optimizedTitle },
        prompt,
        response: response.choices[0].message.content || "",
      });

    } catch (err: any) {
      logger.error(`[VODSEOOptimizer] Error optimizing video ${videoId}: ${err.message}`);
    }
  }
}

export const vodSEOOptimizer = new VODSEOOptimizer();
