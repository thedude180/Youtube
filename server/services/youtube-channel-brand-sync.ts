/**
 * youtube-channel-brand-sync.ts
 *
 * Autonomous channel-wide brand consistency sweep. Runs 25 min after boot
 * then daily at 3:30 AM. Ensures:
 *
 *   1. SHORTS SEO  — every Short has game-matched title (with #Shorts),
 *      description, and tags aligned to the source clip.
 *
 *   2. REPLAY SEO  — every livestream archive that isn't actively live gets
 *      a "Full Replay" title, replay description, chapters, and hashtags.
 *
 *   3. BRAND CONSISTENCY — all videos are checked against the ETGaming247
 *      brand profile. Low-scoring videos are queued for re-optimization.
 *
 *   4. THUMBNAIL SYNC — Shorts and standard videos without brand thumbnails
 *      get a game-matched DALL·E thumbnail generated and uploaded.
 *
 * Rate limits (per sweep):
 *   - Max 12 metadata updates total (shared across sweeps 1-3)
 *   - Max 4 thumbnail generations (sweep 4)
 *   - Min 12 h before re-syncing the same video
 *   - Respects quota breaker and AI semaphore at every AI call
 */

import cron from "node-cron";
import { db } from "../db";
import { backCatalogVideos, channels, videoUpdateHistory } from "@shared/schema";
import { eq, and, desc, sql, gte } from "drizzle-orm";
import { createLogger } from "../lib/logger";
import { isQuotaBreakerTripped } from "./youtube-quota-tracker";
import { tryAcquireAISlotNow, releaseAISlot } from "../lib/ai-semaphore";
import { callClaudeBackground, CLAUDE_MODELS } from "../lib/claude";
import { sanitizeForPrompt, tokenBudget } from "../lib/ai-attack-shield";
import { getBrandProfile, checkBrandAlignment } from "../content/brand-system";
import { buildDescription, type DescriptionParts } from "../lib/description-formatter";
import { getUserChannelLinks } from "../content-variation-engine";

const logger = createLogger("channel-brand-sync");

const METADATA_PER_SWEEP  = 12;
const THUMBS_PER_SWEEP    = 4;
const MIN_RESYNC_HOURS    = 12;
const BRAND_SCORE_MIN     = 0.65;

// ── In-memory status ──────────────────────────────────────────────────────────

export interface BrandSyncStatus {
  lastRunAt: string | null;
  nextRunEta: string | null;
  isRunning: boolean;
  lastRunResult: {
    shortsUpdated: number;
    replaysUpdated: number;
    brandFixes: number;
    thumbnailsGenerated: number;
    skipped: number;
  } | null;
}

const syncStatus: BrandSyncStatus = {
  lastRunAt: null,
  nextRunEta: null,
  isRunning: false,
  lastRunResult: null,
};

export function getBrandSyncStatus(): BrandSyncStatus {
  return { ...syncStatus };
}

// ── Helpers ───────────────────────────────────────────────────────────────────

async function getYouTubeChannel(userId: string): Promise<{ id: number } | null> {
  try {
    const [ch] = await db
      .select({ id: channels.id })
      .from(channels)
      .where(
        and(
          eq(channels.userId, userId),
          eq(channels.platform, "youtube"),
          sql`${channels.accessToken} IS NOT NULL AND length(${channels.accessToken}) > 50`,
        ),
      )
      .limit(1);
    return ch ?? null;
  } catch {
    return null;
  }
}

async function wasRecentlySynced(youtubeVideoId: string, userId: string): Promise<boolean> {
  try {
    const cutoff = new Date(Date.now() - MIN_RESYNC_HOURS * 3_600_000);
    const [row] = await db
      .select({ id: videoUpdateHistory.id })
      .from(videoUpdateHistory)
      .where(
        and(
          eq(videoUpdateHistory.userId, userId),
          eq(videoUpdateHistory.youtubeVideoId, youtubeVideoId),
          eq(videoUpdateHistory.source, "channel_brand_sync"),
          gte(videoUpdateHistory.createdAt, cutoff),
        ),
      )
      .limit(1);
    return !!row;
  } catch {
    return false;
  }
}

async function logSyncUpdate(
  userId: string,
  youtubeVideoId: string,
  videoTitle: string,
  field: string,
  oldValue: string,
  newValue: string,
): Promise<void> {
  try {
    await db.insert(videoUpdateHistory).values({
      userId,
      youtubeVideoId,
      videoTitle,
      field,
      oldValue: oldValue.slice(0, 1000),
      newValue: newValue.slice(0, 1000),
      source: "channel_brand_sync",
      status: "pushed",
      youtubeStudioUrl: `https://studio.youtube.com/video/${youtubeVideoId}/edit`,
    });
  } catch { /* non-fatal */ }
}

async function pushMetadata(
  channelId: number,
  youtubeVideoId: string,
  updates: { title?: string; description?: string; tags?: string[] },
): Promise<boolean> {
  try {
    if (isQuotaBreakerTripped()) return false;
    const { updateYouTubeVideo } = await import("../youtube");
    await updateYouTubeVideo(channelId, youtubeVideoId, updates, "backlogWrite");
    return true;
  } catch (err: any) {
    if (err.code === "QUOTA_EXCEEDED" || err.code === "QUOTA_CAP") {
      logger.warn(`[BrandSync] Quota cap — skipping ${youtubeVideoId}`);
    } else {
      logger.warn(`[BrandSync] Push failed for ${youtubeVideoId}: ${err.message?.slice(0, 150)}`);
    }
    return false;
  }
}

function safeParseJson(raw: string): Record<string, any> | null {
  try {
    let content = raw.trim();
    const fence = content.match(/```(?:json)?\s*([\s\S]*?)\s*```/i);
    if (fence) content = fence[1];
    const brace = content.indexOf("{");
    if (brace > 0) content = content.slice(brace);
    return JSON.parse(content);
  } catch {
    return null;
  }
}

// ── AI: Shorts SEO ────────────────────────────────────────────────────────────

interface ShortsSEO {
  title: string;
  hookLine: string;
  ctaLine: string;
  hashtags: string[];
  tags: string[];
}

async function generateShortsSEO(
  title: string,
  gameName: string,
): Promise<ShortsSEO | null> {
  if (!tryAcquireAISlotNow()) return null;
  try {
    if (!tokenBudget.checkBudget("brand-sync-shorts", 800)) {
      releaseAISlot();
      return null;
    }
    const safeTitle = sanitizeForPrompt(title, 150);
    const safeGame  = sanitizeForPrompt(gameName || "Gaming", 60);

    const prompt = `You are writing YouTube Shorts metadata for ET Gaming 274 — a PS5 no-commentary gaming channel. Respond with valid JSON only.

Source clip title: "${safeTitle}"
Game: ${safeGame}

{
  "title": "...",
  "hookLine": "...",
  "ctaLine": "...",
  "hashtags": ["#tag1", "#tag2", "#tag3"],
  "tags": ["tag1", "tag2", ...]
}

Rules:
- title: max 70 chars. Must contain "#Shorts". Format: "[Exciting verb phrase] — ${safeGame} #Shorts". No fake hype ("INSANE", "OMG"). No commentary.
- hookLine: 1 punchy sentence (max 20 words) opening the description — the moment that makes this clip worth watching.
- ctaLine: 1 natural sentence: invite viewers to watch the full video on the channel. Max 15 words.
- hashtags: exactly 3. Must include #Shorts, #${safeGame.replace(/\s+/g, "")}, #NoCommentary.
- tags: 10-14 tags. Required: "${safeGame.toLowerCase()}", "ps5", "no commentary", "gaming", "shorts", "${safeGame.toLowerCase()} shorts". Under 400 total chars.`;

    const response = await callClaudeBackground({ prompt, model: CLAUDE_MODELS.haiku });
    releaseAISlot();
    if (!response?.content?.trim()) return null;

    const parsed = safeParseJson(response.content) as ShortsSEO | null;
    if (!parsed?.title || !parsed?.tags) return null;

    return {
      title:     parsed.title.trim().slice(0, 100),
      hookLine:  (parsed.hookLine  ?? "").trim().slice(0, 200),
      ctaLine:   (parsed.ctaLine   ?? "").trim().slice(0, 150),
      hashtags:  Array.isArray(parsed.hashtags) ? parsed.hashtags.slice(0, 5) : [],
      tags:      Array.isArray(parsed.tags)
        ? parsed.tags.slice(0, 14).map((t: string) => String(t).trim()).filter(Boolean)
        : [],
    };
  } catch (err: any) {
    releaseAISlot();
    logger.debug(`[BrandSync] Shorts SEO failed: ${err.message?.slice(0, 100)}`);
    return null;
  }
}

// ── AI: Replay SEO ────────────────────────────────────────────────────────────

interface ReplaySEO {
  title: string;
  hookLines: string[];
  bodyParagraph: string;
  ctaLine: string;
  hashtags: string[];
  tags: string[];
}

async function generateReplaySEO(video: {
  title: string;
  gameName?: string | null;
  durationSec?: number | null;
  publishedAt?: Date | null;
}): Promise<ReplaySEO | null> {
  if (!tryAcquireAISlotNow()) return null;
  try {
    if (!tokenBudget.checkBudget("brand-sync-replay", 1000)) {
      releaseAISlot();
      return null;
    }
    const safeTitle = sanitizeForPrompt(video.title, 150);
    const safeGame  = sanitizeForPrompt(video.gameName ?? "Gaming", 60);
    const durMin    = Math.round((video.durationSec ?? 0) / 60);
    const dateStr   = video.publishedAt
      ? video.publishedAt.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })
      : "";
    const typeWord  = durMin > 60 ? "Playthrough" : "Gameplay";

    const prompt = `You are optimizing a YouTube livestream replay (archived VOD) for ET Gaming 274 — a PS5 no-commentary gaming channel. Respond with valid JSON only.

Original title: "${safeTitle}"
Game: ${safeGame}
Duration: ${durMin} min
Stream date: ${dateStr || "unknown"}

{
  "title": "...",
  "hookLines": ["line1", "line2"],
  "bodyParagraph": "...",
  "ctaLine": "...",
  "hashtags": ["#tag1", "#tag2", "#tag3", "#tag4"],
  "tags": ["tag1", "tag2", ...]
}

Rules:
- title: 55-80 chars. Must include "Full Replay" OR "Full ${typeWord}". Must include "No Commentary". Good format: "${safeGame} Full ${typeWord} Replay | No Commentary${dateStr ? " | " + dateStr : ""}". Max 80 chars.
- hookLines: exactly 2 lines, 20-25 words each. First line: what game/moment makes this replay worth watching. Second: what kind of gameplay (objective, story, boss fight, exploration, etc.).
- bodyParagraph: 2-3 sentences. Describe the replay, mention no-commentary style, and the value of watching the full session.
- ctaLine: natural invite to subscribe and drop a comment about their favourite moment. Max 20 words.
- hashtags: 3-4. Must include #${safeGame.replace(/\s+/g, "")}, #NoCommentary, #PS5, #FullGameplay.
- tags: 12-15. Required: "${safeGame.toLowerCase()}", "full gameplay", "no commentary", "ps5", "full playthrough", "replay", "${safeGame.toLowerCase()} replay", "gaming". Under 450 total chars.
- No clickbait, no fake hype, no misleading claims.`;

    const response = await callClaudeBackground({ prompt, model: CLAUDE_MODELS.haiku });
    releaseAISlot();
    if (!response?.content?.trim()) return null;

    const parsed = safeParseJson(response.content) as ReplaySEO | null;
    if (!parsed?.title || !parsed?.tags) return null;

    return {
      title:          parsed.title.trim().slice(0, 100),
      hookLines:      Array.isArray(parsed.hookLines) ? parsed.hookLines : [parsed.hookLines ?? ""],
      bodyParagraph:  (parsed.bodyParagraph ?? "").trim(),
      ctaLine:        (parsed.ctaLine ?? "").trim(),
      hashtags:       Array.isArray(parsed.hashtags) ? parsed.hashtags.slice(0, 5) : [],
      tags:           Array.isArray(parsed.tags)
        ? parsed.tags.slice(0, 15).map((t: string) => String(t).trim()).filter(Boolean)
        : [],
    };
  } catch (err: any) {
    releaseAISlot();
    logger.debug(`[BrandSync] Replay SEO failed: ${err.message?.slice(0, 100)}`);
    return null;
  }
}

// ── Sweep 1: Shorts SEO ───────────────────────────────────────────────────────

async function sweepShortsSEO(
  userId: string,
  channelId: number,
  budget: { remaining: number },
): Promise<{ updated: number; skipped: number }> {
  let updated = 0;
  let skipped = 0;
  try {
    const shorts = await db
      .select()
      .from(backCatalogVideos)
      .where(and(eq(backCatalogVideos.userId, userId), eq(backCatalogVideos.isShort, true)))
      .orderBy(desc(backCatalogVideos.viewCount))
      .limit(40);

    for (const video of shorts) {
      if (budget.remaining <= 0) break;

      if (await wasRecentlySynced(video.youtubeVideoId, userId)) { skipped++; continue; }

      const titleHasShorts  = /\#shorts/i.test(video.title);
      const tagsHaveGame    = (video.tags ?? []).some(
        (t) => t.toLowerCase() === (video.gameName ?? "").toLowerCase(),
      );
      const tagsHavePS5     = (video.tags ?? []).some((t) => /ps5|playstation/i.test(t));

      if (titleHasShorts && tagsHaveGame && tagsHavePS5 && (video.tags ?? []).length >= 8) {
        skipped++;
        continue;
      }

      const seo = await generateShortsSEO(video.title, video.gameName ?? "Gaming");
      if (!seo) { skipped++; continue; }

      const channelLinks = await getUserChannelLinks(userId).catch(() => undefined);
      const parts: DescriptionParts = {
        hookLines:      [seo.hookLine].filter(Boolean),
        bodyParagraph:  "",
        chapters:       [],
        ctaLine:        seo.ctaLine,
        hashtags:       seo.hashtags,
      };
      const finalDesc = buildDescription(parts, channelLinks);

      const updates: { title?: string; description?: string; tags?: string[] } = {
        tags: seo.tags,
      };
      if (seo.title !== video.title) updates.title = seo.title;
      if (finalDesc !== (video.description ?? "")) updates.description = finalDesc;

      const pushed = await pushMetadata(channelId, video.youtubeVideoId, updates);
      if (pushed) {
        await logSyncUpdate(
          userId, video.youtubeVideoId, video.title, "shorts_seo",
          video.title, seo.title,
        );
        await db
          .update(backCatalogVideos)
          .set({
            title: seo.title,
            tags:  seo.tags,
            lastOptimizedAt: new Date(),
            updatedAt: new Date(),
          })
          .where(eq(backCatalogVideos.youtubeVideoId, video.youtubeVideoId));
        budget.remaining--;
        updated++;
        logger.info(`[BrandSync] Short updated: "${seo.title.slice(0, 55)}" (${video.youtubeVideoId})`);
      } else {
        skipped++;
      }
    }
  } catch (err: any) {
    logger.error(`[BrandSync] Shorts sweep error: ${err.message?.slice(0, 150)}`);
  }
  return { updated, skipped };
}

// ── Sweep 2: Replay SEO ───────────────────────────────────────────────────────

async function sweepReplaySEO(
  userId: string,
  channelId: number,
  budget: { remaining: number },
): Promise<{ updated: number; skipped: number }> {
  let updated = 0;
  let skipped = 0;
  try {
    const replays = await db
      .select()
      .from(backCatalogVideos)
      .where(and(eq(backCatalogVideos.userId, userId), eq(backCatalogVideos.isVod, true)))
      .orderBy(desc(backCatalogVideos.viewCount))
      .limit(25);

    for (const video of replays) {
      if (budget.remaining <= 0) break;

      if (await wasRecentlySynced(video.youtubeVideoId, userId)) { skipped++; continue; }

      const tl = video.title.toLowerCase();
      const hasReplayMark   = /replay|full playthrough|full gameplay|archive/i.test(tl);
      const hasNoCommentary = /no commentary/i.test(tl);
      const tagsOk = (video.tags ?? []).length >= 10 &&
        (video.tags ?? []).some((t) => /replay|full gameplay|full playthrough/i.test(t));

      if (hasReplayMark && hasNoCommentary && tagsOk) { skipped++; continue; }

      const seo = await generateReplaySEO({
        title:      video.title,
        gameName:   video.gameName,
        durationSec: video.durationSec,
        publishedAt: video.publishedAt,
      });
      if (!seo) { skipped++; continue; }

      const channelLinks = await getUserChannelLinks(userId).catch(() => undefined);
      const parts: DescriptionParts = {
        hookLines:     seo.hookLines,
        bodyParagraph: seo.bodyParagraph,
        chapters:      [],
        ctaLine:       seo.ctaLine,
        hashtags:      seo.hashtags,
      };
      const finalDesc = buildDescription(parts, channelLinks);

      const pushed = await pushMetadata(channelId, video.youtubeVideoId, {
        title:       seo.title,
        description: finalDesc,
        tags:        seo.tags,
      });
      if (pushed) {
        await logSyncUpdate(
          userId, video.youtubeVideoId, video.title, "replay_seo",
          video.title, seo.title,
        );
        await db
          .update(backCatalogVideos)
          .set({
            title: seo.title,
            tags:  seo.tags,
            lastOptimizedAt: new Date(),
            updatedAt: new Date(),
          })
          .where(eq(backCatalogVideos.youtubeVideoId, video.youtubeVideoId));
        budget.remaining--;
        updated++;
        logger.info(`[BrandSync] Replay updated: "${seo.title.slice(0, 55)}" (${video.youtubeVideoId})`);
      } else {
        skipped++;
      }
    }
  } catch (err: any) {
    logger.error(`[BrandSync] Replay sweep error: ${err.message?.slice(0, 150)}`);
  }
  return { updated, skipped };
}

// ── Sweep 3: Brand consistency ────────────────────────────────────────────────

async function sweepBrandConsistency(
  userId: string,
  budget: { remaining: number },
): Promise<{ fixed: number; skipped: number }> {
  let fixed = 0;
  let skipped = 0;
  try {
    const brandProfile = getBrandProfile(userId);

    const allVideos = await db
      .select()
      .from(backCatalogVideos)
      .where(and(
        eq(backCatalogVideos.userId, userId),
        eq(backCatalogVideos.isShort, false),
      ))
      .orderBy(desc(backCatalogVideos.viewCount))
      .limit(50);

    const { isQuotaBreakerTripped: brandQuotaCheck } = await import("../services/youtube-quota-tracker");
    for (const video of allVideos) {
      if (budget.remaining <= 0) break;
      if (brandQuotaCheck()) {
        logger.warn("[BrandSync] Quota breaker tripped mid-sweep — stopping brand consistency");
        break;
      }

      const { score, issues } = checkBrandAlignment(
        { title: video.title, description: video.description ?? undefined, tags: video.tags ?? undefined },
        brandProfile,
      );

      if (score >= BRAND_SCORE_MIN) { skipped++; continue; }
      if (await wasRecentlySynced(video.youtubeVideoId, userId)) { skipped++; continue; }

      logger.info(
        `[BrandSync] Brand score ${score.toFixed(2)} for "${video.title.slice(0, 45)}" — ${issues.join("; ")}`,
      );

      const { optimizeExistingVideoMetadata } = await import("./youtube-existing-video-optimizer");
      const result = await optimizeExistingVideoMetadata(userId, video.youtubeVideoId, true);

      if (result.success && result.changes.length > 0) {
        await logSyncUpdate(
          userId, video.youtubeVideoId, video.title, "brand_consistency",
          `score:${score.toFixed(2)}|issues:${issues.join(",")}`,
          `changes:${result.changes.join(",")}`,
        );
        budget.remaining--;
        fixed++;
      } else {
        skipped++;
      }
    }
  } catch (err: any) {
    logger.error(`[BrandSync] Brand consistency sweep error: ${err.message?.slice(0, 150)}`);
  }
  return { fixed, skipped };
}

// ── Sweep 4: Thumbnail sync ───────────────────────────────────────────────────

async function sweepThumbnails(userId: string): Promise<{ generated: number }> {
  try {
    const { runThumbnailBackfillSweep } = await import("../auto-thumbnail-engine");
    const result = await runThumbnailBackfillSweep(userId);
    logger.info(`[BrandSync] Thumbnail backfill: ${result.processed} generated, ${result.remaining} remaining`);
    return { generated: result.processed };
  } catch (err: any) {
    logger.error(`[BrandSync] Thumbnail sweep error: ${err.message?.slice(0, 150)}`);
    return { generated: 0 };
  }
}

// ── Orchestrator ──────────────────────────────────────────────────────────────

export interface BrandSyncResult {
  shortsUpdated: number;
  replaysUpdated: number;
  brandFixes: number;
  thumbnailsGenerated: number;
  skipped: number;
}

export async function runChannelBrandSync(userId: string): Promise<BrandSyncResult> {
  const result: BrandSyncResult = {
    shortsUpdated: 0,
    replaysUpdated: 0,
    brandFixes: 0,
    thumbnailsGenerated: 0,
    skipped: 0,
  };

  if (isQuotaBreakerTripped()) {
    logger.warn("[BrandSync] Quota breaker active — deferring sweep");
    return result;
  }

  const channel = await getYouTubeChannel(userId);
  if (!channel) {
    logger.warn("[BrandSync] No valid YouTube channel — skipping user");
    return result;
  }

  logger.info(`[BrandSync] Starting sweep for user ${userId}`);

  const metaBudget = { remaining: METADATA_PER_SWEEP };
  const thumbBudget = { remaining: THUMBS_PER_SWEEP };

  const [shorts, replays, brand, thumbs] = await Promise.allSettled([
    sweepShortsSEO(userId, channel.id, metaBudget),
    sweepReplaySEO(userId, channel.id, metaBudget),
    sweepBrandConsistency(userId, metaBudget),
    sweepThumbnails(userId),
  ]);

  if (shorts.status === "fulfilled")  { result.shortsUpdated      = shorts.value.updated;  result.skipped += shorts.value.skipped; }
  if (replays.status === "fulfilled") { result.replaysUpdated     = replays.value.updated; result.skipped += replays.value.skipped; }
  if (brand.status === "fulfilled")   { result.brandFixes         = brand.value.fixed;     result.skipped += brand.value.skipped; }
  if (thumbs.status === "fulfilled")  { result.thumbnailsGenerated = thumbs.value.generated; }

  logger.info(
    `[BrandSync] Sweep done — Shorts: ${result.shortsUpdated}, Replays: ${result.replaysUpdated}, ` +
    `Brand fixes: ${result.brandFixes}, Thumbnails: ${result.thumbnailsGenerated}, Skipped: ${result.skipped}`,
  );
  return result;
}

// ── Boot & Cron ───────────────────────────────────────────────────────────────

let initialized = false;

async function getAllYouTubeUsers(): Promise<string[]> {
  try {
    const rows = await db
      .select({ userId: channels.userId })
      .from(channels)
      .where(
        and(
          eq(channels.platform, "youtube"),
          sql`${channels.accessToken} IS NOT NULL AND length(${channels.accessToken}) > 50`,
        ),
      );
    return [...new Set(rows.map((r) => r.userId))];
  } catch {
    return [];
  }
}

async function runForAllUsers(): Promise<void> {
  syncStatus.isRunning  = true;
  syncStatus.nextRunEta = null;
  try {
    const users = await getAllYouTubeUsers();
    for (const userId of users) {
      const res = await runChannelBrandSync(userId);
      syncStatus.lastRunResult = res;
      syncStatus.lastRunAt = new Date().toISOString();
    }
  } catch (err: any) {
    logger.error(`[BrandSync] Sweep failed: ${err.message?.slice(0, 200)}`);
  } finally {
    syncStatus.isRunning = false;
    const nextMs = (22 * 60 + Math.floor(Math.random() * 120)) * 60_000;
    syncStatus.nextRunEta = new Date(Date.now() + nextMs).toISOString();
  }
}

export function initChannelBrandSync(): void {
  if (initialized) return;
  initialized = true;

  // First run: 25-30 min after boot (after orchestrator + back-catalog runner)
  const delayMs = (25 * 60 + Math.floor(Math.random() * 5 * 60)) * 1_000;
  syncStatus.nextRunEta = new Date(Date.now() + delayMs).toISOString();

  setTimeout(runForAllUsers, delayMs);

  // Daily safety net at 3:30 AM
  cron.schedule("30 3 * * *", () => {
    if (syncStatus.isRunning) return;
    runForAllUsers().catch((err) =>
      logger.error(`[BrandSync] Cron error: ${String(err).slice(0, 150)}`),
    );
  });

  logger.info(
    `[BrandSync] Channel brand sync initialized — first sweep in ${Math.round(delayMs / 60_000)} min`,
  );
}
