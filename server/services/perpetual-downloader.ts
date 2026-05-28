/**
 * perpetual-downloader.ts
 *
 * Runs the full Download → Edit → Upload pipeline continuously,
 * exactly like a human editor's workflow:
 *
 *  1. DOWNLOAD — pulls every indexed vault video to local disk, one after the
 *     next, for as long as there are videos to download.  Uses yt-dlp to grab
 *     the complete file (not a section) — same as saving the video to your
 *     hard drive.
 *
 *  2. EDIT    — the moment a download finishes, vault-clip-exhauster
 *     automatically queues stream-editor jobs for every clip type: YouTube
 *     Shorts AND long-form.  This happens inside processVaultDownloads itself
 *     (it calls exhaustVaultEntry after each successful download).
 *
 *  3. UPLOAD  — stream-editor auto-publisher (every 5 min) + hourly publisher
 *     sweep pick up the queued clips and upload to YouTube when quota allows.
 *     The schedule grows automatically, forever.
 *
 * The cycle restarts every 3 minutes after finishing so it immediately picks
 * up any new videos indexed by the back-catalog runner or manual vault sync.
 */

import { db } from "../db";
import { channels, contentVaultBackups } from "@shared/schema";
import { eq, and, isNotNull, sql } from "drizzle-orm";
import { createLogger } from "../lib/logger";

const logger = createLogger("perpetual-downloader");

const DEV_BYPASS_USER = "dev_bypass_user";

let _loopTimer: ReturnType<typeof setTimeout> | null = null;
let _started = false;

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

async function getEligibleUserIds(): Promise<string[]> {
  try {
    const rows = await db
      .select({ userId: channels.userId })
      .from(channels)
      .where(and(
        eq(channels.platform, "youtube"),
        isNotNull(channels.accessToken),
      ));

    return [...new Set(
      rows
        .map(r => r.userId)
        .filter((id): id is string => !!id && id !== DEV_BYPASS_USER),
    )];
  } catch {
    return [];
  }
}

async function pendingDownloadCount(userId: string): Promise<number> {
  try {
    const result = await db
      .select({ n: sql<string>`COUNT(*)` })
      .from(contentVaultBackups)
      .where(and(
        eq(contentVaultBackups.userId, userId),
        sql`${contentVaultBackups.status} IN ('indexed','queued')`,
      ));
    return parseInt((result[0] as any)?.n ?? "0", 10);
  } catch {
    return 0;
  }
}

// ---------------------------------------------------------------------------
// Core cycle
// ---------------------------------------------------------------------------

async function runCycle(): Promise<void> {
  const userIds = await getEligibleUserIds();
  if (userIds.length === 0) return;

  // Import lazily to avoid circular-module issues at startup
  const { processVaultDownloads, isVaultDownloading } = await import("./video-vault");

  for (const userId of userIds) {
    // Skip if the vault processor is already running for any user
    // (it's a global mutex — only one can run at a time)
    if (isVaultDownloading()) {
      logger.debug("[PerpetualDownloader] Vault download already running — will pick up on next cycle");
      return;
    }

    const pending = await pendingDownloadCount(userId);
    if (pending === 0) {
      logger.debug(`[PerpetualDownloader] No pending downloads for ${userId}`);
      continue;
    }

    logger.info(`[PerpetualDownloader] Starting download cycle — ${pending} video(s) pending for ${userId}`);

    try {
      // This runs the full while(true) loop:
      //   for each indexed entry → download full video → exhaustVaultEntry (queues clips)
      // It only returns when all pending entries are done or max failures reached.
      await processVaultDownloads(userId);
      logger.info(`[PerpetualDownloader] Cycle complete for ${userId}`);
    } catch (err: any) {
      logger.warn(`[PerpetualDownloader] Cycle error for ${userId}: ${err?.message?.slice(0, 200)}`);
    }
  }
}

// ---------------------------------------------------------------------------
// Loop
// ---------------------------------------------------------------------------

function scheduleNextCycle(): void {
  // 3 minutes between cycles — short enough to pick up newly-indexed videos
  // quickly, long enough to avoid spinning when the vault is empty.
  _loopTimer = setTimeout(async () => {
    try {
      await runCycle();
    } catch (err: any) {
      logger.warn("[PerpetualDownloader] Loop error:", err?.message);
    } finally {
      scheduleNextCycle(); // always re-schedule, even after errors
    }
  }, 3 * 60_000);
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Start the perpetual download → edit → upload pipeline.
 * Safe to call multiple times — only one loop ever runs.
 */
export function initPerpetualDownloader(): void {
  if (_started) return;
  _started = true;

  logger.info("[PerpetualDownloader] Starting — vault downloads will run continuously");

  // First run: 3 minutes after boot so the vault index (back catalog import)
  // has time to finish adding entries before we start downloading.
  _loopTimer = setTimeout(async () => {
    try {
      await runCycle();
    } catch (err: any) {
      logger.warn("[PerpetualDownloader] Initial cycle error:", err?.message);
    } finally {
      scheduleNextCycle();
    }
  }, 3 * 60_000);
}

export function stopPerpetualDownloader(): void {
  if (_loopTimer) {
    clearTimeout(_loopTimer);
    _loopTimer = null;
  }
  _started = false;
}
