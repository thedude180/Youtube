/**
 * back-catalog-reviver.ts
 * ─────────────────────────────────────────────────────────────────────────────
 * Weekly re-promotion engine.
 *
 * What it does:
 *   - Picks the top 5 back-catalog videos (highest totalRevivalScore, then
 *     viewCount) that haven't been promoted in the last 30 days.
 *   - AI-generates an engaging "throwback" community post featuring them.
 *   - Inserts the post into community_posts (status=published).
 *   - Records the revival timestamp in system_settings so the cooldown works.
 *
 * Runs immediately on init and then every 7 days.
 */

import { db } from "../db";
import { storage } from "../storage";
import { backCatalogVideos, communityPosts, systemSettings } from "@shared/schema";
import { eq, and, desc, isNotNull, or, lt, isNull, sql } from "drizzle-orm";
import { getFocusGame } from "../lib/game-focus";
import { getOpenAIClientBackground } from "../lib/openai";
import { logAutonomousAction } from "../lib/autonomous";
import { logger } from "../lib/logger";

const REVIVAL_INTERVAL_MS = 7 * 24 * 60 * 60 * 1000; // weekly
const PROMO_COOLDOWN_MS = 30 * 24 * 60 * 60 * 1000;  // 30 days per video
const TOP_N = 5;

let _interval: ReturnType<typeof setInterval> | null = null;
let _status: { running: boolean; lastRun?: string; lastCount?: number } = { running: false };

// ── system_settings helpers ───────────────────────────────────────────────────

async function readSetting(key: string): Promise<string | null> {
  try {
    const [row] = await db.select().from(systemSettings).where(eq(systemSettings.key, key)).limit(1);
    return row?.value ?? null;
  } catch { return null; }
}

async function writeSetting(key: string, value: string): Promise<void> {
  await db
    .insert(systemSettings)
    .values({ key, value, updatedAt: new Date() })
    .onConflictDoUpdate({ target: systemSettings.key, set: { value, updatedAt: new Date() } });
}

// ── cycle ─────────────────────────────────────────────────────────────────────

async function runRevivalCycle(): Promise<void> {
  try {
    const allChannels = await storage.getChannels();
    const ytUserIds = [
      ...new Set(
        allChannels
          .filter(c => c.platform === "youtube" && c.accessToken)
          .map(c => c.userId),
      ),
    ];

    if (!ytUserIds.length) return;

    for (const userId of ytUserIds) {
      // Per-user weekly cooldown
      const lastRunKey = `back_catalog_reviver:last_run:${userId}`;
      const lastRun = await readSetting(lastRunKey);
      if (lastRun) {
        const elapsed = Date.now() - new Date(lastRun).getTime();
        if (elapsed < REVIVAL_INTERVAL_MS) {
          logger.debug(`[Reviver] Skipping user ${userId} — last run ${Math.round(elapsed / 3600000)}h ago`);
          continue;
        }
      }

      await reviveForUser(userId);
      await writeSetting(lastRunKey, new Date().toISOString());
    }

    _status.lastRun = new Date().toISOString();
  } catch (err: any) {
    logger.error(`[Reviver] Cycle error: ${err.message}`);
  }
}

async function reviveForUser(userId: string): Promise<void> {
  try {
    const cooldownCutoff = new Date(Date.now() - PROMO_COOLDOWN_MS);

    // Top back-catalog videos not revived in 30 days
    // We track revival via system_settings per video: "reviver:video:<userId>:<ytVideoId>"
    const candidates = await db
      .select()
      .from(backCatalogVideos)
      .where(
        and(
          eq(backCatalogVideos.userId, userId),
          isNotNull(backCatalogVideos.youtubeVideoId),
        ),
      )
      .orderBy(desc(backCatalogVideos.totalRevivalScore), desc(backCatalogVideos.viewCount))
      .limit(50);

    if (!candidates.length) {
      logger.info(`[Reviver] No eligible videos for user ${userId}`);
      return;
    }

    // Filter out recently revived
    const eligible: typeof candidates = [];
    for (const v of candidates) {
      if (eligible.length >= TOP_N) break;
      const key = `reviver:video:${userId}:${v.youtubeVideoId}`;
      const lastRevived = await readSetting(key);
      if (!lastRevived || new Date(lastRevived) < cooldownCutoff) {
        eligible.push(v);
      }
    }

    if (!eligible.length) {
      logger.info(`[Reviver] All top videos in cooldown for user ${userId}`);
      return;
    }

    const focusGame = await getFocusGame();
    const openai = getOpenAIClientBackground();

    const videoList = eligible
      .map(v => `"${(v.title ?? "Untitled").slice(0, 60)}" (${(v.viewCount ?? 0).toLocaleString()} views)`)
      .join("; ");

    const res = await openai.chat.completions.create({
      model: "gpt-4o-mini",
      messages: [{
        role: "user",
        content: `Write a YouTube community post for ET Gaming 274, a PS5 ${focusGame} no-commentary channel.
Purpose: throwback / re-promotion of our best older clips.
Top clips to feature: ${videoList}
Tone: warm, authentic, like a creator reconnecting with their audience — not salesy.
Reference specific moments if possible (even invented ones that feel real).
Max 400 characters. No hashtags.`,
      }],
      max_completion_tokens: 200,
    });

    const content = res.choices[0].message.content?.trim();
    if (!content) return;

    await db.insert(communityPosts).values({
      userId,
      platform: "youtube",
      content,
      type: "text",
      status: "published",
      publishedAt: new Date(),
      aiGenerated: true,
    });

    // Mark each video as revived
    for (const v of eligible) {
      await writeSetting(`reviver:video:${userId}:${v.youtubeVideoId}`, new Date().toISOString());
    }

    await logAutonomousAction({
      userId,
      engine: "back-catalog-reviver",
      action: "revival_post",
      reasoning: `Revived ${eligible.length} top back-catalog videos via community post`,
      payload: { videoIds: eligible.map(v => v.youtubeVideoId), content },
    });

    _status.lastCount = eligible.length;
    logger.info(`[Reviver] Posted revival for ${eligible.length} videos — user ${userId}`);
  } catch (err: any) {
    logger.error(`[Reviver] User ${userId} error: ${err.message}`);
  }
}

// ── public API ────────────────────────────────────────────────────────────────

export function initBackCatalogReviver(): void {
  if (_interval) return;
  _status.running = true;
  logger.info("[Reviver] Initialized — weekly back-catalog re-promotion active");
  runRevivalCycle().catch(e => logger.error(`[Reviver] Initial cycle: ${e.message}`));
  _interval = setInterval(
    () => runRevivalCycle().catch(e => logger.error(`[Reviver] Cycle: ${e.message}`)),
    REVIVAL_INTERVAL_MS,
  );
}

export function getRevivalStatus() {
  return { ..._status };
}

export function stopBackCatalogReviver(): void {
  if (_interval) { clearInterval(_interval); _interval = null; }
  _status.running = false;
}
