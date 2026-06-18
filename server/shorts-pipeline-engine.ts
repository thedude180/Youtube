import { getOpenAIClientBackground } from "./lib/openai";
import { storage } from "./storage";
import { db } from "./db";
import { pipelineRuns, clipViralityScores, contentClips, videos } from "@shared/schema";
import { eq, and, desc } from "drizzle-orm";
import { getRetentionBeatsPromptContext } from "./retention-beats-engine";
import { fetchYouTubeTranscript } from "./youtube";
import { google } from "googleapis";
import {
  getVaultVideoPath,
  extractViralMomentsFromVisionAI,
} from "./services/vision-clip-detector";

import { createLogger } from "./lib/logger";
import { sanitizeForPrompt, sanitizeObjectForPrompt, tokenBudget } from "./lib/ai-attack-shield";

const logger = createLogger("shorts-pipeline-engine");
const openai = getOpenAIClientBackground();

type PipelineState = "idle" | "running" | "paused" | "completed" | "failed";

interface PipelineSession {
  userId: string;
  runId: number;
  state: PipelineState;
  mode: "full" | "new-only";
  totalVideos: number;
  processedVideos: number;
  clipsFound: number;
  currentVideoId: number | null;
  startedAt: Date;
  lastActivityAt: Date;
  errors: Array<{ videoId: number; error: string; timestamp: Date }>;
}

const sessions = new Map<string, PipelineSession>();

// Tracks the UTC day (YYYY-MM-DD) on which the daily token budget was exhausted
// for a given user. Prevents automated callers from repeatedly spawning no-op runs
// until midnight resets the budget.
const budgetExhaustedDay = new Map<string, string>();

function utcDay(): string {
  const d = new Date();
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}-${String(d.getUTCDate()).padStart(2, "0")}`;
}

try {
  const { registerMap } = require("./services/resilience-core");
  registerMap("shorts-pipeline-sessions", sessions, 50);
} catch {}

export async function startShortsPipeline(
  userId: string,
  mode: "full" | "new-only" = "full"
): Promise<{ runId: number; totalVideos: number; status: string }> {
  const existing = sessions.get(userId);
  if (existing && existing.state === "running") {
    return { runId: existing.runId, totalVideos: existing.totalVideos, status: "already_running" };
  }

  // If the daily token budget was already exhausted today, skip immediately.
  // This stops automated callers (catalog-sync, vod-watcher, etc.) from
  // re-spawning no-op runs every few seconds until midnight.
  const today = utcDay();
  if (budgetExhaustedDay.get(userId) === today) {
    return { runId: -1, totalVideos: 0, status: "budget_exhausted_today" };
  }

  const allVideos = await storage.getVideosByUser(userId);
  let videosToProcess = allVideos;

  if (mode === "new-only") {
    const existingClips = await storage.getContentClips(userId);
    const processedVideoIds = new Set(existingClips.map(c => c.sourceVideoId).filter(Boolean));
    videosToProcess = allVideos.filter(v => !processedVideoIds.has(v.id));
  }

  const [run] = await db.insert(pipelineRuns).values({
    userId,
    status: "running",
    totalVideos: videosToProcess.length,
    processedVideos: 0,
    clipsFound: 0,
    mode,
    startedAt: new Date(),
    metadata: { errors: [], avgClipsPerVideo: 0 },
  }).returning();

  const session: PipelineSession = {
    userId,
    runId: run.id,
    state: "running",
    mode,
    totalVideos: videosToProcess.length,
    processedVideos: 0,
    clipsFound: 0,
    currentVideoId: null,
    startedAt: new Date(),
    lastActivityAt: new Date(),
    errors: [],
  };

  sessions.set(userId, session);

  processPipelineAsync(userId, videosToProcess, run.id);

  return { runId: run.id, totalVideos: videosToProcess.length, status: "started" };
}

async function processPipelineAsync(userId: string, videos: any[], runId: number) {
  const session = sessions.get(userId);
  if (!session) return;

  // Single upfront budget check — if the daily token budget is already exhausted,
  // abort the entire batch immediately rather than iterating every video and
  // emitting a warning per-video (which can flood logs and stall the DB when
  // the queue contains thousands of entries).
  if (!tokenBudget.checkBudget("shorts-pipeline", 4000)) {
    logger.debug(`[ShortsPipeline] Daily token budget exhausted — deferring pipeline batch (${videos.length} videos) to tomorrow's budget reset`);
    budgetExhaustedDay.set(userId, utcDay());
    const s = sessions.get(userId);
    if (s) { s.state = "completed"; s.currentVideoId = null; }
    await db.update(pipelineRuns).set({ status: "completed" }).where(eq(pipelineRuns.id, runId)).catch(() => {});
    return;
  }

  for (const video of videos) {
    const current = sessions.get(userId);
    if (!current || current.state === "paused") break;
    if (current.state !== "running") break;

    current.currentVideoId = video.id;
    current.lastActivityAt = new Date();

    try {
      const clips = await extractClipsFromVideo(userId, video.id);
      current.clipsFound += (clips?.length || 0);
    } catch (err: any) {
      current.errors.push({ videoId: video.id, error: err.message, timestamp: new Date() });
      // If the AI background queue is saturated, stop immediately and defer the
      // rest of the batch to the next scheduled run.  Continuing to iterate
      // only fills the log with failures and starves other services.
      if (
        typeof err.message === "string" &&
        (err.message.includes("AI queue full") || err.message.includes("request dropped"))
      ) {
        logger.info(
          `[ShortsPipeline] AI queue saturated — deferring pipeline batch after ${current.processedVideos} videos`
        );
        break;
      }
    }

    current.processedVideos++;
    await db.update(pipelineRuns).set({
      processedVideos: current.processedVideos,
      clipsFound: current.clipsFound,
    }).where(eq(pipelineRuns.id, runId));

    // Pace between videos so the shared AI semaphore stays available for other
    // background services.  750 ms is enough for the queue to accept the next
    // slot without noticeably slowing the overall pipeline batch.
    await new Promise(r => setTimeout(r, 750));

    // If extractClipsFromVideo exhausted the budget on this video, stop the batch
    // rather than hammering through remaining videos with no-op budget checks.
    if (!tokenBudget.checkBudget("shorts-pipeline", 4000)) {
      logger.info(`[ShortsPipeline] Budget exhausted after ${current.processedVideos} videos — pausing pipeline batch until tomorrow's reset`);
      budgetExhaustedDay.set(userId, utcDay());
      break;
    }
  }

  const finalSession = sessions.get(userId);
  if (finalSession && finalSession.state === "running") {
    finalSession.state = "completed";
    finalSession.currentVideoId = null;
  }

  const avgClips = session.processedVideos > 0
    ? Math.round((session.clipsFound / session.processedVideos) * 10) / 10
    : 0;

  await db.update(pipelineRuns).set({
    status: "completed",
    completedAt: new Date(),
    processedVideos: session.processedVideos,
    clipsFound: session.clipsFound,
    metadata: {
      errors: session.errors.map(e => `Video ${e.videoId}: ${e.error}`),
      avgClipsPerVideo: avgClips,
    },
  }).where(eq(pipelineRuns.id, runId));
}

export async function getShortsPipelineStatus(userId: string): Promise<{
  state: PipelineState;
  runId: number | null;
  totalVideos: number;
  processedVideos: number;
  clipsFound: number;
  progress: number;
  currentVideoId: number | null;
  errors: number;
  lastRun: any;
}> {
  const session = sessions.get(userId);

  const runs = await db.select().from(pipelineRuns)
    .where(eq(pipelineRuns.userId, userId))
    .orderBy(desc(pipelineRuns.createdAt))
    .limit(1);
  const lastRun = runs[0] || null;

  if (session) {
    return {
      state: session.state,
      runId: session.runId,
      totalVideos: session.totalVideos,
      processedVideos: session.processedVideos,
      clipsFound: session.clipsFound,
      progress: session.totalVideos > 0
        ? Math.round((session.processedVideos / session.totalVideos) * 100)
        : 0,
      currentVideoId: session.currentVideoId,
      errors: session.errors.length,
      lastRun,
    };
  }

  return {
    state: "idle",
    runId: lastRun?.id || null,
    totalVideos: lastRun?.totalVideos || 0,
    processedVideos: lastRun?.processedVideos || 0,
    clipsFound: lastRun?.clipsFound || 0,
    progress: 100,
    currentVideoId: null,
    errors: 0,
    lastRun,
  };
}

export async function pauseShortsPipeline(userId: string): Promise<boolean> {
  const session = sessions.get(userId);
  if (!session || session.state !== "running") return false;
  session.state = "paused";
  session.lastActivityAt = new Date();
  await db.update(pipelineRuns).set({ status: "paused" }).where(eq(pipelineRuns.id, session.runId));
  return true;
}

export async function resumeShortsPipeline(userId: string): Promise<boolean> {
  const session = sessions.get(userId);
  if (!session || session.state !== "paused") return false;
  session.state = "running";
  session.lastActivityAt = new Date();
  await db.update(pipelineRuns).set({ status: "running" }).where(eq(pipelineRuns.id, session.runId));

  const allVideos = await storage.getVideosByUser(userId);
  const existingClips = await storage.getContentClips(userId);
  const processedVideoIds = new Set(existingClips.map(c => c.sourceVideoId).filter(Boolean));
  const remaining = allVideos.filter(v => !processedVideoIds.has(v.id));

  processPipelineAsync(userId, remaining, session.runId);
  return true;
}

// ── Transcript helpers ───────────────────────────────────────────────────────

/**
 * Parse a transcript timestamp like "[1:23]" or "[65:04]" → seconds from start.
 * The transcript format produced by fetchYouTubeTranscript is [M:SS].
 */
function parseTranscriptSec(line: string): number | null {
  const m = line.match(/^\[(\d+):(\d{2})\]/);
  if (!m) return null;
  return parseInt(m[1], 10) * 60 + parseInt(m[2], 10);
}

const VIRAL_CHUNK_SEC = 1800;      // 30 minutes per analysis chunk
const STREAM_SKIP_SEC = 30;        // tiny buffer for stream startup only — creator starts in-match
const VIRAL_CHUNK_BUDGET  = 3000;  // tokens per chunk call
const VIRAL_MIN_DUR_SEC   = 25;    // shortest acceptable Short
const VIRAL_MAX_DUR_SEC   = 58;    // longest acceptable Short

/**
 * Splits a full timestamped transcript into ~30-minute chunks.
 * Lines without a recognisable timestamp are attached to the current chunk.
 */
function chunkTranscriptByTime(transcript: string): Array<{ startSec: number; endSec: number; text: string }> {
  const lines = transcript.split("\n").filter(l => l.trim());
  const chunks: Array<{ startSec: number; endSec: number; lines: string[] }> = [];
  let currentStart = 0;
  let currentLines: string[] = [];
  let lastSec = 0;

  for (const line of lines) {
    const ts = parseTranscriptSec(line);
    if (ts !== null) lastSec = ts;

    const chunkIdx = Math.floor(lastSec / VIRAL_CHUNK_SEC);
    const chunkStart = chunkIdx * VIRAL_CHUNK_SEC;

    if (chunkStart > currentStart && currentLines.length > 0) {
      chunks.push({ startSec: currentStart, endSec: chunkStart, lines: currentLines });
      currentStart = chunkStart;
      currentLines = [];
    }
    currentLines.push(line);
  }

  if (currentLines.length > 0) {
    chunks.push({ startSec: currentStart, endSec: lastSec + 120, lines: currentLines });
  }

  return chunks.map(c => ({ startSec: c.startSec, endSec: c.endSec, text: c.lines.join("\n") }));
}

export interface ViralMoment {
  startSec: number;
  endSec: number;
  viralScore: number;
  title: string;
  reason: string;
}

/**
 * Finds peak viewer-retention moments in a video by reading the YouTube
 * Analytics audience-retention curve.
 *
 * This is the primary detection method for NO-COMMENTARY gaming streams —
 * it uses real viewer behaviour data, not audio/transcript, so it works
 * regardless of whether the creator speaks on stream.
 *
 * Algorithm:
 *  1. Fetch retention curve (up to 1 000 data points, one per ~0.1 % of video)
 *  2. Apply 7-point rolling average to smooth noise
 *  3. Compute "above-trend" score: how much each point exceeds the expected
 *     linear-decay baseline (captures rewatch bumps and slow-drop moments)
 *  4. Find local maxima in the score signal
 *  5. Deduplicate (no two clips within 60 s), return top maxMoments sorted by score
 *
 * Returns [] when the video has no analytics data yet (too new, zero views).
 * In that case callers fall back to transcript analysis or even-spacing.
 */
export async function extractViralMomentsFromRetentionCurve(
  userId: string,
  youtubeId: string,
  durationSec: number,
  maxMoments: number = 15,
): Promise<ViralMoment[]> {
  try {
    const { fetchVideoRetentionCurve } = await import("./services/youtube-analytics");
    const curve = await fetchVideoRetentionCurve(userId, youtubeId, durationSec);
    if (curve.length < 15) return [];

    // ── 1. 7-point rolling average ──────────────────────────────────────────
    const W = 3; // half-window
    const smoothed = curve.map((p, i) => {
      const slice = curve.slice(Math.max(0, i - W), i + W + 1);
      const avgWatch = slice.reduce((s, x) => s + x.watchRatio, 0) / slice.length;
      const avgRel   = slice.reduce((s, x) => s + x.relativePerformance, 0) / slice.length;
      return { timeSec: p.timeSec, watchRatio: avgWatch, relativePerformance: avgRel };
    });

    // ── 2. Linear-decay baseline & above-trend score ────────────────────────
    const first = smoothed[0]?.watchRatio || 1;
    const last  = smoothed[smoothed.length - 1]?.watchRatio || 0;
    const scored = smoothed.map(p => {
      const ratio   = p.timeSec / Math.max(durationSec, 1);
      const baseline = first + (last - first) * ratio;  // expected linear decay
      const aboveTrend = p.watchRatio - baseline;        // positive = viewers staying more than expected
      // Combined score: above-trend weighted 60 %, relativePerformance 40 %
      const score = aboveTrend * 0.6 + Math.max(0, p.relativePerformance) * 0.4;
      return { timeSec: p.timeSec, watchRatio: p.watchRatio, score };
    });

    // ── 3. Find local maxima (peak must beat 7 neighbours on each side) ─────
    const NEIGH = 7;
    const peaks: Array<{ timeSec: number; score: number; watchRatio: number }> = [];
    for (let i = NEIGH; i < scored.length - NEIGH; i++) {
      const p = scored[i];
      if (p.timeSec < STREAM_SKIP_SEC) continue;
      const window = scored.slice(i - NEIGH, i + NEIGH + 1);
      const isMax  = window.every((n, j) => j === NEIGH || n.score <= p.score);
      if (isMax && p.score > 0) peaks.push({ timeSec: p.timeSec, score: p.score, watchRatio: p.watchRatio });
    }

    // ── 4. Sort, deduplicate, cap ───────────────────────────────────────────
    peaks.sort((a, b) => b.score - a.score);
    const deduped: typeof peaks = [];
    for (const p of peaks) {
      if (!deduped.some(k => Math.abs(k.timeSec - p.timeSec) < 60)) deduped.push(p);
      if (deduped.length >= maxMoments) break;
    }

    // ── 5. Convert to ViralMoment — center ~40 s clip around the peak ───────
    const TARGET_DUR = 40;
    const moments: ViralMoment[] = deduped.map(p => {
      const startSec = Math.max(STREAM_SKIP_SEC, Math.round(p.timeSec - TARGET_DUR * 0.4));
      const endSec   = Math.min(durationSec - 5,  startSec + TARGET_DUR);
      const minRetain = Math.round(p.watchRatio * 100);
      const viralScore = Math.min(97, Math.max(50, 50 + Math.round(p.score * 200)));
      return {
        startSec,
        endSec,
        viralScore,
        title: `Top Moment @${Math.floor(p.timeSec / 60)}:${String(Math.round(p.timeSec % 60)).padStart(2, "0")}`,
        reason: `Viewer retention peak — ${minRetain}% still watching (above trend)`,
      };
    });

    logger.info(`[RetentionCurve] ${youtubeId}: ${curve.length} pts → ${peaks.length} peaks → ${moments.length} clips`);
    return moments;
  } catch (err: any) {
    if (err?.message?.includes("AI queue full") || err?.message?.includes("request dropped")) throw err;
    logger.debug(`[RetentionCurve] ${youtubeId}: unavailable (${err?.message?.slice(0, 60)})`);
    return [];
  }
}

/**
 * Analyzes the ENTIRE transcript of a YouTube video for viral clip moments.
 *
 * Breaks the full transcript into 30-minute chunks and runs AI on each one
 * so no part of the stream is missed.  Returns moments sorted by viral score,
 * deduplicated (no two clips within 30 s of each other), capped at maxMoments.
 *
 * Returns [] when no transcript is available — callers should fall back to
 * evenly-spaced clips in that case.
 */
export async function extractViralMomentsFromTranscript(
  youtubeId: string,
  _durationSec: number,
  maxMoments: number = 15,
): Promise<ViralMoment[]> {
  let transcript: string | null = null;
  try {
    transcript = await fetchYouTubeTranscript(youtubeId);
  } catch { /* video has no captions */ }

  if (!transcript || transcript.trim().length < 80) return [];

  const chunks = chunkTranscriptByTime(transcript);
  const allMoments: ViralMoment[] = [];

  for (const chunk of chunks) {
    if (chunk.endSec <= STREAM_SKIP_SEC) continue; // skip pure setup window

    if (!tokenBudget.checkBudget("shorts-pipeline", VIRAL_CHUNK_BUDGET)) {
      logger.debug("[ViralMoments] Budget exhausted — stopping chunk analysis early");
      break;
    }
    tokenBudget.consumeBudget("shorts-pipeline", VIRAL_CHUNK_BUDGET);

    const startMin = Math.round(chunk.startSec / 60);
    const endMin   = Math.round(chunk.endSec   / 60);

    const chunkPrompt = `You are a viral gaming clip expert. Scan this ${endMin - startMin}-minute segment of a gaming stream transcript (video minutes ${startMin}–${endMin}) and find EVERY moment that could go viral as a YouTube Short.

Transcript:
${chunk.text.slice(0, 5500)}

RULES:
- Flag moments with ACTIVE GAMEPLAY ONLY: kills, clutch plays, epic wins, fails, funny reactions, intense firefights, jaw-dropping moments, highlight plays.
- NOTE: The creator starts their stream ALREADY IN A MATCH — there is no pre-stream setup window. The very first seconds of the stream can contain real gameplay. Do NOT skip the beginning based on time alone.
- SKIP moments that show NO MOVEMENT or inactivity: player standing still, not firing, waiting at a respawn screen, sitting in a menu, spectating, watching a killcam for more than a few seconds, idle lobby, "brb", or pure chat with zero gameplay happening. Detect this from the transcript — silence or filler words with no action callouts = no movement.
- PICK moments where something is clearly HAPPENING: the player is talking about a shot they just made, reacting to a kill, calling out enemies, describing a clutch play, expressing hype/surprise/frustration mid-game.
- Each clip must be ${VIRAL_MIN_DUR_SEC}–${VIRAL_MAX_DUR_SEC} seconds long.
- startSec must be the exact second from the VIDEO START (not from this segment's start).
- If this segment has no good moments return {"moments":[]}.

Return JSON only:
{"moments":[{"startSec":120,"endSec":158,"viralScore":88,"title":"Insane Triple Kill!","reason":"Triple kill + hype reaction"}]}`;

    try {
      const resp = await openai.chat.completions.create({
        model: "gpt-5",
        messages: [{ role: "user", content: chunkPrompt }],
        response_format: { type: "json_object" },
        max_completion_tokens: 1800,
      });

      const raw = resp.choices[0]?.message?.content;
      if (!raw) continue;

      const parsed = JSON.parse(raw);
      const moments: any[] = parsed.moments || [];

      for (const m of moments) {
        const rawStart = Number(m.startSec) || 0;
        const rawEnd   = Number(m.endSec)   || rawStart + 38;
        const startSec = Math.max(STREAM_SKIP_SEC, rawStart);
        const endSec   = Math.min(startSec + VIRAL_MAX_DUR_SEC, Math.max(startSec + VIRAL_MIN_DUR_SEC, rawEnd));
        if (endSec <= startSec) continue;
        allMoments.push({
          startSec,
          endSec,
          viralScore: Math.min(100, Math.max(0, Number(m.viralScore) || 50)),
          title: String(m.title || "Gaming Moment").slice(0, 100),
          reason: String(m.reason || "").slice(0, 200),
        });
      }
    } catch (err: any) {
      if (err?.message?.includes("AI queue full") || err?.message?.includes("request dropped")) throw err;
      logger.warn(`[ViralMoments] Chunk ${startMin}–${endMin}min failed: ${err.message}`);
    }

    await new Promise(r => setTimeout(r, 400));
  }

  // Sort by viral score, then deduplicate clips within 30 s of each other
  const sorted = allMoments.sort((a, b) => b.viralScore - a.viralScore);
  const deduped: ViralMoment[] = [];
  for (const m of sorted) {
    if (!deduped.some(k => Math.abs(k.startSec - m.startSec) < 30)) deduped.push(m);
    if (deduped.length >= maxMoments) break;
  }

  logger.info(`[ViralMoments] ${youtubeId}: ${allMoments.length} raw → ${deduped.length} after dedup (${chunks.length} chunks scanned)`);
  return deduped;
}

// ── extractClipsFromVideo ────────────────────────────────────────────────────

export async function extractClipsFromVideo(
  userId: string,
  videoId: number
): Promise<any[]> {
  const video = await storage.getVideo(videoId);
  if (!video) return [];

  const duration = video.metadata?.duration || "unknown";
  const views = video.metadata?.stats?.views || video.metadata?.viewCount || 0;
  const tags = video.metadata?.tags?.join(", ") || "";

  const retentionContext = await getRetentionBeatsPromptContext();

  const youtubeId = (video as any).youtubeId || (video.metadata as any)?.youtubeId;

  // ── Fast path: vision → retention curve → transcript → single-pass ───────
  // Priority:
  //  0. Vision AI (GPT-4o watches actual frames) — works for ANY stream type.
  //     Only available when the video is already downloaded in the vault.
  //  1. YouTube Analytics retention curve — real viewer behaviour data.
  //     Works for NO-COMMENTARY streams; requires ≥48 h of analytics history.
  //  2. Full-transcript chunked analysis — commentary streams with captions.
  //  3. Single-pass prompt (below) — last resort when nothing else works.
  if (youtubeId) {
    try {
      const dur = Number((video.metadata as any)?.durationSec ?? (video.metadata as any)?.duration_sec ?? 0) || 7200;

      // Attempt 0: vision AI — GPT-4o actually watches the video frames
      const vaultPath = await getVaultVideoPath(youtubeId);
      let moments = vaultPath
        ? await extractViralMomentsFromVisionAI(vaultPath, dur, String(video.title ?? youtubeId), 15)
        : [];

      // Attempt 1: retention curve (no AI tokens, no transcript needed)
      if (moments.length === 0) {
        moments = await extractViralMomentsFromRetentionCurve(userId, youtubeId, dur, 15);
      }

      // Attempt 2: full-transcript chunked AI analysis (commentary streams)
      if (moments.length === 0 && tokenBudget.checkBudget("shorts-pipeline", VIRAL_CHUNK_BUDGET)) {
        moments = await extractViralMomentsFromTranscript(youtubeId, dur, 15);
      }

      if (moments.length > 0) {
        const createdClips: any[] = [];
        for (const m of moments) {
          const created = await storage.createContentClip({
            userId,
            sourceVideoId: videoId,
            title: m.title,
            description: m.reason,
            startTime: m.startSec,
            endTime: m.endSec,
            targetPlatform: "youtube",
            status: "ai_ready",
            optimizationScore: m.viralScore,
            metadata: {
              tags: [],
              thumbnailPrompt: "",
              format: "vertical",
              aspectRatio: "9:16",
              hasTranscript: true,
              viralReason: m.reason,
            } as any,
          });
          if (m.viralScore) {
            await db.insert(clipViralityScores).values({
              userId,
              clipId: created.id,
              predictedScore: m.viralScore,
              platform: "youtube",
              factors: {
                hookStrength:    Math.min(100, Math.round(m.viralScore * 0.9  + Math.random() * 10)),
                trendAlignment:  Math.min(100, Math.round(m.viralScore * 0.8  + Math.random() * 15)),
                audienceMatch:   Math.min(100, Math.round(m.viralScore * 0.85 + Math.random() * 12)),
                platformFit:     Math.min(100, Math.round(m.viralScore * 0.95 + Math.random() * 5)),
              },
            }).catch(() => {});
          }
          createdClips.push({ ...created, hook: m.title });
        }
        return createdClips;
      }
    } catch (err: any) {
      if (err?.message?.includes("AI queue full") || err?.message?.includes("request dropped")) throw err;
      // Fall through to single-pass analysis below
    }
  }

  // ── Fallback: single-pass analysis (no transcript / no YouTube ID) ────────
  let transcriptSection = "";
  if (youtubeId) {
    try {
      const transcript = await fetchYouTubeTranscript(youtubeId);
      if (transcript) {
        const lines = transcript.split("\n");
        const sample = lines.length > 800 ? lines.slice(0, 800).join("\n") + "\n... [truncated]" : transcript;
        transcriptSection = `\nTranscript (timestamped):\n${sample}\n\nIMPORTANT: Use the transcript timestamps to identify EXACT clip start/end times. Pick moments where the spoken content is most engaging, surprising, or valuable.\n`;
      }
    } catch {}
  }

  const prompt = `You are a viral shorts/clips extraction expert using proven retention science. Analyze this video and identify 3-8 clip-worthy moments that would perform well as short-form content on TikTok, YouTube Shorts, and Instagram Reels.

Video Title: "${sanitizeForPrompt(video.title)}"
Description: "${sanitizeForPrompt(video.description || "Not provided")}"
Duration: ${duration}
Views: ${views}
Tags: ${sanitizeForPrompt(tags)}
Type: ${video.type}
Platform: ${video.platform || "youtube"}
${transcriptSection}
${retentionContext}

Apply retention beats to every clip — hook in frame 1, escalation by second 5, payoff before the clip ends.

Identify the best clip-worthy moments. For each clip provide:
- A catchy, attention-grabbing title optimized for short-form
- A brief description
- Estimated start time (seconds from beginning)
- Estimated end time (seconds from beginning, clips should be 15-60 seconds)
- Best target platform (youtube or youtube_shorts)
- A powerful hook (the first 1-3 seconds hook text that grabs attention)
- A viral score prediction (1-100)
- Relevant tags

Return as JSON:
{
  "clips": [
    {
      "title": "clip title",
      "description": "brief description of the moment",
      "startTime": 0,
      "endTime": 30,
      "targetPlatform": "youtube",
      "hook": "attention grabbing hook text",
      "viralScore": 75,
      "tags": ["tag1", "tag2"],
      "thumbnailPrompt": "description for thumbnail generation",
      "format": "vertical",
      "aspectRatio": "9:16"
    }
  ]
}

CRITICAL — GAMING LIVE STREAM RULES (apply whenever the video is a stream or VOD):
- IMPORTANT: This creator starts their stream ALREADY IN A MATCH. There is NO pre-stream setup window — real gameplay can appear in the very first seconds. DO NOT skip the beginning of the video based on time alone.
- Only pick moments with ACTIVE IN-GAME ACTION: gunfights, kills, clutch plays, objective captures, team coordination, intense firefights, comeback wins, highlight-reel moments, funny in-game reactions.
- SKIP any moment showing NO MOVEMENT or inactivity: player standing still without firing, respawn screens, menus, spectating, watching killcams, idle lobby, "brb" pauses, or segments where the creator is purely chatting with no gameplay happening. Use the transcript to detect this — no action callouts = no movement.
- NEVER assume a timestamp is bad because it is early in the video. Judge every moment on its content, not its position.

Focus on:
- High-energy or emotional moments
- Surprising or unexpected content
- Visually striking moments
- Relatable or funny in-game moments
- Clutch plays or key turning points

YouTube Shorts optimization:
- Keep clips 15-60 seconds (sweet spot: 30-50 seconds for algorithm)
- Front-load the hook in the first 1-3 seconds
- Title should be clear and searchable
- Use 3-5 relevant hashtags
- Optimize for vertical 9:16 format
- Prioritize moments with strong visual energy`;

  if (!tokenBudget.checkBudget("shorts-pipeline", 4000)) {
    logger.debug(`[ShortsPipeline] Daily token budget exhausted — skipping clip extraction for video ${videoId}`);
    return [];
  }
  tokenBudget.consumeBudget("shorts-pipeline", 4000);

  try {
    const response = await openai.chat.completions.create({
      model: "gpt-5",
      messages: [{ role: "user", content: prompt }],
      response_format: { type: "json_object" },
      max_completion_tokens: 4000,
    });

    const content = response.choices[0]?.message?.content;
    if (!content) return [];

    const parsed = JSON.parse(content);
    const clips = parsed.clips || [];
    const createdClips: any[] = [];

    for (const clip of clips) {
      const rawStart = Number(clip.startTime) || 0;
      const rawEnd = Number(clip.endTime) || 30;
      const startTime = Math.max(0, rawStart);
      const endTime = rawEnd > startTime ? rawEnd : startTime + 30;

      const created = await storage.createContentClip({
        userId,
        sourceVideoId: videoId,
        title: clip.title || "Untitled Clip",
        description: clip.description || "",
        startTime,
        endTime,
        targetPlatform: clip.targetPlatform || "youtube",
        status: "ai_ready",
        optimizationScore: Math.min(100, Math.max(0, clip.viralScore ?? 50)),
        metadata: {
          tags: clip.tags || [],
          thumbnailPrompt: clip.thumbnailPrompt || "",
          format: clip.format || "vertical",
          aspectRatio: clip.aspectRatio || "9:16",
          
          hasTranscript: !!transcriptSection,
        } as any,
      });

      if (clip.viralScore) {
        await db.insert(clipViralityScores).values({
          userId,
          clipId: created.id,
          predictedScore: clip.viralScore,
          platform: clip.targetPlatform || "youtube",
          factors: {
            hookStrength: Math.min(100, Math.round(clip.viralScore * 0.9 + Math.random() * 10)),
            trendAlignment: Math.min(100, Math.round(clip.viralScore * 0.8 + Math.random() * 15)),
            audienceMatch: Math.min(100, Math.round(clip.viralScore * 0.85 + Math.random() * 12)),
            platformFit: Math.min(100, Math.round(clip.viralScore * 0.95 + Math.random() * 5)),
          },
        });
      }

      createdClips.push({ ...created, hook: clip.hook });
    }

    return createdClips;
  } catch (err: any) {
    // Re-throw AI queue saturation errors so the batch loop can break and defer
    // the rest of the batch rather than silently returning [] and letting the
    // loop continue hammering the same saturated queue on every video.
    if (
      typeof err?.message === "string" &&
      (err.message.includes("AI queue full") || err.message.includes("request dropped"))
    ) {
      throw err;
    }
    logger.error(`Failed to extract clips from video ${videoId}:`, err.message);
    return [];
  }
}

export async function generateClipHook(
  userId: string,
  clipId: number
): Promise<{ hook: string; alternatives: string[] }> {
  const clips = await storage.getContentClips(userId);
  const clip = clips.find(c => c.id === clipId);
  if (!clip) return { hook: "Check this out!", alternatives: [] };

  let videoTitle = "";
  if (clip.sourceVideoId) {
    const video = await storage.getVideo(clip.sourceVideoId);
    videoTitle = video?.title || "";
  }

  const prompt = `You are a viral content hook specialist. Generate an attention-grabbing hook for this short-form clip.

Clip Title: "${sanitizeForPrompt(clip.title)}"
Clip Description: "${sanitizeForPrompt(clip.description || "")}"
Source Video: "${sanitizeForPrompt(videoTitle)}"
Target Platform: ${clip.targetPlatform || "youtube"}

Create hooks that:
- Stop the scroll in the first 1-2 seconds
- Create curiosity or urgency
- Are concise (under 15 words)
- Match the platform's style

Return as JSON:
{
  "bestHook": "the single best hook",
  "alternatives": ["hook 2", "hook 3", "hook 4"]
}`;

  if (!tokenBudget.checkBudget("shorts-pipeline", 500)) {
    logger.debug(`[ShortsPipeline] Daily token budget exhausted — skipping hook generation for clip ${clipId}`);
    return { hook: "Check this out!", alternatives: [] };
  }
  tokenBudget.consumeBudget("shorts-pipeline", 500);

  try {
    const response = await openai.chat.completions.create({
      model: "gpt-5",
      messages: [{ role: "user", content: prompt }],
      response_format: { type: "json_object" },
      max_completion_tokens: 500,
    });

    const content = response.choices[0]?.message?.content;
    if (!content) return { hook: "Check this out!", alternatives: [] };

    const parsed = JSON.parse(content);
    return {
      hook: parsed.bestHook || "Check this out!",
      alternatives: parsed.alternatives || [],
    };
  } catch (err: any) {
    logger.error(`Failed to generate hook for clip ${clipId}:`, err.message);
    return { hook: "Check this out!", alternatives: [] };
  }
}

export async function predictClipVirality(
  userId: string,
  clipId: number
): Promise<{
  score: number;
  factors: { hookStrength: number; trendAlignment: number; audienceMatch: number; platformFit: number };
}> {
  const clips = await storage.getContentClips(userId);
  const clip = clips.find(c => c.id === clipId);
  if (!clip) {
    return { score: 50, factors: { hookStrength: 50, trendAlignment: 50, audienceMatch: 50, platformFit: 50 } };
  }

  let videoTitle = "";
  if (clip.sourceVideoId) {
    const video = await storage.getVideo(clip.sourceVideoId);
    videoTitle = video?.title || "";
  }

  const prompt = `You are a viral content prediction AI. Predict the virality potential of this clip on a scale of 1-100.

Clip Title: "${sanitizeForPrompt(clip.title)}"
Clip Description: "${sanitizeForPrompt(clip.description || "")}"
Source Video: "${sanitizeForPrompt(videoTitle)}"
Target Platform: ${clip.targetPlatform || "youtube"}
Duration: ${clip.endTime && clip.startTime ? Math.round((clip.endTime - clip.startTime)) : "unknown"} seconds

Score each factor from 1-100:
- hookStrength: How well the opening grabs attention
- trendAlignment: How well it aligns with current trends
- audienceMatch: How well it matches the target audience
- platformFit: How well the format fits the target platform

Return as JSON:
{
  "overallScore": 75,
  "factors": {
    "hookStrength": 80,
    "trendAlignment": 70,
    "audienceMatch": 75,
    "platformFit": 80
  },
  "reasoning": "brief explanation"
}`;

  if (!tokenBudget.checkBudget("shorts-pipeline", 500)) {
    logger.debug(`[ShortsPipeline] Daily token budget exhausted — skipping virality prediction for clip ${clipId}`);
    return { score: 50, factors: { hookStrength: 50, trendAlignment: 50, audienceMatch: 50, platformFit: 50 } };
  }
  tokenBudget.consumeBudget("shorts-pipeline", 500);

  try {
    const response = await openai.chat.completions.create({
      model: "gpt-5",
      messages: [{ role: "user", content: prompt }],
      response_format: { type: "json_object" },
      max_completion_tokens: 500,
    });

    const content = response.choices[0]?.message?.content;
    if (!content) {
      return { score: 50, factors: { hookStrength: 50, trendAlignment: 50, audienceMatch: 50, platformFit: 50 } };
    }

    const parsed = JSON.parse(content);
    const score = parsed.overallScore ?? 50;
    const factors = {
      hookStrength: parsed.factors?.hookStrength ?? 50,
      trendAlignment: parsed.factors?.trendAlignment ?? 50,
      audienceMatch: parsed.factors?.audienceMatch ?? 50,
      platformFit: parsed.factors?.platformFit ?? 50,
    };

    await db.insert(clipViralityScores).values({
      userId,
      clipId,
      predictedScore: score,
      platform: clip.targetPlatform || "youtube",
      factors,
    });

    await storage.updateContentClip(clipId, { optimizationScore: score });

    return { score, factors };
  } catch (err: any) {
    logger.error(`Failed to predict virality for clip ${clipId}:`, err.message);
    return { score: 50, factors: { hookStrength: 50, trendAlignment: 50, audienceMatch: 50, platformFit: 50 } };
  }
}

export async function getClipsByVideo(
  userId: string,
  videoId?: number
): Promise<Record<number, any[]>> {
  const clips = await storage.getContentClips(userId, videoId);
  const grouped: Record<number, any[]> = {};

  for (const clip of clips) {
    const vid = clip.sourceVideoId || 0;
    if (!grouped[vid]) grouped[vid] = [];
    grouped[vid].push(clip);
  }

  return grouped;
}

export async function compileAutoReel(
  userId: string,
  theme?: string
): Promise<{
  reelTitle: string;
  clips: any[];
  totalDuration: number;
  platforms: string[];
  compilationPlan: string;
}> {
  const allClips = await storage.getContentClips(userId);
  if (allClips.length === 0) {
    return {
      reelTitle: "No clips available",
      clips: [],
      totalDuration: 0,
      platforms: [],
      compilationPlan: "No clips found. Run the shorts pipeline first to extract clips from your videos.",
    };
  }

  const sortedClips = [...allClips].sort((a, b) => (b.optimizationScore || 0) - (a.optimizationScore || 0));
  const topClips = sortedClips.slice(0, 10);

  const clipSummary = topClips.map(c =>
    `- "${sanitizeForPrompt(c.title)}" (score: ${c.optimizationScore || 0}, platform: ${c.targetPlatform || "unknown"}, ${Math.round((c.endTime || 0) - (c.startTime || 0))}s)`
  ).join("\n");

  const prompt = `You are a content compilation expert. Create a compilation reel plan from these top-performing clips.

Available Clips:
${clipSummary}

${theme ? `Theme/Focus: "${sanitizeForPrompt(theme)}"` : "Select the best combination for maximum engagement."}

Create a compilation plan as JSON:
{
  "reelTitle": "catchy compilation title",
  "selectedClipIndices": [0, 1, 2],
  "orderRationale": "why this order works",
  "transitionNotes": "how to transition between clips",
  "platforms": ["youtube"],
  "estimatedPerformance": "expected engagement level",
  "compilationPlan": "detailed plan for assembling the reel"
}`;

  if (!tokenBudget.checkBudget("shorts-pipeline", 1000)) {
    logger.debug(`[ShortsPipeline] Daily token budget exhausted — skipping auto reel compilation`);
    const fallback = topClips.slice(0, 5);
    return {
      reelTitle: "Best Moments Compilation",
      clips: fallback,
      totalDuration: Math.round(fallback.reduce((s, c) => s + ((c.endTime || 0) - (c.startTime || 0)), 0)),
      platforms: ["youtube"],
      compilationPlan: "Top clips selected by viral score.",
    };
  }
  tokenBudget.consumeBudget("shorts-pipeline", 1000);

  try {
    const response = await openai.chat.completions.create({
      model: "gpt-5",
      messages: [{ role: "user", content: prompt }],
      response_format: { type: "json_object" },
      max_completion_tokens: 1000,
    });

    const content = response.choices[0]?.message?.content;
    if (!content) throw new Error("No AI response");

    const parsed = JSON.parse(content);
    const selectedIndices: number[] = parsed.selectedClipIndices || [0, 1, 2];
    const selectedClips = selectedIndices
      .filter(i => i >= 0 && i < topClips.length)
      .map(i => topClips[i]);

    const totalDuration = selectedClips.reduce((sum, c) => {
      return sum + ((c.endTime || 0) - (c.startTime || 0));
    }, 0);

    return {
      reelTitle: parsed.reelTitle || "Best Moments Compilation",
      clips: selectedClips,
      totalDuration: Math.round(totalDuration),
      platforms: parsed.platforms || ["youtube"],
      compilationPlan: parsed.compilationPlan || parsed.orderRationale || "Compile selected clips in order.",
    };
  } catch (err: any) {
    logger.error(`Failed to compile auto reel:`, err.message);
    const selectedClips = topClips.slice(0, 5);
    const totalDuration = selectedClips.reduce((sum, c) => sum + ((c.endTime || 0) - (c.startTime || 0)), 0);
    return {
      reelTitle: "Best Moments Compilation",
      clips: selectedClips,
      totalDuration: Math.round(totalDuration),
      platforms: ["youtube"],
      compilationPlan: "Top clips selected by viral score. Arrange in descending engagement order.",
    };
  }
}

const ALLOWED_YT_HOSTS = new Set([
  "youtube.com", "www.youtube.com", "m.youtube.com",
  "youtu.be", "www.youtu.be",
  "youtube-nocookie.com", "www.youtube-nocookie.com",
]);

export function parseYouTubeVideoId(url: string): string | null {
  if (!url || typeof url !== "string") return null;
  const trimmed = url.trim();

  if (/^[a-zA-Z0-9_-]{11}$/.test(trimmed)) return trimmed;

  let parsed: URL;
  try {
    parsed = new URL(trimmed.startsWith("http") ? trimmed : `https://${trimmed}`);
  } catch {
    return null;
  }

  const host = parsed.hostname.toLowerCase();
  if (!ALLOWED_YT_HOSTS.has(host)) return null;

  if (host === "youtu.be" || host === "www.youtu.be") {
    const id = parsed.pathname.slice(1).split(/[/?#]/)[0];
    return id && /^[a-zA-Z0-9_-]{11}$/.test(id) ? id : null;
  }

  const vParam = parsed.searchParams.get("v");
  if (vParam && /^[a-zA-Z0-9_-]{11}$/.test(vParam)) return vParam;

  const pathPatterns = [/\/(?:shorts|embed|v|live)\/([a-zA-Z0-9_-]{11})/];
  for (const pattern of pathPatterns) {
    const match = parsed.pathname.match(pattern);
    if (match?.[1]) return match[1];
  }

  return null;
}

export async function ingestVideoFromYouTubeUrl(
  userId: string,
  youtubeId: string,
): Promise<{ video: any; alreadyExisted: boolean }> {
  const existingVideos = await storage.getVideosByUser(userId);
  const existing = existingVideos.find(
    (v: any) => (v.metadata as any)?.youtubeId === youtubeId,
  );
  if (existing) return { video: existing, alreadyExisted: true };

  let title = `YouTube Video ${youtubeId}`;
  let description = "";
  let tags: string[] = [];
  let duration = "unknown";
  let categoryId = "20";
  let thumbnailUrl = `https://img.youtube.com/vi/${youtubeId}/hqdefault.jpg`;
  let viewCount = 0;
  let likeCount = 0;
  let commentCount = 0;
  let channelTitle = "";

  try {
    const apiKey = process.env.YOUTUBE_API_KEY;
    let videoData: any = null;

    if (apiKey) {
      const yt = google.youtube({ version: "v3", auth: apiKey });
      const resp = await yt.videos.list({
        part: ["snippet", "contentDetails", "statistics"],
        id: [youtubeId],
      });
      videoData = resp.data.items?.[0];
    }

    if (!videoData) {
      const userChannels = await storage.getChannelsByUser(userId);
      const ytChannel = userChannels.find(
        (c: any) => c.platform === "youtube" && c.accessToken,
      );
      if (ytChannel) {
        const { getAuthenticatedClient } = await import("./youtube");
        const { oauth2Client } = await getAuthenticatedClient(ytChannel.id);
        const yt = google.youtube({ version: "v3", auth: oauth2Client });
        const resp = await yt.videos.list({
          part: ["snippet", "contentDetails", "statistics"],
          id: [youtubeId],
        });
        videoData = resp.data.items?.[0];
      }
    }

    if (videoData) {
      const snippet = videoData.snippet || {};
      const stats = videoData.statistics || {};
      const cd = videoData.contentDetails || {};
      title = snippet.title || title;
      description = snippet.description || "";
      tags = snippet.tags || [];
      categoryId = snippet.categoryId || "20";
      channelTitle = snippet.channelTitle || "";
      thumbnailUrl = snippet.thumbnails?.high?.url || snippet.thumbnails?.default?.url || thumbnailUrl;
      duration = cd.duration || "unknown";
      viewCount = parseInt(stats.viewCount || "0", 10);
      likeCount = parseInt(stats.likeCount || "0", 10);
      commentCount = parseInt(stats.commentCount || "0", 10);
    }
  } catch (err: any) {
    logger.error(`[shorts-pipeline] Failed to fetch YouTube metadata for ${youtubeId}:`, err.message);
  }

  const userChannels = await storage.getChannelsByUser(userId);
  const ytChannel = userChannels.find((c: any) => c.platform === "youtube");
  const channelId = ytChannel?.id ?? 0;

  const video = await storage.createVideo({
    channelId,
    title,
    description,
    type: "video",
    status: "ingested",
    platform: "youtube",
    thumbnailUrl,
    metadata: {
      youtubeId,
      youtubeVideoId: youtubeId,
      tags,
      categoryId,
      channelTitle,
      duration,
      stats: { views: viewCount, likes: likeCount, comments: commentCount, ctr: 0 },
      viewCount,
      likeCount,
      commentCount,
      importedFromUrl: true,
      importedAt: new Date().toISOString(),
    } as any,
  });

  return { video, alreadyExisted: false };
}

export async function optimizeClipsSEO(
  clips: any[],
  sourceVideo: any,
): Promise<any[]> {
  if (clips.length === 0) return clips;

  const clipSummary = clips.map((c, i) => ({
    index: i,
    title: sanitizeForPrompt(c.title),
    description: sanitizeForPrompt(c.description || ""),
    tags: (c.metadata as any)?.tags || [],
    platform: c.targetPlatform,
    hook: sanitizeForPrompt((c.metadata as any)?.hook || ""),
    duration: `${Math.round((c.endTime || 0) - (c.startTime || 0))}s`,
  }));

  const prompt = `You are a YouTube Shorts SEO specialist for a PS5 no-commentary gaming channel. Optimize these clip titles, descriptions, and tags for maximum YouTube Shorts discoverability.

Source Video: "${sanitizeForPrompt(sourceVideo.title)}"
Channel Niche: PS5 Gaming, No Commentary

Clips to optimize:
${JSON.stringify(sanitizeObjectForPrompt(clipSummary), null, 2)}

SEO Rules (STRICT):
- Titles must be DESCRIPTIVE and SPECIFIC — tell viewers exactly what happens
- NO clickbait patterns: no "YOU WON'T BELIEVE", "INSANE", "OMG", "WATCH TILL THE END", ALL CAPS shock phrases
- DO use strong keywords: game name, specific action, result (e.g., "Elden Ring - Malenia First Try No Hit Run")
- Keep titles under 70 characters so they don't get truncated
- Include the game name in every title
- Descriptions: 2-3 sentences, keyword-rich, include the game name and what happens
- Tags: 8-12 relevant tags per clip mixing broad (PS5, gaming, shorts) with specific (game name, boss name, moment type)
- Add 3-5 hashtags at end of description: #Shorts plus niche tags (NO #fyp or generic trending tags)
- Hooks should create genuine curiosity about what happens, not fake tension

Return as JSON:
{
  "optimized": [
    {
      "index": 0,
      "title": "optimized title",
      "description": "optimized description with hashtags",
      "tags": ["tag1", "tag2"],
      "hook": "improved hook text"
    }
  ]
}`;

  if (!tokenBudget.checkBudget("shorts-pipeline", 2000)) {
    logger.debug(`[ShortsPipeline] Daily token budget exhausted — skipping SEO optimization for ${clips.length} clips`);
    return clips;
  }
  tokenBudget.consumeBudget("shorts-pipeline", 2000);

  try {
    const response = await openai.chat.completions.create({
      model: "gpt-5",
      messages: [{ role: "user", content: prompt }],
      response_format: { type: "json_object" },
      max_completion_tokens: 4000,
    });

    const content = response.choices[0]?.message?.content;
    if (!content) return clips;

    const parsed = JSON.parse(content);
    const optimized = parsed.optimized || [];

    for (const opt of optimized) {
      const clip = clips[opt.index];
      if (!clip) continue;

      const updates: any = {};
      if (opt.title) updates.title = opt.title;
      if (opt.description) updates.description = opt.description;

      const existingMeta = (clip.metadata as any) || {};
      const newMeta = {
        ...existingMeta,
        tags: opt.tags || existingMeta.tags || [],
        hook: opt.hook || existingMeta.hook || "",
        seoOptimized: true,
        seoOptimizedAt: new Date().toISOString(),
      };
      updates.metadata = newMeta;

      if (Object.keys(updates).length > 0) {
        await storage.updateContentClip(clip.id, updates);
        Object.assign(clip, updates);
      }
    }

    return clips;
  } catch (err: any) {
    logger.error(`[shorts-pipeline] SEO optimization failed:`, err.message);
    return clips;
  }
}

export async function extractAndOptimizeFromUrl(
  userId: string,
  youtubeUrl: string,
): Promise<{
  video: any;
  clips: any[];
  seoOptimized: boolean;
  alreadyExisted: boolean;
  clipsAlreadyExisted: boolean;
}> {
  const videoId = parseYouTubeVideoId(youtubeUrl);
  if (!videoId) {
    throw new Error("Invalid YouTube URL. Supported formats: youtu.be/xxx, youtube.com/watch?v=xxx, youtube.com/shorts/xxx");
  }

  const { video, alreadyExisted } = await ingestVideoFromYouTubeUrl(userId, videoId);

  const existingClips = await storage.getContentClips(userId, video.id);
  if (existingClips.length > 0) {
    return { video, clips: existingClips, seoOptimized: false, alreadyExisted, clipsAlreadyExisted: true };
  }

  const clips = await extractClipsFromVideo(userId, video.id);

  let seoOptimized = false;
  if (clips.length > 0) {
    try {
      await optimizeClipsSEO(clips, video);
      const anyOptimized = clips.some((c: any) => (c.metadata as any)?.seoOptimized);
      seoOptimized = anyOptimized;
    } catch {
      seoOptimized = false;
    }
  }

  return { video, clips, seoOptimized, alreadyExisted, clipsAlreadyExisted: false };
}

export async function trackClipPerformance(
  userId: string,
  clipId: number,
  actualMetrics: any
): Promise<{ tracked: boolean; accuracy: number | null }> {
  try {
    const existingScores = await db.select().from(clipViralityScores)
      .where(and(
        eq(clipViralityScores.userId, userId),
        eq(clipViralityScores.clipId, clipId),
      ))
      .orderBy(desc(clipViralityScores.createdAt))
      .limit(1);

    const prediction = existingScores[0];

    const actualViews = actualMetrics.views || 0;
    const actualLikes = actualMetrics.likes || 0;
    const actualShares = actualMetrics.shares || 0;
    const actualComments = actualMetrics.comments || 0;

    const engagementRate = actualViews > 0
      ? ((actualLikes + actualShares + actualComments) / actualViews) * 100
      : 0;

    const actualScore = Math.min(100, Math.round(
      Math.log10(Math.max(actualViews, 1)) * 10 +
      engagementRate * 5
    ));

    let accuracy: number | null = null;
    if (prediction) {
      const predictedScore = prediction.predictedScore || 50;
      const diff = Math.abs(predictedScore - actualScore);
      accuracy = Math.max(0, Math.round(100 - diff));

      await db.update(clipViralityScores).set({
        actualScore,
        accuracy,
      }).where(eq(clipViralityScores.id, prediction.id));
    } else {
      await db.insert(clipViralityScores).values({
        userId,
        clipId,
        actualScore,
        platform: actualMetrics.platform || "youtube",
        factors: {
          hookStrength: 50,
          trendAlignment: 50,
          audienceMatch: 50,
          platformFit: 50,
        },
        accuracy: null,
      });
    }

    await storage.updateContentClip(clipId, {
      metadata: {
        actualMetrics: {
          views: actualViews,
          likes: actualLikes,
          shares: actualShares,
          comments: actualComments,
          engagementRate,
          actualScore,
        },
        trackedAt: new Date().toISOString(),
      } as any,
    });

    return { tracked: true, accuracy };
  } catch (err: any) {
    logger.error(`Failed to track clip performance for clip ${clipId}:`, err.message);
    return { tracked: false, accuracy: null };
  }
}
