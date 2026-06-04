/**
 * pre-seo.ts
 *
 * Nightly service that pre-generates ALL SEO (title, description, tags) and
 * extracts thumbnail frames for every queued clip BEFORE the midnight reset.
 *
 * This turns the midnight batch into a pure copy-paste to YouTube:
 *   - Video file already encoded (pre-encoder at 9 PM)
 *   - Title / description / tags already AI-written (this service at 8 PM)
 *   - Thumbnail frame already extracted (this service)
 *   - Publisher just calls YouTube API with ready data → seconds, not minutes
 *
 * Flow per queued item:
 *   1. Find all autopilotQueue items with status="scheduled" and no seoTitle
 *   2. Resolve source video context (game, title) from backCatalogVideos
 *   3. Call Claude Haiku to generate title + descriptionIntro + tags
 *   4. If metadata.preEncodedPath exists → ffmpeg extract thumbnail frame
 *   5. Atomically write seoTitle / seoDescription / seoTags / thumbnailPath
 *      into metadata (only if still "scheduled")
 *
 * Publishers read metadata.seoTitle first and skip AI generation entirely,
 * and upload the thumbnail immediately after the video upload call.
 *
 * Schedule: 8 PM Pacific nightly (1 hour before pre-encoder at 9 PM).
 *           Also runs 10 minutes after startup to catch near-due items.
 */

import path from "path";
import fs from "fs";
import { spawn } from "child_process";
import { db } from "../db";
import { autopilotQueue, backCatalogVideos, streams } from "@shared/schema";
import { eq, and, isNull, sql } from "drizzle-orm";
import { createLogger } from "../lib/logger";
import { callClaudeBackground, CLAUDE_MODELS } from "../lib/claude";
import { sanitizeForPrompt, tokenBudget } from "../lib/ai-attack-shield";
import { tryAcquireAISlotNow, releaseAISlot } from "../lib/ai-semaphore";

const logger = createLogger("pre-seo");

const THUMBNAIL_DIR =
  process.env.THUMBNAIL_DIR ?? path.join(process.cwd(), "data", "thumbnails");

// No per-run cap — process every queued item that lacks SEO on each cycle.
// The AI semaphore + token budget are the real rate limiters.
// Cycle runs every 6 h so a 10,000-item queue is fully prepped within a day.
const MAX_ITEMS_PER_RUN = 10_000;

// ── Directory setup ───────────────────────────────────────────────────────────

function ensureDirs(): void {
  if (!fs.existsSync(THUMBNAIL_DIR)) {
    fs.mkdirSync(THUMBNAIL_DIR, { recursive: true });
  }
}

// ── ffmpeg thumbnail frame extraction ────────────────────────────────────────

function runCmd(bin: string, args: string[]): Promise<void> {
  return new Promise((resolve, reject) => {
    const proc = spawn(bin, args, { stdio: ["ignore", "pipe", "pipe"] });
    const errBufs: Buffer[] = [];
    proc.stderr?.on("data", (d: Buffer) => errBufs.push(d));
    proc.on("close", (code) => {
      if (code === 0) return resolve();
      const msg = Buffer.concat(errBufs).toString("utf8").slice(-300);
      reject(new Error(`ffmpeg exited ${code}: ${msg}`));
    });
    proc.on("error", reject);
  });
}

/**
 * Extract a single frame from a video file as a JPEG thumbnail.
 * Uses 25% into the video — enough to avoid the black intro frame,
 * early enough to show the main action.
 */
async function extractThumbnailFrame(
  videoPath: string,
  durationSec: number,
  outputPath: string,
): Promise<void> {
  const seekSec = Math.max(3, Math.floor(durationSec * 0.25));
  await runCmd("ffmpeg", [
    "-y",
    "-ss", String(seekSec),
    "-i", videoPath,
    "-vframes", "1",
    "-vf", "scale=1280:720:force_original_aspect_ratio=decrease,pad=1280:720:(ow-iw)/2:(oh-ih)/2:black",
    "-q:v", "2",
    outputPath,
  ]);
}

// ── AI SEO generation ─────────────────────────────────────────────────────────

interface PreSeoResult {
  title: string;
  description: string;
  tags: string[];
}

async function generateSeo(clip: {
  type: string;
  caption: string | null;
  sourceTitle: string;
  gameName: string;
  sourceYoutubeId?: string | null;
  durationSec: number;
  isLiveStream?: boolean;
  streamTitle?: string | null;
}): Promise<PreSeoResult | null> {
  if (!tryAcquireAISlotNow()) return null;

  try {
    if (!tokenBudget.checkBudget("pre-seo", 1500)) {
      releaseAISlot();
      return null;
    }

    const isShort  = clip.type.toLowerCase().includes("short");
    const durMin   = Math.round(clip.durationSec / 60);
    const game     = sanitizeForPrompt(clip.gameName, 60);
    const srcTitle = sanitizeForPrompt(clip.streamTitle || clip.sourceTitle, 150);
    const hint     = sanitizeForPrompt(clip.caption ?? "", 120);
    const sourceLink = clip.sourceYoutubeId
      ? `https://youtu.be/${clip.sourceYoutubeId}`
      : null;

    // Live stream clips get a prompt that signals the moment came from a real
    // session — titles should reflect live energy, not catalog compilation tone.
    let prompt: string;
    if (clip.isLiveStream && isShort) {
      prompt = `You are writing YouTube Shorts metadata for the ET Gaming 274 channel.
Channel: No commentary. No facecam. Raw ${game} live stream highlights.

Live session: "${srcTitle}"
Game: ${game}
Moment context: ${hint || "(intense gameplay moment)"}

Write metadata that captures the live energy — NOT a generic "gameplay" title.
Rules: honest description of what happened, compelling without being clickbait. NEVER mention AI, AI-generated, AI-powered, artificial intelligence, or any AI tool in ANY field.

1. TITLE (40-60 chars) — describe the actual moment. Pattern: "[What happened] in ${game} #Shorts"
2. DESCRIPTION INTRO (1-2 lines, max 150 chars) — "Live ${game} moment — no commentary, no facecam."${sourceLink ? ` Include: ${sourceLink}` : ""}
3. TAGS (up to 12, total < 400 chars) — game, live, shorts, no commentary, gameplay, ETGaming274.

JSON only: {"title":"...","descriptionIntro":"...","tags":["tag1","tag2"]}`;
    } else if (clip.isLiveStream && !isShort) {
      prompt = `You are writing YouTube long-form metadata for the ET Gaming 274 channel.
Channel: No commentary. No facecam. Full live session replay of ${game}.

Live session: "${srcTitle}"
Game: ${game}
Duration: ~${durMin} min${sourceLink ? `\nVOD: ${sourceLink}` : ""}

Write metadata that positions this as a complete authentic session — not a highlights reel.
Rules: honest description of the session, click-worthy without being clickbait. NEVER mention AI, AI-generated, AI-powered, artificial intelligence, or any AI tool in ANY field.

1. TITLE (50-80 chars) — pattern: "${game} Live Session — ${durMin} Min | No Commentary"
2. DESCRIPTION INTRO (2-3 lines, max 250 chars) — "Full ${game} live session, ${durMin} min. No commentary, no facecam."${sourceLink ? ` Include: ${sourceLink}` : ""}
3. TAGS (up to 15, total < 500 chars) — game, live, full session, no commentary, ETGaming274, 3-4 game-specific tags.

JSON only: {"title":"...","descriptionIntro":"...","tags":["tag1","tag2"]}`;
    } else if (isShort) {
      prompt = `You are writing YouTube Shorts metadata for the ET Gaming 274 channel.
Channel: No commentary. No facecam. Raw gameplay — steady pressure, clean action.

Source video: "${srcTitle}"
Game: ${game}
Clip hint: ${hint || "(none)"}

Write: NEVER mention AI, AI-generated, AI-powered, artificial intelligence, or any AI tool in ANY field.
1. TITLE (40-60 chars) — punchy, sell the moment, game name included. Pattern: "Clutch ${game} Play — No Commentary #Shorts"
2. DESCRIPTION INTRO (1-2 lines, max 150 chars) — "Raw ${game} gameplay — no commentary, no facecam."${sourceLink ? ` Include: ${sourceLink}` : ""}
3. TAGS (up to 12, total < 400 chars) — game, shorts, no commentary, gameplay, ETGaming274.

JSON only: {"title":"...","descriptionIntro":"...","tags":["tag1","tag2"]}`;
    } else {
      prompt = `You are writing YouTube long-form gaming clip metadata for ET Gaming 274.
Channel: No commentary. No facecam. Raw ${game} gameplay.

Source video: "${srcTitle}"
Game: ${game}
Duration: ~${durMin} min${sourceLink ? `\nSource: ${sourceLink}` : ""}

Write: NEVER mention AI, AI-generated, AI-powered, artificial intelligence, or any AI tool in ANY field.
1. TITLE (50-80 chars) — game + duration + "No Commentary". Pattern: "${game} — ${durMin} Min Gameplay | No Commentary"
2. DESCRIPTION INTRO (2-3 lines, max 250 chars) — "Raw ${game} gameplay, ${durMin} min."${sourceLink ? ` Include: ${sourceLink}` : ""}
3. TAGS (up to 15, total < 500 chars) — game, gameplay, no commentary, ETGaming274, 3-4 game-specific tags.

JSON only: {"title":"...","descriptionIntro":"...","tags":["tag1","tag2"]}`;
    }

    const response = await callClaudeBackground({ prompt, model: CLAUDE_MODELS.haiku });
    releaseAISlot();

    if (!response?.content?.trim()) return null;

    let content = response.content.trim();
    const fence = content.match(/^```(?:json)?\s*([\s\S]*?)\s*```$/i);
    if (fence) content = fence[1];

    const parsed = JSON.parse(content) as { title: string; descriptionIntro: string; tags: string[] };

    if (!parsed.title || parsed.title.length > 120) return null;
    if (!Array.isArray(parsed.tags)) return null;

    const title = parsed.title.trim().slice(0, 100);
    const descIntro = (parsed.descriptionIntro ?? "").trim().slice(0, 300);
    const tags = parsed.tags.slice(0, 15).map((t: string) => String(t).trim()).filter(Boolean);

    // Build full description with brand footer
    const parts: string[] = [];
    if (descIntro) parts.push(descIntro);
    if (!isShort && clip.sourceYoutubeId) {
      parts.push(`\n📺 Full VOD: https://youtube.com/watch?v=${clip.sourceYoutubeId}`);
    }
    parts.push(
      "\n─────────────────────────────",
      "ET Gaming 274 — No Commentary Gaming",
      "Raw gameplay. No facecam. No fake reactions.",
    );
    const description = parts.join("\n").trim().slice(0, 5000);

    return { title, description, tags };
  } catch (err: any) {
    releaseAISlot();
    logger.debug(`[PreSeo] AI generation failed: ${err.message?.slice(0, 120)}`);
    return null;
  }
}

// ── Stale thumbnail cleanup ───────────────────────────────────────────────────

function purgeStaleThumbails(): void {
  try {
    if (!fs.existsSync(THUMBNAIL_DIR)) return;
    const MAX_AGE_MS = 72 * 3_600_000; // 72 hours
    const now = Date.now();
    for (const fname of fs.readdirSync(THUMBNAIL_DIR)) {
      const fpath = path.join(THUMBNAIL_DIR, fname);
      try {
        if (now - fs.statSync(fpath).mtimeMs > MAX_AGE_MS) fs.unlinkSync(fpath);
      } catch { /* skip */ }
    }
  } catch { /* non-fatal */ }
}

// ── Main cycle ────────────────────────────────────────────────────────────────

export async function runPreSeoCycle(): Promise<{ processed: number; seoGenerated: number; thumbsExtracted: number; errors: number }> {
  let processed      = 0;
  let seoGenerated   = 0;
  let thumbsExtracted = 0;
  let errors         = 0;

  if (process.env.NODE_ENV !== "production") {
    logger.debug("[PreSeo] Skipping — development environment");
    return { processed, seoGenerated, thumbsExtracted, errors };
  }

  ensureDirs();
  purgeStaleThumbails();

  // Find ALL scheduled items that have not yet had SEO pre-generated
  const items = await db
    .select()
    .from(autopilotQueue)
    .where(and(
      eq(autopilotQueue.status, "scheduled"),
      sql`${autopilotQueue.metadata}->>'seoTitle' IS NULL`,
    ))
    .orderBy(autopilotQueue.scheduledAt)
    .limit(MAX_ITEMS_PER_RUN);

  if (items.length === 0) {
    logger.info("[PreSeo] All scheduled items already have SEO — nothing to do");
    return { processed, seoGenerated, thumbsExtracted, errors };
  }

  logger.info(`[PreSeo] Pre-generating SEO for ${items.length} queued item(s)`);

  for (const item of items) {
    const meta            = (item.metadata ?? {}) as Record<string, unknown>;
    const sourceYoutubeId = meta.sourceYoutubeId as string | undefined;
    const contentType     = (meta.contentType as string) ?? "";
    const gameName        = String(meta.gameName ?? "Gaming").slice(0, 80);
    const preEncodedPath  = meta.preEncodedPath as string | undefined;

    const isLongForm =
      contentType === "long-form-clip" ||
      contentType === "vod_long_form" ||
      item.type === "auto-clip" ||
      item.type === "vod-long-form";

    const startSec   = isLongForm ? Number(meta.segmentStartSec ?? 0) : Number(meta.startSec ?? 0);
    const endSec     = isLongForm ? Number(meta.segmentEndSec   ?? 0) : Number(meta.endSec   ?? 60);
    const durationSec = Math.max(5, endSec - startSec);

    // Resolve source video title from back catalog
    let sourceTitle = String(item.caption ?? `${gameName} Gameplay`).slice(0, 200);
    if (sourceYoutubeId) {
      try {
        const [src] = await db
          .select({ title: backCatalogVideos.title })
          .from(backCatalogVideos)
          .where(eq(backCatalogVideos.youtubeVideoId, sourceYoutubeId))
          .limit(1);
        if (src?.title) sourceTitle = src.title.slice(0, 200);
      } catch { /* use fallback */ }
    }

    // Resolve stream context for live stream clips — gives Claude the real
    // session title and marks the item as a live clip so it gets a live prompt.
    let isLiveStream = false;
    let streamTitle: string | null = null;
    const streamIdNum = meta.streamId ? Number(meta.streamId) : null;
    if (streamIdNum) {
      try {
        const [streamRow] = await db
          .select({ title: streams.title, category: streams.category })
          .from(streams)
          .where(eq(streams.id, streamIdNum))
          .limit(1);
        if (streamRow) {
          isLiveStream = true;
          streamTitle  = streamRow.title || null;
          // Use stream category as game name if queue metadata is missing it
          if ((!meta.gameName || String(meta.gameName) === "Gaming") && streamRow.category) {
            (meta as Record<string, unknown>).gameName = streamRow.category;
          }
        }
      } catch { /* use fallback — non-fatal */ }
    }

    processed++;

    // ── 1. Generate SEO via AI ─────────────────────────────────────────────
    let seo: PreSeoResult | null = null;
    try {
      seo = await generateSeo({
        type: item.type,
        caption: item.caption,
        sourceTitle,
        gameName: String(meta.gameName ?? "Gaming").slice(0, 80),
        sourceYoutubeId,
        durationSec,
        isLiveStream,
        streamTitle,
      });
      if (seo) seoGenerated++;
    } catch (err: any) {
      errors++;
      logger.warn(`[PreSeo] SEO generation failed for item ${item.id}: ${err.message?.slice(0, 150)}`);
    }

    // ── 2. Extract thumbnail frame from pre-encoded file ───────────────────
    let thumbnailPath: string | undefined;
    if (preEncodedPath && fs.existsSync(preEncodedPath)) {
      const thumbOut = path.join(THUMBNAIL_DIR, `thumb_${item.id}.jpg`);
      try {
        await extractThumbnailFrame(preEncodedPath, durationSec, thumbOut);
        if (fs.existsSync(thumbOut) && fs.statSync(thumbOut).size > 1000) {
          thumbnailPath = thumbOut;
          thumbsExtracted++;
          logger.debug(`[PreSeo] Thumbnail extracted for item ${item.id} (${Math.round(fs.statSync(thumbOut).size / 1024)} KB)`);
        }
      } catch (err: any) {
        logger.debug(`[PreSeo] Thumbnail extract failed for item ${item.id}: ${err.message?.slice(0, 100)}`);
      }
    }

    // Skip metadata update if nothing was generated
    if (!seo && !thumbnailPath) continue;

    // ── 3. Atomically write into metadata (only if still "scheduled") ──────
    const updatedMeta: Record<string, unknown> = { ...meta };
    if (seo) {
      updatedMeta.seoTitle       = seo.title;
      updatedMeta.seoDescription = seo.description;
      updatedMeta.seoTags        = seo.tags;
      updatedMeta.seoPreppedAt   = new Date().toISOString();
    }
    if (thumbnailPath) {
      updatedMeta.thumbnailPath = thumbnailPath;
    }

    try {
      const claimed = await db
        .update(autopilotQueue)
        .set({ metadata: updatedMeta as any })
        .where(and(
          eq(autopilotQueue.id, item.id),
          eq(autopilotQueue.status, "scheduled"),
          sql`${autopilotQueue.metadata}->>'seoTitle' IS NULL`,
        ))
        .returning({ id: autopilotQueue.id });

      if (claimed.length) {
        logger.info(
          `[PreSeo] Item ${item.id} ready — seo:${!!seo} thumb:${!!thumbnailPath} ` +
          `"${seo?.title?.slice(0, 50) ?? "(fallback)"}..."`,
        );
      }
    } catch (err: any) {
      errors++;
      logger.warn(`[PreSeo] Metadata write failed for item ${item.id}: ${err.message?.slice(0, 150)}`);
    }

    // Small pause between AI calls to avoid rate limiting
    await new Promise(r => setTimeout(r, 200));
  }

  logger.info(
    `[PreSeo] Cycle complete — processed: ${processed}, ` +
    `seoGenerated: ${seoGenerated}, thumbsExtracted: ${thumbsExtracted}, errors: ${errors}`,
  );
  return { processed, seoGenerated, thumbsExtracted, errors };
}

// ── Scheduling: every 2 hours ─────────────────────────────────────────────────
// Runs continuously so that as the back catalog fills the queue with thousands
// of items, every one gets its SEO title/description/tags and thumbnail frame
// well before its scheduled publish time.  The AI semaphore + token budget
// inside runPreSeoCycle() prevent runaway Claude spend.
// 2 h keeps SEO always ahead of uploads (publishers are priority-one when not live).

const CYCLE_INTERVAL_MS = 2 * 3_600_000; // 2 hours

let _preSeoTimer: ReturnType<typeof setTimeout> | null = null;

export function stopPreSeo(): void {
  if (_preSeoTimer !== null) {
    clearTimeout(_preSeoTimer);
    _preSeoTimer = null;
    logger.info("[PreSeo] Stopped");
  }
}

export function initPreSeo(): void {
  function scheduleNextRun(): void {
    _preSeoTimer = setTimeout(async () => {
      _preSeoTimer = null;
      logger.info("[PreSeo] Starting 6-hour SEO + thumbnail cycle");
      await runPreSeoCycle().catch(err =>
        logger.error("[PreSeo] Cycle error", { error: String(err) }),
      );
      scheduleNextRun();
    }, CYCLE_INTERVAL_MS);
    logger.info(`[PreSeo] Next SEO + thumbnail cycle in 6 h`);
  }

  stopPreSeo();

  // Startup run after 10-minute delay — preps anything queued near the top
  setTimeout(() => {
    logger.info("[PreSeo] Startup SEO + thumbnail cycle starting");
    runPreSeoCycle().catch(err =>
      logger.warn("[PreSeo] Startup cycle error", { error: String(err) }),
    );
  }, 10 * 60_000);

  scheduleNextRun();
  logger.info(
    "[PreSeo] Initialised — runs every 6 h, pre-generates SEO + thumbnails " +
    "for every queued item that hasn't been prepped yet",
  );
}
