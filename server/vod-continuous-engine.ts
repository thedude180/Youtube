import { db } from "./db";
import {
  vodAutopilotConfig, videos, channels, contentClips, autopilotQueue,
} from "@shared/schema";
import { eq, and, desc, lt, notInArray, sql, gte, inArray } from "drizzle-orm";
import { createLogger } from "./lib/logger";
import { sanitizeForPrompt } from "./lib/ai-attack-shield";
import { getOpenAIClient } from "./lib/openai";
import { sendSSEEvent } from "./routes/events";
import { recordHeartbeat } from "./services/engine-heartbeat";

const logger = createLogger("vod-continuous");
const openai = getOpenAIClient();

const timers = new Map<string, ReturnType<typeof setTimeout>>();
let globalInitDone = false;

function humanDelay(minH: number, maxH: number): number {
  const minMs = minH * 3600_000;
  const maxMs = maxH * 3600_000;
  return minMs + Math.random() * (maxMs - minMs);
}

function peakHourSlot(index: number, total: number): Date {
  const now = new Date();
  const start = new Date(now);
  start.setHours(10, 0, 0, 0);
  if (start < now) start.setDate(start.getDate() + 1);
  const windowMs = 12 * 3600_000;
  const spacing = total > 1 ? windowMs / total : windowMs / 2;
  const jitter = (Math.random() - 0.5) * 900_000;
  return new Date(start.getTime() + index * spacing + jitter);
}

async function getConfig(userId: string) {
  const [cfg] = await db.select().from(vodAutopilotConfig).where(eq(vodAutopilotConfig.userId, userId));
  return cfg || null;
}

async function setStatus(userId: string, status: string, error?: string) {
  await db.update(vodAutopilotConfig).set({
    currentStatus: status,
    lastError: error || null,
    updatedAt: new Date(),
  }).where(eq(vodAutopilotConfig.userId, userId));
  sendSSEEvent(userId, "vod-autopilot", { status, error });
}

async function getAlreadyQueuedVideoIds(userId: string): Promise<Set<number>> {
  const queued = await db.select({ sourceVideoId: autopilotQueue.sourceVideoId })
    .from(autopilotQueue)
    .where(and(
      eq(autopilotQueue.userId, userId),
      sql`${autopilotQueue.type} IN ('vod-long-form', 'vod-short', 'vod-shorts-upload')`,
      gte(autopilotQueue.createdAt, new Date(Date.now() - 7 * 86400_000)),
    ));
  return new Set(queued.map(q => q.sourceVideoId).filter(Boolean) as number[]);
}

async function getTodayUploadCount(userId: string, type: "long" | "short"): Promise<number> {
  const midnight = new Date();
  midnight.setHours(0, 0, 0, 0);
  const queueType = type === "long" ? "vod-long-form" : "vod-short";
  const rows = await db.select({ count: sql<number>`count(*)` })
    .from(autopilotQueue)
    .where(and(
      eq(autopilotQueue.userId, userId),
      sql`${autopilotQueue.type} = ${queueType}`,
      gte(autopilotQueue.createdAt, midnight),
    ));
  return Number(rows[0]?.count ?? 0);
}

async function aiEditVideo(video: any): Promise<{ title: string; description: string; tags: string[]; thumbnailConcept: string }> {
  try {
    const resp = await openai.chat.completions.create({
      model: "gpt-4o-mini",
      messages: [{
        role: "system",
        content: `You are the world's #1 YouTube content editor. Given a video, produce an optimized title, SEO description, tags, and thumbnail concept that maximise CTR and watch time. Return JSON: { title: string, description: string, tags: string[], thumbnailConcept: string }.`,
      }, {
        role: "user",
        content: `Title: "${sanitizeForPrompt(video.title)}". Description: "${sanitizeForPrompt((video.description || "").slice(0, 400))}". Views: ${(video.metadata as any)?.viewCount || 0}. Duration: ${(video.metadata as any)?.duration || "unknown"}. Edit for maximum performance.`,
      }],
      max_completion_tokens: 6000,
      response_format: { type: "json_object" },
    });
    return JSON.parse(resp.choices[0]?.message?.content || "{}");
  } catch {
    return { title: video.title, description: video.description || "", tags: [], thumbnailConcept: "" };
  }
}

async function aiExtractShorts(video: any): Promise<Array<{ title: string; startSec: number; endSec: number; hook: string; viralScore: number }>> {
  try {
    const resp = await openai.chat.completions.create({
      model: "gpt-4o-mini",
      messages: [{
        role: "system",
        content: `You are a viral Shorts/TikTok extraction AI. Identify 3 viral-worthy moments from this video. Each must be 15-59 seconds, start with a strong hook, end with a cliffhanger or punchline. Return JSON: { shorts: [{ title, startSec, endSec, hook, viralScore }] }.`,
      }, {
        role: "user",
        content: `Video: "${sanitizeForPrompt(video.title)}" (${(video.metadata as any)?.duration || 600}s, ${(video.metadata as any)?.viewCount || 0} views). Description: ${sanitizeForPrompt((video.description || "").slice(0, 200))}. Extract the most viral moments.`,
      }],
      max_completion_tokens: 4000,
      response_format: { type: "json_object" },
    });
    const parsed = JSON.parse(resp.choices[0]?.message?.content || "{}");
    return (parsed.shorts || []).slice(0, 3);
  } catch {
    return [];
  }
}

async function runCycle(userId: string) {
  const cfg = await getConfig(userId);
  if (!cfg || !cfg.enabled) return;

  logger.info("[VOD-Continuous] Starting cycle", { userId });
  await setStatus(userId, "running");

  const alreadyQueued = await getAlreadyQueuedVideoIds(userId);
  const userChannels = await db.select({ id: channels.id, platform: channels.platform })
    .from(channels).where(eq(channels.userId, userId));
  const ytChannel = userChannels.find(c => c.platform === "youtube");
  const channelIds = userChannels.map(c => c.id);

  let longFormQueued = 0;
  let shortsQueued = 0;

  try {
    const todayLong = await getTodayUploadCount(userId, "long");
    const longFormBudget = Math.max(0, cfg.maxLongFormPerDay - todayLong);

    if (longFormBudget > 0 && ytChannel) {
      const candidateVideos = channelIds.length > 0 ? await db.select().from(videos)
        .where(and(
          inArray(videos.channelId, channelIds),
          lt(videos.createdAt, new Date(Date.now() - 7 * 86400_000)),
        ))
        .orderBy(desc(videos.createdAt))
        .limit(20) : [];

      const unprocessed = candidateVideos
        .filter(v => v.channelId && channelIds.includes(v.channelId) && !alreadyQueued.has(v.id))
        .slice(0, longFormBudget);

      for (let i = 0; i < unprocessed.length; i++) {
        const video = unprocessed[i];
        const edited = await aiEditVideo(video);
        const scheduledAt = peakHourSlot(i, unprocessed.length);

        await db.insert(autopilotQueue).values({
          userId,
          sourceVideoId: video.id,
          type: "vod-long-form",
          targetPlatform: "youtube",
          content: edited.description || video.description || "",
          caption: edited.title || video.title,
          status: "scheduled",
          scheduledAt,
          metadata: {
            originalTitle: video.title,
            optimizedTitle: edited.title,
            tags: edited.tags,
            thumbnailConcept: edited.thumbnailConcept,
            autoQueued: true,
            cycledAt: new Date().toISOString(),
          },
        });

        alreadyQueued.add(video.id);
        longFormQueued++;
        logger.info("[VOD-Continuous] Long-form queued", { userId, videoId: video.id, scheduledAt });
      }
    }

    const todayShorts = await getTodayUploadCount(userId, "short");
    const shortsBudget = Math.max(0, cfg.maxShortsPerDay - todayShorts);

    if (shortsBudget > 0) {
      const topVideos = channelIds.length > 0 ? await db.select().from(videos)
        .where(inArray(videos.channelId, channelIds))
        .orderBy(desc(videos.createdAt))
        .limit(10) : [];

      const processedVideoIds = new Set(
        (await db.select({ sourceVideoId: contentClips.sourceVideoId })
          .from(contentClips)
          .where(and(eq(contentClips.userId, userId), eq(contentClips.targetPlatform, "youtube-shorts"))))
          .map(c => c.sourceVideoId).filter(Boolean)
      );

      const unprocessedForShorts = topVideos
        .filter(v => !processedVideoIds.has(v.id) && !alreadyQueued.has(v.id))
        .slice(0, 3);

      let slotIndex = 0;
      for (const video of unprocessedForShorts) {
        if (shortsQueued >= shortsBudget) break;
        const shorts = await aiExtractShorts(video);

        for (const short of shorts) {
          if (shortsQueued >= shortsBudget) break;

          const [clip] = await db.insert(contentClips).values({
            userId,
            sourceVideoId: video.id,
            title: short.title || `Short from ${sanitizeForPrompt(video.title)}`,
            targetPlatform: "youtube-shorts",
            status: "pending",
            startTime: short.startSec || 0,
            endTime: short.endSec || 59,
            metadata: {
              hookLine: short.hook,
              viralScore: short.viralScore,
              autoExtracted: true,
              cycledAt: new Date().toISOString(),
            },
          }).returning();

          const targetPlatforms = (cfg.targetPlatforms || ["youtube"]).filter(p =>
            userChannels.some(c => c.platform === p)
          );
          const platforms = targetPlatforms.length > 0 ? targetPlatforms : ["youtube"];

          for (const platform of platforms) {
            const scheduledAt = peakHourSlot(slotIndex, shortsBudget);
            await db.insert(autopilotQueue).values({
              userId,
              sourceVideoId: video.id,
              type: "vod-short",
              targetPlatform: platform,
              content: short.hook || short.title,
              caption: short.title || `${sanitizeForPrompt(video.title)} #Shorts`,
              status: "scheduled",
              scheduledAt,
              metadata: {
                clipId: clip.id,
                startSec: short.startSec,
                endSec: short.endSec,
                viralScore: short.viralScore,
                autoQueued: true,
              },
            });
            slotIndex++;
            shortsQueued++;
          }
        }
      }

      logger.info("[VOD-Continuous] Shorts queued", { userId, count: shortsQueued });
    }

    const nextCycleMs = humanDelay(cfg.cycleIntervalHours * 0.8, cfg.cycleIntervalHours * 1.2);
    const nextCycleAt = new Date(Date.now() + nextCycleMs);

    await db.update(vodAutopilotConfig).set({
      lastCycleAt: new Date(),
      nextCycleAt,
      totalCyclesRun: (cfg.totalCyclesRun ?? 0) + 1,
      totalLongFormUploaded: (cfg.totalLongFormUploaded ?? 0) + longFormQueued,
      totalShortsUploaded: (cfg.totalShortsUploaded ?? 0) + shortsQueued,
      currentStatus: "idle",
      lastError: null,
      updatedAt: new Date(),
    }).where(eq(vodAutopilotConfig.userId, userId));

    sendSSEEvent(userId, "vod-autopilot", {
      status: "cycle_complete",
      longFormQueued,
      shortsQueued,
      nextCycleAt: nextCycleAt.toISOString(),
    });

    await recordHeartbeat("vodContinuousEngine", nextCycleMs);
    logger.info("[VOD-Continuous] Cycle complete", { userId, longFormQueued, shortsQueued, nextCycleAt });

    scheduleNextCycle(userId, nextCycleMs);
  } catch (err: any) {
    logger.error("[VOD-Continuous] Cycle error", { userId, error: err.message });
    await setStatus(userId, "error", err.message);
    const retryMs = 3600_000;
    scheduleNextCycle(userId, retryMs);
  }
}

function scheduleNextCycle(userId: string, delayMs: number) {
  const existing = timers.get(userId);
  if (existing) clearTimeout(existing);

  const timer = setTimeout(async () => {
    timers.delete(userId);
    const cfg = await getConfig(userId).catch(() => null);
    if (cfg?.enabled) {
      runCycle(userId).catch(err =>
        logger.error("[VOD-Continuous] Scheduled cycle failed", { userId, error: String(err) })
      );
    }
  }, delayMs);

  timers.set(userId, timer);
  logger.info("[VOD-Continuous] Next cycle scheduled", { userId, inMs: Math.round(delayMs / 60000) + "m" });
}

export async function enableVodAutopilot(userId: string, settings?: {
  maxLongFormPerDay?: number;
  maxShortsPerDay?: number;
  targetPlatforms?: string[];
  cycleIntervalHours?: number;
  minHoursBetweenUploads?: number;
  maxHoursBetweenUploads?: number;
}): Promise<VodAutopilotStatus> {
  const existing = await getConfig(userId);
  const now = new Date();
  const initialDelay = humanDelay(0.05, 0.25);
  const nextCycleAt = new Date(Date.now() + initialDelay);

  if (existing) {
    await db.update(vodAutopilotConfig).set({
      enabled: true,
      maxLongFormPerDay: settings?.maxLongFormPerDay ?? existing.maxLongFormPerDay,
      maxShortsPerDay: settings?.maxShortsPerDay ?? existing.maxShortsPerDay,
      targetPlatforms: (settings?.targetPlatforms ?? existing.targetPlatforms) as string[],
      cycleIntervalHours: settings?.cycleIntervalHours ?? existing.cycleIntervalHours,
      minHoursBetweenUploads: settings?.minHoursBetweenUploads ?? existing.minHoursBetweenUploads,
      maxHoursBetweenUploads: settings?.maxHoursBetweenUploads ?? existing.maxHoursBetweenUploads,
      currentStatus: "starting",
      nextCycleAt,
      updatedAt: now,
    }).where(eq(vodAutopilotConfig.userId, userId));
  } else {
    await db.insert(vodAutopilotConfig).values({
      userId,
      enabled: true,
      maxLongFormPerDay: settings?.maxLongFormPerDay ?? 1,
      maxShortsPerDay: settings?.maxShortsPerDay ?? 3,
      targetPlatforms: (settings?.targetPlatforms ?? ["youtube"]) as string[],
      cycleIntervalHours: settings?.cycleIntervalHours ?? 6,
      minHoursBetweenUploads: settings?.minHoursBetweenUploads ?? 2,
      maxHoursBetweenUploads: settings?.maxHoursBetweenUploads ?? 8,
      currentStatus: "starting",
      nextCycleAt,
    });
  }

  scheduleNextCycle(userId, initialDelay);
  logger.info("[VOD-Continuous] Enabled", { userId, firstCycleIn: Math.round(initialDelay / 60000) + "m" });
  return getVodAutopilotStatus(userId);
}

export async function disableVodAutopilot(userId: string): Promise<void> {
  const existing = timers.get(userId);
  if (existing) {
    clearTimeout(existing);
    timers.delete(userId);
  }
  await db.update(vodAutopilotConfig).set({
    enabled: false,
    currentStatus: "idle",
    updatedAt: new Date(),
  }).where(eq(vodAutopilotConfig.userId, userId));
  sendSSEEvent(userId, "vod-autopilot", { status: "disabled" });
  logger.info("[VOD-Continuous] Disabled", { userId });
}

export interface VodAutopilotStatus {
  enabled: boolean;
  currentStatus: string;
  lastCycleAt: Date | null;
  nextCycleAt: Date | null;
  totalCyclesRun: number;
  totalLongFormUploaded: number;
  totalShortsUploaded: number;
  maxLongFormPerDay: number;
  maxShortsPerDay: number;
  cycleIntervalHours: number;
  minHoursBetweenUploads: number;
  maxHoursBetweenUploads: number;
  targetPlatforms: string[];
  lastError: string | null;
  queuedToday: { longForm: number; shorts: number };
}

export async function getVodAutopilotStatus(userId: string): Promise<VodAutopilotStatus> {
  const cfg = await getConfig(userId);
  const todayLong = await getTodayUploadCount(userId, "long");
  const todayShorts = await getTodayUploadCount(userId, "short");

  if (!cfg) {
    return {
      enabled: false,
      currentStatus: "idle",
      lastCycleAt: null,
      nextCycleAt: null,
      totalCyclesRun: 0,
      totalLongFormUploaded: 0,
      totalShortsUploaded: 0,
      maxLongFormPerDay: 1,
      maxShortsPerDay: 3,
      cycleIntervalHours: 6,
      minHoursBetweenUploads: 2,
      maxHoursBetweenUploads: 8,
      targetPlatforms: ["youtube"],
      lastError: null,
      queuedToday: { longForm: todayLong, shorts: todayShorts },
    };
  }

  return {
    enabled: cfg.enabled,
    currentStatus: cfg.currentStatus,
    lastCycleAt: cfg.lastCycleAt,
    nextCycleAt: cfg.nextCycleAt,
    totalCyclesRun: cfg.totalCyclesRun,
    totalLongFormUploaded: cfg.totalLongFormUploaded,
    totalShortsUploaded: cfg.totalShortsUploaded,
    maxLongFormPerDay: cfg.maxLongFormPerDay,
    maxShortsPerDay: cfg.maxShortsPerDay,
    cycleIntervalHours: cfg.cycleIntervalHours,
    minHoursBetweenUploads: cfg.minHoursBetweenUploads,
    maxHoursBetweenUploads: cfg.maxHoursBetweenUploads,
    targetPlatforms: cfg.targetPlatforms as string[],
    lastError: cfg.lastError,
    queuedToday: { longForm: todayLong, shorts: todayShorts },
  };
}

export async function triggerCycleNow(userId: string): Promise<void> {
  const existing = timers.get(userId);
  if (existing) {
    clearTimeout(existing);
    timers.delete(userId);
  }
  runCycle(userId).catch(err =>
    logger.error("[VOD-Continuous] Manual trigger failed", { userId, error: String(err) })
  );
}

export async function initVodContinuousEngine() {
  if (globalInitDone) return;
  globalInitDone = true;

  try {
    const enabledConfigs = await db.select().from(vodAutopilotConfig)
      .where(eq(vodAutopilotConfig.enabled, true));

    for (const cfg of enabledConfigs) {
      const now = Date.now();
      const next = cfg.nextCycleAt ? new Date(cfg.nextCycleAt).getTime() : 0;
      const delayMs = next > now ? next - now : humanDelay(0.1, 0.5);
      scheduleNextCycle(cfg.userId, delayMs);
      logger.info("[VOD-Continuous] Restored user from DB", {
        userId: cfg.userId,
        nextIn: Math.round(delayMs / 60000) + "m",
      });
    }

    logger.info("[VOD-Continuous] Engine initialised", { activeUsers: enabledConfigs.length });
  } catch (err: any) {
    logger.error("[VOD-Continuous] Init failed", { error: err.message });
  }
}
