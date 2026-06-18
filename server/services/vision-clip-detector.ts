/**
 * Vision-based clip detection — the AI actually watches the video.
 *
 * Samples one JPEG frame every 60 s from a vault-downloaded video file,
 * sends batches to GPT-4o with vision, gets an intensity score (1-10) per
 * frame, then finds the peak moments (local maxima above threshold 6).
 *
 * This is Priority 0 in the clip-detection chain — it works for any stream
 * regardless of commentary, retention-curve age, or caption availability.
 * It only kicks in when the video has already been downloaded to the vault.
 */

import { execFile } from "child_process";
import { promisify } from "util";
import * as fs from "fs";
import * as path from "path";
import { db } from "../db";
import { contentVaultBackups } from "@shared/schema";
import { eq } from "drizzle-orm";
import { createLogger } from "../lib/logger";
import { getOpenAIClientBackground } from "../lib/openai";
import {
  acquireAISlotBackground,
  releaseAISlot,
} from "../lib/ai-semaphore";
import type { ViralMoment } from "../shorts-pipeline-engine";

const logger = createLogger("vision-clip-detector");
const execFileAsync = promisify(execFile);

const FRAME_INTERVAL_SEC = 60;   // base: sample one frame per minute
const MAX_FRAMES = 60;           // hard cap — 6 GPT-4o batches max regardless of duration
const FRAMES_PER_BATCH = 10;     // frames sent per GPT-4o call
const FRAME_EXTRACT_PARALLEL = 6; // concurrent ffmpeg processes
const MIN_INTENSITY = 6;          // 1-10 scale — anything below is not worth a clip
const CLIP_DURATION_SEC = 45;     // clip window centered on each peak
const LOCAL_MAX_WINDOW = 2;       // must beat this many neighbours each side

// ── Frame extraction ──────────────────────────────────────────────────────────

async function extractFrame(
  videoPath: string,
  timeSec: number,
): Promise<Buffer | null> {
  try {
    const { stdout } = (await execFileAsync(
      "ffmpeg",
      [
        "-ss",       String(timeSec),
        "-i",        videoPath,
        "-vframes",  "1",
        "-vf",       "scale=512:-1",
        "-q:v",      "5",
        "-f",        "image2pipe",
        "-vcodec",   "mjpeg",
        "pipe:1",
      ],
      { maxBuffer: 5 * 1024 * 1024, encoding: "buffer" },
    )) as unknown as { stdout: Buffer };
    if (!stdout || stdout.length < 500) return null;
    return stdout;
  } catch {
    return null;
  }
}

// ── GPT-4o vision batch analysis ─────────────────────────────────────────────

interface FrameScore {
  sec: number;
  score: number;
  description: string;
}

async function analyzeFrameBatch(
  frames: Array<{ sec: number; jpegBuffer: Buffer }>,
  videoTitle: string,
): Promise<FrameScore[]> {
  const openai = getOpenAIClientBackground();

  const imageContent = frames.map(f => ({
    type: "image_url" as const,
    image_url: {
      url: `data:image/jpeg;base64,${f.jpegBuffer.toString("base64")}`,
      detail: "low" as const,
    },
  }));

  const timestamps = frames.map(f => `${f.sec}s`).join(", ");
  const prompt = `You are analyzing frames from a no-commentary gaming stream: "${videoTitle}".

The ${frames.length} frames shown (in order) are at timestamps: ${timestamps}.

For each frame rate ACTION INTENSITY 1-10:
• 9-10 = intense gunfight with explosions / multiple kills happening / vehicle combat / objective capture in chaos
• 7-8  = active firefight, player taking fire, mid-combat, bullets visible
• 5-6  = moving toward enemies, flanking, mild skirmish starting
• 3-4  = running or driving with no enemies in sight
• 1-2  = menus, death/respawn screen, standing still, loading screen, black screen

Return ONLY valid JSON — an array of exactly ${frames.length} objects, nothing else:
[{"sec":<timestamp as number>,"score":<1-10>,"description":"<10 words max describing what is visible>"}]`;

  await acquireAISlotBackground();
  try {
    const response = await openai.chat.completions.create({
      model: "gpt-5",
      max_tokens: 600,
      messages: [
        {
          role: "user",
          content: [{ type: "text", text: prompt }, ...imageContent],
        },
      ],
    });

    const text = response.choices[0]?.message?.content ?? "[]";
    const jsonMatch = text.match(/\[[\s\S]*\]/);
    if (!jsonMatch) return frames.map(f => ({ sec: f.sec, score: 0, description: "" }));
    const parsed = JSON.parse(jsonMatch[0]) as FrameScore[];
    return parsed;
  } catch (err: any) {
    logger.warn(`[VisionClip] Batch analysis failed: ${err?.message}`);
    return frames.map(f => ({ sec: f.sec, score: 0, description: "" }));
  } finally {
    releaseAISlot();
  }
}

// ── Vault path lookup ─────────────────────────────────────────────────────────

export async function getVaultVideoPath(youtubeId: string): Promise<string | null> {
  // 1. Check DB record — most reliable (stores exact download path)
  try {
    const rows = await db
      .select({ filePath: contentVaultBackups.filePath, status: contentVaultBackups.status })
      .from(contentVaultBackups)
      .where(eq(contentVaultBackups.youtubeId, youtubeId))
      .limit(1);

    const row = rows[0];
    if (row?.status === "downloaded" && row.filePath && fs.existsSync(row.filePath)) {
      return row.filePath;
    }
  } catch { /* DB unavailable — fall through */ }

  // 2. Conventional vault path (yt-dlp default output)
  const conventional = path.join(process.cwd(), "vault", `${youtubeId}.mp4`);
  if (fs.existsSync(conventional)) return conventional;

  return null;
}

// ── Main export ───────────────────────────────────────────────────────────────

/**
 * Extracts viral moments by having GPT-4o actually watch the video frames.
 *
 * @param videoPath  Absolute path to the downloaded video file
 * @param durationSec Total video duration in seconds
 * @param videoTitle  Used in the AI prompt for context (game/stream name)
 * @param maxMoments  Maximum number of clips to return (default 15)
 */
export async function extractViralMomentsFromVisionAI(
  videoPath: string,
  durationSec: number,
  videoTitle: string,
  maxMoments = 15,
): Promise<ViralMoment[]> {
  if (!fs.existsSync(videoPath)) {
    logger.debug(`[VisionClip] No vault file at ${videoPath} — skipping vision analysis`);
    return [];
  }

  const SKIP_START = 30; // skip the very first 30 s (channel/match loading)
  // For long videos, coarsen the sampling interval so total frames stay ≤ MAX_FRAMES.
  // This caps vision AI at 6 GPT-4o batches (≈ 3–4 min) regardless of stream length.
  // Without this a 3h stream → 180 frames → 18 batches → 13+ min of AI slot monopoly.
  const effectiveRange = Math.max(1, durationSec - SKIP_START - 30);
  const effectiveInterval = Math.max(
    FRAME_INTERVAL_SEC,
    Math.ceil(effectiveRange / MAX_FRAMES),
  );
  const sampleTimes: number[] = [];
  for (let t = SKIP_START; t < durationSec - 30; t += effectiveInterval) {
    sampleTimes.push(Math.round(t));
  }
  if (sampleTimes.length === 0) return [];

  logger.info(
    `[VisionClip] Sampling ${sampleTimes.length} frames from "${videoTitle}" ` +
    `(${Math.round(durationSec / 60)} min) at ${effectiveInterval}s intervals ` +
    `(cap: ${MAX_FRAMES} frames max)`,
  );

  // ── Extract frames (parallel, capped) ──────────────────────────────────────
  const frameResults: Array<{ sec: number; jpegBuffer: Buffer }> = [];
  for (let i = 0; i < sampleTimes.length; i += FRAME_EXTRACT_PARALLEL) {
    const batch = sampleTimes.slice(i, i + FRAME_EXTRACT_PARALLEL);
    const buffers = await Promise.all(batch.map(sec => extractFrame(videoPath, sec)));
    for (let j = 0; j < batch.length; j++) {
      if (buffers[j]) frameResults.push({ sec: batch[j], jpegBuffer: buffers[j]! });
    }
  }

  if (frameResults.length === 0) {
    logger.warn(`[VisionClip] Zero frames extracted — ffmpeg may have failed`);
    return [];
  }

  logger.info(`[VisionClip] ${frameResults.length} frames extracted, sending to GPT-4o vision`);

  // ── Analyse in batches ─────────────────────────────────────────────────────
  const allScores: FrameScore[] = [];
  for (let i = 0; i < frameResults.length; i += FRAMES_PER_BATCH) {
    const batch = frameResults.slice(i, i + FRAMES_PER_BATCH);
    const scores = await analyzeFrameBatch(batch, videoTitle);
    allScores.push(...scores);
  }

  logger.info(
    `[VisionClip] Scores: min=${Math.min(...allScores.map(s => s.score)).toFixed(1)} ` +
    `max=${Math.max(...allScores.map(s => s.score)).toFixed(1)} — finding peaks…`,
  );

  // ── Find local maxima above threshold ──────────────────────────────────────
  const moments: ViralMoment[] = [];

  for (let i = LOCAL_MAX_WINDOW; i < allScores.length - LOCAL_MAX_WINDOW; i++) {
    const s = allScores[i];
    if (s.score < MIN_INTENSITY) continue;

    const leftNeighbours  = allScores.slice(i - LOCAL_MAX_WINDOW, i);
    const rightNeighbours = allScores.slice(i + 1, i + LOCAL_MAX_WINDOW + 1);
    const isLocalMax =
      leftNeighbours.every(n => n.score <= s.score) &&
      rightNeighbours.every(n => n.score <= s.score);

    if (!isLocalMax) continue;

    // Dedup — reject if another peak is within 60 s
    const centerSec = s.sec;
    const tooClose = moments.some(
      m => Math.abs((m.startSec + m.endSec) / 2 - centerSec) < 60,
    );
    if (tooClose) continue;

    const startSec = Math.max(0, centerSec - CLIP_DURATION_SEC / 2);
    const endSec   = Math.min(durationSec, centerSec + CLIP_DURATION_SEC / 2);

    moments.push({
      startSec,
      endSec,
      viralScore: Math.round(s.score * 10),  // convert 1-10 → 10-100
      title: s.description || `Intense moment at ${Math.floor(centerSec / 60)}:${String(centerSec % 60).padStart(2, "0")}`,
      reason: `Vision AI: score ${s.score}/10 — ${s.description}`,
    });
  }

  // Sort by score descending and return top N
  moments.sort((a, b) => b.viralScore - a.viralScore);
  logger.info(`[VisionClip] ${moments.length} peaks found → returning top ${Math.min(moments.length, maxMoments)}`);
  return moments.slice(0, maxMoments);
}
