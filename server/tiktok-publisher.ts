/**
 * TikTok Publisher — DISABLED
 *
 * CreatorOS operates in YouTube-only mode. All TikTok publishing paths are
 * stubbed here so import chains don't break, but NO calls reach TikTok APIs.
 */
import { createLogger } from "./lib/logger";

const logger = createLogger("tiktok-publisher");

const DISABLED_MSG = "TikTok publishing disabled — CreatorOS operates in YouTube-only mode.";

export interface TikTokPublishResult {
  success: boolean;
  publishId?: string;
  error?: string;
}

export async function publishClipToTikTok(
  _clipId: number,
  _userId: string,
  _caption: string,
): Promise<TikTokPublishResult> {
  logger.info("[TikTok] publishClipToTikTok called — disabled (YouTube-only mode)");
  return { success: false, error: DISABLED_MSG };
}

export function optimizeCaptionForTikTok(caption: string): string {
  return caption;
}

export async function publishVideoToTikTok(
  _userId: string,
  _content: string,
  _metadata?: any,
): Promise<TikTokPublishResult> {
  logger.info("[TikTok] publishVideoToTikTok called — disabled (YouTube-only mode)");
  return { success: false, error: DISABLED_MSG };
}
