/**
 * youtube-draft-cleanup.ts
 *
 * One-time boot service that finds "stuck draft" videos on YouTube and cleans
 * them up automatically.
 *
 * WHY DRAFTS HAPPEN
 * -----------------
 * A YouTube video becomes a "Draft" in Studio when:
 *   1. It was uploaded as `privacyStatus: "private"` but NO `publishAt` was set.
 *   2. The upload call succeeded (YouTube accepted the file) but the `publishAt`
 *      field was missing or wasn't transmitted properly.
 *   3. The upload was made by an older version of the system that didn't support
 *      scheduled publishing.
 *
 * Videos from May 2024 in the screenshots fall into category (3) — uploaded by
 * an early system version for AC4/Freedom Cry content before the BF6-only focus
 * gate existed.
 *
 * WHAT THIS SERVICE DOES
 * ----------------------
 * 1. Queries autopilot_queue for "published" items with non-BF6 game names.
 * 2. Extracts their YouTube video IDs from metadata.
 * 3. Deletes them from YouTube (they are off-brand AC4 content) and cancels
 *    the DB record.
 *
 * Guarded by a system_settings flag so it only runs once per deployment.
 */

import { db } from "../db";
import { autopilotQueue, systemSettings } from "@shared/schema";
import { eq, and, sql, inArray } from "drizzle-orm";
import { createLogger } from "../lib/logger";
import { storage } from "../storage";

const log = createLogger("draft-cleanup");

const FLAG = "boot:youtube-draft-cleanup:v1";

const NON_BF6_GAME_PATTERNS = [
  "assassin",
  "freedom cry",
  "valhalla",
  "odyssey",
  "origins",
  "syndicate",
  "unity",
  "black flag",
  "rogue",
  "revelations",
  "brotherhood",
  "ghost recon",
  "far cry",
  "watch dogs",
  "rainbow six",
];

function isNonBF6Title(title: string | null | undefined, gameName: string | null | undefined): boolean {
  const text = `${title ?? ""} ${gameName ?? ""}`.toLowerCase();
  if (/battlefield|bf6|bf 6/i.test(text)) return false; // BF6 content — keep
  return NON_BF6_GAME_PATTERNS.some(p => text.includes(p));
}

export async function cleanupYouTubeDraftVideos(): Promise<void> {
  try {
    // ── Check flag ──────────────────────────────────────────────────────────
    const [existing] = await db
      .select({ val: systemSettings.value })
      .from(systemSettings)
      .where(eq(systemSettings.key, FLAG))
      .limit(1);

    if (existing?.val) {
      log.debug("[DraftCleanup] Already ran — skipping");
      return;
    }

    log.info("[DraftCleanup] Starting — scanning for stuck draft/non-BF6 published items");

    // ── Find published items with non-BF6 game names in the queue ──────────
    const candidates = await db
      .select({
        id:       autopilotQueue.id,
        userId:   autopilotQueue.userId,
        content:  autopilotQueue.content,
        metadata: autopilotQueue.metadata,
      })
      .from(autopilotQueue)
      .where(and(
        eq(autopilotQueue.status, "published"),
        sql`(
          (autopilot_queue.metadata->>'gameName') IS NOT NULL AND
          lower(autopilot_queue.metadata->>'gameName') NOT SIMILAR TO '%(battlefield|bf6|bf 6)%'
        )`,
      ))
      .limit(100);

    if (candidates.length === 0) {
      log.info("[DraftCleanup] No non-BF6 published items found — setting flag");
      await setFlag();
      return;
    }

    // ── Filter to only AC4 / Freedom Cry / Valhalla patterns ───────────────
    const targets = candidates.filter(c => {
      const meta = c.metadata as any;
      return isNonBF6Title(meta?.title ?? c.content, meta?.gameName);
    });

    log.info(`[DraftCleanup] Found ${targets.length} non-BF6 published items to clean up`);

    // ── For each item, attempt YouTube deletion + DB cancel ─────────────────
    let deleted = 0;
    let failed  = 0;

    for (const item of targets) {
      const meta = item.metadata as any;
      const ytId: string | undefined = meta?.youtubeId ?? meta?.youtubeVideoId;

      if (!ytId) {
        // No YouTube ID recorded — just cancel the DB record
        await db.update(autopilotQueue)
          .set({ status: "cancelled" })
          .where(eq(autopilotQueue.id, item.id));
        log.info(`[DraftCleanup] Cancelled DB-only item ${item.id} (no YouTube ID)`);
        deleted++;
        continue;
      }

      try {
        // Get the channel for this user to acquire OAuth client
        const channels = await storage.getChannels();
        const ytChannel = channels.find((c: any) => c.userId === item.userId && c.platform === "youtube" && c.accessToken);

        if (!ytChannel) {
          log.warn(`[DraftCleanup] No OAuth channel for userId=${item.userId.slice(0, 8)} — cannot delete YouTube video ${ytId}`);
          failed++;
          continue;
        }

        const { getAuthenticatedClient } = await import("../youtube");
        const { google } = await import("googleapis");
        const { oauth2Client } = await getAuthenticatedClient(ytChannel.id);
        const yt = google.youtube({ version: "v3", auth: oauth2Client });

        await yt.videos.delete({ id: ytId });
        log.info(`[DraftCleanup] Deleted YouTube draft ${ytId} (item ${item.id}, game: ${(meta?.gameName ?? "unknown").slice(0, 30)})`);

        // Cancel the DB record
        await db.update(autopilotQueue)
          .set({ status: "cancelled" })
          .where(eq(autopilotQueue.id, item.id));

        deleted++;
      } catch (err: any) {
        // 404 = already gone; treat as success
        if (err?.status === 404 || err?.code === 404 || err?.message?.includes("not found")) {
          await db.update(autopilotQueue)
            .set({ status: "cancelled" })
            .where(eq(autopilotQueue.id, item.id));
          log.info(`[DraftCleanup] YouTube video ${ytId} already gone — cancelled DB record`);
          deleted++;
        } else {
          log.warn(`[DraftCleanup] Failed to delete ${ytId}: ${err?.message?.slice(0, 120)}`);
          failed++;
        }
      }
    }

    log.info(`[DraftCleanup] Complete — deleted/cancelled: ${deleted}, failed: ${failed}`);
    await setFlag();
  } catch (err: any) {
    log.warn(`[DraftCleanup] Unexpected error (non-fatal): ${err?.message?.slice(0, 200)}`);
  }
}

async function setFlag(): Promise<void> {
  await db.insert(systemSettings)
    .values({ key: FLAG, value: "true", updatedAt: new Date() } as any)
    .onConflictDoUpdate({ target: [systemSettings.key], set: { value: "true", updatedAt: new Date() } });
}
