/**
 * channel-backup-sweeper.ts
 *
 * Full-channel safety backup: ensures every video in back_catalog_videos
 * has a vault entry so the perpetual-downloader can archive it to disk.
 *
 * These "backupOnly" vault entries are pure safety copies — they get
 * downloaded just like editorial entries but do NOT trigger the
 * vault-clip-exhauster (no Shorts / long-form generation). The goal is a
 * complete offline mirror of every ET Gaming 274 video as insurance against
 * channel bans, copyright strikes, or accidental deletions.
 *
 * Timing:
 *  • First sweep: 2 min after initChannelBackupSweeper() is called (T+42min
 *    in the boot chain) — by then the back-catalog-runner has already
 *    imported the full catalog at T+35min.
 *  • Subsequent sweeps: every 24 h to pick up new uploads.
 *
 * Each sweep creates entries for up to BATCH_SIZE catalog videos that don't
 * already have any vault entry. Newest uploads are indexed first.
 */

import { db } from "../db";
import { sql } from "drizzle-orm";
import { createLogger } from "../lib/logger";

const logger = createLogger("channel-backup-sweeper");

const BATCH_SIZE = 200;
let _started = false;

// ---------------------------------------------------------------------------
// Core sweep
// ---------------------------------------------------------------------------

export async function runChannelBackupSweep(): Promise<{ created: number; total: number }> {
  try {
    const [countRow] = await db.execute(sql`
      SELECT COUNT(*) AS n FROM back_catalog_videos
      WHERE youtube_video_id IS NOT NULL AND youtube_video_id != ''
    `) as unknown as any[];
    const total = parseInt(countRow?.n ?? "0", 10);

    // Insert vault entries for every catalog video not yet in the vault.
    // DISTINCT ON + ORDER BY youtube_video_id ensures we only touch each
    // YouTube ID once even if the catalog has duplicate rows.
    const result = await db.execute(sql`
      INSERT INTO content_vault_backups
        (user_id, content_id, youtube_id, platform, content_type,
         title, description, game_name, metadata, status,
         permanent_retention, created_at)
      SELECT DISTINCT ON (bcv.youtube_video_id)
        bcv.user_id,
        'backup:' || bcv.youtube_video_id,
        bcv.youtube_video_id,
        'youtube',
        CASE
          WHEN bcv.is_short = true THEN 'short'
          WHEN bcv.is_long_form = true OR bcv.is_vod = true THEN 'stream'
          ELSE 'vod'
        END,
        bcv.title,
        bcv.description,
        bcv.game_name,
        jsonb_build_object('backupOnly', true),
        'indexed',
        true,
        NOW()
      FROM back_catalog_videos bcv
      WHERE bcv.youtube_video_id IS NOT NULL
        AND bcv.youtube_video_id != ''
        AND NOT EXISTS (
          SELECT 1 FROM content_vault_backups existing
          WHERE existing.youtube_id = bcv.youtube_video_id
            AND existing.user_id   = bcv.user_id
        )
      ORDER BY bcv.youtube_video_id, bcv.published_at DESC NULLS LAST
      LIMIT ${BATCH_SIZE}
      ON CONFLICT DO NOTHING
    `);

    const created = (result as any).rowCount ?? 0;

    if (created > 0) {
      logger.info(
        `[BackupSweeper] Created ${created} new backup vault entries ` +
        `(channel total: ${total} videos, ${BATCH_SIZE - created} already indexed this batch)`,
      );
    } else {
      logger.debug(
        `[BackupSweeper] Sweep complete — all ${total} channel videos already have vault entries`,
      );
    }

    return { created, total };
  } catch (err: any) {
    logger.warn(`[BackupSweeper] Sweep error (non-fatal): ${err?.message?.slice(0, 200)}`);
    return { created: 0, total: 0 };
  }
}

// ---------------------------------------------------------------------------
// Status query (used by /api/vault/backup-status)
// ---------------------------------------------------------------------------

export async function getChannelBackupStatus(userId: string): Promise<{
  totalChannelVideos: number;
  backedUp: number;
  queued: number;
  failed: number;
  totalSizeBytes: number;
  percentComplete: number;
  recentDownloads: Array<{
    youtubeId: string;
    title: string;
    fileSize: number | null;
    downloadedAt: string | null;
    gameName: string | null;
  }>;
}> {
  try {
    const [totalRow] = await db.execute(sql`
      SELECT COUNT(*) AS n FROM back_catalog_videos
      WHERE user_id = ${userId}
        AND youtube_video_id IS NOT NULL AND youtube_video_id != ''
    `) as unknown as any[];
    const totalChannelVideos = parseInt(totalRow?.n ?? "0", 10);

    const [statsRow] = await db.execute(sql`
      SELECT
        COUNT(*) FILTER (WHERE status = 'downloaded')           AS backed_up,
        COUNT(*) FILTER (WHERE status IN ('indexed', 'queued')) AS queued,
        COUNT(*) FILTER (WHERE status = 'failed')               AS failed,
        COALESCE(SUM(file_size) FILTER (WHERE status = 'downloaded'), 0) AS total_size
      FROM content_vault_backups
      WHERE user_id = ${userId}
        AND (metadata->>'backupOnly')::boolean = true
    `) as unknown as any[];

    const backedUp         = parseInt(statsRow?.backed_up  ?? "0", 10);
    const queued           = parseInt(statsRow?.queued      ?? "0", 10);
    const failed           = parseInt(statsRow?.failed      ?? "0", 10);
    const totalSizeBytes   = parseInt(statsRow?.total_size  ?? "0", 10);
    const percentComplete  = totalChannelVideos > 0
      ? Math.round((backedUp / totalChannelVideos) * 100)
      : 0;

    const recentRows = await db.execute(sql`
      SELECT youtube_id, title, file_size, downloaded_at, game_name
      FROM content_vault_backups
      WHERE user_id = ${userId}
        AND (metadata->>'backupOnly')::boolean = true
        AND status = 'downloaded'
      ORDER BY downloaded_at DESC NULLS LAST
      LIMIT 12
    `) as unknown as any[];

    const rows = (recentRows as any).rows ?? recentRows;
    const recentDownloads = (Array.isArray(rows) ? rows : []).map((r: any) => ({
      youtubeId:   r.youtube_id,
      title:       r.title ?? "",
      fileSize:    r.file_size ? parseInt(String(r.file_size), 10) : null,
      downloadedAt: r.downloaded_at ? new Date(r.downloaded_at).toISOString() : null,
      gameName:    r.game_name ?? null,
    }));

    return { totalChannelVideos, backedUp, queued, failed, totalSizeBytes, percentComplete, recentDownloads };
  } catch (err: any) {
    logger.warn(`[BackupSweeper] Status query error: ${err?.message}`);
    return { totalChannelVideos: 0, backedUp: 0, queued: 0, failed: 0, totalSizeBytes: 0, percentComplete: 0, recentDownloads: [] };
  }
}

// ---------------------------------------------------------------------------
// Init / scheduler
// ---------------------------------------------------------------------------

export function initChannelBackupSweeper(): void {
  if (_started) return;
  _started = true;

  logger.info("[BackupSweeper] Starting — will index ALL channel videos for full safety backup");

  // 2-minute initial delay so the system is settled before the first sweep.
  // (Back-catalog-runner catalog import at T+35min has already run by T+42min.)
  setTimeout(async () => {
    await runChannelBackupSweep();

    // Repeat every 24 h to pick up new uploads.
    setInterval(() => {
      runChannelBackupSweep().catch((e: any) =>
        logger.warn("[BackupSweeper] Scheduled sweep error:", e?.message),
      );
    }, 24 * 60 * 60_000);
  }, 2 * 60_000);
}
