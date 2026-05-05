/**
 * TikTok Clip Auto-Publisher — DISABLED
 *
 * CreatorOS operates in YouTube-only mode. All TikTok auto-publish intervals
 * and bootstrappers are no-ops. No TikTok intervals are created.
 */
import { createLogger } from "../lib/logger";

const logger = createLogger("tiktok-autopublisher");

export async function startTikTokAutopublisher(_userId: string): Promise<void> {
  logger.info("[TikTok] startTikTokAutopublisher — disabled (YouTube-only mode)");
}

export function stopTikTokAutopublisher(_userId: string): void {}

export function getTikTokAutopublisherStatus(_userId: string) {
  return { active: false, lastRunAt: null, clipsPublished: 0, clipsAttempted: 0, lastError: null };
}

export async function bootstrapTikTokAutopublishers(): Promise<void> {
  logger.info("[TikTok] bootstrapTikTokAutopublishers — disabled (YouTube-only mode)");
}

export async function initTikTokAutopublisherForUser(_userId: string): Promise<void> {
  logger.info("[TikTok] initTikTokAutopublisherForUser — disabled (YouTube-only mode)");
}
