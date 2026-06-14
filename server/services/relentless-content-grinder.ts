import { db } from "../db";
import { getContainerMemory } from "../lib/container-memory";
import { videos, channels, autopilotQueue, videoCatalogLinks, contentExperiments } from "@shared/schema";
import { eq, and, desc, gte, ne, sql, count, or, inArray } from "drizzle-orm";
import { callClaudeBackground, CLAUDE_MODELS } from "../lib/claude";
import { createLogger } from "../lib/logger";
import { isAutonomousMode, logAutonomousAction } from "../lib/autonomous";
import { storage } from "../storage";
import { sanitizeForPrompt, sanitizeObjectForPrompt, tokenBudget } from "../lib/ai-attack-shield";
import { CommandCenter } from "../lib/command-center";
import { getFocusGame, buildFocusGameRegex } from "../lib/game-focus";
import { getMasterKnowledgeForPrompt } from "./knowledge-mesh";
import {
  getNextShortPublishTime,
  getNextLongFormPublishTime,
  canQueueShortToday,
  canQueueLongFormToday,
  MAX_SHORTS_PER_DAY,
  MAX_LONGFORM_PER_DAY,
  isShortScheduleSaturated,
  isLongFormScheduleSaturated,
} from "./youtube-output-schedule";
import { chooseBestLongFormDuration, getBucketRankings } from "./youtube-performance-learner";

const logger = createLogger("content-grinder");

// Throughput constants — grinder uses these in normal mode.
// Burst mode (triggered when queue is thin) overrides these at runtime.
// Fix #4 — spread token budget across the day instead of burning it in 3 hours.
const GRINDER_MAX_PER_CYCLE_NORMAL = 20;  // max videos processed per cycle (normal)
const GRINDER_MAX_PER_CYCLE_BURST  = 50;  // max videos per cycle in burst mode
const GRINDER_INTER_VIDEO_DELAY_MS = 15_000; // 15s between videos (was 30s — AI semaphore provides backpressure)

// Adaptive grind intervals — match the back-catalog runner thresholds so both
// systems breathe in tandem: thin queue → both run fast; full queue → both ease back.
function grindJitter(baseMs: number, jitterMs = baseMs * 0.1): number {
  return baseMs + Math.floor(Math.random() * jitterMs);
}
const GRIND_INTERVAL_URGENT_MS   = grindJitter(20 * 60_000, 2 * 60_000);  // ~20-22 min  — queue < 7 (raised from 10 to prevent T+14min OOM convergence with back-catalog runner)
const GRIND_INTERVAL_LOW_MS      = grindJitter(20 * 60_000, 5 * 60_000);  // ~20-25 min  — queue 7-20
const GRIND_INTERVAL_MODERATE_MS = grindJitter(35 * 60_000, 5 * 60_000);  // ~35-40 min  — queue 20-42
const GRIND_INTERVAL_HEALTHY_MS  = grindJitter(60 * 60_000, 10 * 60_000); // ~60-70 min  — queue ≥ 42

/**
 * Strip markdown code fences and parse JSON from an AI response.
 * Claude sometimes wraps output in ```json\n...\n``` blocks even when
 * told not to — this makes raw JSON.parse throw a SyntaxError.
 * Also handles the case where the AI omits the closing fence entirely.
 */
function extractJsonFromResponse(raw: string): any {
  let content = (raw || "{}").trim();
  // Strip markdown fences (with or without closing fence)
  content = content.replace(/^```(?:json|JSON)?\s*\r?\n?/, "");
  content = content.replace(/\r?\n?```\s*$/, "");
  content = content.trim();

  // Find start of JSON object or array
  const brace = content.indexOf("{");
  const bracket = content.indexOf("[");
  const start =
    brace === -1 ? bracket :
    bracket === -1 ? brace :
    Math.min(brace, bracket);
  if (start > 0) content = content.slice(start);
  if (!content) return JSON.parse("{}");

  // Try direct parse first — handles clean responses where AI returned only JSON
  try { return JSON.parse(content); } catch { /* fall through to balanced-bracket search */ }

  // Balanced-bracket extractor: finds the matching close brace/bracket even
  // when the AI appends explanatory text after the JSON object.
  const opener = content[0];
  const closer = opener === "{" ? "}" : "]";
  let depth = 0;
  let inString = false;
  let escape = false;
  let endPos = -1;
  for (let i = 0; i < content.length; i++) {
    const c = content[i];
    if (escape)             { escape = false; continue; }
    if (c === "\\" && inString) { escape = true; continue; }
    if (c === '"')          { inString = !inString; continue; }
    if (inString)           { continue; }
    if (c === opener)       { depth++; }
    else if (c === closer)  { depth--; if (depth === 0) { endPos = i; break; } }
  }

  if (endPos > 0) {
    try { return JSON.parse(content.slice(0, endPos + 1)); } catch { /* fall through to truncation repair */ }
  }

  // Truncation repair: the AI response was cut off mid-JSON (token limit hit).
  // Close any open string, then close open arrays/objects from innermost out.
  // This recovers partial moments arrays so at least the complete items survive.
  try {
    let repaired = content;
    // If we're inside an unclosed string, close it
    let inStr = false;
    let esc = false;
    for (const ch of repaired) {
      if (esc) { esc = false; continue; }
      if (ch === "\\" && inStr) { esc = true; continue; }
      if (ch === '"') inStr = !inStr;
    }
    if (inStr) repaired += '"';
    // Count unclosed brackets/braces and close them in order
    const stack: string[] = [];
    let inS = false, es = false;
    for (const ch of repaired) {
      if (es) { es = false; continue; }
      if (ch === "\\" && inS) { es = true; continue; }
      if (ch === '"') { inS = !inS; continue; }
      if (inS) continue;
      if (ch === "{" || ch === "[") stack.push(ch === "{" ? "}" : "]");
      else if ((ch === "}" || ch === "]") && stack.length) stack.pop();
    }
    repaired += stack.reverse().join("");
    return JSON.parse(repaired);
  } catch { /* fall through */ }

  if (endPos > 0) {
    return JSON.parse(content.slice(0, endPos + 1));
  }

  // Final attempt — will throw if still malformed (caught by caller)
  return JSON.parse(content);
}

// Track when the thumbnail-intelligence token budget was last exhausted per user.
// If exhausted, skip all thumbnail research for that user for the rest of the day
// to avoid hammering the budget check on every video in the loop.
import { LRUMap } from "../lib/lru-map";
const thumbnailBudgetExhaustedAt: Map<string, number> = new LRUMap(5_000);

// ── Perpetual scheduler state ─────────────────────────────────────────────────
let grindTimer:          ReturnType<typeof setTimeout> | null = null;
let grinderRunning       = false;
let grinderNextRunAt:    Date | null = null;
let lastGrindIntervalMs: number = GRIND_INTERVAL_MODERATE_MS;
let lastGrindTotals:     { clipsQueued: number; longFormQueued: number } = { clipsQueued: 0, longFormQueued: 0 };

/** Probe current YouTube queue depth without touching the YouTube API. */
async function getGrindQueueDepth(): Promise<number> {
  try {
    // Count ALL pending/scheduled items (including past-due ones).
    // Previously filtered scheduledAt >= now, which excluded overdue items and
    // made the grinder see an empty queue even when 350+ items were waiting —
    // triggering URGENT mode (20-22 min) instead of HEALTHY (60-70 min).
    const r = await db.select({ n: count() })
      .from(autopilotQueue)
      .where(and(
        eq(autopilotQueue.targetPlatform, "youtube"),
        inArray(autopilotQueue.status, ["scheduled", "pending"]),
      ));
    return Number(r[0]?.n ?? 0);
  } catch {
    return 99; // assume healthy on error — avoid spurious extra runs
  }
}

/** Pick the next grind interval based on queue depth. */
function grindAdaptiveIntervalMs(queueDepth: number): number {
  if (queueDepth <  7) return GRIND_INTERVAL_URGENT_MS;
  if (queueDepth < 20) return GRIND_INTERVAL_LOW_MS;
  if (queueDepth < 42) return GRIND_INTERVAL_MODERATE_MS;
  return GRIND_INTERVAL_HEALTHY_MS;
}

interface GrindState {
  videosExhausted: number;
  videosWithRemaining: number;
  clipsQueued: number;
  longFormClipsQueued: number;
  seoRefreshed: number;
  thumbnailsRedesigned: number;
  pacingEnhanced: number;
}

export async function runGrindCycle(): Promise<{ clipsQueued: number; longFormQueued: number }> {
  // Container memory gate — if free memory is below 250 MB, defer this cycle.
  // The back-catalog runner, publisher sweep, and this grinder all converge at
  // T+10-20 min after boot; this guard prevents that convergence from OOM-killing
  // the container.
  const mem = getContainerMemory();
  const freeMB = Math.round(mem.freeBytes / 1024 / 1024);
  if (mem.freeBytes < 250 * 1024 * 1024) {
    logger.warn(`[ContentGrinder] Deferred — only ${freeMB}MB container memory free (need 250MB). Will retry next cycle.`);
    return { clipsQueued: 0, longFormQueued: 0 };
  }

  logger.info("Relentless content grinder cycle starting");
  let totalClips = 0;
  let totalLongForm = 0;

  try {
    const allUsers = await storage.getAllUsers();
    const eligible = allUsers.filter((u: any) => u.tier && u.tier !== "free");

    for (const user of eligible) {
      const gate = await CommandCenter.canRun({
        module: "relentless-content-grinder",
        userId: user.id,
        platform: "youtube",
        requiresAI: true,
        priority: 6,
      });
      if (!gate.allowed) {
        logger.debug(`[ContentGrinder] Skipping user ${user.id.substring(0, 8)}: ${gate.reason}`);
        continue;
      }

      try {
        const autonomous = await isAutonomousMode(user.id);
        if (!autonomous) continue;

        const state = await grindUserContent(user.id);
        totalClips    += state.clipsQueued;
        totalLongForm += state.longFormClipsQueued;
        if (state.clipsQueued > 0 || state.longFormClipsQueued > 0 || state.seoRefreshed > 0) {
          logger.info(`[${user.id.substring(0, 8)}] Grind cycle: ${state.clipsQueued} Shorts queued, ${state.longFormClipsQueued} long-form clips queued, ${state.seoRefreshed} SEO refreshed, ${state.thumbnailsRedesigned} thumbnails redesigned, ${state.pacingEnhanced} pacing enhanced. ${state.videosExhausted} fully exhausted, ${state.videosWithRemaining} still have content.`);
        }
      } catch (err: any) {
        logger.warn(`[${user.id.substring(0, 8)}] Grind cycle failed: ${err.message?.substring(0, 200)}`);
      }
    }
  } catch (err: any) {
    logger.error(`Content grinder cycle error: ${err.message?.substring(0, 300)}`);
  }

  // ── Brain feed: every grind outcome (even zero) flows into learningInsights ─
  try {
    const { recordOutcome } = await import("../lib/outcome-recorder");
    const allUsers = await storage.getAllUsers();
    const brainUserId = allUsers.find((u: any) => u.tier && u.tier !== "free")?.id ?? allUsers[0]?.id;
    if (brainUserId) {
      await recordOutcome({
        engine:     "content-grinder",
        userId:     brainUserId,
        category:   "cycle_complete",
        summary:    `Grind cycle: ${totalClips} Shorts + ${totalLongForm} long-form clips queued for publishing`,
        metrics:    { clipsQueued: totalClips, longFormQueued: totalLongForm, total: totalClips + totalLongForm },
        confidence: totalClips + totalLongForm > 0 ? 0.9 : 0.5,
        recommendation: totalClips + totalLongForm > 0
          ? `${totalClips + totalLongForm} item(s) ready in autopilot_queue — publishers pick up next sweep`
          : "No new clips queued — catalog may be exhausted; recycler should trigger a fresh mining pass",
      });
    }
  } catch { /* non-fatal */ }

  return { clipsQueued: totalClips, longFormQueued: totalLongForm };
}

async function grindUserContent(userId: string): Promise<GrindState> {
  const state: GrindState = {
    videosExhausted: 0,
    videosWithRemaining: 0,
    clipsQueued: 0,
    longFormClipsQueued: 0,
    seoRefreshed: 0,
    thumbnailsRedesigned: 0,
    pacingEnhanced: 0,
  };

  const allVideos = await storage.getVideosByUser(userId);
  const _grindFocusGame = await getFocusGame().catch(() => "Battlefield 6");
  const _grindFocusRe = buildFocusGameRegex(_grindFocusGame);
  const longFormVideos = allVideos.filter((v: any) => {
    const meta = (v.metadata as any) || {};
    const durSec = meta.durationSec || parseDurationToSeconds(meta.duration);
    if (!(durSec >= 300 && v.type !== "short" && v.type !== "clip" && !meta.isShort)) return false;
    const gn: string = meta.gameName || "";
    return !gn || _grindFocusRe.test(gn);
  });

  longFormVideos.sort((a: any, b: any) => {
    const aDate = a.publishedAt ? new Date(a.publishedAt).getTime() : (a.createdAt ? new Date(a.createdAt).getTime() : 0);
    const bDate = b.publishedAt ? new Date(b.publishedAt).getTime() : (b.createdAt ? new Date(b.createdAt).getTime() : 0);
    return bDate - aDate;
  });

  if (!longFormVideos.length) return state;

  if (!tokenBudget.checkBudget("content-grinder", 2000)) {
    logger.debug(`[ContentGrinder] Daily token budget exhausted for user ${userId} — skipping grind cycle`);
    return state;
  }

  // Burst mode: if the queue is thin (< half a day's worth), extract more clips
  // per cycle so the pipeline catches up faster. AI semaphore (max 8) provides
  // natural backpressure so we don't burst the model rate limit.
  const burstMode = longFormVideos.length > GRINDER_MAX_PER_CYCLE_NORMAL;
  const maxThisCycle = burstMode ? GRINDER_MAX_PER_CYCLE_BURST : GRINDER_MAX_PER_CYCLE_NORMAL;
  if (burstMode) logger.info(`[ContentGrinder] Burst mode: ${longFormVideos.length} videos pending — processing up to ${maxThisCycle}`);

  let _aiQueueFullStreak = 0;
  for (const video of longFormVideos.slice(0, maxThisCycle)) {
    try {
      const exhaustionLevel = await checkVideoExhaustion(userId, video);

      if (exhaustionLevel >= 95) {
        state.videosExhausted++;
        continue;
      }

      state.videosWithRemaining++;

      if (exhaustionLevel < 80) {
        const newClips = await extractUntappedMoments(userId, video);
        state.clipsQueued += newClips;
      }

      // Extract long-form clips. For source videos > 60 min, the multi-segmenter
      // identifies multiple non-overlapping 8-60 min segments and tracks coverage
      // so the same footage is never queued twice.  For shorter videos the single-
      // segment extractor runs as before.
      const vMeta = (video.metadata as any) || {};
      const vDurSec = vMeta.durationSec || parseDurationToSeconds(vMeta.duration) || 0;
      let lfClips = 0;
      if (vDurSec > 3600) {
        try {
          const { queueLongFormSegments, hasUnminedFootage } = await import("./youtube-longform-segmenter");
          const canMine = await hasUnminedFootage(userId, video.id, vDurSec);
          if (canMine) lfClips = await queueLongFormSegments(userId, video.id);
        } catch (segErr: any) {
          // AI-saturation: propagate up so the outer catch can break the loop
          if (segErr?.message?.includes("AI queue full") || segErr?.message?.includes("request dropped")) {
            throw segErr;
          }
          logger.warn(`[ContentGrinder] Segmenter failed for video ${video.id}: ${segErr.message?.slice(0, 200)}`);
          lfClips = await extractLongFormMoments(userId, video); // fallback to single-segment
        }
      } else {
        lfClips = await extractLongFormMoments(userId, video);
      }
      state.longFormClipsQueued += lfClips;

      const seoResult = await viralSEORefresh(userId, video);
      if (seoResult) state.seoRefreshed++;

      const thumbResult = await viralThumbnailRedesign(userId, video);
      if (thumbResult) state.thumbnailsRedesigned++;

      const pacingResult = await enhanceRetentionPacing(userId, video);
      if (pacingResult) state.pacingEnhanced++;

      _aiQueueFullStreak = 0; // successful video — reset streak
      await new Promise(r => setTimeout(r, GRINDER_INTER_VIDEO_DELAY_MS));
    } catch (err: any) {
      if (err?.message?.includes("AI queue full") || err?.message?.includes("request dropped")) {
        _aiQueueFullStreak++;
        if (_aiQueueFullStreak >= 3) {
          logger.warn(`[ContentGrinder] AI queue full ${_aiQueueFullStreak}× in a row — stopping grind cycle, will resume next run`);
          break;
        }
        logger.warn(`[${userId.substring(0, 8)}] AI queue full for video ${video.id} (streak ${_aiQueueFullStreak}/3) — skipping`);
      } else {
        _aiQueueFullStreak = 0;
        logger.warn(`[${userId.substring(0, 8)}] Failed to grind video ${video.id}: ${err.message?.substring(0, 200)}`);
      }
    }
  }

  await scanForUnderperformers(userId);

  // Always run gap filler last — ensures upcoming days are never empty
  await fillScheduleGaps(userId, allVideos.filter((v: any) => {
    const m = (v.metadata as any) || {};
    return !m.isShort && v.type !== "short" && v.type !== "clip";
  }));

  return state;
}

/**
 * Looks ahead 7 days and proactively fills any day that is missing its target
 * Shorts (3/day) or long-form (1/day).  Uses direct DB queries to count what is
 * already queued/scheduled, then picks the least-exhausted source videos and runs
 * extraction for each gap.  This ensures the publish schedule is ALWAYS fully
 * loaded regardless of how frequently the grinder runs or per-video cooldowns.
 */
async function fillScheduleGaps(userId: string, sourceVideos: any[]): Promise<void> {
  if (sourceVideos.length === 0) return;

  try {
    const now = Date.now();
    const DAY_MS = 86_400_000;

    // Count scheduled Shorts and long-form per calendar day for the next 7 days.
    // "Calendar day" = UTC midnight boundaries (close enough for gap detection).
    let shortGaps = 0;
    let longFormGaps = 0;

    for (let d = 0; d < 7; d++) {
      const dayStart = new Date(now + d * DAY_MS);
      dayStart.setUTCHours(0, 0, 0, 0);
      const dayEnd = new Date(dayStart.getTime() + DAY_MS);

      const rows = await db
        .select({ type: autopilotQueue.type })
        .from(autopilotQueue)
        .where(
          and(
            eq(autopilotQueue.userId, userId),
            eq(autopilotQueue.targetPlatform, "youtube"),
            or(
              eq(autopilotQueue.status, "scheduled"),
              eq(autopilotQueue.status, "pending"),
            ),
            gte(autopilotQueue.scheduledAt, dayStart),
            sql`${autopilotQueue.scheduledAt} < ${dayEnd}`,
          ),
        );

      const shortsCount = rows.filter(r =>
        r.type === "platform_short" || r.type === "vod-short",
      ).length;
      const lfCount = rows.filter(r =>
        r.type === "auto-clip" || r.type === "vod-long-form",
      ).length;

      shortGaps += Math.max(0, MAX_SHORTS_PER_DAY - shortsCount);
      longFormGaps += Math.max(0, MAX_LONGFORM_PER_DAY - lfCount);
    }

    if (shortGaps === 0 && longFormGaps === 0) return;

    logger.info(
      `[ContentGrinder][GapFiller] ${shortGaps} Short + ${longFormGaps} long-form slots empty in next 7 days — filling`,
    );

    // Sort source videos: longer videos first (more content to extract from)
    const scored = sourceVideos
      .map((v: any) => {
        const m = (v.metadata as any) || {};
        return { video: v, durSec: m.durationSec || parseDurationToSeconds(m.duration) || 0 };
      })
      .filter(x => x.durSec >= 60)
      .sort((a, b) => b.durSec - a.durSec);

    // Round-robin across source streams so consecutive schedule slots never
    // come from the same live stream.  One clip (Short or long-form) is extracted
    // per stream per rotation step; Shorts and LF alternate picks from the same
    // rotating index so they also don't land on the same source back-to-back.
    let rotIdx = 0;
    let shortsToFill = shortGaps;
    let lfToFill = longFormGaps;
    let consecutiveMisses = 0;
    const MAX_MISSES = scored.length * 2 + 1; // give up after cycling the list twice

    while ((shortsToFill > 0 || lfToFill > 0) && consecutiveMisses < MAX_MISSES) {
      const { video } = scored[rotIdx % scored.length];
      rotIdx++;
      let slotFilled = false;

      if (shortsToFill > 0 && tokenBudget.checkBudget("content-grinder", 3000)) {
        // maxClips:1 — extract exactly one Short from this stream, then rotate
        const added = await extractUntappedMoments(userId, video, 1);
        if (added > 0) {
          logger.info(`[ContentGrinder][GapFiller] +1 Short from video ${video.id} (rotation ${rotIdx})`);
          shortsToFill--;
          slotFilled = true;
        }
      } else if (lfToFill > 0 && tokenBudget.checkBudget("content-grinder", 2000)) {
        const added = await extractLongFormMoments(userId, video);
        if (added > 0) {
          logger.info(`[ContentGrinder][GapFiller] +1 long-form from video ${video.id} (rotation ${rotIdx})`);
          lfToFill--;
          slotFilled = true;
        }
      }

      // After a Short is filled, also try to fill a LF slot from the NEXT stream
      // before looping back to Shorts — this interleaves stream sources for both types.
      if (slotFilled && lfToFill > 0 && shortsToFill > 0) {
        const { video: lfVideo } = scored[rotIdx % scored.length];
        rotIdx++;
        if (tokenBudget.checkBudget("content-grinder", 2000)) {
          const added = await extractLongFormMoments(userId, lfVideo);
          if (added > 0) {
            logger.info(`[ContentGrinder][GapFiller] +1 long-form from video ${lfVideo.id} (rotation ${rotIdx})`);
            lfToFill--;
          }
        }
      }

      consecutiveMisses = slotFilled ? 0 : consecutiveMisses + 1;
    }
  } catch (err: any) {
    logger.warn(
      `[ContentGrinder][GapFiller] Gap fill error for ${userId.slice(0, 8)}: ${err.message?.slice(0, 200)}`,
    );
  }
}

async function checkVideoExhaustion(userId: string, video: any): Promise<number> {
  const meta = (video.metadata as any) || {};
  const durSec = meta.durationSec || parseDurationToSeconds(meta.duration) || 600;

  const existingClips = await db.select({ id: autopilotQueue.id }).from(autopilotQueue)
    .where(and(
      eq(autopilotQueue.userId, userId),
      eq(autopilotQueue.sourceVideoId, video.id),
    ));

  const maxPossibleClips = Math.max(1, Math.floor(durSec / 30));
  const extractedRatio = Math.min(100, Math.round((existingClips.length / maxPossibleClips) * 100));

  const hasSEO = !!meta.aiOptimized;
  const hasThumbnail = !!meta.thumbnailRedesigned || !!meta.viralThumbnail;
  const hasPacing = !!meta.pacingEnhanced;

  const bonusPoints = (hasSEO ? 5 : 0) + (hasThumbnail ? 5 : 0) + (hasPacing ? 5 : 0);

  return Math.min(100, extractedRatio + bonusPoints);
}

async function getRetentionIntelligence(userId: string, gameName: string): Promise<string> {
  try {
    const { retentionBeats } = await import("@shared/schema");
    const { desc: descOp, or: orOp, eq: eqOp } = await import("drizzle-orm");
    const beats = await db.select({
      beatType: retentionBeats.beatType,
      technique: retentionBeats.technique,
      description: retentionBeats.description,
      retentionImpact: retentionBeats.retentionImpact,
      psychologyPrinciple: retentionBeats.psychologyPrinciple,
    })
      .from(retentionBeats)
      .where(orOp(
        eqOp(retentionBeats.isGlobal, true),
        eqOp(retentionBeats.userId, userId),
      ))
      .orderBy(descOp(retentionBeats.retentionImpact))
      .limit(8);

    if (beats.length === 0) return "";

    const lines = beats.map(b => `- ${b.beatType}: ${b.technique} (impact: ${b.retentionImpact}) — ${b.description}${b.psychologyPrinciple ? ` [Psychology: ${b.psychologyPrinciple}]` : ""}`);
    return `\n\nRETENTION INTELLIGENCE (learned from top creators — prioritize clips that use these patterns):\n${lines.join("\n")}`;
  } catch {
    return "";
  }
}

async function getSEOKnowledgeForClips(userId: string, gameName: string): Promise<string> {
  try {
    const { getEngineKnowledgeForContext } = await import("./knowledge-mesh");
    const insights = await getEngineKnowledgeForContext("vod-seo-optimizer", userId, 5);
    if (insights.length === 0) return "";
    const relevant = insights.filter(i => i.topic.includes(gameName) || i.topic.includes("title_pattern"));
    if (relevant.length === 0) return "";
    return `\n\nSEO TITLE INTELLIGENCE (use these patterns for clip titles):\n${relevant.map(i => `- ${i.insight}`).join("\n")}`;
  } catch {
    return "";
  }
}

/**
 * Returns a dynamic LENGTH VARIETY instruction block for the Shorts extraction
 * prompt. When performance data exists the best-performing bucket gets boosted
 * (more clips requested). Falls back to equal distribution when there is not
 * yet enough data to form a preference.
 */
async function getShortLengthDistributionHint(userId: string): Promise<string> {
  try {
    const buckets = await getBucketRankings(userId);
    const shortBuckets = buckets
      .filter(b => b.contentType === "short" && b.sampleCount >= 3)
      .sort((a, b) => b.avgScore - a.avgScore);

    if (shortBuckets.length === 0) {
      // No data yet — equal distribution
      return `LENGTH VARIETY (critical for audience testing — spread durations across the range):
- At least 2 clips must be SHORT: 8–20 seconds (pure shock/reaction moment)
- At least 2 clips must be MEDIUM: 21–40 seconds (action sequence with payoff)
- At least 2 clips must be LONG: 41–59 seconds (mini-story arc, setup + climax + reaction)
- Do NOT cluster all clips at the same duration — variety is required.`;
    }

    // Map bucket labels to grinder range names
    const labelToRange: Record<string, string> = {
      short_15_30: "SHORT: 8–20 seconds",
      short_31_45: "MEDIUM: 21–40 seconds",
      short_46_60: "LONG: 41–59 seconds",
    };

    const best = shortBuckets[0];
    const worst = shortBuckets.at(-1);
    const bestRange = labelToRange[best.bucket] ?? "MEDIUM: 21–40 seconds";
    const worstRange = worst && worst.bucket !== best.bucket ? labelToRange[worst.bucket] : null;

    let hint = `LENGTH DISTRIBUTION (data-driven — bias toward your best-performing Short length):
- At least 4 clips must target ${bestRange} — this is your current top-performing Short length (avg score ${best.avgScore.toFixed(1)}, ${best.sampleCount} samples, ${best.avgViewPct.toFixed(0)}% avg view)
- At least 2 clips must target each of the other two length ranges for ongoing A/B testing`;
    if (worstRange) {
      hint += `\n- ${worstRange} is currently underperforming — still include 1–2 clips to continue the experiment`;
    }
    hint += `\n- Do NOT cluster all clips at the same duration — retain some variety.`;

    logger.debug(`[ContentGrinder] Short length hint: best=${best.bucket} score=${best.avgScore.toFixed(1)}`);
    return hint;
  } catch {
    return `LENGTH VARIETY (critical for audience testing — spread durations across the range):
- At least 2 clips must be SHORT: 8–20 seconds (pure shock/reaction moment)
- At least 2 clips must be MEDIUM: 21–40 seconds (action sequence with payoff)
- At least 2 clips must be LONG: 41–59 seconds (mini-story arc, setup + climax + reaction)
- Do NOT cluster all clips at the same duration — variety is required.`;
  }
}

async function extractUntappedMoments(userId: string, video: any, maxClips = 10): Promise<number> {
  const meta = (video.metadata as any) || {};
  const durSec = meta.durationSec || parseDurationToSeconds(meta.duration) || 600;
  const gameName = meta.gameName || meta.game || await getFocusGame();
  const youtubeId = meta.youtubeId || meta.youtubeVideoId;

  const existingClips = await db.select().from(autopilotQueue)
    .where(and(
      eq(autopilotQueue.userId, userId),
      eq(autopilotQueue.sourceVideoId, video.id),
    ));

  const coveredRanges = existingClips.map((c: any) => {
    const m = (c.metadata as any) || {};
    // Accept both key variants: grinder uses startSec/endSec; segmenter uses segmentStartSec/segmentEndSec
    const start = m.segmentStartSec ?? m.startSec ?? 0;
    const end = m.segmentEndSec ?? m.endSec ?? 0;
    return { start, end };
  }).filter(r => r.end > r.start);

  const [retentionContext, seoContext, lengthDistributionHint, brainContext] = await Promise.all([
    getRetentionIntelligence(userId, gameName),
    getSEOKnowledgeForClips(userId, gameName),
    getShortLengthDistributionHint(userId),
    getMasterKnowledgeForPrompt(userId, 5).catch(() => ""),
  ]);

  if (!tokenBudget.checkBudget("content-grinder", 3000)) {
    logger.debug(`[ContentGrinder] extractUntappedMoments: daily budget exhausted, skipping video ${video.id}`);
    return 0;
  }
  tokenBudget.consumeBudget("content-grinder", 3000);

  try {
    const resp = await callClaudeBackground({
      model: CLAUDE_MODELS.sonnet,
      prompt: `You are the most aggressive content extraction AI. Your goal: squeeze EVERY last piece of viral content from this video. Leave NOTHING on the table.

VIDEO: "${sanitizeForPrompt(video.title, 200)}" (${sanitizeForPrompt(gameName, 100)})
Duration: ${Math.floor(durSec / 60)} minutes
Already extracted clips: ${existingClips.length}
Already covered time ranges: ${JSON.stringify(sanitizeObjectForPrompt(coveredRanges.slice(0, 20)))}

⚠️ GAME ACCURACY (NON-NEGOTIABLE): This video is EXCLUSIVELY "${sanitizeForPrompt(gameName, 100)}" gameplay.
Every clip title MUST reference "${sanitizeForPrompt(gameName, 100)}" or a recognizable aspect of it.
Do NOT mention any other game — even if the video title says otherwise (the title may be incorrect).

Find moments in the UNCOVERED time ranges that can become viral Shorts or clips.

For NO COMMENTARY PS5 gaming, viral moments include:
- The EXACT frame a boss appears (cold open — no buildup)
- A death that happens in the first 2 seconds (immediate shock)
- A satisfying combo or kill chain  
- Finding a hidden area or rare item
- A jump scare or horror moment
- A beautiful panoramic vista
- A clutch dodge or parry at the last possible moment
- An unexpected enemy ambush
- Speed-running a section perfectly
- Any "wait for it..." moment with a payoff${retentionContext}${seoContext}${brainContext ? `\n\nCHANNEL INTELLIGENCE (AI brain learned from analytics + internet):\n${brainContext}` : ""}

VIRAL RULES:
- First frame must be VISUALLY EXPLOSIVE — no menus, no inventory, no walking
- Each clip must have a HOOK in the first 1-2 seconds
- End on a HIGH NOTE or a cliffhanger (never fade out)
- Titles must create curiosity gap: "This Boss Had Me SHAKING" not "Boss Fight Gameplay"

${lengthDistributionHint}

Return raw JSON only (no markdown code blocks):
{
  "moments": [
    {
      "startSec": number,
      "endSec": number, 
      "title": "string — viral clickbait title, max 80 chars",
      "hookDescription": "string — what happens in the first 2 seconds",
      "payoff": "string — the satisfying conclusion",
      "viralScore": 1-10,
      "retentionStrategy": "string — why viewer stays till end"
    }
  ],
  "exhaustionEstimate": 0-100
}`,
      maxTokens: 4096,
      temperature: 0.8,
    });

    const parsed = extractJsonFromResponse(resp.content || "{}");
    const moments = Array.isArray(parsed.moments) ? parsed.moments : [];

    let queued = 0;
    const userChannels = await db.select().from(channels)
      .where(and(eq(channels.userId, userId), eq(channels.platform, "youtube")));

    for (const moment of moments.slice(0, maxClips)) {
      if (typeof moment.startSec !== "number" || typeof moment.endSec !== "number") continue;
      if (moment.endSec <= moment.startSec || moment.endSec - moment.startSec > 59) continue;
      if (moment.endSec - moment.startSec < 8) continue;

      // Server-side overlap guard — reject if this timestamp range overlaps any
      // already-queued clip for this video (60-second tolerance).
      const OVERLAP_TOLERANCE = 60;
      const overlaps = coveredRanges.some(
        r => moment.startSec < r.end - OVERLAP_TOLERANCE && moment.endSec > r.start + OVERLAP_TOLERANCE,
      );
      if (overlaps) {
        logger.debug(`[ContentGrinder] Skipping duplicate moment ${moment.startSec}–${moment.endSec}s for video ${video.id}`);
        continue;
      }
      // Add to covered ranges immediately so later moments in this same batch
      // don't collide with each other.
      coveredRanges.push({ start: moment.startSec, end: moment.endSec });

      // Bail out early if the Short schedule is known to be saturated — calling
      // getNextShortPublishTime would just do 42 DB queries and return +6h each time.
      if (isShortScheduleSaturated(userId)) {
        logger.debug(`[ContentGrinder] Short schedule saturated for ${userId.slice(0, 8)} — skipping remaining moments`);
        break;
      }
      const scheduleTime = await getNextShortPublishTime(userId);
      const title = String(moment.title || `${gameName} Moment`).substring(0, 90) + " #Shorts";
      const description = `${moment.hookDescription || ""}\n\n${moment.retentionStrategy || ""}\n\nPure PS5 gameplay — no commentary.\n\n#Shorts #PS5 #NoCommentary #${gameName.replace(/\s+/g, "")} #Gaming`;

      try {
        await db.insert(autopilotQueue).values({
          userId,
          sourceVideoId: video.id,
          type: "platform_short",
          targetPlatform: "youtubeshorts",
          content: description,
          caption: title,
          status: "scheduled",
          scheduledAt: scheduleTime,
          metadata: {
            contentType: "platform_short",
            contentCategory: "video",
            style: "viral-grinder",
            aiModel: CLAUDE_MODELS.sonnet,
            sourceYoutubeId: youtubeId,
            startSec: moment.startSec,
            endSec: moment.endSec,
            gameName,
            noCommentary: true,
            viralScore: moment.viralScore || 5,
            hookDescription: moment.hookDescription,
            retentionStrategy: moment.retentionStrategy,
            tags: ["no commentary", "PS5", gameName, "gaming", "shorts", "viral", "gameplay"],
            grinderGenerated: true,
          },
        });
        queued++;
      } catch {}
    }

    return queued;
  } catch (err: any) {
    logger.warn(`[${userId.substring(0, 8)}] Moment extraction failed: ${err.message?.substring(0, 200)}`);
    return 0;
  }
}

// Long-form duration experiment buckets in seconds: 8 / 10 / 15 / 20 / 30 / 45 / 60 min.
// 8 min = AdSense mid-roll threshold. Each bucket is tested independently so the
// channel discovers which length maximises watch-time for this audience.
const LONG_FORM_DURATION_TARGETS_SEC = [480, 600, 900, 1200, 1800, 2700, 3600];
// Per-bucket cooldown: 7 days before the same duration is tried again on a video.
const BUCKET_COOLDOWN_MS = 7 * 86400_000;

/**
 * Identifies a compelling long-form clip from the video for the NEXT untested
 * duration bucket and queues it. Each bucket (8/10/15/20/30/45/60 min) is
 * treated independently with a 7-day cooldown so every video can yield up to
 * 7 different-length experiments over time.  Returns 1 if queued, 0 otherwise.
 */
async function extractLongFormMoments(userId: string, video: any): Promise<number> {
  const meta = (video.metadata as any) || {};
  const durSec = meta.durationSec || parseDurationToSeconds(meta.duration) || 0;

  if (durSec < 480) return 0;

  // Per-bucket cooldown tracking stored in video metadata as { bucketSec: lastTriedTimestamp }
  const triedBuckets: Record<string, number> = (meta.longFormBucketsTriedAt as any) || {};
  const now = Date.now();

  // Find the next untested (or cooldown-expired) bucket that fits in the video
  const validTargets = LONG_FORM_DURATION_TARGETS_SEC.filter(t => {
    if (t >= durSec * 0.9) return false; // bucket must fit in the video
    const lastTried = triedBuckets[String(t)] || 0;
    return now - lastTried >= BUCKET_COOLDOWN_MS;
  });
  if (validTargets.length === 0) return 0;

  const gameName = meta.gameName || meta.game || await getFocusGame();
  const youtubeId = meta.youtubeId || meta.youtubeVideoId;

  // Use the performance learner to bias toward high-performing buckets.
  // chooseBestLongFormDuration uses 85% exploitation / 15% exploration and
  // returns the best-scoring bucket (in seconds) for this user+game.
  // We then snap to the nearest cooldown-expired bucket so we never re-run
  // a bucket that was just tried on this video.
  let targetSec: number;
  try {
    const learnedSec = await chooseBestLongFormDuration(userId, gameName, durSec);
    targetSec = validTargets.reduce((prev, curr) =>
      Math.abs(curr - learnedSec) < Math.abs(prev - learnedSec) ? curr : prev,
    );
  } catch {
    targetSec = validTargets[0];
  }
  const targetMin = Math.round(targetSec / 60);

  if (!tokenBudget.checkBudget("content-grinder", 2000)) return 0;
  tokenBudget.consumeBudget("content-grinder", 2000);

  try {
    const resp = await callClaudeBackground({
      model: CLAUDE_MODELS.sonnet,
      prompt: `You are an expert YouTube video editor. Identify the BEST ${targetMin}-minute segment from this video that can stand alone as a compelling YouTube video.

VIDEO: "${sanitizeForPrompt(video.title, 200)}"
GAME: "${sanitizeForPrompt(gameName, 100)}"
TOTAL DURATION: ${Math.floor(durSec / 60)} minutes

⚠️ GAME ACCURACY (NON-NEGOTIABLE): This video is EXCLUSIVELY "${sanitizeForPrompt(gameName, 100)}" gameplay.
All titles MUST reference "${sanitizeForPrompt(gameName, 100)}" specifically.

TARGET CLIP DURATION: exactly ~${targetMin} minutes (${targetSec} seconds)

For NO COMMENTARY PS5 gameplay, the best long-form segments are:
- A complete boss fight from start to finish
- A key story mission or chapter
- An exploration sequence with beautiful environments
- A skill/speed run of a recognizable area
- An intense combat gauntlet
- Any sequence with strong pacing that keeps viewers engaged

The segment MUST:
- Start with something visually compelling (action, a vista, a dramatic moment) — NOT a loading screen, menu, or slow walk
- Have internal pacing — something interesting every 60-90 seconds
- End on a satisfying note (victory, discovery, cinematic moment)

Return raw JSON only (no markdown):
{
  "startSec": number,
  "endSec": number,
  "title": "string — compelling YouTube title under 80 chars (NOT clickbait, genuinely describes the content)",
  "description": "string — 2-sentence hook for the YouTube description",
  "reasonThisWorks": "string — why this segment keeps viewers watching",
  "contentQualityScore": 1-10
}`,
      maxTokens: 600,
      temperature: 0.7,
    });

    const parsed = extractJsonFromResponse(resp.content || "{}");

    const startSec = Number(parsed.startSec);
    const endSec = Number(parsed.endSec);
    const actualDurSec = endSec - startSec;

    // Validate: segment must be within 50% of target, at least 3 min, within video
    if (
      !parsed.title
      || isNaN(startSec) || isNaN(endSec)
      || actualDurSec < 180
      || actualDurSec < targetSec * 0.5
      || actualDurSec > targetSec * 1.5
      || endSec > durSec
      || startSec < 0
    ) {
      logger.debug(`[ContentGrinder] Long-form clip validation failed for video ${video.id}: start=${startSec} end=${endSec} target=${targetSec}s`);
      return 0;
    }

    if (isLongFormScheduleSaturated(userId)) {
      logger.debug(`[ContentGrinder] Long-form schedule saturated for ${userId.slice(0, 8)} — skipping long-form clip queue`);
      return 0;
    }
    const scheduledAt = await getNextLongFormPublishTime(userId);
    const title = String(parsed.title).substring(0, 90);
    const description = String(parsed.description || `${gameName} gameplay — no commentary.\n\n#PS5 #NoCommentary #${gameName.replace(/\s+/g, "")} #Gaming`).substring(0, 5000);

    await db.insert(autopilotQueue).values({
      userId,
      sourceVideoId: video.id,
      type: "auto-clip",
      targetPlatform: "youtube",
      content: description,
      caption: title,
      status: "scheduled",
      scheduledAt,
      metadata: {
        contentType: "long-form-clip",
        segmentStartSec: startSec,
        segmentEndSec: endSec,
        targetDurationSec: targetSec,
        actualDurationSec: actualDurSec,
        gameName,
        sourceYoutubeId: youtubeId,
        noCommentary: true,
        contentQualityScore: parsed.contentQualityScore || 5,
        reasonThisWorks: parsed.reasonThisWorks || "",
        grinderGenerated: true,
        lengthExperiment: true,
        tags: ["no commentary", "PS5", gameName, "gaming", "gameplay", `${targetMin} minutes`],
      } as any,
    });

    // Record the bucket as tried so it won't be re-queued for 7 days
    await storage.updateVideo(video.id, {
      metadata: {
        ...meta,
        longFormClipExtractedAt: new Date().toISOString(),
        longFormBucketsTriedAt: { ...triedBuckets, [String(targetSec)]: now },
      },
    });

    logger.info(`[ContentGrinder] Long-form clip queued: video ${video.id} → ${targetMin}min bucket [${startSec}s–${endSec}s] for "${sanitizeForPrompt(gameName, 50)}"`, { userId: userId.substring(0, 8), scheduledAt });
    return 1;
  } catch (err: any) {
    logger.warn(`[${userId.substring(0, 8)}] Long-form clip extraction failed for video ${video.id}: ${err.message?.substring(0, 200)}`);
    return 0;
  }
}

async function viralSEORefresh(userId: string, video: any): Promise<boolean> {
  const meta = (video.metadata as any) || {};
  const lastOptimized = meta.viralSeoAt ? new Date(meta.viralSeoAt).getTime() : 0;
  if (Date.now() - lastOptimized < 7 * 86400_000) return false;

  const gameName = meta.gameName || meta.game || await getFocusGame();
  const viewCount = meta.viewCount || meta.views || 0;

  if (!tokenBudget.checkBudget("content-grinder", 2000)) {
    logger.debug(`[ContentGrinder] viralSEORefresh: daily budget exhausted, skipping video ${video.id}`);
    return false;
  }
  tokenBudget.consumeBudget("content-grinder", 2000);

  try {
    const resp = await callClaudeBackground({
      model: CLAUDE_MODELS.sonnet,
      prompt: `You are the #1 YouTube SEO expert. Your titles get 3-5x more clicks than average. Optimize this video for MAXIMUM virality and watch time.

CURRENT TITLE: "${sanitizeForPrompt(video.title, 200)}"
CURRENT DESCRIPTION: "${sanitizeForPrompt(video.description || "", 500)}"
GAME: ${sanitizeForPrompt(gameName, 100)}
VIEWS SO FAR: ${viewCount.toLocaleString()}
STYLE: No commentary PS5 gameplay

⚠️ GAME ACCURACY RULE (NON-NEGOTIABLE): This video is EXCLUSIVELY about "${sanitizeForPrompt(gameName, 100)}".
Your title and description MUST reference "${sanitizeForPrompt(gameName, 100)}" specifically.
Do NOT substitute, replace, or mention any other video game — even if the current title contains a different game name (the current title may be wrong).

YOUR OPTIMIZATION GOALS:
1. TITLE: Create intense curiosity gap. Use power words (INSANE, IMPOSSIBLE, TERRIFYING, BEAUTIFUL). Keep under 70 chars.
   - BAD: "God of War Ragnarök Gameplay"
   - GOOD: "This Boss Fight Made Me Physically FLINCH | God of War Ragnarök"
2. DESCRIPTION: First 2 lines are CRITICAL (shown in search). Use a hook question or bold claim.
   - Include timestamps that tease what's coming ("12:34 — The moment everything changes")
   - Natural keyword density for search
   - Call-to-action for watch time: "Watch till the end for..." 
3. TAGS: 20 tags mixing broad + specific + trending for ${sanitizeForPrompt(gameName, 100)}
4. CHAPTERS: Timestamps worded as cliffhangers to keep people watching
   - BAD: "Boss Fight" → GOOD: "The Boss That Broke Me"
   - BAD: "Exploring Area" → GOOD: "I Should NOT Have Gone Here"

Return raw JSON only (no markdown code blocks):
{
  "title": "string",
  "description": "string",
  "tags": ["string"],
  "chapters": [{"time": "MM:SS", "label": "string"}],
  "seoScore": 1-100,
  "viralPotential": "string — why this will perform"
}`,
      maxTokens: 2000,
      temperature: 0.7,
    });

    const parsed = extractJsonFromResponse(resp.content || "{}");

    if (parsed.title && parsed.description) {
      await storage.updateVideo(video.id, {
        title: String(parsed.title).substring(0, 100),
        description: String(parsed.description).substring(0, 5000),
        metadata: {
          ...meta,
          tags: Array.isArray(parsed.tags) ? parsed.tags : meta.tags,
          chapters: Array.isArray(parsed.chapters) ? parsed.chapters : [],
          viralSeoAt: new Date().toISOString(),
          viralSeoScore: parsed.seoScore || 0,
          viralPotential: parsed.viralPotential || "",
          aiOptimized: true,
          aiOptimizedAt: new Date().toISOString(),
        },
      });

      const ytChannel = (await db.select().from(channels)
        .where(and(eq(channels.userId, userId), eq(channels.platform, "youtube")))
        .limit(1))[0];

      if (ytChannel && meta.youtubeId) {
        try {
          const { updateYouTubeVideo } = await import("../youtube");
          await updateYouTubeVideo(ytChannel.id, meta.youtubeId, {
            title: String(parsed.title).substring(0, 100),
            description: String(parsed.description).substring(0, 5000),
            tags: Array.isArray(parsed.tags) ? parsed.tags.slice(0, 30) : undefined,
          });
          logger.info(`[${userId.substring(0, 8)}] Viral SEO pushed to YouTube for video ${video.id}`);
        } catch (err: any) {
          logger.warn(`[${userId.substring(0, 8)}] YouTube SEO update failed: ${err.message?.substring(0, 150)}`);
        }
      }

      return true;
    }
  } catch (err: any) {
    logger.warn(`[${userId.substring(0, 8)}] Viral SEO refresh failed: ${err.message?.substring(0, 200)}`);
  }
  return false;
}

async function viralThumbnailRedesign(userId: string, video: any): Promise<boolean> {
  const meta = (video.metadata as any) || {};
  const lastRedesigned = meta.viralThumbnailAt ? new Date(meta.viralThumbnailAt).getTime() : 0;
  if (Date.now() - lastRedesigned < 14 * 86400_000) return false;

  const viewCount = meta.viewCount || 0;
  const ctr = meta.ctr || 0;
  if (viewCount > 1000 && ctr > 6) return false;

  // If the thumbnail-intelligence token budget was already exhausted this cycle,
  // skip research for all remaining videos rather than hammering the check on each one.
  const exhaustedAt = thumbnailBudgetExhaustedAt.get(userId) ?? 0;
  if (Date.now() - exhaustedAt < 23 * 3600_000) return false;

  try {
    let researchNote = "";
    try {
      // Only attempt research when we have a real game name — avoid sending the generic
      // "PS5 Gameplay" placeholder string to the AI for every untagged video.
      const gameName = meta.gameName || meta.game || null;
      if (gameName) {
        const { researchThumbnailsForGame } = await import("./thumbnail-intelligence");
        const intel = await researchThumbnailsForGame(userId, gameName);
        if (intel) {
          researchNote = `Web-researched: ${intel.references.length} reference thumbnails studied`;
        } else {
          // null return means budget exhausted — mark and stop for this cycle
          thumbnailBudgetExhaustedAt.set(userId, Date.now());
          return false;
        }
      }
    } catch {}

    const { generateThumbnailForNewVideo } = await import("../auto-thumbnail-engine");
    await generateThumbnailForNewVideo(userId, video.id);

    await storage.updateVideo(video.id, {
      metadata: {
        ...meta,
        viralThumbnailAt: new Date().toISOString(),
        thumbnailRedesigned: true,
        thumbnailRedesignReason: viewCount > 0 && ctr < 5
          ? `Low CTR (${ctr}%) — redesigning for higher click-through`
          : "Proactive thumbnail optimization for virality",
        thumbnailResearchUsed: !!researchNote,
        thumbnailResearchNote: researchNote || undefined,
      },
    });

    return true;
  } catch (err: any) {
    logger.warn(`[${userId.substring(0, 8)}] Thumbnail redesign failed: ${err.message?.substring(0, 150)}`);
    return false;
  }
}

async function enhanceRetentionPacing(userId: string, video: any): Promise<boolean> {
  const meta = (video.metadata as any) || {};
  if (meta.pacingEnhanced && Date.now() - new Date(meta.pacingEnhancedAt || 0).getTime() < 14 * 86400_000) return false;

  const durSec = meta.durationSec || parseDurationToSeconds(meta.duration) || 0;
  if (durSec < 300) return false;

  const gameName = meta.gameName || meta.game || await getFocusGame();

  if (!tokenBudget.checkBudget("content-grinder", 2000)) {
    logger.debug(`[ContentGrinder] enhanceRetentionPacing: daily budget exhausted, skipping video ${video.id}`);
    return false;
  }
  tokenBudget.consumeBudget("content-grinder", 2000);

  try {
    const resp = await callClaudeBackground({
      model: CLAUDE_MODELS.sonnet,
      prompt: `You are a YouTube retention expert. For a ${Math.floor(durSec / 60)}-minute NO COMMENTARY ${gameName} gameplay video, design the optimal pacing strategy to maximize watch time.

VIDEO: "${video.title}"
Current description: "${(video.description || "").substring(0, 300)}"

For no-commentary gaming, viewers drop off when:
- Nothing visually exciting happens for >60 seconds
- They can't tell what's coming next  
- The video feels repetitive
- There's no sense of progression

Design retention tactics:
1. CHAPTER TITLES that create "I need to see this" urge at every break point
2. DESCRIPTION HOOKS — first 2 lines visible in search must create unbearable curiosity
3. PINNED COMMENT strategy — what to say to boost engagement
4. END SCREEN STRATEGY — how to chain viewers to the next video
5. CARD PLACEMENT — when to show clickable cards (at potential drop-off points)

Return JSON:
{
  "chapters": [{"time": "MM:SS", "label": "string — cliffhanger chapter name"}],
  "descriptionHook": "string — first 2 lines of description",
  "pinnedComment": "string — engagement-driving comment to pin",
  "endScreenStrategy": "string — what to show and when",
  "cardPlacements": [{"time": "MM:SS", "reason": "string — why here prevents drop-off"}],
  "retentionScore": 1-100,
  "predictedAvgViewDuration": "string — percentage of video"
}`,
      maxTokens: 2000,
      temperature: 0.7,
    });

    const parsed = extractJsonFromResponse(resp.content || "{}");

    const chapters = Array.isArray(parsed.chapters) ? parsed.chapters : [];
    const currentDesc = video.description || "";
    const hookLine = parsed.descriptionHook || "";
    const newDesc = hookLine
      ? `${hookLine}\n\n${currentDesc}`.substring(0, 5000)
      : currentDesc;

    await storage.updateVideo(video.id, {
      description: newDesc,
      metadata: {
        ...meta,
        pacingEnhanced: true,
        pacingEnhancedAt: new Date().toISOString(),
        retentionChapters: chapters,
        pinnedComment: parsed.pinnedComment || "",
        endScreenStrategy: parsed.endScreenStrategy || "",
        cardPlacements: parsed.cardPlacements || [],
        retentionScore: parsed.retentionScore || 0,
        predictedAvgViewDuration: parsed.predictedAvgViewDuration || "",
      },
    });

    const ytChannel = (await db.select().from(channels)
      .where(and(eq(channels.userId, userId), eq(channels.platform, "youtube")))
      .limit(1))[0];

    if (ytChannel && meta.youtubeId && hookLine) {
      try {
        const { updateYouTubeVideo } = await import("../youtube");
        await updateYouTubeVideo(ytChannel.id, meta.youtubeId, {
          description: newDesc,
        });
      } catch {}
    }

    return true;
  } catch (err: any) {
    logger.warn(`[${userId.substring(0, 8)}] Retention pacing failed: ${err.message?.substring(0, 200)}`);
    return false;
  }
}

async function scanForUnderperformers(userId: string): Promise<void> {
  const allVideos = await storage.getVideosByUser(userId);
  const _scanFocusGame = await getFocusGame().catch(() => "Battlefield 6");
  const _scanFocusRe = buildFocusGameRegex(_scanFocusGame);
  const publishedVideos = allVideos.filter((v: any) => {
    const meta = (v.metadata as any) || {};
    const gn: string = meta.gameName || "";
    if (gn && !_scanFocusRe.test(gn)) return false;
    return meta.youtubeId && (meta.viewCount || 0) > 0;
  });

  if (publishedVideos.length < 5) return;

  const avgViews = publishedVideos.reduce((sum, v) => sum + ((v.metadata as any)?.viewCount || 0), 0) / publishedVideos.length;

  const underperformers = publishedVideos.filter((v: any) => {
    const meta = (v.metadata as any) || {};
    const views = meta.viewCount || 0;
    return views < avgViews * 0.3 && views > 0;
  });

  for (const video of underperformers.slice(0, 3)) {
    const meta = (video.metadata as any) || {};
    const lastRescue = meta.rescueAttemptAt ? new Date(meta.rescueAttemptAt).getTime() : 0;
    if (Date.now() - lastRescue < 7 * 86400_000) continue;

    logger.info(`[${userId.substring(0, 8)}] Underperformer detected: "${video.title}" (${(meta.viewCount || 0)} views vs ${Math.round(avgViews)} avg) — triggering rescue`);

    await viralSEORefresh(userId, video);
    await viralThumbnailRedesign(userId, video);
    await enhanceRetentionPacing(userId, video);

    await storage.updateVideo(video.id, {
      metadata: {
        ...meta,
        rescueAttemptAt: new Date().toISOString(),
        rescueReason: `Views (${meta.viewCount}) well below average (${Math.round(avgViews)})`,
      },
    });
  }
}

function parseDurationToSeconds(d: string | null | undefined): number {
  if (!d) return 0;
  const match = d.match(/PT(?:(\d+)H)?(?:(\d+)M)?(?:(\d+)S)?/);
  if (!match) return 0;
  return (parseInt(match[1] || "0") * 3600) + (parseInt(match[2] || "0") * 60) + parseInt(match[3] || "0");
}

export async function getGrinderStatus(userId: string): Promise<{
  totalVideos: number;
  fullyExhausted: number;
  hasContentRemaining: number;
  totalClipsGenerated: number;
  seoOptimized: number;
  thumbnailsRedesigned: number;
  pacingEnhanced: number;
  underperformersRescued: number;
}> {
  const allVideos = await storage.getVideosByUser(userId);
  const longForm = allVideos.filter((v: any) => {
    const meta = (v.metadata as any) || {};
    const durSec = meta.durationSec || parseDurationToSeconds(meta.duration);
    return durSec >= 300 && v.type !== "short" && v.type !== "clip" && !meta.isShort;
  });

  let fullyExhausted = 0;
  let seoOptimized = 0;
  let thumbnailsRedesigned = 0;
  let pacingEnhanced = 0;
  let underperformersRescued = 0;

  for (const v of longForm) {
    const meta = (v.metadata as any) || {};
    const level = await checkVideoExhaustion(userId, v);
    if (level >= 95) fullyExhausted++;
    if (meta.viralSeoAt) seoOptimized++;
    if (meta.viralThumbnailAt) thumbnailsRedesigned++;
    if (meta.pacingEnhanced) pacingEnhanced++;
    if (meta.rescueAttemptAt) underperformersRescued++;
  }

  const totalClipsResult = await db.select({ total: count() }).from(autopilotQueue)
    .where(eq(autopilotQueue.userId, userId));

  return {
    totalVideos: longForm.length,
    fullyExhausted,
    hasContentRemaining: longForm.length - fullyExhausted,
    totalClipsGenerated: totalClipsResult[0]?.total || 0,
    seoOptimized,
    thumbnailsRedesigned,
    pacingEnhanced,
    underperformersRescued,
  };
}

export function startContentGrinder(): void {
  if (grindTimer) return; // already running

  // Recursive adaptive scheduler: after each cycle the grinder measures queue
  // depth and picks the shortest safe interval to stay in tandem with the
  // back-catalog runner.  If a cycle produces meaningful new content, it
  // schedules an immediate follow-up (5 min) to keep filling gaps fast.
  function scheduleNextGrind(overrideMs?: number): void {
    getGrindQueueDepth().then(depth => {
      const intervalMs = overrideMs ?? grindAdaptiveIntervalMs(depth);
      lastGrindIntervalMs = intervalMs;
      grinderNextRunAt    = new Date(Date.now() + intervalMs);
      logger.info(
        `[ContentGrinder] Adaptive schedule: queue=${depth} items → next run in ${Math.round(intervalMs / 60_000)} min`
      );
      grindTimer = setTimeout(async () => {
        if (grinderRunning) {
          logger.warn("[ContentGrinder] Previous cycle still running — rescheduling");
          scheduleNextGrind();
          return;
        }
        grinderRunning = true;
        try {
          const result = await runGrindCycle();
          lastGrindTotals = { clipsQueued: result.clipsQueued, longFormQueued: result.longFormQueued };
          // Always use the adaptive interval based on queue depth.
          // The former 5-min immediate follow-up (when >5 clips were produced)
          // caused the grinder to re-fire at T+9min, converging with the catalog
          // sync at T+10min and the back-catalog runner at T+10-20min — this
          // convergence was the root cause of the repeated OOM crashes.
          scheduleNextGrind();
        } finally {
          grinderRunning = false;
        }
      }, intervalMs);
    }).catch(err => {
      logger.warn(`[ContentGrinder] Queue depth check failed — defaulting to moderate: ${err?.message}`);
      lastGrindIntervalMs = GRIND_INTERVAL_MODERATE_MS;
      grinderNextRunAt    = new Date(Date.now() + GRIND_INTERVAL_MODERATE_MS);
      grindTimer = setTimeout(async () => {
        if (!grinderRunning) {
          grinderRunning = true;
          try { await runGrindCycle(); } finally { grinderRunning = false; }
        }
        scheduleNextGrind();
      }, GRIND_INTERVAL_MODERATE_MS);
    });
  }

  // Initial run after 10 min — pushed from 4 min to avoid the T+29-35min
  // convergence window where back-catalog runner (T+25-30min), Wave 11
  // (T+40min), and VOD optimizer (T+47min) all compete for memory/AI slots.
  // Wave 10 fires at T+25min, so this first grind runs at T+35min.
  grindTimer = setTimeout(() => {
    grinderRunning = true;
    runGrindCycle()
      .then(result => { lastGrindTotals = { clipsQueued: result.clipsQueued, longFormQueued: result.longFormQueued }; })
      .catch(err => logger.warn("Initial grind cycle failed", { error: String(err).substring(0, 200) }))
      .finally(() => {
        grinderRunning = false;
        scheduleNextGrind();
      });
  }, 600_000);

  logger.info("Relentless Content Grinder started — adaptive perpetual mode (10 min–60 min based on queue depth)");
}

export function stopContentGrinder(): void {
  if (grindTimer) {
    clearTimeout(grindTimer);
    grindTimer = null;
  }
}

/** Expose the grinder's adaptive schedule state to routes/dashboard. */
export function getGrinderSchedulerStatus() {
  return {
    running:        grinderRunning,
    nextRunEta:     grinderNextRunAt?.toISOString() ?? null,
    lastIntervalMs: lastGrindIntervalMs,
    lastTotals:     lastGrindTotals,
  };
}
