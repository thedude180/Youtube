/**
 * Migration: disable-non-youtube-channels
 *
 * Marks every channel row whose platform is NOT "youtube" as suspended
 * by stamping { _youtubeOnlyDisabled: true } into platformData.
 * Safe to run multiple times (idempotent).
 *
 * No schema change is required — the channels.platformData jsonb column
 * already accepts arbitrary keys.  Background services that respect the
 * YouTube-only contract already skip non-YouTube channels by platform
 * name; this stamp makes the intent visible in the DB for auditing.
 *
 * Usage (dev):
 *   npx ts-node --esm server/migrations/disable-non-youtube-channels.ts
 */

import { db } from "../db";
import { channels } from "@shared/schema";
import { eq } from "drizzle-orm";
import { createLogger } from "../lib/logger";

const logger = createLogger("migration:disable-non-youtube");

export async function disableNonYoutubeChannels(): Promise<{
  stampedCount: number;
  alreadyStamped: number;
  youtubeCount: number;
}> {
  logger.info("[Migration] Scanning channels for non-YouTube platforms...");

  const allChannels = await db
    .select({ id: channels.id, platform: channels.platform, platformData: channels.platformData })
    .from(channels);

  const nonYoutube = allChannels.filter(c => c.platform !== "youtube");
  const alreadyStamped = nonYoutube.filter(c => (c.platformData as any)?._youtubeOnlyDisabled === true).length;
  const toStamp = nonYoutube.filter(c => !(c.platformData as any)?._youtubeOnlyDisabled);
  const youtubeCount = allChannels.filter(c => c.platform === "youtube").length;

  logger.info(
    `[Migration] Found ${allChannels.length} total channels: ` +
    `${youtubeCount} YouTube, ` +
    `${toStamp.length} non-YouTube to stamp, ` +
    `${alreadyStamped} already stamped.`
  );

  if (toStamp.length === 0) {
    logger.info("[Migration] No changes needed — all non-YouTube channels already stamped.");
    return { stampedCount: 0, alreadyStamped, youtubeCount };
  }

  for (const ch of toStamp) {
    const existing = (ch.platformData || {}) as Record<string, any>;
    await db
      .update(channels)
      .set({ platformData: { ...existing, _youtubeOnlyDisabled: true } })
      .where(eq(channels.id, ch.id));
  }

  logger.info(
    `[Migration] Stamped ${toStamp.length} non-YouTube channel(s): ` +
    toStamp.map(c => `${c.platform}#${c.id}`).join(", ")
  );

  return { stampedCount: toStamp.length, alreadyStamped, youtubeCount };
}

// Allow direct execution as a script
if (process.argv[1] && process.argv[1].includes("disable-non-youtube-channels")) {
  disableNonYoutubeChannels()
    .then(result => {
      console.log("[Migration complete]", result);
      process.exit(0);
    })
    .catch(err => {
      console.error("[Migration failed]", err);
      process.exit(1);
    });
}
