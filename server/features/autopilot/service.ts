import { autopilotRepo } from "./repository.js";
import { channelRepo } from "../channels/repository.js";
import { sseEmit } from "../../core/sse.js";
import { aiRoute } from "../../ai/router.js";
import { createLogger } from "../../core/logger.js";
import { publishToplatform } from "../pipeline/social-publisher.js";
import type { Platform, AutopilotQueueItem } from "../../../shared/schema/index.js";

const log = createLogger("autopilot");

export class AutopilotService {
  async enqueuePost(
    userId: string,
    platforms: Platform[],
    payload: Record<string, unknown>,
    scheduledAt?: Date,
    videoId?: number,
  ): Promise<number[]> {
    const ids: number[] = [];
    for (const platform of platforms) {
      const item = await autopilotRepo.enqueue({
        userId,
        videoId: videoId ?? null,
        platform,
        payload,
        scheduledAt: scheduledAt ?? null,
        status: "pending",
      });
      ids.push(item.id);
    }
    return ids;
  }

  /** Called by the pg-boss worker for each queue item. */
  async executePost(item: AutopilotQueueItem): Promise<string | null> {
    const channels = await channelRepo.findByUserId(item.userId);
    const channel = channels.find((c) => c.platform === item.platform && c.isActive);

    if (!channel || !channel.accessToken) {
      throw new Error(`${item.platform} not connected — add it in Settings → Platforms`);
    }

    const payload = item.payload as Record<string, unknown>;
    const platformData = (channel.platformData ?? {}) as Record<string, unknown>;

    // Stream-only platforms don't post social content
    if (item.platform === "twitch" || item.platform === "kick") {
      throw new Error(`${item.platform} is a streaming platform — use Stream page to go live`);
    }

    // YouTube video upload is handled by a dedicated upload flow
    if (item.platform === "youtube") {
      if (!payload.vaultItemPath && !payload.videoId) {
        throw new Error("YouTube post requires vaultItemPath or videoId in payload");
      }
      throw new Error("YouTube upload not yet implemented — connect YouTube and use the Pipeline page");
    }

    // All other social platforms use the unified publisher
    const postPayload = {
      text: (payload.content ?? payload.text ?? "") as string,
      imageUrl: payload.imageUrl as string | undefined,
      videoUrl: payload.videoUrl as string | undefined,
      linkUrl: payload.linkUrl as string | undefined,
      title: payload.title as string | undefined,
      subreddit: payload.subreddit as string | undefined,
    };

    const result = await publishToplatform(
      item.platform as any,
      postPayload,
      channel.accessToken,
      platformData,
    );

    log.info("Post published", { platform: item.platform, postId: result.postId });
    return result.postId;
  }

  async computeOptimalSchedule(userId: string): Promise<Record<string, string[]>> {
    const result = await aiRoute({
      task: "content-strategy",
      background: true,
      prompt: `Suggest optimal posting times for a PS5 no-commentary gaming channel. Consider peak gaming audience hours for YouTube, TikTok, Discord, Twitter, Instagram, and Reddit. Return JSON mapping days to 2-3 recommended times (24h format). Example: {"monday": ["14:00", "20:00"]}`,
    });

    try {
      const cleaned = result.replace(/^```(?:json)?\n?/, "").replace(/\n?```$/, "").trim();
      return JSON.parse(cleaned);
    } catch {
      return {
        monday: ["14:00", "20:00"],
        wednesday: ["14:00", "20:00"],
        friday: ["16:00", "20:00"],
        saturday: ["12:00", "18:00"],
        sunday: ["14:00", "19:00"],
      };
    }
  }

  async toggleAutopilot(userId: string, enabled: boolean): Promise<void> {
    await autopilotRepo.upsertConfig(userId, { enabled });
    log.info("Autopilot toggled", { userId, enabled });
    sseEmit(userId, "autopilot:status-changed", { enabled });
  }
}

export const autopilotService = new AutopilotService();
