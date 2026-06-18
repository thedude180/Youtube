/**
 * Back Catalog SEO Engine
 *
 * Uses leftover YouTube quota (after uploads) to improve the title,
 * description, and tags of the worst-performing back-catalog videos.
 *
 * Budget: max 30 videos/day × 50 units = 1,500 units (backlogWrite tier)
 * Priority: lowest view-count videos first (worst performers need the most help)
 * Gate: always checks canAffordOperation('backlogWrite') before each update
 * Cool-down: skips videos updated within the last 7 days (lastOptimizedAt)
 * Hook: called 30 min after the midnight quota-reset publisher run
 */

import { db } from "../db";
import { eq, and, or, isNull, lt, asc } from "drizzle-orm";
import { backCatalogVideos } from "@shared/schema";
import { logger } from "../lib/logger";
import { canAffordOperation, isQuotaBreakerTripped } from "./youtube-quota-tracker";
import { getFocusGame } from "../lib/game-focus";
import { storage } from "../storage";
import { getOpenAIClientBackground } from "../lib/openai";
import { updateYouTubeVideo } from "../youtube";
import { recordEngineKnowledge } from "./knowledge-mesh";

const MAX_UPDATES_PER_DAY     = 30;
const REOPTIMIZE_AFTER_DAYS   = 7;
const INTER_UPDATE_PAUSE_MS   = 2500;

const _dailyUpdates  = new Map<string, { count: number; date: string }>();
const _running       = new Set<string>();
let   _lastRunAt: Date | null = null;

function todayKey(): string {
  return new Date().toISOString().slice(0, 10);
}
function getDailyCount(userId: string): number {
  const e = _dailyUpdates.get(userId);
  return e && e.date === todayKey() ? e.count : 0;
}
function incDailyCount(userId: string): void {
  const today = todayKey();
  const e = _dailyUpdates.get(userId);
  if (!e || e.date !== today) { _dailyUpdates.set(userId, { count: 1, date: today }); }
  else { e.count++; }
}

// ── AI SEO generation ────────────────────────────────────────────────────────

async function generateSeo(video: {
  title: string;
  description: string | null;
  gameName: string | null;
  durationSec: number | null;
  isVod: boolean | null;
}): Promise<{ title: string; description: string; tags: string[] } | null> {
  try {
    const openai = getOpenAIClientBackground();
    const focusGame = await getFocusGame().catch(() => video.gameName ?? "gaming");
    const game      = video.gameName ?? focusGame;
    const type      = video.isVod ? "stream VOD / replay" : "gameplay clip";
    const mins      = video.durationSec ? Math.round(video.durationSec / 60) : null;

    const prompt = `You are a YouTube SEO expert optimizing videos for the ET Gaming 274 channel (PS5 gaming, no commentary, no facecam).

Current metadata:
Title: ${video.title}
Game: ${game}
Type: ${type}${mins ? `\nDuration: ${mins} min` : ""}

Rewrite for maximum discoverability and click-through rate.
Rules:
- Title: 55–80 chars, factual, includes game name, sounds like a real gamer wrote it. No clickbait.
- Description: 180–300 chars, naturally mentions the game and what happens, ends with channel name.
- Tags: exactly 10 tags, mix of game-specific and broad gaming terms, all lowercase.

Respond with ONLY valid JSON (no markdown, no wrapping):
{"title":"...","description":"...","tags":["tag1","tag2","tag3","tag4","tag5","tag6","tag7","tag8","tag9","tag10"]}`;

    const res = await openai.chat.completions.create({
      model: "gpt-5",
      messages: [{ role: "user", content: prompt }],
      max_completion_tokens: 500,
      response_format: { type: "json_object" },
    });

    const raw    = (res.choices[0].message.content ?? "").trim();
    const parsed = JSON.parse(raw);
    if (!parsed.title || !parsed.description || !Array.isArray(parsed.tags)) return null;
    return {
      title:       String(parsed.title).slice(0, 100),
      description: String(parsed.description).slice(0, 500),
      tags:        parsed.tags.slice(0, 12).map(String),
    };
  } catch (err: any) {
    logger.warn(`[SeoEngine] AI generation error: ${err.message?.slice(0, 80)}`);
    return null;
  }
}

// ── Per-user run ─────────────────────────────────────────────────────────────

async function runForUser(userId: string): Promise<{ updated: number; skipped: number; errors: number }> {
  if (isQuotaBreakerTripped()) {
    logger.info("[SeoEngine] Quota breaker active — deferring SEO updates");
    return { updated: 0, skipped: 0, errors: 0 };
  }

  const daily = getDailyCount(userId);
  if (daily >= MAX_UPDATES_PER_DAY) {
    return { updated: 0, skipped: daily, errors: 0 };
  }

  const userChannels = await storage.getChannelsByUser(userId);
  const channel = userChannels.find(c => c.accessToken && c.platform === "youtube")
               ?? userChannels.find(c => c.platform === "youtube");
  if (!channel) return { updated: 0, skipped: 0, errors: 0 };

  const threshold = new Date(Date.now() - REOPTIMIZE_AFTER_DAYS * 86400_000);
  const remaining = MAX_UPDATES_PER_DAY - daily;

  // Worst performers first: lowest view count + not recently optimized
  const candidates = await db
    .select()
    .from(backCatalogVideos)
    .where(and(
      eq(backCatalogVideos.userId, userId),
      or(
        isNull(backCatalogVideos.lastOptimizedAt),
        lt(backCatalogVideos.lastOptimizedAt, threshold),
      ),
    ))
    .orderBy(asc(backCatalogVideos.viewCount))
    .limit(remaining);

  let updated = 0, skipped = 0, errors = 0;

  for (const video of candidates) {
    if (isQuotaBreakerTripped()) break;
    if (getDailyCount(userId) >= MAX_UPDATES_PER_DAY) break;

    const canAfford = await canAffordOperation(userId, "backlogWrite").catch(() => true);
    if (!canAfford) {
      logger.info(`[SeoEngine] Quota ceiling hit mid-batch (${updated} updated)`);
      break;
    }

    try {
      const seo = await generateSeo({
        title:       video.title,
        description: video.description,
        gameName:    video.gameName,
        durationSec: video.durationSec,
        isVod:       video.isVod,
      });

      if (!seo) { skipped++; continue; }

      await updateYouTubeVideo(
        channel.id,
        video.youtubeVideoId,
        { title: seo.title, description: seo.description, tags: seo.tags },
        "backlogWrite",
      );

      await db.update(backCatalogVideos)
        .set({ lastOptimizedAt: new Date(), title: seo.title, description: seo.description })
        .where(eq(backCatalogVideos.id, video.id));

      incDailyCount(userId);
      updated++;
      logger.info(`[SeoEngine] ✓ ${video.youtubeVideoId}: "${seo.title.slice(0, 50)}"`);

      // Feed the winning title pattern back to the learning brain — future SEO gets smarter each cycle
      recordEngineKnowledge(
        "back-catalog-seo-engine", userId,
        "seo_pattern", `winning_title:${(video.gameName ?? "gaming").slice(0, 40)}`,
        `Winning SEO title: "${seo.title}" (was: "${video.title.slice(0, 60)}")`,
        `youtube_id=${video.youtubeVideoId}, game=${video.gameName ?? "unknown"}`,
        62,
        { oldTitle: video.title, newTitle: seo.title, tags: seo.tags.slice(0, 5) },
      ).catch(() => {});

      await new Promise(r => setTimeout(r, INTER_UPDATE_PAUSE_MS));
    } catch (err: any) {
      if (err.code === "QUOTA_EXCEEDED" || err.code === "QUOTA_CAP") {
        logger.info("[SeoEngine] Quota limit hit — stopping");
        break;
      }
      logger.warn(`[SeoEngine] Error on ${video.youtubeVideoId}: ${err.message?.slice(0, 80)}`);
      errors++;
    }
  }

  logger.info(`[SeoEngine] ${userId}: updated=${updated} skipped=${skipped} errors=${errors}`);
  return { updated, skipped, errors };
}

// ── Public API ────────────────────────────────────────────────────────────────

export async function runBackCatalogSeoEngine(
  userId?: string,
): Promise<{ updated: number; skipped: number; errors: number }> {
  const users: string[] = userId
    ? [userId]
    : (await db.selectDistinct({ userId: backCatalogVideos.userId }).from(backCatalogVideos))
        .map(r => r.userId);

  let totalUpdated = 0, totalSkipped = 0, totalErrors = 0;

  for (const uid of users) {
    if (_running.has(uid)) { totalSkipped++; continue; }
    _running.add(uid);
    try {
      const r = await runForUser(uid);
      totalUpdated += r.updated;
      totalSkipped += r.skipped;
      totalErrors  += r.errors;
    } finally {
      _running.delete(uid);
    }
  }

  _lastRunAt = new Date();
  logger.info(`[SeoEngine] Run complete: updated=${totalUpdated} skipped=${totalSkipped} errors=${totalErrors}`);
  return { updated: totalUpdated, skipped: totalSkipped, errors: totalErrors };
}

export function getBackCatalogSeoStatus(userId?: string): {
  updatesToday: number;
  budgetRemaining: number;
  lastRunAt: Date | null;
  isRunning: boolean;
  maxPerDay: number;
} {
  const uid = userId ?? "";
  return {
    updatesToday:    getDailyCount(uid),
    budgetRemaining: Math.max(0, MAX_UPDATES_PER_DAY - getDailyCount(uid)),
    lastRunAt:       _lastRunAt,
    isRunning:       _running.has(uid),
    maxPerDay:       MAX_UPDATES_PER_DAY,
  };
}

export function initBackCatalogSeoEngine(): void {
  logger.info("[SeoEngine] Back Catalog SEO Engine ready — fires 30 min after midnight quota reset");
}
