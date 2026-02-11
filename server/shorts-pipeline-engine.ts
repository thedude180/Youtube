import OpenAI from "openai";
import { storage } from "./storage";
import { db } from "./db";
import { pipelineRuns, clipViralityScores, contentClips } from "@shared/schema";
import { eq, and, desc } from "drizzle-orm";

const openai = new OpenAI({
  apiKey: process.env.AI_INTEGRATIONS_OPENAI_API_KEY,
  baseURL: process.env.AI_INTEGRATIONS_OPENAI_BASE_URL,
});

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

export async function startShortsPipeline(
  userId: string,
  mode: "full" | "new-only" = "full"
): Promise<{ runId: number; totalVideos: number; status: string }> {
  const existing = sessions.get(userId);
  if (existing && existing.state === "running") {
    return { runId: existing.runId, totalVideos: existing.totalVideos, status: "already_running" };
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
    }

    current.processedVideos++;
    await db.update(pipelineRuns).set({
      processedVideos: current.processedVideos,
      clipsFound: current.clipsFound,
    }).where(eq(pipelineRuns.id, runId));
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

export async function extractClipsFromVideo(
  userId: string,
  videoId: number
): Promise<any[]> {
  const video = await storage.getVideo(videoId);
  if (!video) return [];

  const duration = video.metadata?.duration || "unknown";
  const views = video.metadata?.stats?.views || video.metadata?.viewCount || 0;
  const tags = video.metadata?.tags?.join(", ") || "";

  const prompt = `You are a viral shorts/clips extraction expert. Analyze this video and identify 3-8 clip-worthy moments that would perform well as short-form content on TikTok, YouTube Shorts, and Instagram Reels.

Video Title: "${video.title}"
Description: "${video.description || "Not provided"}"
Duration: ${duration}
Views: ${views}
Tags: ${tags}
Type: ${video.type}
Platform: ${video.platform || "youtube"}

Identify the best clip-worthy moments. For each clip provide:
- A catchy, attention-grabbing title optimized for short-form
- A brief description
- Estimated start time (seconds from beginning)
- Estimated end time (seconds from beginning, clips should be 15-60 seconds)
- Best target platform (tiktok, youtube_shorts, or reels)
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
      "targetPlatform": "tiktok",
      "hook": "attention grabbing hook text",
      "viralScore": 75,
      "tags": ["tag1", "tag2"],
      "thumbnailPrompt": "description for thumbnail generation",
      "format": "vertical",
      "aspectRatio": "9:16"
    }
  ]
}

Focus on:
- High-energy or emotional moments
- Surprising or unexpected content
- Educational "did you know" segments
- Controversial or debate-worthy takes
- Visually striking moments
- Relatable or funny moments
- Key takeaways or tips`;

  try {
    const response = await openai.chat.completions.create({
      model: "gpt-5-mini",
      messages: [{ role: "user", content: prompt }],
      response_format: { type: "json_object" },
      max_completion_tokens: 2048,
    });

    const content = response.choices[0]?.message?.content;
    if (!content) return [];

    const parsed = JSON.parse(content);
    const clips = parsed.clips || [];
    const createdClips: any[] = [];

    for (const clip of clips) {
      const created = await storage.createContentClip({
        userId,
        sourceVideoId: videoId,
        title: clip.title || "Untitled Clip",
        description: clip.description || "",
        startTime: clip.startTime ?? 0,
        endTime: clip.endTime ?? 30,
        targetPlatform: clip.targetPlatform || "tiktok",
        status: "pending",
        optimizationScore: clip.viralScore ?? 50,
        metadata: {
          tags: clip.tags || [],
          thumbnailPrompt: clip.thumbnailPrompt || "",
          format: clip.format || "vertical",
          aspectRatio: clip.aspectRatio || "9:16",
        },
      });

      if (clip.viralScore) {
        await db.insert(clipViralityScores).values({
          userId,
          clipId: created.id,
          predictedScore: clip.viralScore,
          platform: clip.targetPlatform || "tiktok",
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
    console.error(`Failed to extract clips from video ${videoId}:`, err.message);
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

Clip Title: "${clip.title}"
Clip Description: "${clip.description || ""}"
Source Video: "${videoTitle}"
Target Platform: ${clip.targetPlatform || "tiktok"}

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

  try {
    const response = await openai.chat.completions.create({
      model: "gpt-5-mini",
      messages: [{ role: "user", content: prompt }],
      response_format: { type: "json_object" },
      max_completion_tokens: 512,
    });

    const content = response.choices[0]?.message?.content;
    if (!content) return { hook: "Check this out!", alternatives: [] };

    const parsed = JSON.parse(content);
    return {
      hook: parsed.bestHook || "Check this out!",
      alternatives: parsed.alternatives || [],
    };
  } catch (err: any) {
    console.error(`Failed to generate hook for clip ${clipId}:`, err.message);
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

Clip Title: "${clip.title}"
Clip Description: "${clip.description || ""}"
Source Video: "${videoTitle}"
Target Platform: ${clip.targetPlatform || "tiktok"}
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

  try {
    const response = await openai.chat.completions.create({
      model: "gpt-5-mini",
      messages: [{ role: "user", content: prompt }],
      response_format: { type: "json_object" },
      max_completion_tokens: 512,
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
      platform: clip.targetPlatform || "tiktok",
      factors,
    });

    await storage.updateContentClip(clipId, { optimizationScore: score });

    return { score, factors };
  } catch (err: any) {
    console.error(`Failed to predict virality for clip ${clipId}:`, err.message);
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
    `- "${c.title}" (score: ${c.optimizationScore || 0}, platform: ${c.targetPlatform || "unknown"}, ${Math.round((c.endTime || 0) - (c.startTime || 0))}s)`
  ).join("\n");

  const prompt = `You are a content compilation expert. Create a compilation reel plan from these top-performing clips.

Available Clips:
${clipSummary}

${theme ? `Theme/Focus: "${theme}"` : "Select the best combination for maximum engagement."}

Create a compilation plan as JSON:
{
  "reelTitle": "catchy compilation title",
  "selectedClipIndices": [0, 1, 2],
  "orderRationale": "why this order works",
  "transitionNotes": "how to transition between clips",
  "platforms": ["tiktok", "youtube_shorts", "reels"],
  "estimatedPerformance": "expected engagement level",
  "compilationPlan": "detailed plan for assembling the reel"
}`;

  try {
    const response = await openai.chat.completions.create({
      model: "gpt-5-mini",
      messages: [{ role: "user", content: prompt }],
      response_format: { type: "json_object" },
      max_completion_tokens: 1024,
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
      platforms: parsed.platforms || ["tiktok", "youtube_shorts", "reels"],
      compilationPlan: parsed.compilationPlan || parsed.orderRationale || "Compile selected clips in order.",
    };
  } catch (err: any) {
    console.error(`Failed to compile auto reel:`, err.message);
    const selectedClips = topClips.slice(0, 5);
    const totalDuration = selectedClips.reduce((sum, c) => sum + ((c.endTime || 0) - (c.startTime || 0)), 0);
    return {
      reelTitle: "Best Moments Compilation",
      clips: selectedClips,
      totalDuration: Math.round(totalDuration),
      platforms: ["tiktok", "youtube_shorts", "reels"],
      compilationPlan: "Top clips selected by viral score. Arrange in descending engagement order.",
    };
  }
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
        platform: actualMetrics.platform || "tiktok",
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
      },
    });

    return { tracked: true, accuracy };
  } catch (err: any) {
    console.error(`Failed to track clip performance for clip ${clipId}:`, err.message);
    return { tracked: false, accuracy: null };
  }
}
