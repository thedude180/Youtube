/**
 * youtube-metadata-corrector.ts
 *
 * Corrects published YouTube video metadata when the game label in the title /
 * description / tags does not match the actual footage.
 *
 * How it works
 * ─────────────
 * 1. A KNOWN_CORRECTIONS list maps specific YouTube video IDs to their confirmed
 *    correct game name (these are human-verified, screenshot-confirmed mismatches).
 * 2. For each entry the service:
 *    a) Reads the source video's stored metadata from back_catalog_videos
 *       (description, tags, original title) so the new SEO copy can draw on
 *       the video's real content rather than re-hallucinating.
 *    b) Uses AI to regenerate a correct title, description, and tags using the
 *       actual game name and whatever usable signals exist in the source metadata.
 *    c) Calls updateYouTubeVideo() to push the corrected snippet to YouTube.
 *    d) Updates the back_catalog_videos row with the corrected metadata.
 * 3. Each correction is idempotent — a system_settings flag prevents re-running.
 * 4. The service is exposed via POST /api/admin/youtube/correct-game-metadata.
 */

import { db } from "../db";
import { backCatalogVideos, channels, systemSettings } from "@shared/schema";
import { eq, and, sql } from "drizzle-orm";
import { updateYouTubeVideo } from "../youtube";
import { getOpenAIClientBackground } from "../lib/openai";
import { createLogger } from "../lib/logger";

const log = createLogger("metadata-corrector");

// ── Known-bad video registry ────────────────────────────────────────────────────
// Add entries here whenever a video is confirmed wrong via screenshot / human review.
// youtubeVideoId: the ID of the VIDEO ON YOUTUBE that needs correcting
// correctGame:    the actual game shown in the footage
// reason:         brief human note explaining why we know it's wrong

interface KnownCorrection {
  youtubeVideoId: string;
  correctGame: string;
  reason: string;
}

export const KNOWN_CORRECTIONS: KnownCorrection[] = [
  {
    youtubeVideoId: "3NKTCjsIgAY",
    correctGame: "Assassin's Creed 3",
    reason: "Footage shows AC3 colonial-era gameplay (character Ellen visible); title/description incorrectly say Battlefield 6 due to AI generation error. Confirmed via screenshot 2026-06-06.",
  },
  // Add more entries here when new mismatches are identified.
];

// ── Helpers ──────────────────────────────────────────────────────────────────────

async function getFlag(key: string): Promise<boolean> {
  const [row] = await db
    .select({ value: systemSettings.value })
    .from(systemSettings)
    .where(eq(systemSettings.key, key))
    .limit(1);
  return row?.value === "true";
}

async function setFlag(key: string, value = "true"): Promise<void> {
  await db
    .insert(systemSettings)
    .values({ key, value, createdAt: new Date(), updatedAt: new Date() } as any)
    .onConflictDoUpdate({
      target: systemSettings.key,
      set: { value, updatedAt: new Date() },
    });
}

async function getChannelForUser(userId: string): Promise<number | null> {
  const [ch] = await db
    .select({ id: channels.id })
    .from(channels)
    .where(and(eq(channels.userId, userId), eq(channels.platform, "youtube")))
    .limit(1);
  return ch?.id ?? null;
}

// ── AI metadata generation ────────────────────────────────────────────────────────

interface GeneratedMetadata {
  title: string;
  description: string;
  tags: string[];
}

async function generateCorrectMetadata(
  youtubeVideoId: string,
  correctGame: string,
  sourceTitle: string,
  sourceDescription: string | null,
  sourceTags: string[] | null,
): Promise<GeneratedMetadata> {
  const openai = getOpenAIClientBackground();

  // Extract any usable content signals from the original metadata
  // (duration chapters, specific moments, locations that aren't game-name errors)
  const sourceContext = [
    sourceTitle ? `Original title: ${sourceTitle}` : "",
    sourceDescription ? `Original description (may have wrong game name):\n${sourceDescription.slice(0, 800)}` : "",
    sourceTags?.length ? `Original tags: ${sourceTags.slice(0, 20).join(", ")}` : "",
  ].filter(Boolean).join("\n\n");

  const prompt = `You are a YouTube SEO expert for the gaming channel ET Gaming 274.

A previously published video has the WRONG game label in its metadata. The actual footage shows "${correctGame}" gameplay. Please generate corrected YouTube metadata.

${sourceContext}

IMPORTANT RULES:
- The actual game in the video is: "${correctGame}"
- Remove ALL references to the wrong game from title, description, and tags
- Keep any useful content signals from the original (specific gameplay moments, tactics, timestamps if present)
- Title: max 100 chars, engaging, includes game name, no ALL CAPS, no spam
- Description: 200-400 words, includes chapters if the original had them, proper hashtags
- Tags: 15-20 tags, game-specific, SEO-optimized

Respond with ONLY valid JSON in this exact format:
{
  "title": "...",
  "description": "...",
  "tags": ["tag1", "tag2", ...]
}`;

  const response = await openai.chat.completions.create({
    model: "gpt-4o-mini",
    messages: [{ role: "user", content: prompt }],
    response_format: { type: "json_object" },
    max_tokens: 1200,
    temperature: 0.7,
  });

  const raw = response.choices[0]?.message?.content ?? "{}";
  let parsed: any;
  try {
    parsed = JSON.parse(raw);
  } catch {
    log.warn(`[MetadataCorrector] AI returned non-JSON for ${youtubeVideoId} — using fallback`);
    parsed = {};
  }

  const title = (typeof parsed.title === "string" && parsed.title.length > 5)
    ? parsed.title.slice(0, 100)
    : `${correctGame} Gameplay — PS5 No Commentary`;

  const description = (typeof parsed.description === "string" && parsed.description.length > 20)
    ? parsed.description.slice(0, 4500)
    : `${correctGame} gameplay on PS5. Raw, no commentary.\n\nhttps://etgaming247.com\nManaged with CreatorOS.`;

  const tags = Array.isArray(parsed.tags)
    ? parsed.tags.filter((t: any) => typeof t === "string" && t.length > 0).slice(0, 20)
    : [correctGame, "PS5 gameplay", "no commentary"];

  return { title, description, tags };
}

// ── Core correction logic ─────────────────────────────────────────────────────────

export interface CorrectionResult {
  youtubeVideoId: string;
  status: "corrected" | "already_done" | "skipped" | "error";
  newTitle?: string;
  error?: string;
}

async function correctOneVideo(
  correction: KnownCorrection,
  channelId: number,
): Promise<CorrectionResult> {
  const flagKey = `metadata_correction:${correction.youtubeVideoId}`;

  if (await getFlag(flagKey)) {
    log.info(`[MetadataCorrector] ${correction.youtubeVideoId} already corrected — skipping`);
    return { youtubeVideoId: correction.youtubeVideoId, status: "already_done" };
  }

  try {
    // 1. Load source metadata from back_catalog_videos (original YouTube import data)
    const [source] = await db
      .select({
        id: backCatalogVideos.id,
        title: backCatalogVideos.title,
        description: backCatalogVideos.description,
        tags: backCatalogVideos.tags,
        gameName: backCatalogVideos.gameName,
      })
      .from(backCatalogVideos)
      .where(eq(backCatalogVideos.youtubeVideoId, correction.youtubeVideoId))
      .limit(1);

    if (!source) {
      log.warn(`[MetadataCorrector] ${correction.youtubeVideoId} not found in back_catalog_videos — skipping`);
      return { youtubeVideoId: correction.youtubeVideoId, status: "skipped", error: "Not in back_catalog_videos" };
    }

    log.info(`[MetadataCorrector] Generating corrected metadata for ${correction.youtubeVideoId} → "${correction.correctGame}"`);

    // 2. Generate correct metadata using AI + original source signals
    const { title, description, tags } = await generateCorrectMetadata(
      correction.youtubeVideoId,
      correction.correctGame,
      source.title,
      source.description,
      source.tags,
    );

    log.info(`[MetadataCorrector] Generated title: "${title}"`);

    // 3. Push corrected metadata to YouTube
    await updateYouTubeVideo(
      channelId,
      correction.youtubeVideoId,
      { title, description, tags },
      "write",
    );

    log.info(`[MetadataCorrector] YouTube updated for ${correction.youtubeVideoId}`);

    // 4. Update back_catalog_videos with corrected metadata + game name
    await db.update(backCatalogVideos)
      .set({
        title,
        description,
        tags,
        gameName: correction.correctGame,
        minedForShorts: false,
        minedForLongForm: false,
        lastOptimizedAt: null,
        updatedAt: new Date(),
      })
      .where(eq(backCatalogVideos.youtubeVideoId, correction.youtubeVideoId));

    // 5. Mark done
    await setFlag(flagKey);
    log.info(`[MetadataCorrector] Correction complete for ${correction.youtubeVideoId} → "${correction.correctGame}"`);

    return { youtubeVideoId: correction.youtubeVideoId, status: "corrected", newTitle: title };
  } catch (err: any) {
    const msg = err?.message ?? String(err);
    log.warn(`[MetadataCorrector] Failed for ${correction.youtubeVideoId}: ${msg.slice(0, 200)}`);
    return { youtubeVideoId: correction.youtubeVideoId, status: "error", error: msg };
  }
}

// ── Public API ────────────────────────────────────────────────────────────────────

/**
 * Run metadata corrections for all entries in KNOWN_CORRECTIONS.
 * Idempotent — already-corrected videos are skipped.
 */
export async function runMetadataCorrections(userId: string): Promise<CorrectionResult[]> {
  const channelId = await getChannelForUser(userId);
  if (!channelId) {
    log.warn(`[MetadataCorrector] No YouTube channel for user ${userId.slice(0, 8)} — cannot correct metadata`);
    return KNOWN_CORRECTIONS.map(c => ({
      youtubeVideoId: c.youtubeVideoId,
      status: "skipped" as const,
      error: "No YouTube channel found",
    }));
  }

  const results: CorrectionResult[] = [];
  for (const correction of KNOWN_CORRECTIONS) {
    const result = await correctOneVideo(correction, channelId);
    results.push(result);
    // Brief pause between API calls to respect quota
    if (result.status === "corrected") {
      await new Promise(r => setTimeout(r, 1500));
    }
  }

  const corrected = results.filter(r => r.status === "corrected").length;
  const skipped   = results.filter(r => r.status === "already_done").length;
  const errors    = results.filter(r => r.status === "error").length;
  log.info(`[MetadataCorrector] Run complete — corrected:${corrected} skipped:${skipped} errors:${errors}`);

  return results;
}

/**
 * Check correction status for all KNOWN_CORRECTIONS (no writes).
 */
export async function getMetadataCorrectionStatus(): Promise<Array<{
  youtubeVideoId: string;
  correctGame: string;
  reason: string;
  done: boolean;
}>> {
  return Promise.all(
    KNOWN_CORRECTIONS.map(async (c) => ({
      youtubeVideoId: c.youtubeVideoId,
      correctGame: c.correctGame,
      reason: c.reason,
      done: await getFlag(`metadata_correction:${c.youtubeVideoId}`),
    }))
  );
}
