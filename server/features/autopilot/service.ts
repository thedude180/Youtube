import { autopilotRepo } from "./repository.js";
import { channelRepo } from "../channels/repository.js";
import { sseEmit } from "../../core/sse.js";
import { aiRoute } from "../../ai/router.js";
import { badRequest, notFound } from "../../core/errors.js";
import { createLogger } from "../../core/logger.js";
import type { Platform } from "../../../shared/schema/index.js";

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

  async executePost(queueItemId: number): Promise<void> {
    const items = await autopilotRepo.listQueue(""); // we'll look up by id directly
    // This is called from the pg-boss worker which already has the full item
    log.info("Executing post", { queueItemId });
  }

  async publishToDiscord(payload: Record<string, unknown>, accessToken: string): Promise<string | null> {
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
      return data.id;
    }

    if (channelId && botToken) {
      const res = await fetch(`https://discord.com/api/v10/channels/${channelId}/messages`, {
        method: "POST",
        headers: { "Content-Type": "application/json", "Authorization": `Bot ${botToken}` },
        body: JSON.stringify(message),
      });
      if (!res.ok) throw new Error(`Discord bot API failed: ${res.status}`);
      const data = await res.json() as any;
      return data.id;
    }

    throw new Error("No Discord webhook or bot token configured");
  }

  async computeOptimalSchedule(userId: string): Promise<Record<string, string[]>> {
    const result = await aiRoute({
      task: "content-strategy",
      background: true,
      prompt: `Based on typical YouTube gaming audience behavior, suggest optimal posting times for a PS5 no-commentary gaming channel. Return a JSON object mapping days of week to 2-3 recommended posting times (24h format). Example: {"monday": ["14:00", "20:00"], "wednesday": ["16:00"], ...}`,
    });

    try {
      return JSON.parse(result);
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
