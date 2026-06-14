/**
 * server/services/shorts-prep-pipeline.ts
 *
 * Shorts Pre-Publication Pipeline
 *
 * Runs BEFORE any YouTube API call. Does ALL AI work so that when YouTube
 * quota resets at midnight Pacific, the publisher just reads ready rows
 * and POSTs — zero AI calls at upload time.
 *
 * Pipeline per clip:
 *   1. Load clip + source video metadata from DB
 *   2. AI: score clip moment + extract hook line
 *   3. AI: generate YouTube Short title (≤100 chars, hook-first)
 *   4. AI: generate SEO description (keyword-rich, CTA, hashtags)
 *   5. AI: generate tag set (≤500 chars total, ranked by search volume)
 *   6. Write all metadata to DB → status: 'ready_to_upload'
 *
 * NOTE: Shorts intentionally have NO custom thumbnail.
 * YouTube Shorts are discovered through the Shorts feed which uses a frame
 * from the video, not a custom thumbnail. Uploading a custom thumbnail to a
 * Short wastes quota and doesn't improve CTR.
 */
import { callOpenAI } from "../lib/openai";
import { createLogger } from "../lib/logger";
import { setJitteredInterval } from "../lib/timer-utils";
import { assertTierCapacity } from "../lib/ai-semaphore";
import { storage } from "../storage";
import { getNextShortPublishTime } from "./youtube-output-schedule";

const log = createLogger("shorts-prep-pipeline");

// ─── Types ────────────────────────────────────────────────────────────────────
export interface ClipRecord {
  id: number;
  userId: string;
  videoId: number;
  sourceVideoTitle: string;
  sourceVideoDescription: string;
  sourceVideoTags: string[];
  clipStartSec: number;
  clipEndSec: number;
  clipFilePath: string;
  gameName: string;
  channelName: string;
  hookMomentDescription?: string;
}


export interface ShortsReadyPayload {
  clipId: number;
  title: string;
  description: string;
  tags: string[];
  categoryId: string;
  defaultLanguage: string;
  thumbnailConcept: null;
  thumbnailFilePath: null;
  scheduledAt: Date;
  status: "ready_to_upload";
  preparedAt: Date;
}

// ─── Main prep function ───────────────────────────────────────────────────────
export async function prepareShortForUpload(clip: ClipRecord): Promise<ShortsReadyPayload> {
  log.info(`[ShortsPrepPipeline] Starting prep for clip ${clip.id} (video ${clip.videoId})`);
  const durationSec = clip.clipEndSec - clip.clipStartSec;

  // Single batched AI call — all 4 metadata fields in one prompt (4× fewer API roundtrips)
  assertTierCapacity("shorts_pipeline", "shorts-prep");
  const batchResult = await callOpenAI({
    tier: "shorts_pipeline",
    messages: [
      {
        role: "system",
        content:
          "You are a YouTube Shorts content specialist for a no-commentary PS5 gaming channel. " +
          "Generate all metadata for a Short in one response. " +
          "Respond ONLY with valid JSON (no markdown, no explanation):\n" +
          "{\n" +
          '  "hookMoment": "one sentence — specific peak action, what happens, why visually striking",\n' +
          '  "title": "≤100 chars, hook-first with emotion/curiosity in first 3 words, no clickbait, no ALL CAPS, no emojis",\n' +
          '  "description": "150-300 chars: searchable keyword phrase first, 1-2 sentences describing clip, subscribe CTA, 3-5 hashtags including #Shorts",\n' +
          '  "tags": ["8-15 tags, ≤500 total chars, ranked best-first by search volume"]\n' +
          "}",
      },
      {
        role: "user",
        content:
          `Game: ${clip.gameName}\n` +
          `Source video: "${clip.sourceVideoTitle}"\n` +
          `Clip: ${durationSec}s (${clip.clipStartSec}s–${clip.clipEndSec}s)\n` +
          `Source description: ${clip.sourceVideoDescription?.slice(0, 400) ?? "none"}\n` +
          `Channel: ${clip.channelName}\n` +
          `Source tags: ${clip.sourceVideoTags?.slice(0, 10).join(", ") ?? "none"}\n\n` +
          "Generate all Short metadata fields.",
      },
    ],
    maxTokens: 620,
  });

  // Parse batch response with per-field fallbacks
  let hookMoment = clip.sourceVideoTitle;
  let title = clip.sourceVideoTitle;
  let description = "";
  let tags: string[] = [];

  try {
    const raw = batchResult.choices[0].message.content?.trim() ?? "{}";
    const parsed = JSON.parse(raw.replace(/```json|```/g, "").trim());
    hookMoment = parsed.hookMoment?.trim() || clip.sourceVideoTitle;
    title = (parsed.title?.trim() || clip.sourceVideoTitle).slice(0, 100);
    description = (parsed.description?.trim() || "").slice(0, 4800);
    if (Array.isArray(parsed.tags)) {
      let totalChars = 0;
      tags = parsed.tags.filter((t: unknown) => {
        totalChars += String(t).length + 1;
        return totalChars <= 500;
      });
    }
  } catch {
    log.warn(`[ShortsPrepPipeline] Clip ${clip.id} batch parse failed — using source title`);
    title = clip.sourceVideoTitle;
  }

  if (!tags.length) {
    tags = [clip.gameName, "Gaming", (clip.gameName || "").replace(/\s+/g, ""), "Shorts", "NoCommentary"];
  }

  log.info(`[ShortsPrepPipeline] Clip ${clip.id} hook: "${hookMoment}" | title: "${title}" | ${tags.length} tags`);

  // Append source-video back-link so viewers can find the full video.
  if (clip.videoId) {
    try {
      const sourceVideo = await storage.getVideo(clip.videoId);
      const srcYtId =
        (sourceVideo?.metadata as any)?.youtubeId ??
        (sourceVideo?.metadata as any)?.youtubeVideoId ??
        null;
      if (srcYtId) {
        description = `${description}\n\n📺 Full video: https://www.youtube.com/watch?v=${srcYtId}`.slice(0, 5000);
        log.info(`[ShortsPrepPipeline] Clip ${clip.id} source link appended → yt:${srcYtId}`);
      } else {
        description = `${description}\n\n📺 From: ${clip.sourceVideoTitle}`.slice(0, 5000);
        log.info(`[ShortsPrepPipeline] Clip ${clip.id} no YouTube ID — used source title`);
      }
    } catch (e) {
      log.warn(`[ShortsPrepPipeline] Clip ${clip.id} source video lookup failed:`, e);
    }
  }

  // Step 5 — Claim a scheduled publish slot
  // Claiming happens here (pre-upload) so the output schedule stays coherent
  // even if multiple clips finish prep at the same time.
  let scheduledAt: Date;
  try {
    scheduledAt = await getNextShortPublishTime(clip.userId);
    log.info(`[ShortsPrepPipeline] Clip ${clip.id} scheduled → ${scheduledAt.toISOString()}`);
  } catch (e) {
    // Fall back to 1 hour from now so the publisher can still pick it up.
    scheduledAt = new Date(Date.now() + 3_600_000);
    log.warn(`[ShortsPrepPipeline] Clip ${clip.id} slot claim failed, using fallback:`, e);
  }

  // Step 6 — Persist to DB as ready_to_upload
  // NOTE: thumbnailConcept is intentionally null — Shorts use a video frame,
  // not a custom thumbnail. Custom thumbnails on Shorts waste quota and do not
  // improve discovery in the Shorts feed.
  const payload: ShortsReadyPayload = {
    clipId: clip.id,
    title,
    description,
    tags,
    categoryId: "20",
    defaultLanguage: "en",
    thumbnailConcept: null,
    thumbnailFilePath: null,
    scheduledAt,
    status: "ready_to_upload",
    preparedAt: new Date(),
  };
  await storage.upsertShortsReadyPayload(clip.id, payload);
  log.info(`[ShortsPrepPipeline] ✅ Clip ${clip.id} → ready_to_upload | title: "${title}"`);
  return payload;
}

// ─── Batch runner ─────────────────────────────────────────────────────────────
export async function runShortsPrepCycle(userId: string): Promise<void> {
  log.info(`[ShortsPrepPipeline] Starting prep cycle for user ${userId}`);
  const pendingClips = await storage.getEncodedClipsWithoutReadyPayload(userId);
  log.info(`[ShortsPrepPipeline] ${pendingClips.length} clips awaiting prep`);

  for (const clip of pendingClips) {
    try {
      await prepareShortForUpload(clip);
      await new Promise((r) => setTimeout(r, 3000));
    } catch (err: any) {
      if (err.message?.includes("AI queue full")) {
        log.warn(
          "[ShortsPrepPipeline] Queue full — pausing prep cycle, will retry next interval"
        );
        break;
      }
      log.error(`[ShortsPrepPipeline] Failed to prep clip ${clip.id}:`, err);
    }
  }
  log.info("[ShortsPrepPipeline] Prep cycle complete");
}

// ─── Service lifecycle ────────────────────────────────────────────────────────
let _stopPrepCycle: (() => void) | null = null;

export function startShortsPrepPipeline(userId: string): void {
  if (_stopPrepCycle) {
    log.warn("[ShortsPrepPipeline] Already running — skipping double-start");
    return;
  }
  log.info("[ShortsPrepPipeline] Starting — prep interval: ~20 min");
  _stopPrepCycle = setJitteredInterval(
    () =>
      runShortsPrepCycle(userId).catch((err) =>
        log.error("[ShortsPrepPipeline] Cycle error:", err)
      ),
    20 * 60 * 1000
  );
}

export function stopShortsPrepPipeline(): void {
  if (_stopPrepCycle) {
    _stopPrepCycle();
    _stopPrepCycle = null;
    log.info("[ShortsPrepPipeline] Stopped");
  }
}
