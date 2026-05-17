/**
 * youtube-clip-seo-sync.ts
 *
 * Audits every published derivative clip (Shorts + long-form) that was
 * generated from the back catalog and ensures its YouTube metadata
 * (title, description, tags) and thumbnail match the clip content.
 *
 * Flow per clip:
 *  1. Resolve the source back-catalog video (game, title context)
 *  2. AI-generate clip-specific metadata
 *  3. If metadata has changed → push via updateYouTubeVideo
 *  4. If no custom thumbnail yet → generate + upload
 *  5. Stamp metadata.seoSynced / metadata.thumbnailSynced so we never repeat
 *
 * Daily caps (separate from the source-video optimizer):
 *  - SEO updates:  10 / user / day
 *  - Thumb uploads: 5 / user / day  (thumbnail quota is expensive: 50 units each)
 *
 * Trigger: called from youtube-back-catalog-runner per-user cycle
 * Manual:  POST /api/youtube/clips/seo-sync
 */

import { db } from "../db";
import {
  autopilotQueue,
  backCatalogVideos,
  channels,
  videoUpdateHistory,
} from "@shared/schema";
import { eq, and, desc, gte, sql, inArray } from "drizzle-orm";
import { createLogger } from "../lib/logger";
import { callClaudeBackground, CLAUDE_MODELS } from "../lib/claude";
import { sanitizeForPrompt, tokenBudget } from "../lib/ai-attack-shield";
import { tryAcquireAISlotNow, releaseAISlot } from "../lib/ai-semaphore";

const logger = createLogger("clip-seo-sync");

const SEO_PER_DAY      = 10;
const THUMB_PER_DAY    = 5;
const MAX_PER_RUN      = 15;

const CLIP_TYPES = [
  "youtube_short",
  "platform_short",
  "auto-clip",
  "long-form-clip",
  "long_form_clip",
  "youtube_long_form",
];

// ── Daily-cap counters ────────────────────────────────────────────────────────

async function countTodaySeoUpdates(userId: string): Promise<number> {
  try {
    const todayStart = new Date();
    todayStart.setHours(0, 0, 0, 0);
    const [row] = await db
      .select({ cnt: sql<number>`count(*)::int` })
      .from(videoUpdateHistory)
      .where(
        and(
          eq(videoUpdateHistory.userId, userId),
          eq(videoUpdateHistory.source, "clip_seo_sync"),
          gte(videoUpdateHistory.createdAt, todayStart),
        ),
      );
    return row?.cnt ?? 0;
  } catch {
    return 0;
  }
}

async function countTodayThumbUploads(userId: string): Promise<number> {
  try {
    const todayStart = new Date();
    todayStart.setHours(0, 0, 0, 0);
    const [row] = await db
      .select({ cnt: sql<number>`count(*)::int` })
      .from(videoUpdateHistory)
      .where(
        and(
          eq(videoUpdateHistory.userId, userId),
          eq(videoUpdateHistory.source, "clip_thumbnail_sync"),
          gte(videoUpdateHistory.createdAt, todayStart),
        ),
      );
    return row?.cnt ?? 0;
  } catch {
    return 0;
  }
}

// ── Log to videoUpdateHistory ─────────────────────────────────────────────────

async function logChange(
  userId: string,
  youtubeVideoId: string,
  title: string,
  field: string,
  oldVal: string,
  newVal: string,
  source: "clip_seo_sync" | "clip_thumbnail_sync",
): Promise<void> {
  try {
    await db.insert(videoUpdateHistory).values({
      userId,
      youtubeVideoId,
      videoTitle: title,
      field,
      oldValue: oldVal.slice(0, 1000),
      newValue: newVal.slice(0, 1000),
      source,
      status: "pushed",
      youtubeStudioUrl: `https://studio.youtube.com/video/${youtubeVideoId}/edit`,
    });
  } catch { /* non-fatal */ }
}

// ── AI: generate clip-specific metadata ──────────────────────────────────────

interface ClipMetadata {
  title: string;
  descriptionIntro: string;
  tags: string[];
}

async function generateClipMetadata(clip: {
  type: string;
  caption?: string | null;
  sourceTitle: string;
  gameName: string;
  sourceYoutubeId?: string | null;
  durationSec?: number | null;
}): Promise<ClipMetadata | null> {
  if (!tryAcquireAISlotNow()) return null;

  try {
    if (!tokenBudget.checkBudget("clip-seo-sync", 1500)) {
      releaseAISlot();
      return null;
    }

    const isShort = clip.type.toLowerCase().includes("short");
    const durMin  = Math.round((clip.durationSec ?? 60) / 60);
    const game    = sanitizeForPrompt(clip.gameName, 60);
    const srcTitle = sanitizeForPrompt(clip.sourceTitle, 150);
    const clipHint = sanitizeForPrompt(clip.caption ?? "", 120);
    const sourceLink = clip.sourceYoutubeId
      ? `https://youtu.be/${clip.sourceYoutubeId}`
      : null;

    const prompt = isShort
      ? `You are writing YouTube Shorts metadata for the ETGaming247 channel.
Channel identity: No commentary. No facecam. Raw gameplay, 92 BPM cadence — steady pressure, clean action.

This Short clip was taken from source video: "${srcTitle}"
Game: ${game}
Clip hint / original caption: ${clipHint || "(none)"}

Write:
1. TITLE (40-60 chars) — punchy, sell the moment, include game name. No all-caps spam. No "INSANE" or "EPIC" unless earned. Pattern: "Clutch ${game} Play — No Commentary #Shorts"
2. DESCRIPTION INTRO (1-2 lines, max 150 chars) — brand default: "Raw ${game} gameplay clip — no commentary, no facecam." Optionally include the source link if provided: ${sourceLink ?? "(no link)"}
3. TAGS (up to 12 tags, total < 400 chars) — game name, shorts, no commentary, gameplay, ETGaming247, platform.

Respond in JSON only:
{"title":"...","descriptionIntro":"...","tags":["tag1","tag2"]}`
      : `You are writing YouTube long-form gaming clip metadata for ETGaming247.
Channel identity: No commentary. No facecam. Raw gameplay cut with 92 BPM cadence.

This clip was taken from source video: "${srcTitle}"
Game: ${game}
Duration: ~${durMin} min
Source link: ${sourceLink ?? "(none)"}

Write:
1. TITLE (50-80 chars) — describe the situation/segment. Include game + "No Commentary". Pattern: "${game} — ${durMin} Min Gameplay | No Commentary"
2. DESCRIPTION INTRO (2-3 lines, max 250 chars) — "Raw ${game} no-commentary gameplay. ${durMin} min of steady pressure and clean action." Include source link if provided.
3. TAGS (up to 15 tags, total < 500 chars) — game name, gameplay, no commentary, ETGaming247, long form, and 3-4 game-specific tags.

Respond in JSON only:
{"title":"...","descriptionIntro":"...","tags":["tag1","tag2"]}`;

    const response = await callClaudeBackground({ prompt, model: CLAUDE_MODELS.haiku });
    releaseAISlot();

    if (!response?.content?.trim()) return null;

    let content = response.content.trim();
    const fence = content.match(/^```(?:json)?\s*([\s\S]*?)\s*```$/i);
    if (fence) content = fence[1];

    const parsed = JSON.parse(content) as ClipMetadata;

    if (!parsed.title || parsed.title.length > 120) return null;
    if (!Array.isArray(parsed.tags)) return null;

    return {
      title: parsed.title.trim().slice(0, 100),
      descriptionIntro: (parsed.descriptionIntro ?? "").trim().slice(0, 300),
      tags: parsed.tags.slice(0, 15).map((t: string) => String(t).trim()).filter(Boolean),
    };
  } catch (err: any) {
    releaseAISlot();
    logger.debug(`[ClipSeoSync] AI generation failed: ${err.message?.slice(0, 120)}`);
    return null;
  }
}

// ── Push metadata to YouTube ──────────────────────────────────────────────────

async function pushMetadata(
  userId: string,
  channelId: number,
  youtubeVideoId: string,
  updates: { title?: string; description?: string; tags?: string[] },
): Promise<boolean> {
  try {
    const { isQuotaBreakerTripped } = await import("./youtube-quota-tracker");
    if (isQuotaBreakerTripped()) {
      logger.warn(`[ClipSeoSync] Quota breaker — skipping push for ${youtubeVideoId}`);
      return false;
    }
    const { updateYouTubeVideo } = await import("../youtube");
    await updateYouTubeVideo(channelId, youtubeVideoId, updates, "write");
    return true;
  } catch (err: any) {
    if (err.code === "QUOTA_EXCEEDED" || err.code === "QUOTA_CAP") {
      logger.warn(`[ClipSeoSync] Quota cap — deferred: ${youtubeVideoId}`);
    } else {
      logger.warn(`[ClipSeoSync] YouTube push failed for ${youtubeVideoId}: ${err.message?.slice(0, 200)}`);
    }
    return false;
  }
}

// ── Build full description for the clip ──────────────────────────────────────

function buildClipDescription(
  intro: string,
  sourceYoutubeId: string | null | undefined,
  isShort: boolean,
): string {
  const parts: string[] = [];
  if (intro) parts.push(intro);

  if (!isShort && sourceYoutubeId) {
    parts.push(`\n📺 Full VOD: https://youtube.com/watch?v=${sourceYoutubeId}`);
  }

  parts.push(
    "\n─────────────────────────────",
    "ETGaming247 — No Commentary Gaming",
    "Raw gameplay. No facecam. No fake reactions.",
  );

  return parts.join("\n").trim().slice(0, 5000);
}

// ── Stamp seoSynced / thumbnailSynced in autopilotQueue metadata ──────────────

async function stampMeta(
  itemId: number,
  currentMeta: Record<string, unknown>,
  fields: { seoSynced?: boolean; thumbnailSynced?: boolean },
): Promise<void> {
  try {
    await db
      .update(autopilotQueue)
      .set({ metadata: { ...currentMeta, ...fields } as any })
      .where(eq(autopilotQueue.id, itemId));
  } catch { /* non-fatal */ }
}

// ── Main: sync SEO + thumbnail for one clip ───────────────────────────────────

async function syncOneClip(
  userId: string,
  channelId: number,
  item: {
    id: number;
    type: string;
    caption: string | null;
    metadata: unknown;
  },
  seoUsed: number,
  thumbUsed: number,
): Promise<{ seoUpdated: boolean; thumbUpdated: boolean }> {
  const meta = (item.metadata as Record<string, unknown>) ?? {};
  const clipYtId: string | undefined =
    (meta.youtubeVideoId as string) ||
    (meta.youtubeId as string) ||
    undefined;

  if (!clipYtId) return { seoUpdated: false, thumbUpdated: false };

  const sourceYtId: string | undefined =
    (meta.sourceYoutubeId as string) || undefined;
  const gameName: string = String(meta.gameName ?? "Gaming").slice(0, 80);
  const isShort = item.type.toLowerCase().includes("short");

  // Resolve source back-catalog video for context
  let sourceTitle = "Gaming Gameplay";
  let sourceDuration: number | null = null;
  if (sourceYtId) {
    try {
      const [src] = await db
        .select({ title: backCatalogVideos.title, durationSec: backCatalogVideos.durationSec })
        .from(backCatalogVideos)
        .where(
          and(
            eq(backCatalogVideos.userId, userId),
            eq(backCatalogVideos.youtubeVideoId, sourceYtId),
          ),
        )
        .limit(1);
      if (src) {
        sourceTitle   = src.title;
        sourceDuration = src.durationSec;
      }
    } catch { /* non-fatal */ }
  }

  let seoUpdated   = false;
  let thumbUpdated = false;

  // ── SEO update ────────────────────────────────────────────────────────────
  if (seoUsed < SEO_PER_DAY && !(meta.seoSynced as boolean)) {
    const optimized = await generateClipMetadata({
      type: item.type,
      caption: item.caption,
      sourceTitle,
      gameName,
      sourceYoutubeId: sourceYtId,
      durationSec: isShort ? 60 : (sourceDuration ?? null),
    });

    if (optimized) {
      const newDesc = buildClipDescription(optimized.descriptionIntro, sourceYtId, isShort);
      const updates: { title?: string; description?: string; tags?: string[] } = {};
      const changes: string[] = [];

      const currentTitle = String(meta.clipTitle ?? meta.title ?? item.caption ?? "").slice(0, 100);
      if (optimized.title && optimized.title !== currentTitle) {
        updates.title = optimized.title;
        changes.push("title");
      }
      if (newDesc) {
        updates.description = newDesc;
        changes.push("description");
      }
      if (optimized.tags.length > 0) {
        updates.tags = optimized.tags;
        changes.push("tags");
      }

      if (changes.length > 0) {
        const pushed = await pushMetadata(userId, channelId, clipYtId, updates);
        if (pushed) {
          for (const field of changes) {
            await logChange(
              userId, clipYtId, sourceTitle, field,
              field === "title" ? currentTitle : "(previous)",
              field === "title" ? (optimized.title ?? "") :
                field === "description" ? newDesc.slice(0, 200) :
                JSON.stringify(optimized.tags),
              "clip_seo_sync",
            );
          }
          seoUpdated = true;
          logger.info(`[ClipSeoSync] SEO updated [${changes.join(", ")}] for clip ${clipYtId} (source: ${sourceYtId ?? "unknown"})`);
        }
      }

      // Mark seoSynced regardless of push outcome (avoid hammering the same clip)
      await stampMeta(item.id, meta, { seoSynced: true });
    }
  }

  // ── Thumbnail update ──────────────────────────────────────────────────────
  if (thumbUsed < THUMB_PER_DAY && !(meta.thumbnailSynced as boolean)) {
    try {
      const { isQuotaBreakerTripped } = await import("./youtube-quota-tracker");
      if (!isQuotaBreakerTripped()) {
        const { generateAndUploadThumbnailForClip } = await import("../auto-thumbnail-engine");
        const clipTitleStr = String(meta.clipTitle ?? item.caption ?? sourceTitle).slice(0, 100);
        const clipDesc = buildClipDescription(
          `Raw ${gameName} gameplay clip — no commentary.`,
          sourceYtId,
          isShort,
        );

        const uploaded = await generateAndUploadThumbnailForClip(
          userId,
          channelId,
          clipYtId,
          clipTitleStr,
          clipDesc,
          isShort ? "short" : "long_form",
          gameName,
        );

        if (uploaded) {
          await logChange(
            userId, clipYtId, sourceTitle, "thumbnail",
            "(previous)", "AI-generated clip thumbnail", "clip_thumbnail_sync",
          );
          thumbUpdated = true;
          logger.info(`[ClipSeoSync] Thumbnail uploaded for clip ${clipYtId}`);
        }
      }
    } catch (err: any) {
      logger.debug(`[ClipSeoSync] Thumbnail upload failed for ${clipYtId}: ${err.message?.slice(0, 150)}`);
    }

    // Always stamp thumbnailSynced after attempt so we don't retry today
    await stampMeta(item.id, meta, { thumbnailSynced: true });
  }

  return { seoUpdated, thumbUpdated };
}

// ── Public: run the full sweep for one user ───────────────────────────────────

export async function runClipSeoSync(userId: string): Promise<{
  scanned: number;
  seoUpdated: number;
  thumbUpdated: number;
  skipped: string[];
}> {
  const result = { scanned: 0, seoUpdated: 0, thumbUpdated: 0, skipped: [] as string[] };

  try {
    const { isQuotaBreakerTripped } = await import("./youtube-quota-tracker");
    if (isQuotaBreakerTripped()) {
      result.skipped.push("YouTube quota breaker active");
      return result;
    }

    // Check daily caps upfront
    const seoUsed   = await countTodaySeoUpdates(userId);
    const thumbUsed = await countTodayThumbUploads(userId);

    if (seoUsed >= SEO_PER_DAY && thumbUsed >= THUMB_PER_DAY) {
      result.skipped.push(`Daily caps reached — SEO ${seoUsed}/${SEO_PER_DAY}, thumbnails ${thumbUsed}/${THUMB_PER_DAY}`);
      return result;
    }

    // Resolve YouTube channel for this user
    const [ytChannel] = await db
      .select({ id: channels.id })
      .from(channels)
      .where(
        and(
          eq(channels.userId, userId),
          eq(channels.platform, "youtube"),
          sql`${channels.accessToken} IS NOT NULL`,
        ),
      )
      .limit(1);

    if (!ytChannel) {
      result.skipped.push("No connected YouTube channel");
      return result;
    }

    // Find published clips that need SEO or thumbnail sync
    const clips = await db
      .select({
        id: autopilotQueue.id,
        type: autopilotQueue.type,
        caption: autopilotQueue.caption,
        metadata: autopilotQueue.metadata,
        publishedAt: autopilotQueue.publishedAt,
      })
      .from(autopilotQueue)
      .where(
        and(
          eq(autopilotQueue.userId, userId),
          eq(autopilotQueue.status, "published"),
          inArray(autopilotQueue.type, CLIP_TYPES),
          sql`${autopilotQueue.metadata}->>'youtubeVideoId' IS NOT NULL
              OR ${autopilotQueue.metadata}->>'youtubeId' IS NOT NULL`,
          sql`(
            (${autopilotQueue.metadata}->>'seoSynced')::text IS DISTINCT FROM 'true'
            OR
            (${autopilotQueue.metadata}->>'thumbnailSynced')::text IS DISTINCT FROM 'true'
          )`,
        ),
      )
      .orderBy(desc(autopilotQueue.publishedAt))
      .limit(MAX_PER_RUN);

    if (!clips.length) {
      result.skipped.push("No published clips needing sync");
      return result;
    }

    logger.info(`[ClipSeoSync] Found ${clips.length} clip(s) to audit for user ${userId.slice(0, 8)}`);

    let seoRunning   = seoUsed;
    let thumbRunning = thumbUsed;

    for (const clip of clips) {
      result.scanned++;

      const { seoUpdated, thumbUpdated } = await syncOneClip(
        userId,
        ytChannel.id,
        clip,
        seoRunning,
        thumbRunning,
      );

      if (seoUpdated) { result.seoUpdated++; seoRunning++; }
      if (thumbUpdated) { result.thumbUpdated++; thumbRunning++; }

      // Stop early if both caps hit mid-run
      if (seoRunning >= SEO_PER_DAY && thumbRunning >= THUMB_PER_DAY) break;
    }

    logger.info(`[ClipSeoSync] Done for ${userId.slice(0, 8)}: scanned ${result.scanned}, SEO ${result.seoUpdated}, thumbs ${result.thumbUpdated}`);
    return result;
  } catch (err: any) {
    logger.error(`[ClipSeoSync] Sweep failed for ${userId.slice(0, 8)}: ${err.message?.slice(0, 200)}`);
    result.skipped.push(`Error: ${err.message?.slice(0, 100)}`);
    return result;
  }
}

// ── Status query ──────────────────────────────────────────────────────────────

export async function getClipSeoSyncStatus(userId: string): Promise<{
  pendingClips: number;
  seoUpdatedToday: number;
  thumbsUploadedToday: number;
  seoCap: number;
  thumbCap: number;
}> {
  try {
    const [pendingRow] = await db
      .select({ cnt: sql<number>`count(*)::int` })
      .from(autopilotQueue)
      .where(
        and(
          eq(autopilotQueue.userId, userId),
          eq(autopilotQueue.status, "published"),
          inArray(autopilotQueue.type, CLIP_TYPES),
          sql`${autopilotQueue.metadata}->>'youtubeVideoId' IS NOT NULL
              OR ${autopilotQueue.metadata}->>'youtubeId' IS NOT NULL`,
          sql`(
            (${autopilotQueue.metadata}->>'seoSynced')::text IS DISTINCT FROM 'true'
            OR
            (${autopilotQueue.metadata}->>'thumbnailSynced')::text IS DISTINCT FROM 'true'
          )`,
        ),
      );

    const [seoToday, thumbToday] = await Promise.all([
      countTodaySeoUpdates(userId),
      countTodayThumbUploads(userId),
    ]);

    return {
      pendingClips: pendingRow?.cnt ?? 0,
      seoUpdatedToday: seoToday,
      thumbsUploadedToday: thumbToday,
      seoCap: SEO_PER_DAY,
      thumbCap: THUMB_PER_DAY,
    };
  } catch {
    return { pendingClips: 0, seoUpdatedToday: 0, thumbsUploadedToday: 0, seoCap: SEO_PER_DAY, thumbCap: THUMB_PER_DAY };
  }
}

logger.debug("[ClipSeoSync] Module loaded");
