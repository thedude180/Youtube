import { getOpenAIClient } from "./lib/openai";
import { storage } from "./storage";
import { db } from "./db";
import { pipelineRuns, clipViralityScores, contentClips, videos } from "@shared/schema";
import { eq, and, desc } from "drizzle-orm";
import { getRetentionBeatsPromptContext } from "./retention-beats-engine";
import { fetchYouTubeTranscript } from "./youtube";
import { google } from "googleapis";

import { createLogger } from "./lib/logger";

const logger = createLogger("shorts-pipeline-engine");
const openai = getOpenAIClient();

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

  const retentionContext = await getRetentionBeatsPromptContext(userId);

  let transcriptSection = "";
  const youtubeId = video.youtubeId || (video.metadata as any)?.youtubeId;
  if (youtubeId) {
    try {
      const transcript = await fetchYouTubeTranscript(youtubeId);
      if (transcript) {
        const lines = transcript.split("\n");
        const truncated = lines.length > 300 ? lines.slice(0, 300).join("\n") + "\n... [truncated]" : transcript;
        transcriptSection = `\nTranscript (timestamped):\n${truncated}\n\nIMPORTANT: Use the transcript timestamps to identify EXACT clip start/end times. Pick moments where the spoken content is most engaging, surprising, or valuable.\n`;
      }
    } catch {}
  }

  const prompt = `You are a viral shorts/clips extraction expert using proven retention science. Analyze this video and identify 3-8 clip-worthy moments that would perform well as short-form content on TikTok, YouTube Shorts, and Instagram Reels.

Video Title: "${video.title}"
Description: "${video.description || "Not provided"}"
Duration: ${duration}
Views: ${views}
Tags: ${tags}
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
- Key takeaways or tips

TikTok-specific optimization (for clips targeting tiktok):
- Keep clips 15-60 seconds (sweet spot: 21-34 seconds for algorithm boost)
- Front-load the hook in the first 1-3 seconds
- Title should use TikTok trending formats: "POV:", "Wait for it...", "This is why...", "No one talks about..."
- Use 3-5 hashtags mixing trending (#fyp #viral) with niche-specific tags
- Description should be ultra-casual, lowercase aesthetic when it fits
- Optimize for vertical 9:16 format
- Prioritize moments with strong visual movement or reactions`;

  try {
    const response = await openai.chat.completions.create({
      model: "gpt-4o-mini",
      messages: [{ role: "user", content: prompt }],
      response_format: { type: "json_object" },
      max_completion_tokens: 16000,
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
        targetPlatform: clip.targetPlatform || "tiktok",
        status: "ai_ready",
        optimizationScore: Math.min(100, Math.max(0, clip.viralScore ?? 50)),
        metadata: {
          tags: clip.tags || [],
          thumbnailPrompt: clip.thumbnailPrompt || "",
          format: clip.format || "vertical",
          aspectRatio: clip.aspectRatio || "9:16",
          hook: clip.hook || "",
          hasTranscript: !!transcriptSection,
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
      model: "gpt-4o-mini",
      messages: [{ role: "user", content: prompt }],
      response_format: { type: "json_object" },
      max_completion_tokens: 16000,
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
      model: "gpt-4o-mini",
      messages: [{ role: "user", content: prompt }],
      response_format: { type: "json_object" },
      max_completion_tokens: 16000,
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
      model: "gpt-4o-mini",
      messages: [{ role: "user", content: prompt }],
      response_format: { type: "json_object" },
      max_completion_tokens: 16000,
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
    logger.error(`Failed to compile auto reel:`, err.message);
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
  const channelId = ytChannel?.id ?? null;

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
    title: c.title,
    description: c.description || "",
    tags: (c.metadata as any)?.tags || [],
    platform: c.targetPlatform,
    hook: (c.metadata as any)?.hook || "",
    duration: `${Math.round((c.endTime || 0) - (c.startTime || 0))}s`,
  }));

  const prompt = `You are a YouTube Shorts SEO specialist for a PS5 no-commentary gaming channel. Optimize these clip titles, descriptions, and tags for maximum YouTube Shorts discoverability.

Source Video: "${sourceVideo.title}"
Channel Niche: PS5 Gaming, No Commentary

Clips to optimize:
${JSON.stringify(clipSummary, null, 2)}

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

  try {
    const response = await openai.chat.completions.create({
      model: "gpt-4o-mini",
      messages: [{ role: "user", content: prompt }],
      response_format: { type: "json_object" },
      max_completion_tokens: 16000,
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
      } as any,
    });

    return { tracked: true, accuracy };
  } catch (err: any) {
    logger.error(`Failed to track clip performance for clip ${clipId}:`, err.message);
    return { tracked: false, accuracy: null };
  }
}
