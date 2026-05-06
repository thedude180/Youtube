/**
 * youtube-existing-video-optimizer.ts
 *
 * Phase 3: Improve existing YouTube videos through better metadata, chapters,
 * thumbnail concepts, and description refresh — without uploading new files.
 *
 * Rate: 5–15 metadata refreshes/day max (enforced by METADATA_REFRESH_PER_DAY).
 * Priority: highest totalRevivalScore videos first.
 *
 * API pushes use updateYouTubeVideo() with before/after logged to videoUpdateHistory
 * for rollback support.
 */

import { db } from "../db";
import {
  backCatalogVideos,
  channels,
  videoUpdateHistory,
} from "@shared/schema";
import { eq, and, desc, lt, gte, sql } from "drizzle-orm";
import { createLogger } from "../lib/logger";
import { callClaudeBackground, CLAUDE_MODELS } from "../lib/claude";
import { sanitizeForPrompt, tokenBudget } from "../lib/ai-attack-shield";
import { tryAcquireAISlotNow, releaseAISlot } from "../lib/ai-semaphore";

const logger = createLogger("video-optimizer");

const METADATA_REFRESH_PER_DAY = 10;  // max metadata updates per user per day
const MIN_HOURS_BETWEEN_UPDATES = 2;   // don't update the same video twice quickly

// ── Count today's metadata updates ───────────────────────────────────────────

async function countTodayMetadataUpdates(userId: string): Promise<number> {
  try {
    const todayStart = new Date();
    todayStart.setHours(0, 0, 0, 0);
    const [row] = await db.select({ cnt: sql<number>`count(*)::int` })
      .from(videoUpdateHistory)
      .where(and(
        eq(videoUpdateHistory.userId, userId),
        eq(videoUpdateHistory.source, "back_catalog_optimizer"),
        gte(videoUpdateHistory.createdAt, todayStart),
      ));
    return row?.cnt ?? 0;
  } catch {
    return 0;
  }
}

// ── Log update to history ─────────────────────────────────────────────────────

async function logUpdate(
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
      source: "back_catalog_optimizer",
      status: "pushed",
      youtubeStudioUrl: `https://studio.youtube.com/video/${youtubeVideoId}/edit`,
    });
  } catch (err: any) {
    logger.debug(`[Optimizer] Log update failed: ${err.message?.slice(0, 100)}`);
  }
}

// ── Push metadata update to YouTube ──────────────────────────────────────────

async function pushToYouTube(
  userId: string,
  channelId: number,
  youtubeVideoId: string,
  updates: { title?: string; description?: string; tags?: string[]; categoryId?: string },
): Promise<boolean> {
  try {
    const { isQuotaBreakerTripped } = await import("../services/youtube-quota-tracker");
    if (isQuotaBreakerTripped()) {
      logger.warn(`[Optimizer] Quota breaker active — skipping YouTube push for ${youtubeVideoId}`);
      return false;
    }
    const { updateYouTubeVideo } = await import("../youtube");
    await updateYouTubeVideo(channelId, youtubeVideoId, updates, "write");
    return true;
  } catch (err: any) {
    if (err.code === "QUOTA_EXCEEDED" || err.code === "QUOTA_CAP") {
      logger.warn(`[Optimizer] Quota cap — metadata update deferred: ${youtubeVideoId}`);
    } else {
      logger.warn(`[Optimizer] YouTube push failed for ${youtubeVideoId}: ${err.message?.slice(0, 200)}`);
    }
    return false;
  }
}

// ── AI: generate optimized metadata ──────────────────────────────────────────

interface OptimizedMetadata {
  title: string;
  descriptionIntro: string;  // first 2 lines only — don't overwrite full desc
  tags: string[];
  noCommentaryFraming?: string;
}

async function generateOptimizedMetadata(video: {
  title: string;
  description?: string | null;
  tags?: string[] | null;
  gameName?: string | null;
  durationSec?: number | null;
  isVod?: boolean | null;
  viewCount?: number | null;
}): Promise<OptimizedMetadata | null> {
  if (!tryAcquireAISlotNow()) return null;

  try {
    if (!tokenBudget.checkBudget("video-optimizer", 1500)) {
      releaseAISlot();
      return null;
    }

    const safeTitle = sanitizeForPrompt(video.title, 200);
    const safeDesc  = sanitizeForPrompt(video.description ?? "", 400);
    const game      = sanitizeForPrompt(video.gameName ?? "Gaming", 60);
    const durMin    = Math.round((video.durationSec ?? 0) / 60);
    const existing  = (video.tags ?? []).slice(0, 10).join(", ");

    const prompt = `You are optimizing an existing YouTube gaming video's metadata to improve CTR and discoverability.

Video: "${safeTitle}"
Game: ${game}
Duration: ${durMin} min
Is VOD/stream replay: ${video.isVod ? "yes" : "no"}
Current views: ${video.viewCount ?? 0}
Current description (first 300 chars): ${safeDesc}
Current tags: ${existing}

Write:
1. A new TITLE (40-70 chars, no clickbait, no misleading claims, accurately describes content with a strong hook)
2. A new DESCRIPTION INTRO (2 lines, 100-200 chars total, describes content and value without keyword stuffing)
3. Up to 15 TAGS (game name, genre, specific moments, channel brand — no misleading tags)
4. If the video is a VOD or long-form clip, a short "no-commentary framing" sentence (e.g., "Chaptered gameplay — no commentary")

Rules:
- Keep the title accurate — do not add claims that aren't true
- Do not use all-caps spam
- Do not keyword-stuff
- Write like a professional YouTube creator, not a bot

Respond in JSON only:
{
  "title": "...",
  "descriptionIntro": "...",
  "tags": ["tag1", "tag2", ...],
  "noCommentaryFraming": "..."
}`;

    const response = await callClaudeBackground({ prompt, model: CLAUDE_MODELS.haiku });
    releaseAISlot();

    if (!response?.content?.trim()) return null;

    let content = response.content.trim();
    const fence = content.match(/^```(?:json)?\s*([\s\S]*?)\s*```$/i);
    if (fence) content = fence[1];

    const parsed = JSON.parse(content) as OptimizedMetadata;

    // Safety guards
    if (!parsed.title || parsed.title.length > 100) return null;
    if (!parsed.tags || !Array.isArray(parsed.tags)) return null;

    return {
      title: parsed.title.trim().slice(0, 100),
      descriptionIntro: (parsed.descriptionIntro ?? "").trim().slice(0, 300),
      tags: parsed.tags.slice(0, 15).map((t: string) => String(t).trim()).filter(Boolean),
      noCommentaryFraming: parsed.noCommentaryFraming?.trim() ?? undefined,
    };
  } catch (err: any) {
    releaseAISlot();
    logger.debug(`[Optimizer] AI metadata generation failed: ${err.message?.slice(0, 150)}`);
    return null;
  }
}

// ── AI: generate chapters ─────────────────────────────────────────────────────

async function generateChaptersAI(video: {
  title: string;
  description?: string | null;
  gameName?: string | null;
  durationSec?: number | null;
}): Promise<string | null> {
  if (!tryAcquireAISlotNow()) return null;

  try {
    const durMin = Math.round((video.durationSec ?? 0) / 60);
    if (durMin < 5) { releaseAISlot(); return null; }

    const safeTitle = sanitizeForPrompt(video.title, 200);
    const game = sanitizeForPrompt(video.gameName ?? "Gaming", 60);

    const segmentCount = Math.min(12, Math.max(3, Math.floor(durMin / 5)));
    const segmentLen   = Math.floor(durMin / segmentCount);

    const prompt = `Generate YouTube chapter timestamps for a ${durMin}-minute ${game} gaming video titled "${safeTitle}".

Create ${segmentCount} chapters, each approximately ${segmentLen} minutes long.
The first chapter MUST start at 0:00.
Use realistic gaming chapter names (e.g., "Intro", "First Boss", "Exploration", "Story Continues", etc.).

Respond in this exact format (one chapter per line):
0:00 Intro
${segmentLen}:00 [Chapter name]
...

Only output the timestamps, nothing else.`;

    const response = await callClaudeBackground({ prompt, model: CLAUDE_MODELS.haiku });
    releaseAISlot();

    if (!response?.content?.trim()) return null;

    // Validate: must start with 0:00
    const lines = response.content.trim().split("\n").filter((l: string) => /^\d+:\d{2}/.test(l.trim()));
    if (!lines.length || !lines[0].startsWith("0:00")) return null;

    return lines.slice(0, 15).join("\n");
  } catch (err: any) {
    releaseAISlot();
    logger.debug(`[Optimizer] Chapter generation failed: ${err.message?.slice(0, 100)}`);
    return null;
  }
}

// ── Build updated description ─────────────────────────────────────────────────

function buildUpdatedDescription(
  original: string,
  intro: string,
  chapters?: string | null,
  sourceYoutubeId?: string | null,
  noCommentaryFraming?: string,
): string {
  const parts: string[] = [];

  // New intro at top
  if (intro) parts.push(intro);
  if (noCommentaryFraming) parts.push(noCommentaryFraming);

  // Chapters block
  if (chapters) {
    parts.push("\n⏱ CHAPTERS:\n" + chapters);
  }

  // Source link if derivative
  if (sourceYoutubeId) {
    parts.push("\n📺 Full VOD: https://youtube.com/watch?v=" + sourceYoutubeId);
  }

  // Preserve existing description body (skip first 2 lines if they were the old intro)
  const existingLines = original.split("\n");
  const bodyStart = (existingLines[0].length < 200 && existingLines.length > 3) ? 2 : 0;
  const existingBody = existingLines.slice(bodyStart).join("\n").trim();

  if (existingBody && !parts.join("\n").includes(existingBody.slice(0, 50))) {
    parts.push("\n" + existingBody);
  }

  return parts.join("\n").trim().slice(0, 5000);
}

// ── Public: optimize metadata for a single video ──────────────────────────────

export async function optimizeExistingVideoMetadata(
  userId: string,
  youtubeVideoId: string,
  pushToAPI = true,
): Promise<{ success: boolean; changes: string[]; skipped?: string }> {
  const [video] = await db.select()
    .from(backCatalogVideos)
    .where(and(
      eq(backCatalogVideos.userId, userId),
      eq(backCatalogVideos.youtubeVideoId, youtubeVideoId),
    ))
    .limit(1);

  if (!video) return { success: false, changes: [], skipped: "video not found in back catalog" };

  // Check if recently optimized
  if (video.lastOptimizedAt) {
    const hoursAgo = (Date.now() - new Date(video.lastOptimizedAt).getTime()) / 3_600_000;
    if (hoursAgo < MIN_HOURS_BETWEEN_UPDATES) {
      return { success: false, changes: [], skipped: `optimized ${Math.round(hoursAgo * 10) / 10}h ago — too soon` };
    }
  }

  // Check daily cap
  const todayCount = await countTodayMetadataUpdates(userId);
  if (todayCount >= METADATA_REFRESH_PER_DAY) {
    return { success: false, changes: [], skipped: `daily metadata cap reached (${METADATA_REFRESH_PER_DAY}/day)` };
  }

  const optimized = await generateOptimizedMetadata(video);
  if (!optimized) return { success: false, changes: [], skipped: "AI optimization unavailable" };

  const changes: string[] = [];

  // Find channel for API push
  let channelId: number | null = video.channelId ?? null;
  if (!channelId) {
    try {
      const [ch] = await db.select({ id: channels.id })
        .from(channels)
        .where(and(eq(channels.userId, userId), eq(channels.platform, "youtube")))
        .limit(1);
      channelId = ch?.id ?? null;
    } catch { /* ok */ }
  }

  const updates: { title?: string; description?: string; tags?: string[] } = {};

  // Title update
  if (optimized.title && optimized.title !== video.title) {
    await logUpdate(userId, youtubeVideoId, video.title, "title", video.title, optimized.title);
    updates.title = optimized.title;
    changes.push("title");
  }

  // Description update
  if (optimized.descriptionIntro) {
    const newDesc = buildUpdatedDescription(
      video.description ?? "",
      optimized.descriptionIntro,
      null,
      null,
      optimized.noCommentaryFraming,
    );
    if (newDesc !== video.description) {
      await logUpdate(userId, youtubeVideoId, video.title, "description",
        (video.description ?? "").slice(0, 200),
        newDesc.slice(0, 200),
      );
      updates.description = newDesc;
      changes.push("description");
    }
  }

  // Tags update
  if (optimized.tags.length > 0) {
    const currentTags = JSON.stringify(video.tags ?? []);
    const newTags = JSON.stringify(optimized.tags);
    if (currentTags !== newTags) {
      await logUpdate(userId, youtubeVideoId, video.title, "tags", currentTags, newTags);
      updates.tags = optimized.tags;
      changes.push("tags");
    }
  }

  if (!changes.length) {
    return { success: true, changes: [], skipped: "no meaningful changes detected" };
  }

  // Push to YouTube API if enabled and channelId available
  let pushed = false;
  if (pushToAPI && channelId && Object.keys(updates).length > 0) {
    pushed = await pushToYouTube(userId, channelId, youtubeVideoId, updates);
  }

  // Update local back catalog record
  await db.update(backCatalogVideos)
    .set({
      title: updates.title ?? video.title,
      tags: updates.tags ?? video.tags,
      lastOptimizedAt: new Date(),
      metadataUpdatesQueued: (video.metadataUpdatesQueued ?? 0) + 1,
      updatedAt: new Date(),
    })
    .where(and(
      eq(backCatalogVideos.userId, userId),
      eq(backCatalogVideos.youtubeVideoId, youtubeVideoId),
    ));

  logger.info(`[Optimizer] ${youtubeVideoId}: changed [${changes.join(", ")}]${pushed ? " — pushed to YouTube" : " — logged only"}`);
  return { success: true, changes };
}

// ── Public: generate chapters for an existing video ───────────────────────────

export async function generateChaptersForExistingVideo(
  userId: string,
  youtubeVideoId: string,
  pushToAPI = true,
): Promise<{ success: boolean; chapters?: string; skipped?: string }> {
  const [video] = await db.select()
    .from(backCatalogVideos)
    .where(and(
      eq(backCatalogVideos.userId, userId),
      eq(backCatalogVideos.youtubeVideoId, youtubeVideoId),
    ))
    .limit(1);

  if (!video) return { success: false, skipped: "not in back catalog" };

  // Skip if already has chapters
  if (/\d:\d{2}/.test(video.description ?? "")) {
    return { success: false, skipped: "already has timestamps in description" };
  }

  // Skip if too short
  if ((video.durationSec ?? 0) < 300) {
    return { success: false, skipped: "video too short for chapters" };
  }

  const chapters = await generateChaptersAI(video);
  if (!chapters) return { success: false, skipped: "AI chapter generation failed" };

  const newDesc = buildUpdatedDescription(video.description ?? "", "", chapters);

  await logUpdate(userId, youtubeVideoId, video.title, "description_chapters",
    (video.description ?? "").slice(0, 100),
    chapters.slice(0, 200),
  );

  let pushed = false;
  if (pushToAPI && video.channelId) {
    pushed = await pushToYouTube(userId, video.channelId, youtubeVideoId, { description: newDesc });
  }

  logger.info(`[Optimizer] Chapters added to ${youtubeVideoId}${pushed ? " (pushed)" : " (logged)"}`);
  return { success: true, chapters };
}

// ── Public: generate thumbnail refresh concept ────────────────────────────────

export async function refreshThumbnailConcept(
  userId: string,
  youtubeVideoId: string,
): Promise<{ concept: string | null; skipped?: string }> {
  const [video] = await db.select()
    .from(backCatalogVideos)
    .where(and(
      eq(backCatalogVideos.userId, userId),
      eq(backCatalogVideos.youtubeVideoId, youtubeVideoId),
    ))
    .limit(1);

  if (!video) return { concept: null, skipped: "not in back catalog" };

  if (!tryAcquireAISlotNow()) return { concept: null, skipped: "AI slot unavailable" };

  try {
    const game = sanitizeForPrompt(video.gameName ?? "Gaming", 60);
    const title = sanitizeForPrompt(video.title, 150);

    const prompt = `Design a YouTube thumbnail concept for a gaming video.

Title: "${title}"
Game: ${game}
Views: ${video.viewCount ?? 0}
Current thumbnail low CTR: ${(video.viewCount ?? 0) < 1000 ? "yes — needs improvement" : "unknown"}

Write a specific thumbnail design brief (3–5 sentences):
- What image to use (screenshot, character, moment)
- Text overlay (max 4 words)
- Color scheme / border
- Facial expression or emotion if applicable
- Layout: where elements go

Be specific and actionable. No generic advice.`;

    const response = await callClaudeBackground({ prompt, model: CLAUDE_MODELS.haiku });
    releaseAISlot();

    if (!response?.content?.trim()) return { concept: null, skipped: "empty AI response" };

    const concept = response.content.trim().slice(0, 600);
    logger.info(`[Optimizer] Thumbnail concept generated for ${youtubeVideoId}`);
    return { concept };
  } catch (err: any) {
    releaseAISlot();
    logger.debug(`[Optimizer] Thumbnail concept failed: ${err.message?.slice(0, 100)}`);
    return { concept: null, skipped: "AI error" };
  }
}

// ── Public: queue a metadata update (with quota check) ───────────────────────

export async function queueMetadataUpdate(
  userId: string,
  youtubeVideoId: string,
): Promise<{ queued: boolean; reason?: string }> {
  // Check quota before running
  try {
    const { isQuotaBreakerTripped } = await import("../services/youtube-quota-tracker");
    if (isQuotaBreakerTripped()) {
      return { queued: false, reason: "YouTube quota breaker active — deferred until reset" };
    }
  } catch { /* ok */ }

  // Check daily cap
  const todayCount = await countTodayMetadataUpdates(userId);
  if (todayCount >= METADATA_REFRESH_PER_DAY) {
    return { queued: false, reason: `daily metadata cap (${METADATA_REFRESH_PER_DAY}) reached` };
  }

  // Run the optimization (pushToAPI=true)
  const result = await optimizeExistingVideoMetadata(userId, youtubeVideoId, true);
  if (result.skipped) return { queued: false, reason: result.skipped };
  return { queued: result.success, reason: result.changes.join(", ") };
}

// ── Public: audit monetization readiness via back catalog record ──────────────

export async function auditVideoMonetizationReadiness(
  userId: string,
  youtubeVideoId: string,
): Promise<{ status: string; issues: string[]; suggestions: string[] }> {
  const { auditBackCatalogVideo } = await import("./youtube-monetization-readiness");
  const report = await auditBackCatalogVideo(userId, youtubeVideoId);
  return {
    status: report?.status ?? "not_enough_info",
    issues: report?.issues ?? [],
    suggestions: report?.suggestions ?? [],
  };
}

logger.debug("[VideoOptimizer] Module loaded");
