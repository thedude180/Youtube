/**
 * server/services/longform-prep-pipeline.ts
 *
 * Long-form Pre-Publication Pipeline
 *
 * Identical philosophy to shorts-prep-pipeline: ALL AI work happens here,
 * BEFORE any YouTube API call. When quota resets, the publisher just reads
 * ready rows and uploads — zero AI at upload time.
 *
 * Pipeline per video:
 *   1. Load video + back catalog data from DB
 *   2. AI: strategic scoring (should this video publish now vs defer?)
 *   3. AI: generate YouTube title (≤100 chars, search-optimized)
 *   4. AI: generate full SEO description with keyword sections + timestamps
 *   5. AI: generate tag set (≤500 chars, ranked by search volume)
 *   6. AI: generate chapter markers if clip has structure
 *   7. AI: generate thumbnail concept (composition + text + color direction)
 *   8. Write all metadata to DB → status: 'ready_to_upload'
 */
import { callOpenAI } from "../lib/openai";
import { callClaudeMessages } from "../lib/claude";
import { createLogger } from "../lib/logger";
import { setJitteredInterval } from "../lib/timer-utils";
import { assertTierCapacity } from "../lib/ai-semaphore";
import { storage } from "../storage";
import { getNextLongFormPublishTime, isLongFormScheduleSaturated, clearLongFormScheduleSaturation } from "./youtube-output-schedule";

const log = createLogger("longform-prep-pipeline");

// ─── Types ────────────────────────────────────────────────────────────────────
export interface VideoRecord {
  id: number;
  userId: string;
  youtubeVideoId: string | null;
  title: string;
  description: string | null;
  tags: string[];
  durationSec: number;
  viewCount: number;
  likeCount: number;
  gameName: string;
  channelName: string;
  filePath: string;
  publishedAt: Date | null;
  score: number | null;
}

interface ChapterMarker {
  timestampSec: number;
  label: string;
}

interface ThumbnailConcept {
  composition: string;
  textOverlay: string;
  colorGrade: string;
  focalElement: string;
  mood: string;
  avoidElements: string;
}

export interface LongformReadyPayload {
  videoId: number;
  title: string;
  description: string;
  tags: string[];
  categoryId: string;
  defaultLanguage: string;
  chapters: ChapterMarker[];
  thumbnailConcept: ThumbnailConcept;
  thumbnailFilePath: string | null;
  scheduledAt: Date;
  status: "ready_to_upload";
  preparedAt: Date;
}

// ─── Main prep function ───────────────────────────────────────────────────────
export async function prepareLongformForUpload(
  video: VideoRecord
): Promise<LongformReadyPayload> {
  log.info(
    `[LongformPrepPipeline] Starting prep for video ${video.id} — "${video.title}"`
  );
  const durationMin = Math.round(video.durationSec / 60);

  // Single batched OpenAI call — score + title + description + tags + chapters in one prompt
  // (5 sequential calls → 1, then Claude thumbnail separately)
  assertTierCapacity("longform_pipeline", "longform-prep");
  const batchResult = await callOpenAI({
    tier: "longform_pipeline",
    messages: [
      {
        role: "system",
        content:
          "You are a YouTube content strategist for a no-commentary PS5 gaming channel. " +
          "Generate all metadata for a long-form video in one response. " +
          "Respond ONLY with valid JSON (no markdown, no explanation):\n" +
          "{\n" +
          '  "publishScore": 0-100,\n' +
          '  "scoreReason": "one sentence",\n' +
          '  "title": "≤100 chars, keyword-first, creates curiosity, no clickbait, no ALL CAPS, no emojis",\n' +
          '  "description": "400-800 chars: (1) opening hook with searchable keyword in first 125 chars, (2) what video covers 2-3 sentences, (3) subscribe+notification CTA, (4) Watch more [Game] gameplay: with 3-4 search phrases, (5) 5-8 hashtags",\n' +
          '  "tags": ["10-20 tags, ≤500 total chars, ranked best-first by search volume"],\n' +
          '  "chapters": [{"timestampSec": 0, "label": "Intro"}] — 4-8 chapters, first MUST be 0:00 Intro, evenly spaced, labels ≤30 chars\n' +
          "}",
      },
      {
        role: "user",
        content:
          `Game: ${video.gameName}\n` +
          `Original title: ${video.title}\n` +
          `Duration: ${durationMin} minutes (${video.durationSec}s)\n` +
          `Historical views: ${video.viewCount} | Historical likes: ${video.likeCount}\n` +
          `Channel: ${video.channelName}\n` +
          `Original description: ${video.description?.slice(0, 500) ?? "none"}\n` +
          `Existing tags: ${video.tags?.slice(0, 10).join(", ") ?? "none"}\n\n` +
          "Generate all video metadata fields.",
      },
    ],
    maxTokens: 1200,
  });

  // Parse batch response with per-field fallbacks
  let publishScore = 70;
  let title = video.title;
  let description = "";
  let tags: string[] = [];
  let chapters: ChapterMarker[] = [];

  try {
    const raw = batchResult.choices[0].message.content?.trim() ?? "{}";
    const parsed = JSON.parse(raw.replace(/```json|```/g, "").trim());
    publishScore = typeof parsed.publishScore === "number" ? parsed.publishScore : 70;
    title = (parsed.title?.trim() || video.title).slice(0, 100);
    description = (parsed.description?.trim() || "").slice(0, 5000);
    if (Array.isArray(parsed.tags)) {
      let totalChars = 0;
      tags = parsed.tags.filter((t: unknown) => {
        totalChars += String(t).length + 1;
        return totalChars <= 500;
      });
    }
    if (Array.isArray(parsed.chapters) && parsed.chapters.length > 0) {
      chapters = parsed.chapters;
    }
  } catch {
    log.warn(`[LongformPrepPipeline] Video ${video.id} batch parse failed — using source title`);
    title = video.title;
  }

  if (!tags.length) {
    tags = [video.gameName, "Gaming", (video.gameName || "").replace(/\s+/g, ""), "NoCommentary", "Gameplay"];
  }
  if (!chapters.length && video.durationSec > 300) {
    const step = Math.floor(video.durationSec / 5);
    chapters = [
      { timestampSec: 0, label: "Intro" },
      { timestampSec: step, label: "Gameplay" },
      { timestampSec: step * 2, label: "Mid Game" },
      { timestampSec: step * 3, label: "Late Game" },
      { timestampSec: step * 4, label: "Finale" },
    ];
  }

  log.info(
    `[LongformPrepPipeline] Video ${video.id} score: ${publishScore}/100 | title: "${title}" | ` +
    `${tags.length} tags | ${chapters.length} chapters | desc: ${description.length} chars`,
  );

  // Step 6 — Thumbnail concept (Claude for visual reasoning)
  assertTierCapacity("longform_pipeline", "longform-prep");
  const thumbResult = await callClaudeMessages({
    tier: "longform_pipeline",
    messages: [
      {
        role: "user",
        content:
          "Design a YouTube gaming thumbnail concept for a long-form video.\n\n" +
          `Game: ${video.gameName}\n` +
          `Title: ${title}\n` +
          `Duration: ${durationMin} minutes\n\n` +
          "Output ONLY valid JSON:\n" +
          "{\n" +
          '  "composition": "subject positioning, rule-of-thirds notes",\n' +
          '  "textOverlay": "max 5 words, impact phrase",\n' +
          '  "colorGrade": "shadow and highlight color treatment",\n' +
          '  "focalElement": "single most eye-catching element + frame position",\n' +
          '  "mood": "2-3 emotion words",\n' +
          '  "avoidElements": "UI elements or visual clutter to exclude"\n' +
          "}\n\n" +
          "For PS5 gaming: favor destruction/action in upper frame, " +
          "strong contrast between foreground subject and background, " +
          "minimal on-screen HUD, one dominant accent color against desaturated background.",
      },
    ],
    maxTokens: 300,
  });

  let thumbnailConcept: ThumbnailConcept = {
    composition: "center subject, enemy threat upper right quadrant",
    textOverlay: "MUST WATCH GAMEPLAY",
    colorGrade: "cool blue shadows, warm orange highlights on subject",
    focalElement: "player character silhouette against explosion, lower left",
    mood: "epic, intense, awe",
    avoidElements: "no HUD overlay, no minimap, no health bars",
  };
  try {
    const raw =
      thumbResult.content[0].type === "text" ? thumbResult.content[0].text.trim() : "{}";
    thumbnailConcept = {
      ...thumbnailConcept,
      ...JSON.parse(raw.replace(/```json|```/g, "").trim()),
    };
  } catch {
    log.warn(
      `[LongformPrepPipeline] Video ${video.id} thumbnail parse failed — using defaults`
    );
  }

  // Step 7 — Append chapters to description if present
  let finalDescription = description;
  if (chapters.length > 0) {
    const chapterText = chapters
      .map((c) => {
        const m = Math.floor(c.timestampSec / 60);
        const s = String(c.timestampSec % 60).padStart(2, "0");
        return `${m}:${s} ${c.label}`;
      })
      .join("\n");
    finalDescription = `${description}\n\n${chapterText}`.slice(0, 5000);
  }

  // Step 8 — Claim a long-form publish slot
  let scheduledAt: Date;
  if (isLongFormScheduleSaturated(video.userId)) {
    log.debug(`[LongformPrepPipeline] Long-form schedule saturated for ${video.userId.slice(0, 8)} — using +24h fallback`);
    scheduledAt = new Date(Date.now() + 24 * 3_600_000);
  } else
  try {
    scheduledAt = await getNextLongFormPublishTime(video.userId);
    log.info(`[LongformPrepPipeline] Video ${video.id} scheduled → ${scheduledAt.toISOString()}`);
  } catch (e) {
    scheduledAt = new Date(Date.now() + 3_600_000);
    log.warn(`[LongformPrepPipeline] Video ${video.id} slot claim failed, using fallback:`, e);
  }

  // Step 9 — Persist to DB
  const payload: LongformReadyPayload = {
    videoId: video.id,
    title,
    description: finalDescription,
    tags,
    categoryId: "20",
    defaultLanguage: "en",
    chapters,
    thumbnailConcept,
    thumbnailFilePath: null,
    scheduledAt,
    status: "ready_to_upload",
    preparedAt: new Date(),
  };
  await storage.upsertLongformReadyPayload(video.id, payload);
  log.info(
    `[LongformPrepPipeline] ✅ Video ${video.id} → ready_to_upload | ` +
      `score: ${publishScore} | title: "${title}" | tags: ${tags.length} | chapters: ${chapters.length}`
  );
  return payload;
}

// ─── Batch runner ─────────────────────────────────────────────────────────────
export async function runLongformPrepCycle(userId: string): Promise<void> {
  log.info(`[LongformPrepPipeline] Starting prep cycle for user ${userId}`);
  const pendingVideos = await storage.getDownloadedVideosWithoutReadyPayload(userId);
  log.info(`[LongformPrepPipeline] ${pendingVideos.length} videos awaiting prep`);

  for (const video of pendingVideos) {
    try {
      await prepareLongformForUpload(video);
      await new Promise((r) => setTimeout(r, 5000));
    } catch (err: any) {
      if (err.message?.includes("AI queue full")) {
        log.warn("[LongformPrepPipeline] Queue full — pausing, will retry next interval");
        break;
      }
      log.error(`[LongformPrepPipeline] Failed to prep video ${video.id}:`, err);
    }
  }
  log.info("[LongformPrepPipeline] Prep cycle complete");
}

// ─── Service lifecycle ────────────────────────────────────────────────────────
let _stopPrepCycle: (() => void) | null = null;

export function startLongformPrepPipeline(userId: string): void {
  if (_stopPrepCycle) {
    log.warn("[LongformPrepPipeline] Already running — skipping double-start");
    return;
  }
  log.info("[LongformPrepPipeline] Starting — prep interval: ~30 min");
  _stopPrepCycle = setJitteredInterval(
    () =>
      runLongformPrepCycle(userId).catch((err) =>
        log.error("[LongformPrepPipeline] Cycle error:", err)
      ),
    30 * 60 * 1000
  );
}

export function stopLongformPrepPipeline(): void {
  if (_stopPrepCycle) {
    _stopPrepCycle();
    _stopPrepCycle = null;
    log.info("[LongformPrepPipeline] Stopped");
  }
}
