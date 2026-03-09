import { db } from "./db";
import { autopilotQueue, channels } from "@shared/schema";
import { eq, and, lte, desc } from "drizzle-orm";
import { createLogger } from "./lib/logger";
import { recordLearningEvent } from "./learning-engine";

const logger = createLogger("performance-feedback");

async function fetchYouTubeAnalyticsForVideo(
  channelId: number,
  youtubeVideoId: string,
): Promise<{ views: number; estimatedMinutesWatched: number; averageViewDuration: number } | null> {
  try {
    const [channel] = await db.select().from(channels).where(eq(channels.id, channelId));
    if (!channel?.accessToken) return null;

    const endDate = new Date().toISOString().split("T")[0];
    const startDate = new Date(Date.now() - 30 * 86400_000).toISOString().split("T")[0];

    const url = `https://youtubeanalytics.googleapis.com/v2/reports?ids=channel==${channel.channelId}&startDate=${startDate}&endDate=${endDate}&metrics=views,estimatedMinutesWatched,averageViewDuration&filters=video==${youtubeVideoId}`;

    const res = await fetch(url, {
      headers: { Authorization: `Bearer ${channel.accessToken}` },
    });

    if (!res.ok) return null;

    const data = await res.json() as any;
    const row = data.rows?.[0];
    if (!row) return null;

    return {
      views: Number(row[0] || 0),
      estimatedMinutesWatched: Number(row[1] || 0),
      averageViewDuration: Number(row[2] || 0),
    };
  } catch (err) {
    logger.warn("YouTube Analytics fetch failed", { channelId, youtubeVideoId, error: String(err).substring(0, 200) });
    return null;
  }
}

export async function processPerformanceChecks(): Promise<{ processed: number }> {
  const now = new Date();
  let processed = 0;

  try {
    const dueItems = await db.select()
      .from(autopilotQueue)
      .where(and(
        eq(autopilotQueue.type, "performance-check"),
        eq(autopilotQueue.status, "pending"),
        lte(autopilotQueue.scheduledAt, now),
      ))
      .orderBy(autopilotQueue.scheduledAt)
      .limit(10);

    for (const item of dueItems) {
      try {
        const meta = item.metadata as any;
        const youtubeVideoId = meta?.youtubeVideoId;
        const channelId = meta?.channelId;
        const decisions = meta?.contentDecisions || {};

        if (!youtubeVideoId || !channelId) {
          await db.update(autopilotQueue)
            .set({ status: "failed", errorMessage: "Missing youtubeVideoId or channelId" })
            .where(eq(autopilotQueue.id, item.id));
          continue;
        }

        const analytics = await fetchYouTubeAnalyticsForVideo(channelId, youtubeVideoId);

        if (analytics) {
          const { views, estimatedMinutesWatched, averageViewDuration } = analytics;

          const gameName = decisions.gameName as string || "unknown";
          const titlePattern = decisions.titlePattern as string || "unknown";
          const uploadHour = decisions.uploadHour as number ?? -1;
          const segmentCount = decisions.segmentCount as number || 0;
          const sourceDuration = decisions.sourceDuration as number || 0;

          const retentionRate = sourceDuration > 0
            ? Math.min(1, averageViewDuration / Math.min(sourceDuration, 900))
            : 0;

          const performanceScore = Math.min(1, (Math.log10(views + 1) / 5) * 0.4 + retentionRate * 0.4 + (estimatedMinutesWatched > 0 ? 0.2 : 0));

          await recordLearningEvent(
            item.userId,
            "video_performance",
            `highlight_reel_${gameName}`,
            {
              finding: `${gameName} highlight reel got ${views} views with ${Math.round(retentionRate * 100)}% avg retention`,
              evidence: [
                `Views: ${views}`,
                `Avg view duration: ${Math.round(averageViewDuration)}s`,
                `Estimated watch time: ${Math.round(estimatedMinutesWatched)} mins`,
                `Upload hour: ${uploadHour}`,
                `Segments: ${segmentCount}`,
                `Title: "${titlePattern}"`,
              ],
              recommendation: views > 500
                ? `${gameName} highlight reels perform well — prioritize this game for smart edits`
                : `Low views on ${gameName} highlight — try different segment selection or posting time`,
              performanceImpact: performanceScore,
              platform: "youtube",
            },
          );

          if (uploadHour >= 0) {
            await recordLearningEvent(
              item.userId,
              "upload_timing",
              `hour_${uploadHour}_performance`,
              {
                finding: `Uploading at hour ${uploadHour} yielded ${views} views`,
                evidence: [`Upload hour: ${uploadHour}:00`, `Views: ${views}`, `Retention: ${Math.round(retentionRate * 100)}%`],
                recommendation: views > 1000
                  ? `Hour ${uploadHour} is a strong upload time — prioritise it`
                  : `Consider testing different upload times`,
                performanceImpact: performanceScore,
                platform: "youtube",
              },
            );
          }

          logger.info("Performance check recorded", {
            youtubeVideoId,
            views,
            averageViewDuration,
            gameName,
            performanceScore: Math.round(performanceScore * 100),
          });
        } else {
          logger.debug("No analytics data yet, re-scheduling", { youtubeVideoId });
          await db.update(autopilotQueue)
            .set({ scheduledAt: new Date(Date.now() + 12 * 60 * 60_000) })
            .where(eq(autopilotQueue.id, item.id));
          continue;
        }

        await db.update(autopilotQueue)
          .set({ status: "done", publishedAt: now })
          .where(eq(autopilotQueue.id, item.id));

        processed++;
      } catch (err) {
        logger.error("Performance check item failed", { id: item.id, error: String(err).substring(0, 200) });
        await db.update(autopilotQueue)
          .set({ status: "failed", errorMessage: String(err).substring(0, 300) })
          .where(eq(autopilotQueue.id, item.id));
      }
    }
  } catch (err) {
    logger.error("processPerformanceChecks failed", { error: String(err).substring(0, 200) });
  }

  return { processed };
}

let performanceFeedbackInterval: ReturnType<typeof setInterval> | null = null;

export function startPerformanceFeedbackEngine(): void {
  if (performanceFeedbackInterval) return;

  logger.info("Performance feedback engine starting");

  processPerformanceChecks().catch(err =>
    logger.warn("Initial performance check failed", { error: String(err).substring(0, 200) })
  );

  performanceFeedbackInterval = setInterval(() => {
    processPerformanceChecks().catch(err =>
      logger.warn("Scheduled performance check failed", { error: String(err).substring(0, 200) })
    );
  }, 60 * 60_000);
}

export function stopPerformanceFeedbackEngine(): void {
  if (performanceFeedbackInterval) {
    clearInterval(performanceFeedbackInterval);
    performanceFeedbackInterval = null;
  }
}
