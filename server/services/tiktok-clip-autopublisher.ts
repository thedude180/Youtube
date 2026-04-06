'use strict';
import { db } from "../db";
import { contentClips } from "@shared/schema";
import { eq, and } from "drizzle-orm";
import { storage } from "../storage";
import { createLogger } from "../lib/logger";

const logger = createLogger("tiktok-autopublisher");

const PUBLISH_INTERVAL_MS = 10 * 60 * 1000;
const MAX_CLIPS_PER_RUN   = 3;
const DELAY_BETWEEN_CLIPS = 15_000;

interface PublisherState {
  userId: string;
  active: boolean;
  lastRunAt: Date | null;
  clipsPublished: number;
  clipsAttempted: number;
  lastError: string | null;
  intervalHandle: ReturnType<typeof setInterval> | null;
}

const publisherSessions = new Map<string, PublisherState>();

async function hasTikTokChannel(userId: string): Promise<boolean> {
  try {
    const userChannels = await storage.getChannelsByUser(userId);
    return userChannels.some((c: any) => c.platform === "tiktok" && c.accessToken);
  } catch {
    return false;
  }
}

async function publishPendingClips(userId: string): Promise<void> {
  const state = publisherSessions.get(userId);
  if (!state) return;

  state.lastRunAt = new Date();

  const connected = await hasTikTokChannel(userId);
  if (!connected) {
    logger.info(`[${userId}] No TikTok account connected — skipping run`);
    return;
  }

  const allClips = await storage.getContentClips(userId);
  const pending = allClips.filter(
    (c: any) =>
      (c.targetPlatform === "tiktok" || c.platform === "tiktok") &&
      (c.status === "pending" || c.status === "ai_ready")
  ).slice(0, MAX_CLIPS_PER_RUN);

  if (pending.length === 0) {
    logger.info(`[${userId}] No ready TikTok clips`);
    return;
  }

  logger.info(`[${userId}] Publishing ${pending.length} ready TikTok clip(s)`);

  const { publishClipToTikTok } = await import("../tiktok-publisher");

  for (let i = 0; i < pending.length; i++) {
    const clip = pending[i] as any;

    if (i > 0) {
      await new Promise(r => setTimeout(r, DELAY_BETWEEN_CLIPS));
    }

    state.clipsAttempted++;

    try {
      const caption = clip.description || clip.title || "Check this out!";
      const result = await publishClipToTikTok(clip.id, userId, caption);

      if (result.success) {
        await db
          .update(contentClips)
          .set({ status: "published", publishedAt: new Date() } as any)
          .where(and(eq(contentClips.id, clip.id), eq(contentClips.userId, userId)));

        state.clipsPublished++;
        state.lastError = null;
        logger.info(`[${userId}] Clip ${clip.id} published to TikTok (publishId: ${result.publishId})`);
      } else {
        await db
          .update(contentClips)
          .set({ status: "failed" } as any)
          .where(and(eq(contentClips.id, clip.id), eq(contentClips.userId, userId)));

        state.lastError = result.error || "Unknown error";
        logger.warn(`[${userId}] Clip ${clip.id} failed: ${result.error}`);
      }
    } catch (err: any) {
      state.lastError = err.message;
      logger.warn(`[${userId}] Clip ${clip.id} threw: ${err.message}`);

      const isPermanent = err.message?.includes("permanently inaccessible") ||
        err.message?.includes("permanently failed (cached)") ||
        (err.message?.includes("Video unavailable") && !err.message?.includes("Will retry"));
      if (isPermanent) {
        await db
          .update(contentClips)
          .set({ status: "failed" } as any)
          .where(and(eq(contentClips.id, clip.id), eq(contentClips.userId, userId)));
        logger.info(`[${userId}] Clip ${clip.id} permanently failed — marked as failed`);
      }
    }
  }
}

export async function startTikTokAutopublisher(userId: string): Promise<void> {
  const existing = publisherSessions.get(userId);
  if (existing?.intervalHandle) return;

  const state: PublisherState = {
    userId,
    active: true,
    lastRunAt: null,
    clipsPublished: 0,
    clipsAttempted: 0,
    lastError: null,
    intervalHandle: null,
  };
  publisherSessions.set(userId, state);

  setTimeout(() => publishPendingClips(userId).catch(() => {}), 20_000);

  state.intervalHandle = setInterval(() => {
    publishPendingClips(userId).catch((err: any) => {
      const s = publisherSessions.get(userId);
      if (s) s.lastError = err.message;
    });
  }, PUBLISH_INTERVAL_MS);

  logger.info(`[${userId}] TikTok auto-publisher started — scanning every ${PUBLISH_INTERVAL_MS / 60000} min`);
}

export function stopTikTokAutopublisher(userId: string): void {
  const state = publisherSessions.get(userId);
  if (state?.intervalHandle) {
    clearInterval(state.intervalHandle);
    state.intervalHandle = null;
    state.active = false;
    publisherSessions.delete(userId);
  }
}

export function getTikTokAutopublisherStatus(userId: string) {
  const state = publisherSessions.get(userId);
  if (!state) return { active: false, lastRunAt: null, clipsPublished: 0, clipsAttempted: 0, lastError: null };
  return {
    active: !!state.intervalHandle,
    lastRunAt: state.lastRunAt?.toISOString() ?? null,
    clipsPublished: state.clipsPublished,
    clipsAttempted: state.clipsAttempted,
    lastError: state.lastError,
    nextRunAt: state.lastRunAt
      ? new Date(state.lastRunAt.getTime() + PUBLISH_INTERVAL_MS).toISOString()
      : null,
  };
}

export async function bootstrapTikTokAutopublishers(): Promise<void> {
  try {
    const allUsers = await storage.getAllUsers();
    const paidUsers = allUsers.filter((u: any) => u.tier && u.tier !== "free");
    logger.info(`[TikTokAutopublisher] Bootstrapping for ${paidUsers.length} paid users`);

    for (let i = 0; i < paidUsers.length; i++) {
      const user = paidUsers[i];
      setTimeout(async () => {
        try {
          const hasChannel = await hasTikTokChannel(user.id);
          if (hasChannel) {
            await startTikTokAutopublisher(user.id);
            logger.info(`[TikTokAutopublisher] Started for ${user.id}`);
          }
        } catch (err: any) {
          logger.warn(`[TikTokAutopublisher] Bootstrap failed for ${user.id}: ${err.message}`);
        }
      }, i * 4_000);
    }
  } catch (err: any) {
    logger.warn(`[TikTokAutopublisher] Bootstrap error: ${err.message}`);
  }
}

export async function initTikTokAutopublisherForUser(userId: string): Promise<void> {
  try {
    const hasChannel = await hasTikTokChannel(userId);
    if (hasChannel) {
      await startTikTokAutopublisher(userId);
      logger.info(`[${userId}] TikTok auto-publisher initialized on connect`);
    }
  } catch (err: any) {
    logger.warn(`[TikTokAutopublisher] Init failed for ${userId}: ${err.message}`);
  }
}
