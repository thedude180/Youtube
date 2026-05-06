/**
 * youtube-longform-segmenter.ts
 *
 * Phase 1: Multi-segment extraction for source videos longer than 60 minutes.
 *
 * For videos <= 60 min: extract at most 1 segment (the whole video or best
 * sub-section), identical to the previous grinder behaviour.
 *
 * For videos >  60 min: identify multiple non-overlapping 8-60 minute
 * segments via a single AI call, each with:
 *   • strong opening (no menus / loading screens)
 *   • sufficient action or story density
 *   • clean ending
 *   • title / description / tags / quality / retention scores
 *
 * Coverage is persisted in longformExtractionSegments so the same timestamp
 * range is never queued twice, even across separate grinder cycles.
 */

import { db } from "../db";
import {
  longformExtractionSegments,
  autopilotQueue,
  videos,
  channels,
} from "@shared/schema";
import { eq, and, sql } from "drizzle-orm";
import { createLogger } from "../lib/logger";
import { callClaudeBackground, CLAUDE_MODELS } from "../lib/claude";
import { sanitizeForPrompt } from "../lib/ai-attack-shield";
import { getNextLongFormPublishTime } from "./youtube-output-schedule";

const logger = createLogger("yt-segmenter");

const MIN_SEGMENT_SEC = 480;   // 8 min (AdSense mid-roll threshold)
const MAX_SEGMENT_SEC = 3600;  // 60 min hard ceiling
const LONG_VIDEO_THRESHOLD_SEC = 3600; // 60 min — trigger multi-segment mode
const OVERLAP_TOLERANCE_SEC = 60;     // allow up to 60s overlap between segments

// ── Helper: overlap check ─────────────────────────────────────────────────────

function overlaps(
  aStart: number, aEnd: number,
  bStart: number, bEnd: number,
): boolean {
  return aStart < bEnd - OVERLAP_TOLERANCE_SEC &&
    bStart < aEnd - OVERLAP_TOLERANCE_SEC;
}

// ── Helper: duration bucket label ────────────────────────────────────────────

function parseDurationToSeconds(d: string | number | undefined): number {
  if (!d) return 0;
  if (typeof d === "number") return d;
  const parts = String(d).split(":").map(Number);
  if (parts.length === 3) return parts[0] * 3600 + parts[1] * 60 + parts[2];
  if (parts.length === 2) return parts[0] * 60 + parts[1];
  return Number(d) || 0;
}

// ── AI: identify segments ─────────────────────────────────────────────────────

interface AISegment {
  startSec: number;
  endSec: number;
  title: string;
  description: string;
  tags: string[];
  hookDescription: string;
  endingType: string;
  contentCategory: string;
  qualityScore: number;
  retentionScore: number;
  reasonThisWorks: string;
}

async function identifySegmentsWithAI(
  video: { id: number; title: string; description?: string | null; metadata: any },
  existingCoverage: Array<{ startSec: number; endSec: number }>,
  durSec: number,
): Promise<AISegment[]> {
  const meta = (video.metadata ?? {}) as Record<string, any>;
  const gameName = meta.gameName || meta.game || "Gaming";
  const isLongVideo = durSec > LONG_VIDEO_THRESHOLD_SEC;
  const maxSegments = isLongVideo
    ? Math.min(8, Math.floor(durSec / MIN_SEGMENT_SEC))
    : 1;

  const coveredStr = existingCoverage.length > 0
    ? `Already extracted ranges (AVOID these): ${JSON.stringify(existingCoverage.slice(0, 20))}`
    : "No ranges extracted yet — this is a fresh video.";

  const prompt = `You are an expert YouTube video editor specializing in no-commentary PS5 gaming content.

VIDEO: "${sanitizeForPrompt(video.title, 200)}"
GAME: "${sanitizeForPrompt(gameName, 100)}"
TOTAL DURATION: ${Math.floor(durSec / 60)} minutes (${durSec} seconds)
${coveredStr}

TASK: Identify ${isLongVideo ? `up to ${maxSegments} compelling` : "the single best"} standalone long-form segment${isLongVideo ? "s" : ""} from this video.

Each segment MUST:
- Be between ${MIN_SEGMENT_SEC} and ${MAX_SEGMENT_SEC} seconds (${Math.round(MIN_SEGMENT_SEC / 60)}–${Math.round(MAX_SEGMENT_SEC / 60)} minutes)
- NOT overlap with already-extracted ranges
- Start with visually compelling action (NOT a loading screen, menu, inventory, or slow walk)
- Have internal pacing — something interesting every 60–90 seconds
- End on a satisfying note (victory, discovery, cinematic moment, or cliffhanger)
- Be about "${sanitizeForPrompt(gameName, 100)}" ONLY — do not reference any other game

IDEAL SEGMENT TYPES for no-commentary PS5 gaming:
- Complete boss fight from start to finish
- Key story mission or chapter
- Intense combat gauntlet  
- Exploration with beautiful environments
- Speed-run of a recognizable area
- A sequence that peaks emotionally or mechanically

SCORING:
- qualityScore 1-10: overall standalone watchability
- retentionScore 1-10: how well viewers will stay through the end

Return raw JSON only (no markdown, no code blocks):
{
  "segments": [
    {
      "startSec": number,
      "endSec": number,
      "title": "string — compelling YouTube title under 80 chars",
      "description": "string — 2-sentence hook for YouTube description",
      "tags": ["string", ...up to 10 tags],
      "hookDescription": "string — what happens in the very first 5 seconds",
      "endingType": "victory|discovery|cliffhanger|cinematic|boss_defeat|area_clear",
      "contentCategory": "boss_fight|exploration|combat|story|speed_run|challenge",
      "qualityScore": number,
      "retentionScore": number,
      "reasonThisWorks": "string — 1 sentence why this keeps viewers watching"
    }
  ]
}`;

  const resp = await callClaudeBackground({
    model: CLAUDE_MODELS.sonnet,
    prompt,
    maxTokens: 2000,
    temperature: 0.7,
  });

  try {
    const raw = resp.content || "{}";
    const fenceMatch = raw.match(/^```(?:json)?\s*\n?([\s\S]*?)\n?```\s*$/i);
    const clean = fenceMatch ? fenceMatch[1] : raw;
    const parsed = JSON.parse(clean);
    return Array.isArray(parsed.segments) ? parsed.segments : [];
  } catch {
    return [];
  }
}

// ── Public API ────────────────────────────────────────────────────────────────

/**
 * Analyse a source video and return segment candidates without writing to DB.
 * Used for preview / dry-run.
 */
export async function analyzeLongFormSourceVideo(
  userId: string,
  videoId: number,
): Promise<AISegment[]> {
  const [video] = await db.select().from(videos).where(eq(videos.id, videoId)).limit(1);
  if (!video) throw new Error(`Video ${videoId} not found`);

  const meta = (video.metadata ?? {}) as Record<string, any>;
  const durSec = meta.durationSec || parseDurationToSeconds(meta.duration) || 0;
  if (durSec < MIN_SEGMENT_SEC) return [];

  const existing = await db
    .select({ startSec: longformExtractionSegments.startSec, endSec: longformExtractionSegments.endSec })
    .from(longformExtractionSegments)
    .where(and(
      eq(longformExtractionSegments.userId, userId),
      eq(longformExtractionSegments.sourceVideoId, videoId),
    ));

  return identifySegmentsWithAI(video, existing, durSec);
}

/**
 * Identify segments and queue the best ones for upload, respecting daily caps.
 * Returns the number of segments newly queued.
 */
export async function queueLongFormSegments(
  userId: string,
  videoId: number,
): Promise<number> {
  const [video] = await db.select().from(videos).where(eq(videos.id, videoId)).limit(1);
  if (!video) return 0;

  const meta = (video.metadata ?? {}) as Record<string, any>;
  const durSec = meta.durationSec || parseDurationToSeconds(meta.duration) || 0;
  if (durSec < MIN_SEGMENT_SEC) return 0;

  const existing = await db
    .select({
      startSec: longformExtractionSegments.startSec,
      endSec: longformExtractionSegments.endSec,
    })
    .from(longformExtractionSegments)
    .where(and(
      eq(longformExtractionSegments.userId, userId),
      eq(longformExtractionSegments.sourceVideoId, videoId),
    ));

  const gameName = (meta.gameName || meta.game || "Gaming") as string;
  const youtubeId = (meta.youtubeId || meta.youtubeVideoId) as string | undefined;

  // Find YouTube channel
  const ytChannels = await db.select().from(channels)
    .where(and(eq(channels.userId, userId), eq(channels.platform, "youtube")));
  const ytChannel = ytChannels.find((c: any) => c.accessToken) || ytChannels[0];

  let aiSegments: AISegment[] = [];
  try {
    aiSegments = await identifySegmentsWithAI(video, existing, durSec);
  } catch (err: any) {
    logger.warn(`[Segmenter] AI call failed for video ${videoId}: ${err.message?.slice(0, 200)}`);
    return 0;
  }

  if (!aiSegments.length) return 0;

  // Filter: must be within bounds, not overlap existing, sorted by quality desc
  const valid = aiSegments
    .filter(s => {
      const dur = s.endSec - s.startSec;
      if (typeof s.startSec !== "number" || typeof s.endSec !== "number") return false;
      if (dur < MIN_SEGMENT_SEC || dur > MAX_SEGMENT_SEC) return false;
      if (s.endSec > durSec || s.startSec < 0) return false;
      // Not overlapping with already-extracted segments
      const blocked = existing.some(e => overlaps(s.startSec, s.endSec, e.startSec, e.endSec));
      if (blocked) return false;
      // Not overlapping with other segments in this batch
      return true;
    })
    .sort((a, b) => (b.qualityScore + b.retentionScore) - (a.qualityScore + a.retentionScore));

  // De-overlap within this batch
  const deduplicated: AISegment[] = [];
  for (const seg of valid) {
    const blocked = deduplicated.some(d => overlaps(seg.startSec, seg.endSec, d.startSec, d.endSec));
    if (!blocked) deduplicated.push(seg);
  }

  let queued = 0;
  for (const seg of deduplicated) {
    try {
      const scheduledAt = await getNextLongFormPublishTime(userId);
      const title = String(seg.title || `${gameName} Gameplay`).substring(0, 90);
      const description = String(
        seg.description || `${gameName} gameplay — no commentary.\n\n#PS5 #NoCommentary #Gaming`,
      ).substring(0, 5000);
      const tags = [
        ...(Array.isArray(seg.tags) ? seg.tags : []),
        "no commentary", "PS5", gameName, "gaming",
      ];

      // Record coverage BEFORE queuing to prevent race conditions
      const [coverage] = await db.insert(longformExtractionSegments).values({
        userId,
        sourceVideoId: videoId,
        startSec: Math.round(seg.startSec),
        endSec: Math.round(seg.endSec),
        durationSec: Math.round(seg.endSec - seg.startSec),
        title,
        description,
        tags,
        gameName,
        qualityScore: Math.round(Math.min(10, Math.max(1, seg.qualityScore || 5))),
        retentionScore: Math.round(Math.min(10, Math.max(1, seg.retentionScore || 5))),
        hookDescription: seg.hookDescription,
        endingType: seg.endingType,
        contentCategory: seg.contentCategory,
        status: "queued",
        metadata: { reasonThisWorks: seg.reasonThisWorks, multiSegmentExtraction: durSec > LONG_VIDEO_THRESHOLD_SEC },
      }).returning();

      const [queueItem] = await db.insert(autopilotQueue).values({
        userId,
        sourceVideoId: videoId,
        type: "auto-clip",
        targetPlatform: "youtube",
        content: description,
        caption: title,
        status: "scheduled",
        scheduledAt,
        metadata: {
          contentType: "long-form-clip",
          segmentStartSec: Math.round(seg.startSec),
          segmentEndSec: Math.round(seg.endSec),
          targetDurationSec: Math.round(seg.endSec - seg.startSec),
          actualDurationSec: Math.round(seg.endSec - seg.startSec),
          gameName,
          sourceYoutubeId: youtubeId,
          noCommentary: true,
          contentQualityScore: seg.qualityScore || 5,
          retentionScore: seg.retentionScore || 5,
          hookDescription: seg.hookDescription,
          endingType: seg.endingType,
          contentCategory: seg.contentCategory,
          reasonThisWorks: seg.reasonThisWorks,
          grinderGenerated: true,
          segmenterGenerated: true,
          multiSegment: durSec > LONG_VIDEO_THRESHOLD_SEC,
          coverageId: coverage.id,
          tags,
        } as any,
      }).returning();

      // Link coverage row back to the queue item
      await db.update(longformExtractionSegments)
        .set({ queueItemId: queueItem.id })
        .where(eq(longformExtractionSegments.id, coverage.id));

      logger.info(
        `[Segmenter] Queued segment ${Math.round(seg.startSec / 60)}–${Math.round(seg.endSec / 60)}min ` +
        `from video ${videoId} | q=${seg.qualityScore} r=${seg.retentionScore} → ${scheduledAt.toISOString()}`,
        { userId: userId.slice(0, 8) },
      );
      queued++;
    } catch (err: any) {
      logger.warn(`[Segmenter] Failed to queue segment for video ${videoId}: ${err.message?.slice(0, 200)}`);
    }
  }

  return queued;
}

/**
 * Return all extraction segments for a source video (coverage map).
 */
export async function getExtractionCoverage(
  userId: string,
  videoId: number,
): Promise<LongformExtractionSegment[]> {
  return db.select().from(longformExtractionSegments)
    .where(and(
      eq(longformExtractionSegments.userId, userId),
      eq(longformExtractionSegments.sourceVideoId, videoId),
    ))
    .orderBy(longformExtractionSegments.startSec);
}

type LongformExtractionSegment = typeof longformExtractionSegments.$inferSelect;

/**
 * Mark a coverage segment as exhausted (no further use).
 */
export async function markSegmentExhausted(
  userId: string,
  videoId: number,
  segmentId: number,
): Promise<void> {
  await db.update(longformExtractionSegments)
    .set({ status: "exhausted", updatedAt: new Date() })
    .where(and(
      eq(longformExtractionSegments.id, segmentId),
      eq(longformExtractionSegments.userId, userId),
      eq(longformExtractionSegments.sourceVideoId, videoId),
    ));
}

/**
 * True if the source video has un-extracted time ranges worth mining.
 * Used by the grinder to decide whether to call the segmenter.
 */
export async function hasUnminedFootage(
  userId: string,
  videoId: number,
  durSec: number,
): Promise<boolean> {
  if (durSec < MIN_SEGMENT_SEC) return false;

  const existing = await db
    .select({ startSec: longformExtractionSegments.startSec, endSec: longformExtractionSegments.endSec })
    .from(longformExtractionSegments)
    .where(and(
      eq(longformExtractionSegments.userId, userId),
      eq(longformExtractionSegments.sourceVideoId, videoId),
    ));

  if (existing.length === 0) return true;

  // For long videos, check if the covered range leaves at least one more 8-min window
  const coveredSec = existing.reduce((acc, e) => acc + Math.max(0, e.endSec - e.startSec), 0);
  const maxExtractable = Math.floor(durSec / MIN_SEGMENT_SEC);
  return existing.length < maxExtractable && coveredSec < durSec * 0.9;
}
