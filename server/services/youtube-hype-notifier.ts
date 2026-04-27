import { db } from "../db";
import { videos } from "@shared/schema";
import { eq } from "drizzle-orm";
import { createLogger } from "../lib/logger";
import { notifyViaDiscord, sendDiscordWebhook, getNotificationPreferences } from "./notification-system";

const logger = createLogger("hype-notifier");

// YouTube Hype: available for channels with 500–500,000 subscribers.
// Viewers can Hype a video within the first 7 days of publication, pushing it onto
// a dedicated leaderboard and giving it a temporary ranking boost in the Explore feed.
// We fire this once per video as soon as the autonomous pipeline processes it.

export async function sendHypeNotification(params: {
  userId: string;
  videoId: number;
  videoTitle: string;
  youtubeVideoId?: string;
}): Promise<void> {
  const { userId, videoId, videoTitle, youtubeVideoId } = params;

  try {
    const [video] = await db.select().from(videos).where(eq(videos.id, videoId)).limit(1);
    if (!video) return;

    const meta = (video.metadata as any) || {};
    if (meta.hypeNotificationSentAt) return;

    const videoUrl = youtubeVideoId
      ? `https://www.youtube.com/watch?v=${youtubeVideoId}`
      : "";

    const prefs = await getNotificationPreferences(userId);
    if (!prefs.discordWebhookUrl) return;

    const daysUntilExpiry = 7;
    const expiresAt = new Date(Date.now() + daysUntilExpiry * 86_400_000);
    const expiresStr = expiresAt.toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric" });

    const sent = await sendDiscordWebhook(
      prefs.discordWebhookUrl,
      "⚡ Hype Window Open — 7 Days",
      `New video live: **"${videoTitle.slice(0, 120)}"**\n\nYouTube's **Hype feature** gives a free ranking boost in the Explore feed when fans Hype a video within 7 days of upload. Ask your community to Hype it now — this window closes **${expiresStr}**.${videoUrl ? `\n\n👉 ${videoUrl}` : ""}\n\n_Hyping is free for viewers and costs no quota._`,
      "info",
      [
        { name: "Window closes", value: expiresStr, inline: true },
        { name: "Boost type", value: "Explore feed leaderboard", inline: true },
        { name: "Eligible if", value: "Channel 500 – 500K subs", inline: true },
      ],
    );

    if (sent) {
      await db.update(videos).set({
        metadata: { ...meta, hypeNotificationSentAt: new Date().toISOString() },
      }).where(eq(videos.id, videoId));

      logger.info("Hype notification sent", { videoId, title: videoTitle.slice(0, 60) });
    }
  } catch (err) {
    logger.warn("Hype notification skipped (non-critical)", {
      videoId,
      error: String(err).slice(0, 100),
    });
  }
}
