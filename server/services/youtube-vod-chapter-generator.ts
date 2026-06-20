/**
 * youtube-vod-chapter-generator.ts
 *
 * Auto-generates YouTube chapter timestamps for full VOD videos after a
 * live stream ends. Chapters make long-form VODs significantly more
 * watchable (YouTube prominently displays them in the progress bar) and
 * are a strong algorithmic signal for watch time retention.
 *
 * Sources for chapter markers (in priority order):
 *   1. Clip moments marked by live-copilot during the stream
 *      (markClipMoment fires on chat spikes, game events, highlight detection)
 *   2. Game segment changes detected from live stream metadata
 *   3. AI-generated approximate timestamps from stream duration + game context
 *      (fallback when no live moments were captured)
 *
 * Output format (YouTube requires):
 *   - First chapter MUST start at 00:00
 *   - Minimum 3 chapters, each ≥ 10 seconds apart
 *   - Format: "00:00 Title\n02:30 Title\n..."
 *   - Prepended to the video description (existing description preserved below)
 *
 * Runs once per VOD, triggered from afterStreamCopilot hook and also
 * via a sweep of recent unchaptered VODs every 4h.
 *
 * Quota cost: 1 videos.list (read description) + 50 videos.update = 51 units per VOD.
 */

import { db } from "../db";
import { channels, streams, youtubeOutputMetrics } from "@shared/schema";
import { eq, and, isNotNull, desc, gte, isNull } from "drizzle-orm";
import { google } from "googleapis";
import { getAuthenticatedClient } from "../youtube";
import { trackQuotaUsage, isQuotaBreakerTripped } from "./youtube-quota-tracker";
import { getClipMoments } from "./youtube-live-copilot";
import { executeRoutedAICall } from "./ai-model-router";
import { safeParseJSON } from "../lib/safe-json";
import { setJitteredInterval } from "../lib/timer-utils";
import { createLogger } from "../lib/logger";
import { getFocusGame } from "../lib/game-focus";

const logger = createLogger("vod-chapter-gen");

const ALREADY_CHAPTERED_MARKER = "<!-- chapters-generated -->";

// ─── Timestamp formatter ──────────────────────────────────────────────────────

function formatTimestamp(totalSeconds: number): string {
  const h = Math.floor(totalSeconds / 3600);
  const m = Math.floor((totalSeconds % 3600) / 60);
  const s = Math.floor(totalSeconds % 60);
  if (h > 0) return `${h}:${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
  return `${m}:${String(s).padStart(2, "0")}`;
}

// ─── Chapter block builder ────────────────────────────────────────────────────

interface Chapter { startSec: number; title: string; }

function buildChapterBlock(chapters: Chapter[]): string {
  const sorted = [...chapters].sort((a, b) => a.startSec - b.startSec);
  // Ensure first chapter starts at 00:00
  if (sorted[0]?.startSec !== 0) sorted.unshift({ startSec: 0, title: "Intro" });
  // Deduplicate chapters that are < 10s apart
  const deduped: Chapter[] = [];
  for (const ch of sorted) {
    const prev = deduped[deduped.length - 1];
    if (prev && ch.startSec - prev.startSec < 10) continue;
    deduped.push(ch);
  }
  if (deduped.length < 3) return ""; // YouTube requires ≥3 chapters
  return deduped.map(c => `${formatTimestamp(c.startSec)} ${c.title}`).join("\n");
}

// ─── AI fallback chapter generation ──────────────────────────────────────────

async function generateChaptersFromAI(
  game: string,
  durationSec: number,
  userId: string,
): Promise<Chapter[]> {
  const durationMin = Math.round(durationSec / 60);
  try {
    const result = await executeRoutedAICall(
      { taskType: "content", userId, maxTokens: 400 },
      "You generate YouTube chapter timestamps for gaming live stream VODs. Return only valid JSON.",
      `Generate chapter timestamps for a ${durationMin}-minute no-commentary ${game} live stream on PS5.
Create 5-10 chapters that represent natural game segments (intro, warmup, matches, highlights, etc).
First chapter MUST be at second 0. Space chapters realistically across the ${durationSec}s duration.

Return JSON array:
[{"startSec": 0, "title": "Intro"}, {"startSec": 90, "title": "First Match"}, ...]`,
    );
    return safeParseJSON<Chapter[]>(result.content, []);
  } catch {
    // Minimal fallback — divide into equal segments
    const segCount = Math.min(8, Math.max(3, Math.floor(durationSec / 300)));
    const segSec = Math.floor(durationSec / segCount);
    const segments = ["Intro", "Warmup", "First Match", "Mid Game", "Late Game", "Highlights", "Final Push", "Outro"];
    return Array.from({ length: segCount }, (_, i) => ({
      startSec: i * segSec,
      title: segments[i] ?? `Segment ${i + 1}`,
    }));
  }
}

// ─── Core: generate and apply chapters to a VOD ───────────────────────────────

export async function generateChaptersForVOD(
  userId: string,
  channelDbId: number,
  youtubeVideoId: string,
  streamId?: number,
  durationSec?: number,
  game?: string,
): Promise<boolean> {
  if (isQuotaBreakerTripped()) return false;

  try {
    const { oauth2Client } = await getAuthenticatedClient(channelDbId);
    const youtube = google.youtube({ version: "v3", auth: oauth2Client });

    // Fetch current description to check if already chaptered
    const videoRes = await youtube.videos.list({
      part: ["snippet"],
      id: [youtubeVideoId],
    });
    await trackQuotaUsage(userId, "read", 1);

    const snippet = videoRes.data.items?.[0]?.snippet;
    if (!snippet) return false;

    const currentDesc = snippet.description ?? "";
    if (currentDesc.includes(ALREADY_CHAPTERED_MARKER)) {
      logger.debug(`[ChapterGen] VOD ${youtubeVideoId} already chaptered — skipping`);
      return false;
    }

    const resolvedGame = game ?? await getFocusGame(userId);
    const resolvedDuration = durationSec ?? 3600; // default 1h if unknown

    // Build chapters from live clip moments first, then AI fallback
    let chapters: Chapter[] = [];

    if (streamId) {
      const moments = getClipMoments(streamId);
      if (moments.length >= 3) {
        // Use live clip moments as chapter anchors
        const state = await db.select({ startedAt: streams.startedAt })
          .from(streams)
          .where(eq(streams.id, streamId))
          .limit(1);
        const streamStart = state[0]?.startedAt ? new Date(state[0].startedAt).getTime() : Date.now() - resolvedDuration * 1000;

        chapters = moments.map(m => ({
          startSec: m.startSec,
          title: m.label.length > 40 ? m.label.slice(0, 40) : m.label,
        }));
        logger.info(`[ChapterGen] Built ${chapters.length} chapters from ${moments.length} live moments`);
      }
    }

    if (chapters.length < 3) {
      logger.info(`[ChapterGen] Insufficient live moments — using AI generation for ${resolvedGame}`);
      chapters = await generateChaptersFromAI(resolvedGame, resolvedDuration, userId);
    }

    const chapterBlock = buildChapterBlock(chapters);
    if (!chapterBlock) {
      logger.info(`[ChapterGen] Could not build valid chapter block for ${youtubeVideoId}`);
      return false;
    }

    // Prepend chapters to description
    const newDescription =
      `${chapterBlock}\n\n${ALREADY_CHAPTERED_MARKER}\n\n${currentDesc}`.trim();

    await youtube.videos.update({
      part: ["snippet"],
      requestBody: {
        id: youtubeVideoId,
        snippet: {
          ...snippet,
          description: newDescription,
        },
      },
    });
    await trackQuotaUsage(userId, "write", 1);

    logger.info(`[ChapterGen] Applied ${chapters.length} chapters to VOD ${youtubeVideoId}`);
    return true;
  } catch (err: any) {
    logger.warn(`[ChapterGen] Failed for ${youtubeVideoId}: ${err?.message?.slice(0, 100)}`);
    return false;
  }
}

// ─── Sweep: find recent VODs without chapters ─────────────────────────────────

async function runChapterSweep(): Promise<void> {
  if (isQuotaBreakerTripped()) return;

  try {
    const since7d = new Date(Date.now() - 7 * 24 * 60 * 60_000);

    // Find recently published VODs (long-form, from live streams) that lack chapters
    const candidates = await db
      .select({
        userId:    youtubeOutputMetrics.userId,
        videoId:   youtubeOutputMetrics.videoId,
        title:     youtubeOutputMetrics.title,
        game:      youtubeOutputMetrics.game,
        duration:  youtubeOutputMetrics.duration,
      })
      .from(youtubeOutputMetrics)
      .where(and(
        isNotNull(youtubeOutputMetrics.videoId),
        gte(youtubeOutputMetrics.publishedAt, since7d),
      ))
      .orderBy(desc(youtubeOutputMetrics.publishedAt))
      .limit(5);

    for (const vid of candidates) {
      if (!vid.videoId || !vid.userId) continue;

      const ytChannels = await db
        .select({ id: channels.id })
        .from(channels)
        .where(and(
          eq(channels.userId, vid.userId),
          eq(channels.platform, "youtube"),
          isNotNull(channels.accessToken),
        ))
        .limit(1);

      const ch = ytChannels[0];
      if (!ch) continue;

      await generateChaptersForVOD(
        vid.userId,
        ch.id,
        vid.videoId,
        undefined,
        vid.duration ?? undefined,
        vid.game ?? undefined,
      );

      // Respect quota — pace between videos
      await new Promise(r => setTimeout(r, 5000));
    }
  } catch (err: any) {
    logger.debug(`[ChapterGen] Sweep error: ${err?.message?.slice(0, 80)}`);
  }
}

// ─── Lifecycle ───────────────────────────────────────────────────────────────

let _stopFn: (() => void) | null = null;

export function startVODChapterGenerator(): void {
  if (_stopFn) return;

  // First sweep at T+45min (after post-stream processing has created VODs)
  setTimeout(async () => {
    try { await runChapterSweep(); } catch { /* non-fatal */ }
  }, 45 * 60_000);

  _stopFn = setJitteredInterval(async () => {
    try { await runChapterSweep(); } catch { /* non-fatal */ }
  }, 4 * 60 * 60_000); // every 4h ±20%

  logger.info("[ChapterGen] Started — first sweep in 45min, then every 4h");
}

export function stopVODChapterGenerator(): void {
  if (_stopFn) { _stopFn(); _stopFn = null; }
}
