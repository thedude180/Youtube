import { autopilotRepo } from "./repository.js";
import { channelRepo } from "../channels/repository.js";
import { sseEmit } from "../../core/sse.js";
import { aiRoute } from "../../ai/router.js";
import { badRequest } from "../../core/errors.js";
import { createLogger } from "../../core/logger.js";
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
      throw new Error(`${item.platform} channel not connected for user ${item.userId}`);
    }

    const payload = item.payload as Record<string, unknown>;

    switch (item.platform) {
      case "discord":
        return this.publishToDiscord(payload, channel.accessToken);

      case "youtube":
        // YouTube publishing requires uploading a video file — queue items for
        // YouTube should carry a vaultItemPath; skip here if missing
        if (!payload.vaultItemPath) throw new Error("YouTube post requires vaultItemPath in payload");
        throw new Error("YouTube upload not yet implemented in autopilot worker");

      case "tiktok":
        throw new Error("TikTok upload not yet implemented — requires TikTok Content Posting API");

      case "twitch":
        // Twitch is stream-only; posting is not applicable
        throw new Error("Twitch is a streaming platform — use the Stream page to go live");

      case "kick":
        throw new Error("Kick is a streaming platform — use the Stream page to go live");

      default:
        throw new Error(`Unknown platform: ${item.platform}`);
    }
  }

  async publishToDiscord(payload: Record<string, unknown>, _accessToken: string): Promise<string | null> {
    const webhookUrl = (payload.webhookUrl as string) ?? null;
    const channelId = process.env.DISCORD_CHANNEL_ID;
    const botToken = process.env.DISCORD_BOT_TOKEN;

    const message = { content: payload.content as string };

    if (webhookUrl) {
      const res = await fetch(webhookUrl, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(message),
      });
      if (!res.ok) throw new Error(`Discord webhook failed: ${res.status}`);
      const data = await res.json() as any;
      return data.id ?? null;
    }

    if (channelId && botToken) {
      const res = await fetch(`https://discord.com/api/v10/channels/${channelId}/messages`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bot ${botToken}` },
        body: JSON.stringify(message),
      });
      if (!res.ok) throw new Error(`Discord bot API failed: ${res.status}`);
      const data = await res.json() as any;
      return data.id ?? null;
    }

    throw new Error("No Discord webhook URL or DISCORD_BOT_TOKEN configured");
  }

  async computeOptimalSchedule(userId: string): Promise<Record<string, string[]>> {
    const result = await aiRoute({
      task: "content-strategy",
      background: true,
      prompt: `Based on typical YouTube gaming audience behavior, suggest optimal posting times for a PS5 no-commentary gaming channel. Return a JSON object mapping days of week to 2-3 recommended posting times (24h format). Example: {"monday": ["14:00", "20:00"]}`,
    });

    try {
      const cleaned = result.replace(/^```(?:json)?\n?/, "").replace(/\n?```$/, "").trim();
      return JSON.parse(cleaned);
    } catch {
      return {
        monday: ["14:00", "20:00"],
        wednesday: ["14:00"],
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
