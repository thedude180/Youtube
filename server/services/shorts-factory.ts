import { creatorDNABuilder, withCreatorVoice } from "./creator-dna-builder";
import { isAutonomousMode, logAutonomousAction } from "../lib/autonomous";
import { jobQueue } from "./intelligent-job-queue";
import { createLogger } from "../lib/logger";

const logger = createLogger("shorts-factory");

export class ShortsFactory {
  /**
   * Identifies the best moments from a VOD and enqueues clipping jobs.
   * @AUTONOMOUS: High-impact content creation from stream data.
   */
  async process(userId: string, vodVideoId: number, gameTitle: string, duration?: string): Promise<void> {
    const autonomous = await isAutonomousMode(userId);
    if (!autonomous) {
      logger.info(`[ShortsFactory] Autonomous mode disabled for user ${userId}. Skipping shorts creation.`);
      return;
    }

    logger.info(`[ShortsFactory] Identifying best moments for VOD ${vodVideoId} (${gameTitle}) for user ${userId}`);

    try {
      // 1. Prepare AI Prompt
      const basePrompt = `Analyze the stream metadata for "${gameTitle}" (VOD ID: ${vodVideoId}).
Identify 6 high-engagement, viral-potential moments for short-form clips (Shorts/TikTok/Reels).
Focus on: high-action gameplay, funny reactions, or insightful commentary.

For each moment, provide:
1. Start timestamp (estimate based on duration: ${duration || "unknown"})
2. End timestamp (clips should be 15-60 seconds)
3. Catchy title for the clip
4. Reasoning for selection

Return a JSON array of objects with keys: "startTime", "endTime", "title", "reasoning".`;

      const prompt = await withCreatorVoice(userId, basePrompt);

      // 2. Call AI (Mocking the identify process as per task details to identify 6 moments)
      // In a real scenario, we'd pass more granular data like chat spikes or kill feeds if available.
      // For now, we follow the instruction: "AI identifies 6 best moments"
      
      const { getOpenAIClient } = await import("../lib/openai");
      const openai = getOpenAIClient();
      
      const response = await openai.chat.completions.create({
        model: "gpt-4o-mini",
        messages: [{ role: "user", content: prompt }],
        response_format: { type: "json_object" },
        max_tokens: 1000,
      });

      const result = JSON.parse(response.choices[0].message.content || '{"moments": []}');
      const moments = result.moments || [];

      logger.info(`[ShortsFactory] AI identified ${moments.length} moments for VOD ${vodVideoId}`);

      // 3. Enqueue jobs for each moment
      for (const moment of moments.slice(0, 6)) {
        await jobQueue.enqueue({
          type: "extract_and_publish_clip",
          userId,
          priority: 8,
          payload: {
            vodVideoId,
            gameTitle,
            startTime: moment.startTime,
            endTime: moment.endTime,
            title: moment.title,
            reasoning: moment.reasoning,
            isAutonomous: true
          },
        });
      }

      // 4. Log the autonomous action
      await logAutonomousAction({
        userId,
        engine: "shorts-factory",
        action: "identify_shorts",
        reasoning: `Identified ${moments.length} viral moments from ${gameTitle} stream.`,
        payload: { vodVideoId, momentsCount: moments.length },
        prompt,
        response: response.choices[0].message.content || "",
      });

    } catch (err: any) {
      logger.error(`[ShortsFactory] Error processing shorts for VOD ${vodVideoId}: ${err.message}`);
    }
  }
}

export const shortsFactory = new ShortsFactory();
