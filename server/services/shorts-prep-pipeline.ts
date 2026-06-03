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

const log = createLogger("shorts-prep-pipeline");

// ─── Types ────────────────────────────────────────────────────────────────────
export interface ClipRecord {
  id: number;
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
  status: "ready_to_upload";
  preparedAt: Date;
}

// ─── Main prep function ───────────────────────────────────────────────────────
export async function prepareShortForUpload(clip: ClipRecord): Promise<ShortsReadyPayload> {
  log.info(`[ShortsPrepPipeline] Starting prep for clip ${clip.id} (video ${clip.videoId})`);
  const durationSec = clip.clipEndSec - clip.clipStartSec;

  // Step 1 — Hook extraction + moment scoring
  assertTierCapacity("shorts_pipeline", "shorts-prep");
  const hookAnalysis = await callOpenAI({
    tier: "shorts_pipeline",
    messages: [
      {
        role: "system",
        content:
          "You are a YouTube Shorts analyst for a no-commentary PS5 gaming channel. " +
          "Identify the single most compelling hook moment in a clip and write a " +
          "punchy one-sentence description of what happens. Be specific and visual.",
      },
      {
        role: "user",
        content:
          `Game: ${clip.gameName}\n` +
          `Source video: "${clip.sourceVideoTitle}"\n` +
          `Clip duration: ${durationSec}s (${clip.clipStartSec}s–${clip.clipEndSec}s)\n` +
          `Source description: ${clip.sourceVideoDescription?.slice(0, 400) ?? "none"}\n\n` +
          "In one sentence, describe the peak action moment in this clip. " +
          "Be specific: what happens, what the stakes feel like, why it is visually striking.",
      },
    ],
    maxTokens: 120,
  });
  const hookMoment = hookAnalysis.choices[0].message.content?.trim() ?? clip.sourceVideoTitle;
  log.info(`[ShortsPrepPipeline] Clip ${clip.id} hook: "${hookMoment}"`);

  // Step 2 — Title generation
  assertTierCapacity("shorts_pipeline", "shorts-prep");
  const titleResult = await callOpenAI({
    tier: "shorts_pipeline",
    messages: [
      {
        role: "system",
        content:
          "You are a YouTube Shorts title writer for a no-commentary PS5 gaming channel. " +
          "Write titles that are ≤100 characters, hook-first (emotion or curiosity gap in " +
          "the first 3 words), no clickbait, no ALL CAPS, no emojis. " +
          "The title should make someone stop scrolling. " +
          "Respond with ONLY the title, no quotes, no explanation.",
      },
      {
        role: "user",
        content:
          `Game: ${clip.gameName}\n` +
          `Hook moment: ${hookMoment}\n` +
          `Source title: ${clip.sourceVideoTitle}\n` +
          `Duration: ${durationSec} seconds\n\n` +
          "Write the YouTube Short title.",
      },
    ],
    maxTokens: 60,
  });
  const title =
    titleResult.choices[0].message.content?.trim().slice(0, 100) ?? clip.sourceVideoTitle;
  log.info(`[ShortsPrepPipeline] Clip ${clip.id} title: "${title}"`);

  // Step 3 — SEO description
  assertTierCapacity("shorts_pipeline", "shorts-prep");
  const descResult = await callOpenAI({
    tier: "shorts_pipeline",
    messages: [
      {
        role: "system",
        content:
          "You are an SEO specialist for a no-commentary PS5 gaming YouTube channel. " +
          "Write a YouTube Short description that: " +
          "(1) opens with the most searchable keyword phrase for this game and moment, " +
          "(2) describes what happens in the clip in 1-2 sentences, " +
          "(3) includes a subscribe CTA, " +
          "(4) ends with 3-5 relevant hashtags including #Shorts. " +
          "Total length: 150-300 characters. No filler phrases.",
      },
      {
        role: "user",
        content:
          `Game: ${clip.gameName}\n` +
          `Title: ${title}\n` +
          `Hook moment: ${hookMoment}\n` +
          `Channel: ${clip.channelName}\n\n` +
          "Write the YouTube Short description.",
      },
    ],
    maxTokens: 200,
  });
  const description = descResult.choices[0].message.content?.trim().slice(0, 5000) ?? "";
  log.info(
    `[ShortsPrepPipeline] Clip ${clip.id} description ready (${description.length} chars)`
  );

  // Step 4 — Tag set
  assertTierCapacity("shorts_pipeline", "shorts-prep");
  const tagsResult = await callOpenAI({
    tier: "shorts_pipeline",
    messages: [
      {
        role: "system",
        content:
          "You are a YouTube SEO specialist. Generate a tag set for a YouTube Short. " +
          "Rules: (1) 8-15 tags, (2) mix of broad game tags and specific moment tags, " +
          "(3) total character count ≤500 across all tags, " +
          "(4) ranked best-first by estimated search volume, " +
          "(5) respond with ONLY a JSON array of strings, no markdown.",
      },
      {
        role: "user",
        content:
          `Game: ${clip.gameName}\n` +
          `Title: ${title}\n` +
          `Hook moment: ${hookMoment}\n` +
          `Existing source tags: ${clip.sourceVideoTags?.slice(0, 10).join(", ") ?? "none"}\n\n` +
          "Generate the tag array.",
      },
    ],
    maxTokens: 200,
  });
  let tags: string[] = [];
  try {
    const raw = tagsResult.choices[0].message.content?.trim() ?? "[]";
    const cleaned = raw.replace(/```json|```/g, "").trim();
    const parsed = JSON.parse(cleaned) as string[];
    let totalChars = 0;
    tags = parsed.filter((t) => {
      totalChars += t.length + 1;
      return totalChars <= 500;
    });
  } catch {
    log.warn(`[ShortsPrepPipeline] Clip ${clip.id} tag parse failed — using fallback tags`);
    tags = [clip.gameName, "Gaming", "PS5", "Shorts", "NoCommentary"];
  }
  log.info(`[ShortsPrepPipeline] Clip ${clip.id} tags: [${tags.join(", ")}]`);

  // Step 5 — Persist to DB as ready_to_upload
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
