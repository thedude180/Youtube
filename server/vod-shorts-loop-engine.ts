import { db } from "./db";
import { vodShortsLoopRuns, videos, channels, contentClips, autopilotQueue } from "@shared/schema";
import { eq, and, desc, lt, asc, sql, inArray } from "drizzle-orm";
import { createLogger } from "./lib/logger";
import { sanitizeForPrompt } from "./lib/ai-attack-shield";
import { sendSSEEvent } from "./routes/events";
import { getOpenAIClient } from "./lib/openai";
import { recordHeartbeat } from "./services/engine-heartbeat";

const logger = createLogger("vod-shorts-loop");
const openai = getOpenAIClient();

async function getUserChannelIds(userId: string): Promise<number[]> {
  const userChannels = await db.select({ id: channels.id }).from(channels)
    .where(eq(channels.userId, userId));
  return userChannels.map(c => c.id);
}

async function getUserVideos(userId: string, orderCol: any = desc(videos.createdAt), limit?: number) {
  const channelIds = await getUserChannelIds(userId);
  if (channelIds.length === 0) return [];
  let q = db.select().from(videos)
    .where(inArray(videos.channelId, channelIds))
    .orderBy(orderCol);
  if (limit) q = q.limit(limit) as any;
  return q;
}

const VOD_SHORTS_PHASES = [
  "content-scan",
  "decay-detection",
  "title-optimization",
  "description-seo",
  "thumbnail-refresh",
  "shorts-extraction",
  "cross-platform-distribution",
  "performance-verification",
  "learning-adaptation",
] as const;

type VodPhase = typeof VOD_SHORTS_PHASES[number];

interface PhaseState {
  name: string;
  status: "pending" | "running" | "completed" | "failed" | "skipped";
  startedAt?: string;
  completedAt?: string;
  durationMs?: number;
  result?: any;
  error?: string;
}

function createFreshPhases(): PhaseState[] {
  return VOD_SHORTS_PHASES.map(name => ({ name, status: "pending" as const }));
}

const activeLoops = new Map<string, { runId: number; phase: VodPhase; abortController: AbortController }>();

try {
  const { registerMap } = require("./services/resilience-core");
  registerMap("vod-shorts-activeLoops", activeLoops, 20);
} catch {}

async function updatePhase(runId: number, phaseName: string, update: Partial<PhaseState>, userId: string) {
  const [run] = await db.select().from(vodShortsLoopRuns).where(eq(vodShortsLoopRuns.id, runId));
  if (!run) return;

  const phases = (run.phases as PhaseState[]) || [];
  const idx = phases.findIndex(p => p.name === phaseName);
  if (idx >= 0) {
    phases[idx] = { ...phases[idx], ...update };
  }

  await db.update(vodShortsLoopRuns).set({
    phases,
    phase: phaseName,
  }).where(eq(vodShortsLoopRuns.id, runId));

  sendSSEEvent(userId, "vod-shorts-loop", { runId, phase: phaseName, ...update });
}

async function runContentScan(userId: string): Promise<any> {
  const allVideos = await getUserVideos(userId, desc(videos.createdAt));

  const totalViews = allVideos.reduce((sum, v) => sum + ((v.metadata as any)?.viewCount || 0), 0);
  const avgViews = totalViews / Math.max(allVideos.length, 1);
  const avgCtr = allVideos.reduce((sum, v) => {
    const meta = (v.metadata as any) || {};
    return sum + (meta.ctr || 0);
  }, 0) / Math.max(allVideos.length, 1);

  const categories: Record<string, number> = {};
  for (const v of allVideos) {
    const meta = (v.metadata as any) || {};
    const cat = meta.category || meta.game || "uncategorized";
    categories[cat] = (categories[cat] || 0) + 1;
  }

  return {
    totalVideos: allVideos.length,
    totalViews,
    avgViews: Math.round(avgViews),
    avgCtr: parseFloat(avgCtr.toFixed(2)),
    topCategories: Object.entries(categories).sort((a, b) => b[1] - a[1]).slice(0, 5),
    oldestVideo: allVideos[allVideos.length - 1]?.createdAt || null,
    newestVideo: allVideos[0]?.createdAt || null,
  };
}

async function runDecayDetection(userId: string): Promise<any> {
  const allVideos = await getUserVideos(userId, desc(videos.createdAt));

  if (allVideos.length === 0) return { decaying: 0, reason: "no_videos" };

  const avgViews = allVideos.reduce((sum, v) => sum + ((v.metadata as any)?.viewCount || 0), 0) / allVideos.length;
  const decayingVideos = allVideos.filter(v => {
    const views = (v.metadata as any)?.viewCount || 0;
    const meta = (v.metadata as any) || {};
    const isOld = v.createdAt && (Date.now() - new Date(v.createdAt).getTime()) > 30 * 86400000;
    const isUnderperforming = views < avgViews * 0.5;
    const notRecentlyOptimized = !meta.lastOptimizedAt ||
      (Date.now() - new Date(meta.lastOptimizedAt).getTime()) > 14 * 86400000;
    return isOld && isUnderperforming && notRecentlyOptimized;
  });

  return {
    decaying: decayingVideos.length,
    totalScanned: allVideos.length,
    avgViews: Math.round(avgViews),
    decayingIds: decayingVideos.slice(0, 10).map(v => ({ id: v.id, title: v.title, views: (v.metadata as any)?.viewCount || 0 })),
  };
}

async function runTitleOptimization(userId: string): Promise<any> {
  const allVideos = await getUserVideos(userId, desc(videos.createdAt), 10);

  if (allVideos.length === 0) return { optimized: 0, reason: "no_videos" };

  const avgViews = allVideos.reduce((sum, v) => sum + ((v.metadata as any)?.viewCount || 0), 0) / allVideos.length;
  const underperformers = allVideos.filter(v => ((v.metadata as any)?.viewCount || 0) < avgViews * 0.7);

  let optimized = 0;
  for (const video of underperformers.slice(0, 5)) {
    try {
      const response = await openai.chat.completions.create({
        model: "gpt-4o-mini",
        messages: [{
          role: "system",
          content: `You are the world's #1 YouTube title optimization AI. Generate 3 A/B test title variants that maximize CTR. Use power words, numbers, curiosity gaps, and emotional triggers. Return JSON: {variants: [{title, strategy, expectedCtrLift}], analysis: string}.`
        }, {
          role: "user",
          content: `Current title: "${sanitizeForPrompt(video.title)}" (${(video.metadata as any)?.viewCount || 0} views). Category: ${(video.metadata as any)?.category || "general"}. Optimize for maximum CTR.`
        }],
        max_completion_tokens: 4000,
        response_format: { type: "json_object" },
      });

      const result = JSON.parse(response.choices[0]?.message?.content || "{}");

      const meta = (video.metadata as any) || {};
      await db.update(videos).set({
        metadata: {
          ...meta,
          titleVariants: result.variants,
          titleOptimizedAt: new Date().toISOString(),
          lastOptimizedAt: new Date().toISOString(),
        },
      }).where(eq(videos.id, video.id));

      optimized++;
    } catch (err) {
      logger.warn("Title optimization error", { videoId: video.id, error: String(err) });
    }
  }

  return { optimized, totalUnderperformers: underperformers.length };
}

async function runDescriptionSeo(userId: string): Promise<any> {
  const recentVideos = await getUserVideos(userId, desc(videos.createdAt), 5);

  let optimized = 0;
  for (const video of recentVideos) {
    const meta = (video.metadata as any) || {};
    if (meta.descriptionSeoOptimized) continue;

    try {
      const response = await openai.chat.completions.create({
        model: "gpt-4o-mini",
        messages: [{
          role: "system",
          content: `You are a YouTube SEO master. Optimize this video description for maximum search ranking. Include: keyword-rich first 2 lines, timestamps if applicable, relevant hashtags, call-to-action, and social links placeholder.

CRITICAL YOUTUBE POLICY REQUIREMENTS (April 2026):
1. AI DISCLOSURE: You MUST include at the end of the description: "AI Disclosure: AI tools were used to assist in editing, optimization, and/or description generation for this content."
2. NO-COMMENTARY ELIGIBILITY: For no-commentary gameplay, include transformative elements: chapter timestamps, gameplay tips/analysis, curated highlight notes, or game context/lore.
3. Keep upload scheduling advice conservative (max 3 videos + 6 shorts per day).

Return JSON: {optimizedDescription, keywords: string[], hashtags: string[], seoScore: number}.`
        }, {
          role: "user",
          content: `Title: "${sanitizeForPrompt(video.title)}". Description: "${sanitizeForPrompt((video.description || "").slice(0, 500))}". Optimize for YouTube search.`
        }],
        max_completion_tokens: 6000,
        response_format: { type: "json_object" },
      });

      const seo = JSON.parse(response.choices[0]?.message?.content || "{}");

      const AI_DISCLOSURE_FOOTER = "\n\n---\nAI Disclosure: AI tools were used to assist in editing, optimization, and/or description generation for this content.";
      if (seo.optimizedDescription && !seo.optimizedDescription.toLowerCase().includes("ai disclosure")) {
        seo.optimizedDescription = seo.optimizedDescription.trimEnd() + AI_DISCLOSURE_FOOTER;
      }

      await db.update(videos).set({
        metadata: { ...meta, descriptionSeoOptimized: true, seoData: seo, seoOptimizedAt: new Date().toISOString() },
      }).where(eq(videos.id, video.id));

      optimized++;
    } catch (err) {
      logger.warn("Description SEO error", { videoId: video.id, error: String(err) });
    }
  }

  return { optimized, totalChecked: recentVideos.length };
}

async function runThumbnailRefresh(userId: string): Promise<any> {
  const allVideos = await getUserVideos(userId, desc(videos.createdAt), 5);

  let refreshed = 0;
  for (const video of allVideos) {
    const meta = (video.metadata as any) || {};
    if (meta.thumbnailRefreshed) continue;

    try {
      const response = await openai.chat.completions.create({
        model: "gpt-4o-mini",
        messages: [{
          role: "system",
          content: `You are a world-class thumbnail design AI. Analyze this video and suggest 3 thumbnail concepts that maximize CTR. Consider: bold text overlays, expressive faces, bright colors, contrast, curiosity elements. Return JSON: {concepts: [{description, textOverlay, colorScheme, emotionalTrigger, expectedCtrLift}]}.`
        }, {
          role: "user",
          content: `Video: "${sanitizeForPrompt(video.title)}" (${(video.metadata as any)?.viewCount || 0} views). Current thumbnail: ${video.thumbnailUrl || "none"}. Design concepts for maximum CTR.`
        }],
        max_completion_tokens: 4000,
        response_format: { type: "json_object" },
      });

      const concepts = JSON.parse(response.choices[0]?.message?.content || "{}");

      await db.update(videos).set({
        metadata: { ...meta, thumbnailRefreshed: true, thumbnailConcepts: concepts, thumbnailRefreshedAt: new Date().toISOString() },
      }).where(eq(videos.id, video.id));

      refreshed++;
    } catch (err) {
      logger.warn("Thumbnail refresh error", { videoId: video.id, error: String(err) });
    }
  }

  return { refreshed, totalChecked: allVideos.length };
}

async function runShortsExtraction(userId: string): Promise<any> {
  const allVideos = await getUserVideos(userId, desc(videos.createdAt), 10);

  const existingClips = await db.select().from(contentClips)
    .where(and(eq(contentClips.userId, userId), eq(contentClips.targetPlatform, "youtube-shorts")));

  const processedVideoIds = new Set(existingClips.map(c => c.sourceVideoId).filter(Boolean));
  const unprocessed = allVideos.filter(v => !processedVideoIds.has(v.id));

  let shortsCreated = 0;
  for (const video of unprocessed.slice(0, 3)) {
    try {
      const response = await openai.chat.completions.create({
        model: "gpt-4o-mini",
        messages: [{
          role: "system",
          content: `You are a viral Shorts/TikTok AI expert. Identify the top 3 most viral-worthy moments from this video for YouTube Shorts. Each should be 15-60 seconds, start with a strong hook, and end with a cliffhanger or punchline. Return JSON: {shorts: [{title, hookLine, startTimeSec, endTimeSec, viralScore, platform: "youtube-shorts"|"tiktok"|"reels"}]}.`
        }, {
          role: "user",
          content: `Video: "${sanitizeForPrompt(video.title)}" (${(video.metadata as any)?.duration || 600}s, ${(video.metadata as any)?.viewCount || 0} views). Description: ${sanitizeForPrompt((video.description || "").slice(0, 200))}. Extract the most viral Short clips.`
        }],
        max_completion_tokens: 4000,
        response_format: { type: "json_object" },
      });

      const extraction = JSON.parse(response.choices[0]?.message?.content || "{}");
      const shorts = extraction.shorts || [];

      for (const short of shorts) {
        const startT = Math.max(0, short.startTimeSec || 0);
        const endT = Math.max(startT + 3, short.endTimeSec || 60);
        await db.insert(contentClips).values({
          userId,
          sourceVideoId: video.id,
          title: short.title || `Short from ${sanitizeForPrompt(video.title)}`,
          targetPlatform: "youtube-shorts",
          status: "ai_ready",
          startTime: startT,
          endTime: endT,
          metadata: { hookLine: short.hookLine, viralScore: short.viralScore, platform: short.platform, autoExtracted: true } as any,
        });
        shortsCreated++;
      }
    } catch (err) {
      logger.warn("Shorts extraction error", { videoId: video.id, error: String(err) });
    }
  }

  return { shortsCreated, videosProcessed: Math.min(unprocessed.length, 3), remainingVideos: Math.max(0, unprocessed.length - 3) };
}

async function runCrossPlatformDistribution(userId: string): Promise<any> {
  const pendingClips = await db.select().from(contentClips)
    .where(and(eq(contentClips.userId, userId), inArray(contentClips.status, ["pending", "ai_ready"]), eq(contentClips.targetPlatform, "youtube-shorts")))
    .limit(5);

  const connectedPlatforms = await db.select({ platform: channels.platform })
    .from(channels).where(eq(channels.userId, userId));
  const platforms = [...new Set(connectedPlatforms.map(c => c.platform))];

  let distributed = 0;
  for (const clip of pendingClips) {
    const targetPlatforms = platforms.filter(p => ["tiktok", "discord"].includes(p));

    for (const platform of targetPlatforms) {
      await db.insert(autopilotQueue).values({
        userId,
        sourceVideoId: clip.sourceVideoId,
        type: "cross-promo",
        targetPlatform: platform,
        content: `${sanitizeForPrompt(clip.title)} | Watch full video on YouTube!`,
        caption: clip.title || "New Short",
        status: "scheduled",
        scheduledAt: new Date(Date.now() + Math.random() * 7200000),
      });
      distributed++;
    }

    await db.update(contentClips).set({ status: "approved" }).where(eq(contentClips.id, clip.id));
  }

  return { distributed, platforms: platforms.length, clipsQueued: pendingClips.length };
}

async function runVodPerformanceVerification(userId: string): Promise<any> {
  const recentlyOptimized = await getUserVideos(userId, desc(videos.createdAt), 20);

  const optimizedVideos = recentlyOptimized.filter(v => {
    const meta = (v.metadata as any) || {};
    return meta.lastOptimizedAt || meta.titleOptimizedAt || meta.seoOptimizedAt;
  });

  let improved = 0;
  let declined = 0;
  for (const video of optimizedVideos) {
    const meta = (video.metadata as any) || {};
    const preOptViews = meta.preOptimizationViews || 0;
    const currentViews = (video.metadata as any)?.viewCount || 0;
    if (currentViews > preOptViews) improved++;
    else declined++;
  }

  return {
    verified: true,
    totalOptimized: optimizedVideos.length,
    improved,
    declined,
    successRate: optimizedVideos.length > 0 ? Math.round((improved / optimizedVideos.length) * 100) : 0,
  };
}

async function runVodLearningAdaptation(userId: string): Promise<any> {
  const recentRuns = await db.select().from(vodShortsLoopRuns)
    .where(and(eq(vodShortsLoopRuns.userId, userId), eq(vodShortsLoopRuns.status, "completed")))
    .orderBy(desc(vodShortsLoopRuns.createdAt))
    .limit(5);

  try {
    const allMetrics = recentRuns.map(r => r.metrics as any).filter(Boolean);
    const totalOptimized = allMetrics.reduce((sum: number, m: any) => sum + (m.titlesOptimized || 0), 0);
    const totalShorts = allMetrics.reduce((sum: number, m: any) => sum + (m.shortsViews || 0), 0);

    const response = await openai.chat.completions.create({
      model: "gpt-4o-mini",
      messages: [{
        role: "system",
        content: `You are an AI learning engine for VOD optimization. Analyze performance data and generate actionable adaptations. Return JSON: {patterns: string[], adaptations: string[], nextPriorities: string[], confidenceScore: number}.`
      }, {
        role: "user",
        content: `${recentRuns.length} optimization cycles completed. ${totalOptimized} videos optimized, ${totalShorts} shorts views. Generate learning adaptations.`
      }],
      max_completion_tokens: 4000,
      response_format: { type: "json_object" },
    });

    const learning = JSON.parse(response.choices[0]?.message?.content || "{}");
    return { adapted: true, ...learning, cyclesAnalyzed: recentRuns.length };
  } catch {
    return { adapted: false, patterns: [], adaptations: ["Collect more data"], cyclesAnalyzed: recentRuns.length };
  }
}

export async function executeVodShortsLoop(userId: string): Promise<{ runId: number }> {
  const existing = activeLoops.get(userId);
  if (existing) {
    return { runId: existing.runId };
  }

  const phases = createFreshPhases();
  const [run] = await db.insert(vodShortsLoopRuns).values({
    userId,
    phase: "content-scan",
    status: "running",
    phases,
    startedAt: new Date(),
  }).returning();

  const abortController = new AbortController();
  activeLoops.set(userId, { runId: run.id, phase: "content-scan", abortController });

  executeVodShortsLoopAsync(userId, run.id, abortController.signal).catch(err => {
    logger.error("VOD/Shorts loop fatal error", { userId, runId: run.id, error: String(err) });
  });

  return { runId: run.id };
}

async function executeVodShortsLoopAsync(userId: string, runId: number, signal: AbortSignal) {
  const phaseHandlers: Record<VodPhase, (userId: string) => Promise<any>> = {
    "content-scan": runContentScan,
    "decay-detection": runDecayDetection,
    "title-optimization": runTitleOptimization,
    "description-seo": runDescriptionSeo,
    "thumbnail-refresh": runThumbnailRefresh,
    "shorts-extraction": runShortsExtraction,
    "cross-platform-distribution": runCrossPlatformDistribution,
    "performance-verification": runVodPerformanceVerification,
    "learning-adaptation": runVodLearningAdaptation,
  };

  const loopStart = Date.now();
  let totalOptimized = 0;
  let totalShorts = 0;
  let totalDistributed = 0;
  let videosAnalyzed = 0;

  for (const phaseName of VOD_SHORTS_PHASES) {
    if (signal.aborted) break;

    const phaseStart = Date.now();
    await updatePhase(runId, phaseName, { status: "running", startedAt: new Date().toISOString() }, userId);

    const loop = activeLoops.get(userId);
    if (loop) loop.phase = phaseName;

    try {
      const result = await phaseHandlers[phaseName](userId);

      if (phaseName === "content-scan") videosAnalyzed = result.totalVideos || 0;
      if (phaseName === "title-optimization") totalOptimized += result.optimized || 0;
      if (phaseName === "description-seo") totalOptimized += result.optimized || 0;
      if (phaseName === "shorts-extraction") totalShorts += result.shortsCreated || 0;
      if (phaseName === "cross-platform-distribution") totalDistributed += result.distributed || 0;

      const durationMs = Date.now() - phaseStart;
      await updatePhase(runId, phaseName, {
        status: "completed",
        completedAt: new Date().toISOString(),
        durationMs,
        result,
      }, userId);

      logger.info(`VOD/Shorts phase completed: ${phaseName}`, { userId, runId, durationMs });
    } catch (err: any) {
      const durationMs = Date.now() - phaseStart;
      await updatePhase(runId, phaseName, {
        status: "failed",
        completedAt: new Date().toISOString(),
        durationMs,
        error: err.message,
      }, userId);
      logger.error(`VOD/Shorts phase failed: ${phaseName}`, { userId, runId, error: err.message });
    }
  }

  const totalDurationMs = Date.now() - loopStart;

  await db.update(vodShortsLoopRuns).set({
    status: "completed",
    phase: "learning-adaptation",
    completedAt: new Date(),
    totalDurationMs,
    videosAnalyzed,
    videosOptimized: totalOptimized,
    shortsGenerated: totalShorts,
    metrics: {
      titlesOptimized: totalOptimized,
      shortsViews: totalShorts,
      distributionCount: totalDistributed,
    },
  }).where(eq(vodShortsLoopRuns.id, runId));

  activeLoops.delete(userId);
  sendSSEEvent(userId, "vod-shorts-loop", { runId, status: "completed", totalDurationMs });
  await recordHeartbeat("vodShortsLoop", "completed", totalDurationMs);
  logger.info("VOD/Shorts loop completed", { userId, runId, totalDurationMs, totalOptimized, totalShorts });
}

export async function getVodShortsLoopStatus(userId: string) {
  const active = activeLoops.get(userId);
  const recentRuns = await db.select().from(vodShortsLoopRuns)
    .where(eq(vodShortsLoopRuns.userId, userId))
    .orderBy(desc(vodShortsLoopRuns.createdAt))
    .limit(10);

  const currentRun = active ? recentRuns.find(r => r.id === active.runId) : null;

  return {
    isRunning: !!active,
    currentPhase: active?.phase || null,
    currentRun: currentRun || null,
    recentRuns: recentRuns.map(r => ({
      id: r.id,
      status: r.status,
      phase: r.phase,
      phases: r.phases,
      metrics: r.metrics,
      learnings: r.learnings,
      videosAnalyzed: r.videosAnalyzed,
      videosOptimized: r.videosOptimized,
      shortsGenerated: r.shortsGenerated,
      totalDurationMs: r.totalDurationMs,
      startedAt: r.startedAt,
      completedAt: r.completedAt,
      createdAt: r.createdAt,
    })),
    totalRuns: recentRuns.length,
    phases: VOD_SHORTS_PHASES,
  };
}

export async function cancelVodShortsLoop(userId: string): Promise<boolean> {
  const active = activeLoops.get(userId);
  if (!active) return false;

  active.abortController.abort();
  activeLoops.delete(userId);

  await db.update(vodShortsLoopRuns).set({
    status: "cancelled" as any,
    completedAt: new Date(),
  }).where(eq(vodShortsLoopRuns.id, active.runId));

  sendSSEEvent(userId, "vod-shorts-loop", { runId: active.runId, status: "cancelled" });
  return true;
}

export function initVodShortsLoopEngine() {
}
