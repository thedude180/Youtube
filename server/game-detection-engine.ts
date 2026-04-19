import { db } from "./db";
import { videos, users, channels, aiAgentTasks, autopilotQueue } from "@shared/schema";
import { eq, and, sql, isNotNull, inArray } from "drizzle-orm";
import { createLogger } from "./lib/logger";
import { detectGameFromFrames } from "./smart-edit-engine";
import { downloadSourceVideo } from "./clip-video-processor";
import { generateVideoMetadata } from "./ai-engine";
import { lookupGameFromWeb, loadLearnedGames, detectGameFromLearned, persistGameToDatabase, lookupGameWithAI } from "./services/web-game-lookup";
import * as fs from "fs";

const logger = createLogger("game-detection-engine");

const CYCLE_INTERVAL_MS = 60 * 60_000;
const BATCH_SIZE = 10;
const DELAY_BETWEEN_VIDEOS_MS = 15_000;

async function sleep(ms: number) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

export async function runGameDetectionCycle(): Promise<void> {
  logger.info("Game detection cycle starting");

  try {
    const allUsers = await db.select({ id: users.id }).from(users).limit(50);

    for (const user of allUsers) {
      try {
        await processUserCatalog(user.id);
      } catch (err) {
        logger.error("Game detection cycle failed for user", { userId: user.id, error: String(err).substring(0, 200) });
      }
      await sleep(5000);
    }

    logger.info("Game detection cycle complete");
  } catch (err) {
    logger.error("Game detection cycle failed", { error: String(err).substring(0, 200) });
  }
}

async function processUserCatalog(userId: string): Promise<void> {
  const userChannels = await db.select({ id: channels.id }).from(channels)
    .where(eq(channels.userId, userId)).limit(20);
  if (userChannels.length === 0) return;

  const channelIds = userChannels.map(c => c.id);
  const userVideos = await db.select().from(videos)
    .where(inArray(videos.channelId, channelIds))
    .limit(200);

  const needsDetection = userVideos.filter(v => {
    const meta = (v.metadata || {}) as any;
    if (!meta.gameDetectionMethod) return true;
    if (meta.gameDetectionMethod === "vision" || meta.gameDetectionMethod === "web-lookup") return false;
    return true;
  });

  if (needsDetection.length === 0) {
    return;
  }

  logger.info("Processing undetected videos", { userId, count: needsDetection.length });

  const [agentTask] = await db.insert(aiAgentTasks).values({
    ownerId: userId,
    agentRole: "ai-editor",
    taskType: "auto_game_detection",
    title: `Auto game detection: ${needsDetection.length} videos`,
    status: "in_progress",
    startedAt: new Date(),
    payload: { totalVideos: needsDetection.length },
  }).returning();

  let processed = 0;
  let updated = 0;
  let errors = 0;

  for (const video of needsDetection.slice(0, BATCH_SIZE)) {
    try {
      const meta = (video.metadata || {}) as any;
      const youtubeVideoId = meta?.youtubeVideoId || meta?.youtube_id;
      if (!youtubeVideoId) {
        processed++;
        continue;
      }

      let newGame: string = "Unknown";
      let detectionMethod: string = "unknown";
      const oldGame = meta?.gameName || "Unknown";
      const searchText = `${video.title || ""} ${video.description || ""}`;

      const learnedMatch = detectGameFromLearned(searchText);
      if (learnedMatch) {
        newGame = learnedMatch;
        detectionMethod = "learned-db";
        await persistGameToDatabase(learnedMatch, "learned-cache");
        logger.info("Game matched from learned database — skipping download", { videoId: video.id, game: learnedMatch });
      } else {
        let sourcePath: string | null = null;

        try {
          sourcePath = await downloadSourceVideo(youtubeVideoId, userId);
        } catch {
          logger.info("Video download failed, using web lookup for game detection", { videoId: video.id });
        }

        if (sourcePath) {
          const visionResult = await detectGameFromFrames(
            sourcePath,
            video.title || "",
            video.description || "",
          );

          if (visionResult && visionResult !== "Unknown") {
            newGame = visionResult;
            detectionMethod = "vision";
            await persistGameToDatabase(visionResult, "vision");
          }

          try { fs.unlinkSync(sourcePath); } catch { }
        }

        if (newGame === "Unknown") {
          const webGame = await lookupGameFromWeb(searchText);
          if (webGame) {
            newGame = webGame;
            detectionMethod = "web-lookup";
            logger.info("Game identified via web lookup", { videoId: video.id, game: webGame });
          }
        }

        if (newGame === "Unknown") {
          const aiGame = await lookupGameWithAI(video.title || "", video.description || "");
          if (aiGame) {
            newGame = aiGame;
            detectionMethod = "ai-text-analysis";
            await persistGameToDatabase(aiGame, "ai-text-analysis");
            logger.info("Game identified via AI text analysis fallback", { videoId: video.id, game: aiGame });
          }
        }
      }

      if (newGame === "Unknown") {
        processed++;
        errors++;
        await sleep(DELAY_BETWEEN_VIDEOS_MS);
        continue;
      }

      await db.update(videos).set({
        metadata: {
          ...meta,
          gameName: newGame,
          gameDetectionMethod: detectionMethod,
          previousGameName: oldGame !== newGame ? oldGame : meta.previousGameName,
          gameDetectedAt: new Date().toISOString(),
        },
      }).where(eq(videos.id, video.id));

      if (newGame !== oldGame) {
        updated++;

        await db.insert(aiAgentTasks).values({
          ownerId: userId,
          agentRole: "ai-seo-manager",
          taskType: "seo_optimize",
          title: `Auto SEO repackage (${newGame}): ${(video.title || "").slice(0, 60)}`,
          status: "queued",
          priority: 5,
          payload: {
            videoId: video.id,
            videoTitle: video.title,
            videoDescription: video.description,
            platform: video.platform,
            metadata: { ...meta, gameName: newGame },
            redetectedGame: newGame,
            autoDetected: true,
          },
        });
      }

      processed++;

      logger.info("Game detected for video", {
        videoId: video.id,
        oldGame,
        newGame,
        method: detectionMethod,
        changed: oldGame !== newGame,
      });

      await sleep(DELAY_BETWEEN_VIDEOS_MS);
    } catch (err) {
      logger.error("Game detection failed for video", {
        videoId: video.id,
        error: String(err).substring(0, 200),
      });
      errors++;
      processed++;
    }
  }

  await db.update(aiAgentTasks).set({
    status: "completed",
    completedAt: new Date(),
    result: {
      processed,
      updated,
      errors,
      total: needsDetection.length,
      remaining: Math.max(0, needsDetection.length - BATCH_SIZE),
    },
  }).where(eq(aiAgentTasks.id, agentTask.id));

  logger.info("User catalog game detection batch done", {
    userId,
    processed,
    updated,
    errors,
    remaining: Math.max(0, needsDetection.length - BATCH_SIZE),
  });
}

let engineTimer: ReturnType<typeof setInterval> | null = null;

export function initGameDetectionEngine(): ReturnType<typeof setInterval> {
  logger.info("Game Detection Engine initialized — will run every 6 hours");

  loadLearnedGames().catch(err =>
    logger.warn("Failed to preload learned games", { error: String(err).substring(0, 200) })
  );

  runGameDetectionCycle().catch(err =>
    logger.error("Initial game detection cycle failed", { error: String(err).substring(0, 200) })
  );

  engineTimer = setInterval(() => {
    runGameDetectionCycle().catch(err =>
      logger.error("Scheduled game detection cycle failed", { error: String(err).substring(0, 200) })
    );
  }, CYCLE_INTERVAL_MS);

  return engineTimer;
}
