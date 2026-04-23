/**
 * Vault Clip Exhauster
 *
 * Fully autonomous pipeline piece: once a vault video is downloaded,
 * this service automatically queues stream editor jobs for every platform
 * that hasn't been processed yet (YouTube, Shorts, TikTok, Rumble).
 *
 * It runs in two modes:
 *  1. Immediate — called right after a vault download succeeds
 *  2. Periodic sweep — runs every 10 minutes to catch anything missed
 *
 * No human interaction required after tokens are verified.
 */

import { db } from "../db";
import { contentVaultBackups, streamEditJobs } from "@shared/schema";
import { eq, and, inArray, sql, ne } from "drizzle-orm";
import { createLogger } from "../lib/logger";
import { queueStreamEditJob } from "./stream-editor";

const logger = createLogger("vault-clip-exhauster");

const ALL_PLATFORMS = ["youtube", "shorts", "tiktok", "rumble"] as const;
type Platform = (typeof ALL_PLATFORMS)[number];

// Default clip duration: 60 minutes (processor will auto-split if needed)
const DEFAULT_CLIP_DURATION_MINS = 60;

// Default enhancements applied to every auto-created job
const DEFAULT_ENHANCEMENTS = {
  upscale4k: false,
  audioNormalize: true,
  colorEnhance: true,
  sharpen: false,
};

let isSweeping = false;

/**
 * Determine which platforms still need jobs for a given vault entry.
 * A platform is considered "covered" if a non-failed job exists that includes it.
 */
async function getMissingPlatforms(
  userId: string,
  vaultEntryId: number,
): Promise<Platform[]> {
  const existingJobs = await db
    .select({ platforms: streamEditJobs.platforms, status: streamEditJobs.status })
    .from(streamEditJobs)
    .where(
      and(
        eq(streamEditJobs.vaultEntryId, vaultEntryId),
        eq(streamEditJobs.userId, userId),
        // Ignore errored jobs so they can be re-queued for this vault entry
        ne(streamEditJobs.status as any, "error"),
      ),
    );

  const coveredPlatforms = new Set<string>();
  for (const job of existingJobs) {
    for (const p of (job.platforms ?? []) as string[]) {
      coveredPlatforms.add(p);
    }
  }

  return ALL_PLATFORMS.filter((p) => !coveredPlatforms.has(p));
}

/**
 * Queue clip jobs for all platforms not yet covered for a single vault entry.
 * Called immediately after a download finishes.
 */
export async function exhaustVaultEntry(
  userId: string,
  vaultEntryId: number,
): Promise<{ queued: Platform[]; skipped: Platform[] }> {
  try {
    const [entry] = await db
      .select()
      .from(contentVaultBackups)
      .where(
        and(
          eq(contentVaultBackups.id, vaultEntryId),
          eq(contentVaultBackups.userId, userId),
        ),
      )
      .limit(1);

    if (!entry || entry.status !== "downloaded") {
      logger.debug(`[Exhauster] Entry ${vaultEntryId} not downloaded yet — skipping`);
      return { queued: [], skipped: [...ALL_PLATFORMS] };
    }

    const missing = await getMissingPlatforms(userId, vaultEntryId);
    if (missing.length === 0) {
      logger.debug(`[Exhauster] Entry ${vaultEntryId} already covered on all platforms`);
      return { queued: [], skipped: [...ALL_PLATFORMS] };
    }

    logger.info(
      `[Exhauster] Auto-queueing clips for vault entry ${vaultEntryId} ` +
        `"${entry.title?.substring(0, 60) ?? "unknown"}" → ${missing.join(", ")}`,
    );

    await queueStreamEditJob(
      userId,
      vaultEntryId,
      missing as any,
      DEFAULT_CLIP_DURATION_MINS,
      DEFAULT_ENHANCEMENTS,
      true, // autoPublish = true — zero human interaction once tokens verified
    );

    return { queued: missing, skipped: ALL_PLATFORMS.filter((p) => !missing.includes(p)) };
  } catch (err: any) {
    logger.error(`[Exhauster] Failed to exhaust vault entry ${vaultEntryId}:`, err?.message);
    return { queued: [], skipped: [...ALL_PLATFORMS] };
  }
}

/**
 * Periodic sweep: find ALL downloaded vault entries that are missing clip
 * coverage for one or more platforms, and queue jobs for them.
 *
 * Processes up to `batchSize` entries per sweep to avoid overloading the
 * FFmpeg queue with hundreds of jobs at once.
 */
export async function runVaultExhaustSweep(batchSize = 50): Promise<void> {
  if (isSweeping) {
    logger.debug("[Exhauster] Sweep already running — skipping");
    return;
  }
  isSweeping = true;

  try {
    // Find all users that have channels
    const { channels } = await import("@shared/schema");
    const channelRows = await db
      .select({ userId: channels.userId })
      .from(channels)
      .where(sql`${channels.userId} IS NOT NULL`);

    const userIds = [...new Set(channelRows.map((r) => r.userId).filter(Boolean))] as string[];
    if (userIds.length === 0) return;

    for (const userId of userIds) {
      // Find downloaded entries for this user
      const downloadedEntries = await db
        .select({ id: contentVaultBackups.id })
        .from(contentVaultBackups)
        .where(
          and(
            eq(contentVaultBackups.userId, userId),
            eq(contentVaultBackups.status, "downloaded"),
            // Skip synthetic local entries
            sql`${contentVaultBackups.youtubeId} NOT LIKE 'local_%'`,
            sql`${contentVaultBackups.youtubeId} NOT LIKE 'clip_%'`,
          ),
        )
        .limit(500); // broad cap — sweeps all recently-downloaded entries

      let queued = 0;
      for (const { id } of downloadedEntries) {
        if (queued >= batchSize) break;

        const missing = await getMissingPlatforms(userId, id);
        if (missing.length === 0) continue;

        const result = await exhaustVaultEntry(userId, id);
        if (result.queued.length > 0) queued++;
      }

      if (queued > 0) {
        logger.info(`[Exhauster] Sweep: queued ${queued} new clip job(s) for user ${userId}`);
      }
    }
  } catch (err: any) {
    logger.error("[Exhauster] Sweep error:", err?.message);
  } finally {
    isSweeping = false;
  }
}

let sweepInterval: ReturnType<typeof setInterval> | null = null;

/**
 * Start the periodic sweep poller. Safe to call multiple times — only one
 * interval is ever registered.
 */
export function initVaultClipExhauster(): void {
  if (sweepInterval) return;

  logger.info("[Exhauster] Starting vault clip exhauster — polling every 10 minutes");

  // Run an initial sweep 2 minutes after boot so the stream editor queue
  // has time to warm up and avoid a thundering-herd on startup.
  setTimeout(() => {
    runVaultExhaustSweep().catch((e) =>
      logger.error("[Exhauster] Initial sweep failed:", e?.message),
    );
  }, 2 * 60_000);

  sweepInterval = setInterval(() => {
    runVaultExhaustSweep().catch((e) =>
      logger.error("[Exhauster] Periodic sweep failed:", e?.message),
    );
  }, 10 * 60_000); // every 10 minutes
}
