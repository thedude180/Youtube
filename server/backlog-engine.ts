import { storage } from "./storage";
import { generateVideoMetadata, runAgentTask, generateCommunityPost, detectContentContext } from "./ai-engine";
import { AI_AGENTS } from "@shared/schema";
import { tokenBudget } from "./lib/ai-attack-shield";

// ── Viral-optimization concurrency semaphore ─────────────────────────────────
// Prevents concurrent AI hammering when autopilot processes many videos at once.
const VIRAL_OPT_MAX_CONCURRENT = 2;
let _viralOptActive = 0;
const _viralOptQueue: Array<() => void> = [];

function _acquireViralOpt(): Promise<void> {
  if (_viralOptActive < VIRAL_OPT_MAX_CONCURRENT) {
    _viralOptActive++;
    return Promise.resolve();
  }
  return new Promise<void>(resolve => _viralOptQueue.push(resolve));
}

function _releaseViralOpt(): void {
  const next = _viralOptQueue.shift();
  if (next) {
    // Keep the counter as-is; pass the slot directly to the next waiter
    next();
  } else {
    _viralOptActive--;
  }
}
// ─────────────────────────────────────────────────────────────────────────────

type ProcessingState = "idle" | "processing" | "paused" | "stream_active";

interface BacklogSession {
  userId: string;
  state: ProcessingState;
  currentVideoId: number | null;
  currentAgentIndex: number;
  currentChainStep: number;
  totalVideos: number;
  processedVideos: number;
  jobId: number | null;
  startedAt: Date;
  lastActivityAt: Date;
  mode: "quick" | "deep";
  priority: "backlog" | "stream" | "post_stream";
  chainResults: Record<number, AgentChainResult>;
  errors: Array<{ videoId: number; error: string; timestamp: Date }>;
}

interface AgentChainResult {
  videoId: number;
  steps: Array<{
    agentId: string;
    status: "pending" | "running" | "completed" | "failed";
    result?: any;
    startedAt?: Date;
    completedAt?: Date;
  }>;
  optimizationScore: number;
  startedAt: Date;
  completedAt?: Date;
}

const AGENT_CHAIN = [
  { agentId: "seo",        action: "SEO Optimization" },
  { agentId: "editor",     action: "Content Refinement" },
  { agentId: "brand",      action: "Brand Alignment Check" },
  { agentId: "legal",      action: "Compliance Verification" },
  { agentId: "social",     action: "Social Distribution Plan" },
  { agentId: "analyst",    action: "Performance Prediction" },
];

const STREAM_SUPPORT_AGENTS = [
  { agentId: "seo",        action: "Live Stream SEO Optimization" },
  { agentId: "social",     action: "Live Social Engagement" },
  { agentId: "community",  action: "Live Chat Management" },
  { agentId: "analyst",    action: "Real-time Analytics Monitoring" },
  { agentId: "ops",        action: "Live Growth Tactics" },
];

const sessions = new Map<string, BacklogSession>();

const SESSION_TTL_MS = 4 * 60 * 60 * 1000;
import { registerCleanup } from "./services/cleanup-coordinator";
import { createLogger } from "./lib/logger";

const logger = createLogger("backlog-engine");
registerCleanup("backlogSessions", () => {
  const now = Date.now();
  for (const [userId, session] of sessions) {
    if (now - session.lastActivityAt.getTime() > SESSION_TTL_MS) {
      sessions.delete(userId);
    }
  }
}, 10 * 60 * 1000);

export function getBacklogSession(userId: string): BacklogSession | null {
  return sessions.get(userId) || null;
}

export function calculateOptimizationScore(metadata: any): number {
  if (!metadata) return 0;
  let score = 0;
  if (metadata.aiOptimized) score += 15;
  if (metadata.seoScore) score += Math.min(metadata.seoScore * 0.2, 20);
  if (metadata.tags && metadata.tags.length >= 5) score += 10;
  if (metadata.tags && metadata.tags.length >= 10) score += 5;
  if (metadata.aiSuggestions?.titleHooks?.length > 0) score += 10;
  if (metadata.aiSuggestions?.descriptionTemplate) score += 10;
  if (metadata.aiSuggestions?.thumbnailCritique) score += 10;
  if (metadata.aiSuggestions?.seoRecommendations?.length > 0) score += 5;
  if (metadata.aiSuggestions?.complianceNotes?.length > 0) score += 5;
  if (metadata.chainCompleted) score += 10;
  return Math.min(score, 100);
}

function prioritizeVideos(videos: any[]): any[] {
  return videos.sort((a, b) => {
    const scoreA = calculateOptimizationScore(a.metadata);
    const scoreB = calculateOptimizationScore(b.metadata);
    if (scoreA !== scoreB) return scoreA - scoreB;
    const viewsA = a.metadata?.stats?.views || 0;
    const viewsB = b.metadata?.stats?.views || 0;
    if (viewsB !== viewsA) return viewsB - viewsA;
    const dateA = a.createdAt ? new Date(a.createdAt).getTime() : 0;
    const dateB = b.createdAt ? new Date(b.createdAt).getTime() : 0;
    return dateB - dateA;
  });
}

export async function startBacklogProcessing(
  userId: string,
  mode: "quick" | "deep" = "deep"
): Promise<{ jobId: number; totalVideos: number; alreadyRunning: boolean }> {
  const existing = sessions.get(userId);
  if (existing && existing.state === "processing") {
    return { jobId: existing.jobId!, totalVideos: existing.totalVideos, alreadyRunning: true };
  }

  const allVideos = await storage.getVideosByUser(userId);
  const videosToProcess = allVideos.filter(v => {
    const score = calculateOptimizationScore(v.metadata);
    return score < 80;
  });

  const prioritized = prioritizeVideos(videosToProcess);

  const job = await storage.createJob({
    type: "auto_backlog_processing",
    status: "processing",
    priority: 2,
    payload: {
      totalVideos: prioritized.length,
      mode,
      videoIds: prioritized.map(v => v.id),
      userId,
    },
  });

  const session: BacklogSession = {
    userId,
    state: "processing",
    currentVideoId: null,
    currentAgentIndex: 0,
    currentChainStep: 0,
    totalVideos: prioritized.length,
    processedVideos: 0,
    jobId: job.id,
    startedAt: new Date(),
    lastActivityAt: new Date(),
    mode,
    priority: "backlog",
    chainResults: {},
    errors: [],
  };

  sessions.set(userId, session);

  processBacklogAsync(userId, prioritized, job.id, mode);

  return { jobId: job.id, totalVideos: prioritized.length, alreadyRunning: false };
}

async function processBacklogAsync(
  userId: string,
  videos: any[],
  jobId: number,
  mode: "quick" | "deep"
) {
  const session = sessions.get(userId);
  if (!session) return;

  let completed = 0;

  for (const video of videos) {
    const currentSession = sessions.get(userId);
    if (!currentSession || currentSession.state === "paused") {
      break;
    }
    if (currentSession.state === "stream_active") {
      await waitForStreamEnd(userId);
      const resumedSession = sessions.get(userId);
      if (!resumedSession || resumedSession.state === "paused") break;
    }

    currentSession.currentVideoId = video.id;
    currentSession.lastActivityAt = new Date();

    const chainResult: AgentChainResult = {
      videoId: video.id,
      steps: AGENT_CHAIN.map(step => ({
        agentId: step.agentId,
        status: "pending" as const,
      })),
      optimizationScore: calculateOptimizationScore(video.metadata),
      startedAt: new Date(),
    };

    currentSession.chainResults[video.id] = chainResult;

    try {
      const suggestions = await generateVideoMetadata({
        title: video.title,
        description: video.description,
        type: video.type,
        metadata: video.metadata,
        platform: video.platform || undefined,
      });

      const contentCtx = detectContentContext(video.title, video.description, video.metadata?.contentCategory, video.metadata);
      const newMetadata = {
        ...video.metadata,
        duration: video.metadata?.duration,
        privacyStatus: video.metadata?.privacyStatus,
        seoScore: suggestions.seoScore || 0,
        aiSuggestions: {
          titleHooks: suggestions.titleHooks || [],
          descriptionTemplate: suggestions.descriptionTemplate || "",
          thumbnailCritique: suggestions.thumbnailCritique || "",
          seoRecommendations: suggestions.seoRecommendations || [],
          complianceNotes: suggestions.complianceNotes || [],
        },
        tags: suggestions.suggestedTags || video.metadata?.tags || [],
        aiOptimized: true,
        aiOptimizedAt: new Date().toISOString(),
        gameName: video.metadata?.gameName || contentCtx.topicName || null,
        contentCategory: video.metadata?.contentCategory || (contentCtx.niche !== 'general' ? contentCtx.niche : null),
        brandKeywords: video.metadata?.brandKeywords?.length ? video.metadata.brandKeywords : contentCtx.brandKeywords,
      };

      chainResult.steps[0].status = "completed";
      chainResult.steps[0].completedAt = new Date();

      const videoUpdate: any = { metadata: newMetadata };
      if (suggestions.titleHooks?.length && suggestions.titleHooks[0]) {
        newMetadata.originalTitle = newMetadata.originalTitle || video.title;
        videoUpdate.title = suggestions.titleHooks[0];
      }
      if (suggestions.descriptionTemplate) {
        newMetadata.originalDescription = newMetadata.originalDescription || video.description;
        videoUpdate.description = suggestions.descriptionTemplate;
      }
      videoUpdate.metadata = newMetadata;

      await storage.updateVideo(video.id, videoUpdate);

      try {
        const { queueMetadataUpdate } = await import("./services/push-scheduler");
        queueMetadataUpdate(userId, video.id, "immediate");
      } catch (syncErr: any) {
        logger.error(`[BacklogEngine] Push scheduler queue failed:`, syncErr.message);
      }

      if (video.metadata?.youtubeId && video.channelId) {
        try {
          const { addToBacklog } = await import("./services/youtube-push-backlog");
          const pushUpdates: any = {};
          if (videoUpdate.title) pushUpdates.title = videoUpdate.title;
          if (videoUpdate.description) pushUpdates.description = videoUpdate.description;
          if (newMetadata.tags?.length) pushUpdates.tags = newMetadata.tags;
          if (Object.keys(pushUpdates).length > 0) {
            await addToBacklog({
              userId,
              videoId: video.id,
              channelId: video.channelId,
              youtubeVideoId: video.metadata.youtubeId,
              updates: pushUpdates,
              priority: 5,
            });
          }
        } catch (backlogErr: any) {
          logger.error(`[BacklogEngine] YouTube push backlog queue failed:`, backlogErr.message);
        }
      }

      await storage.createAgentActivity({
        userId,
        agentId: "seo_director",
        action: `Optimized SEO for "${video.title}"`,
        target: video.title,
        status: "completed",
        details: {
          description: `Generated optimized metadata with ${suggestions.suggestedTags?.length || 0} tags, SEO score: ${suggestions.seoScore}`,
          impact: `SEO score improved to ${suggestions.seoScore}/100`,
          recommendations: suggestions.seoRecommendations?.slice(0, 3),
        },
      });

      if (mode === "deep") {
        const chainAgents = AGENT_CHAIN.slice(1);
        for (let i = 0; i < chainAgents.length; i++) {
          const step = chainAgents[i];
          const stepIndex = i + 1;
          chainResult.steps[stepIndex].status = "running";
          chainResult.steps[stepIndex].startedAt = new Date();

          try {
            const userChannels = await storage.getChannelsByUser(userId);
            const allVids = await storage.getVideosByUser(userId);
            const result = await runAgentTask(step.agentId, {
              channelName: userChannels[0]?.channelName || "My Channel",
              videoCount: allVids.length,
              recentTitles: [video.title, ...allVids.slice(0, 4).map(v => v.title)],
              gameName: video.metadata?.gameName || null,
              contentCategory: video.metadata?.contentCategory || null,
              brandKeywords: video.metadata?.brandKeywords || [],
            });

            chainResult.steps[stepIndex].status = "completed";
            chainResult.steps[stepIndex].result = result;
            chainResult.steps[stepIndex].completedAt = new Date();

            await storage.createAgentActivity({
              userId,
              agentId: step.agentId,
              action: result.action || `${step.action} for "${video.title}"`,
              target: result.target || video.title,
              status: "completed",
              details: {
                description: result.description,
                impact: result.impact,
                recommendations: result.recommendations,
                humanized: true,
              },
            });
          } catch (err: any) {
            chainResult.steps[stepIndex].status = "failed";
            logger.error(`Chain step ${step.agentId} failed for video ${video.id}:`, err.message);
          }

          const checkSession = sessions.get(userId);
          if (!checkSession || checkSession.state !== "processing") break;
        }
      }

      const allStepsFinished = chainResult.steps.every(s => s.status === "completed" || s.status === "failed");
      const updatedVideo = await storage.getVideo(video.id);
      const updatedMeta: any = {
        ...updatedVideo?.metadata,
        chainCompleted: allStepsFinished,
        chainCompletedAt: allStepsFinished ? new Date().toISOString() : null,
        optimizationScore: calculateOptimizationScore({
          ...updatedVideo?.metadata,
          chainCompleted: allStepsFinished,
        }),
      };
      await storage.updateVideo(video.id, { metadata: updatedMeta });

      chainResult.optimizationScore = updatedMeta.optimizationScore;
      chainResult.completedAt = new Date();

    } catch (err: any) {
      logger.error(`Failed to process video ${video.id}:`, err.message);
      currentSession.errors.push({
        videoId: video.id,
        error: err.message,
        timestamp: new Date(),
      });
    }

    completed++;
    currentSession.processedVideos = completed;
    const progress = Math.round((completed / videos.length) * 100);
    await storage.updateJobProgress(jobId, progress);
  }

  const finalSession = sessions.get(userId);
  if (finalSession) {
    finalSession.state = "idle";
    finalSession.currentVideoId = null;
  }
  await storage.updateJobStatus(jobId, "completed", {
    optimized: completed,
    total: videos.length,
    mode,
  });

  await storage.createAuditLog({
    userId,
    action: "auto_backlog_completed",
    target: `${completed} of ${videos.length} videos processed`,
    riskLevel: "low",
  });
}

function waitForStreamEnd(userId: string): Promise<void> {
  return new Promise((resolve) => {
    const MAX_WAIT_MS = 12 * 60 * 60 * 1000;
    const startTime = Date.now();
    const check = setInterval(() => {
      const session = sessions.get(userId);
      if (!session || session.state !== "stream_active" || (Date.now() - startTime) > MAX_WAIT_MS) {
        clearInterval(check);
        resolve();
      }
    }, 5000);
  });
}

export async function pauseBacklog(userId: string): Promise<boolean> {
  const session = sessions.get(userId);
  if (!session || session.state !== "processing") return false;
  session.state = "paused";
  session.lastActivityAt = new Date();
  return true;
}

export async function resumeBacklog(userId: string): Promise<boolean> {
  const session = sessions.get(userId);
  if (!session || session.state !== "paused") return false;
  session.state = "processing";
  session.lastActivityAt = new Date();

  const allVideos = await storage.getVideosByUser(userId);
  const remaining = allVideos.filter(v => {
    const score = calculateOptimizationScore(v.metadata);
    return score < 80;
  });
  const prioritized = prioritizeVideos(remaining);

  if (session.jobId) {
    processBacklogAsync(userId, prioritized, session.jobId, session.mode);
  }
  return true;
}

export async function pivotToStream(userId: string, streamId: number): Promise<void> {
  const session = sessions.get(userId);
  if (session) {
    session.state = "stream_active";
    session.priority = "stream";
    session.lastActivityAt = new Date();
  }

  for (const agent of STREAM_SUPPORT_AGENTS) {
    try {
      const userChannels = await storage.getChannelsByUser(userId);
      const videos = await storage.getVideosByUser(userId);
      const result = await runAgentTask(agent.agentId, {
        channelName: userChannels[0]?.channelName || "My Channel",
        videoCount: videos.length,
        recentTitles: videos.slice(0, 5).map(v => v.title),
      });

      await storage.createAgentActivity({
        userId,
        agentId: agent.agentId,
        action: result.action || agent.action,
        target: `Stream #${streamId}`,
        status: "completed",
        details: {
          description: result.description || `${agent.action} activated for live stream`,
          impact: result.impact,
          recommendations: result.recommendations,
        },
      });
    } catch (err: any) {
      logger.error(`Stream support agent ${agent.agentId} error:`, err.message);
    }
  }
}

export async function resumeFromStream(userId: string, streamId: number): Promise<void> {
  const session = sessions.get(userId);
  if (session) {
    session.priority = "post_stream";
    session.lastActivityAt = new Date();
  }

  const postStreamAgents = [
    { agentId: "editor", action: "VOD Processing & Highlights" },
    { agentId: "seo_director", action: "VOD SEO Optimization" },
    { agentId: "social_manager", action: "Post-Stream Social Posts" },
    { agentId: "analytics_director", action: "Stream Performance Report" },
  ];

  for (const agent of postStreamAgents) {
    try {
      const userChannels = await storage.getChannelsByUser(userId);
      const videos = await storage.getVideosByUser(userId);
      const result = await runAgentTask(agent.agentId, {
        channelName: userChannels[0]?.channelName || "My Channel",
        videoCount: videos.length,
        recentTitles: videos.slice(0, 5).map(v => v.title),
      });

      await storage.createAgentActivity({
        userId,
        agentId: agent.agentId,
        action: result.action || agent.action,
        target: `Post-stream #${streamId}`,
        status: "completed",
        details: {
          description: result.description || `${agent.action} for stream VOD`,
          impact: result.impact,
          recommendations: result.recommendations,
        },
      });
    } catch (err: any) {
      logger.error(`Post-stream agent ${agent.agentId} error:`, err.message);
    }
  }

  if (session) {
    session.state = "processing";
    session.priority = "backlog";
    session.lastActivityAt = new Date();
  }
}

export async function getBacklogStatus(userId: string): Promise<{
  state: ProcessingState;
  totalVideos: number;
  optimizedVideos: number;
  pendingVideos: number;
  processingVideoId: number | null;
  processedCount: number;
  progress: number;
  mode: string;
  priority: string;
  errors: number;
  currentChain: AgentChainResult | null;
  scores: { excellent: number; good: number; fair: number; poor: number };
  estimatedTimeRemaining: string;
  activeJob: any;
}> {
  const session = sessions.get(userId);
  const allVideos = await storage.getVideosByUser(userId);

  const scores = { excellent: 0, good: 0, fair: 0, poor: 0 };
  let totalScore = 0;
  allVideos.forEach(v => {
    const score = calculateOptimizationScore(v.metadata);
    totalScore += score;
    if (score >= 80) scores.excellent++;
    else if (score >= 60) scores.good++;
    else if (score >= 30) scores.fair++;
    else scores.poor++;
  });

  const optimized = allVideos.filter(v => calculateOptimizationScore(v.metadata) >= 80).length;
  const pending = allVideos.length - optimized;

  let activeJob = null;
  if (session?.jobId) {
    const jobs = await storage.getJobs();
    activeJob = jobs.find(j => j.id === session.jobId && j.status === "processing");
  }

  const avgProcessTime = 15;
  const remainingCount = session ? (session.totalVideos - session.processedVideos) : pending;
  const estimatedMinutes = remainingCount * avgProcessTime * (session?.mode === "deep" ? AGENT_CHAIN.length : 1);
  const hours = Math.floor(estimatedMinutes / 60);
  const mins = estimatedMinutes % 60;
  const estimatedTimeRemaining = hours > 0 ? `${hours}h ${mins}m` : `${mins}m`;

  const currentChain = session?.currentVideoId ? session.chainResults[session.currentVideoId] || null : null;

  return {
    state: session?.state || "idle",
    totalVideos: allVideos.length,
    optimizedVideos: optimized,
    pendingVideos: pending,
    processingVideoId: session?.currentVideoId || null,
    processedCount: session?.processedVideos || 0,
    progress: session ? Math.round((session.processedVideos / Math.max(session.totalVideos, 1)) * 100) : 0,
    mode: session?.mode || "deep",
    priority: session?.priority || "backlog",
    errors: session?.errors.length || 0,
    currentChain,
    scores,
    estimatedTimeRemaining,
    activeJob,
  };
}

export async function getVideosWithScores(userId: string): Promise<Array<{
  id: number;
  title: string;
  platform: string;
  type: string;
  optimizationScore: number;
  isOptimized: boolean;
  needsReoptimization: boolean;
  lastOptimizedAt: string | null;
  chainCompleted: boolean;
}>> {
  const allVideos = await storage.getVideosByUser(userId);
  return allVideos.map(v => {
    const score = calculateOptimizationScore(v.metadata);
    const lastOpt = v.metadata?.aiOptimizedAt || null;
    const daysSinceOpt = lastOpt ? (Date.now() - new Date(lastOpt).getTime()) / (1000 * 60 * 60 * 24) : Infinity;

    return {
      id: v.id,
      title: v.title,
      platform: v.platform || "youtube",
      type: v.type,
      optimizationScore: score,
      isOptimized: score >= 80,
      needsReoptimization: daysSinceOpt > 30 && score < 90,
      lastOptimizedAt: lastOpt,
      chainCompleted: !!v.metadata?.chainCompleted,
    };
  });
}

export async function bulkOptimize(
  userId: string,
  videoIds: number[],
  agentIds: string[]
): Promise<{ jobId: number; count: number }> {
  const job = await storage.createJob({
    type: "bulk_agent_optimize",
    status: "processing",
    priority: 1,
    payload: {
      videoIds,
      agentIds,
      userId,
    },
  });

  (async () => {
    let completed = 0;
    for (const videoId of videoIds) {
      const video = await storage.getVideo(videoId);
      if (!video) continue;

      for (const agentId of agentIds) {
        try {
          const userChannels = await storage.getChannelsByUser(userId);
          const allVids = await storage.getVideosByUser(userId);
          const result = await runAgentTask(agentId, {
            channelName: userChannels[0]?.channelName || "My Channel",
            videoCount: allVids.length,
            recentTitles: [video.title, ...allVids.slice(0, 4).map(v => v.title)],
            gameName: video.metadata?.gameName || null,
            contentCategory: video.metadata?.contentCategory || null,
            brandKeywords: video.metadata?.brandKeywords || [],
          });

          await storage.createAgentActivity({
            userId,
            agentId,
            action: result.action || `Bulk optimized "${video.title}"`,
            target: video.title,
            status: "completed",
            details: {
              description: result.description,
              impact: result.impact,
              recommendations: result.recommendations,
            },
          });
        } catch (err: any) {
          logger.error(`Bulk optimize agent ${agentId} failed for video ${videoId}:`, err.message);
        }
      }

      completed++;
      const progress = Math.round((completed / videoIds.length) * 100);
      await storage.updateJobProgress(job.id, progress);
    }

    await storage.updateJobStatus(job.id, "completed", {
      optimized: completed,
      total: videoIds.length,
      agents: agentIds,
    });
  })();

  return { jobId: job.id, count: videoIds.length };
}

export async function autoScheduleOptimizedContent(userId: string): Promise<number> {
  const { getAudienceDrivenTime, calculateDailyPostBudget } = await import("./human-behavior-engine");
  const { getOptimalPostingTimes } = await import("./smart-scheduler");

  const PLATFORM_MIN_GAP: Record<string, number> = {
    youtube: 120,
  };

  const allVideos = await storage.getVideosByUser(userId);
  const fullyOptimized = allVideos.filter(v => {
    const score = calculateOptimizationScore(v.metadata);
    const meta = v.metadata as any;
    return score >= 80 && meta?.chainCompleted && !meta?.autoScheduled;
  });

  if (fullyOptimized.length === 0) return 0;

  const now = new Date();
  const fourteenDaysOut = new Date(now.getTime() + 14 * 86400000);
  const existingSchedule = await storage.getScheduleItems(userId, now, fourteenDaysOut);

  const scheduledPerPlatformPerDay = new Map<string, number>();
  const lastScheduledPerPlatform = new Map<string, Date>();
  for (const item of existingSchedule) {
    if (item.status === "cancelled") continue;
    const dayKey = `${item.platform}:${new Date(item.scheduledAt).toISOString().slice(0, 10)}`;
    scheduledPerPlatformPerDay.set(dayKey, (scheduledPerPlatformPerDay.get(dayKey) || 0) + 1);
    const itemTime = new Date(item.scheduledAt);
    const existing = lastScheduledPerPlatform.get(item.platform || "");
    if (!existing || itemTime > existing) {
      lastScheduledPerPlatform.set(item.platform || "", itemTime);
    }
  }

  const platforms = ["youtube"];

  const audienceSourceByPlatform = new Map<string, string>();
  for (const platform of platforms) {
    try {
      const result = await getOptimalPostingTimes(userId, platform);
      audienceSourceByPlatform.set(platform, result.source === "data" ? "audience-data" : "default-timing");
    } catch {
      audienceSourceByPlatform.set(platform, "default-timing");
    }
  }

  let totalScheduled = 0;

  for (const video of fullyOptimized) {
    let videoScheduledCount = 0;
    const sourcesUsed = new Set<string>();

    for (const platform of platforms) {
      let scheduledTime = await getAudienceDrivenTime({
        platform,
        userId,
        contentType: "new-video",
        urgency: "normal",
      });

      const minGap = (PLATFORM_MIN_GAP[platform] || 120) * 60000;
      const lastForPlatform = lastScheduledPerPlatform.get(platform);
      if (lastForPlatform && scheduledTime.getTime() - lastForPlatform.getTime() < minGap) {
        scheduledTime = new Date(lastForPlatform.getTime() + minGap + Math.floor(Math.random() * 30) * 60000);
      }

      const finalDayKey = `${platform}:${scheduledTime.toISOString().slice(0, 10)}`;
      const currentDayCount = scheduledPerPlatformPerDay.get(finalDayKey) || 0;
      const budget = calculateDailyPostBudget(platform, scheduledTime);
      if (currentDayCount >= budget) continue;

      const source = audienceSourceByPlatform.get(platform) || "default-timing";
      sourcesUsed.add(source);

      try {
        await storage.createScheduleItem({
          userId,
          title: video.title,
          type: "social_post",
          platform,
          scheduledAt: scheduledTime,
          status: "scheduled",
          videoId: video.id,
          metadata: {
            description: source === "audience-data"
              ? `Scheduled using audience activity data`
              : `Scheduled using default timing (no audience data yet)`,
            tags: video.metadata?.tags || [],
            autoPublish: true,
            crossPost: platforms,
            aiOptimized: true,
            schedulingSource: source,
          } as any,
        });
        videoScheduledCount++;
        totalScheduled++;
        scheduledPerPlatformPerDay.set(finalDayKey, currentDayCount + 1);
        lastScheduledPerPlatform.set(platform, scheduledTime);
      } catch (err: any) {
        logger.error(`[AutoSchedule] Failed for video ${video.id} on ${platform}:`, err.message);
      }
    }

    if (videoScheduledCount > 0) {
      const schedulingSource = sourcesUsed.has("audience-data") ? "audience-data" : "default-timing";
      const updatedAutoMeta: any = { ...video.metadata, autoScheduled: true, autoScheduledAt: new Date().toISOString(), schedulingSource };
      await storage.updateVideo(video.id, { metadata: updatedAutoMeta });

      await storage.createAgentActivity({
        userId,
        agentId: "social_manager",
        action: `Auto-scheduled "${video.title}" across ${videoScheduledCount} platform(s) [${schedulingSource}]`,
        target: video.title,
        status: "completed",
        details: {
          description: schedulingSource === "audience-data"
            ? `Scheduled at times your audience is most active, based on real viewer data`
            : `Scheduled using optimized default timing — will switch to audience-driven once viewer data is available`,
          impact: `${videoScheduledCount} posts scheduled at optimal times`,
        },
      });
    }
  }

  return totalScheduled;
}

export async function viralOptimizeVideo(userId: string, videoId: number): Promise<{
  optimized: boolean;
  youtubeUpdated: boolean;
  thumbnailQueued: boolean;
  seoScore: number;
  error?: string;
}> {
  // Early budget check — reject immediately if daily cap exhausted (don't queue in semaphore)
  if (!tokenBudget.checkBudget("viral-optimizer", 3000)) {
    return { optimized: false, youtubeUpdated: false, thumbnailQueued: false, seoScore: 0, error: "Daily viral-optimizer budget exhausted" };
  }

  const video = await storage.getVideo(videoId);
  if (!video) return { optimized: false, youtubeUpdated: false, thumbnailQueued: false, seoScore: 0, error: "Video not found" };

  if (video.channelId) {
    const userChannels = await storage.getChannelsByUser(userId);
    const ownsVideo = userChannels.some(c => c.id === video.channelId);
    if (!ownsVideo) return { optimized: false, youtubeUpdated: false, thumbnailQueued: false, seoScore: 0, error: "Access denied" };
  }

  const meta = (video.metadata as any) || {};
  const youtubeId = meta.youtubeId || meta.youtubeVideoId || meta.externalId;
  const channelId = video.channelId;

  let liveYouTubeData: any = null;
  if (youtubeId && channelId) {
    try {
      const { fetchYouTubeVideoDetails } = await import("./youtube");
      liveYouTubeData = await fetchYouTubeVideoDetails(channelId, youtubeId);
    } catch (err: any) {
      logger.error(`[ViralOptimize] Failed to fetch YouTube data for ${youtubeId}:`, err.message);
    }
  }

  const currentTitle = liveYouTubeData?.title || video.title;
  const currentDescription = liveYouTubeData?.description || video.description || "";
  const currentTags = liveYouTubeData?.tags || meta.tags || [];
  const currentStats = liveYouTubeData ? {
    viewCount: liveYouTubeData.viewCount,
    likeCount: liveYouTubeData.likeCount,
    commentCount: liveYouTubeData.commentCount,
  } : {
    viewCount: meta.viewCount || 0,
    likeCount: meta.likeCount || 0,
    commentCount: meta.commentCount || 0,
  };

  const contentCtx = detectContentContext(currentTitle, currentDescription, meta.contentCategory, meta);

  // Detect content type: live stream VOD, clip, short, or regular video
  const titleLower = currentTitle.toLowerCase();
  const durationSec = Number(liveYouTubeData?.duration || meta.duration || 0);
  let detectedContentType: string;
  if (meta.isLive === true || meta.videoType === "live_stream" ||
      /\b(full\s*stream|live\s*stream|live\s*vod|\bvod\b|full\s*vod|\bstream\b|\blive\b)/.test(titleLower)) {
    detectedContentType = "live_stream";
  } else if (meta.videoType === "short" || /\b(#shorts?|short\s*form)/.test(titleLower) || (durationSec > 0 && durationSec <= 60)) {
    detectedContentType = "short";
  } else if (meta.videoType === "clip" ||
      /\b(clip|highlight|moment|best\s*(moment|play|kills?)|montage|compilation|funniest|reaction)/.test(titleLower) ||
      (durationSec > 0 && durationSec <= 300)) {
    detectedContentType = "clip";
  } else {
    detectedContentType = "regular";
  }

  await _acquireViralOpt();
  let suggestions: any;
  try {
    suggestions = await generateVideoMetadata({
      title: currentTitle,
      description: currentDescription,
      type: video.type || "long",
      metadata: {
        ...meta,
        tags: currentTags,
        liveStats: currentStats,
        youtubeCategory: liveYouTubeData?.categoryId,
        publishedAt: liveYouTubeData?.publishedAt || meta.publishedAt,
        duration: liveYouTubeData?.duration || meta.duration,
        detectedContentType,
      },
      platform: video.platform || "youtube",
    }, userId);
  } finally {
    // 800ms spacing between releases to prevent burst hammering
    await new Promise(r => setTimeout(r, 800));
    _releaseViralOpt();
  }

  const newMetadata: any = {
    ...meta,
    seoScore: suggestions.seoScore || 0,
    aiSuggestions: {
      titleHooks: suggestions.titleHooks || [],
      descriptionTemplate: suggestions.descriptionTemplate || "",
      thumbnailCritique: suggestions.thumbnailCritique || "",
      thumbnailVariants: suggestions.thumbnailVariants || [],
      seoRecommendations: suggestions.seoRecommendations || [],
      complianceNotes: suggestions.complianceNotes || [],
      retentionBrief: suggestions.retentionBrief || null,
      contentBrief: suggestions.contentBrief || null,
    },
    tags: suggestions.suggestedTags || currentTags,
    aiOptimized: true,
    aiOptimizedAt: new Date().toISOString(),
    viralOptimized: true,
    viralOptimizedAt: new Date().toISOString(),
    gameName: meta.gameName || contentCtx.topicName || null,
    contentCategory: meta.contentCategory || (contentCtx.niche !== 'general' ? contentCtx.niche : null),
    brandKeywords: meta.brandKeywords?.length ? meta.brandKeywords : contentCtx.brandKeywords,
    liveYouTubeSnapshot: liveYouTubeData ? {
      fetchedAt: new Date().toISOString(),
      title: liveYouTubeData.title,
      viewCount: liveYouTubeData.viewCount,
      likeCount: liveYouTubeData.likeCount,
      commentCount: liveYouTubeData.commentCount,
    } : meta.liveYouTubeSnapshot,
  };

  const videoUpdate: any = { metadata: newMetadata };
  const bestTitle = suggestions.titleHooks?.[0];
  if (bestTitle && bestTitle.length <= 100) {
    newMetadata.originalTitle = newMetadata.originalTitle || currentTitle;
    videoUpdate.title = bestTitle;
  }
  if (suggestions.descriptionTemplate) {
    newMetadata.originalDescription = newMetadata.originalDescription || currentDescription;
    videoUpdate.description = suggestions.descriptionTemplate;
  }

  await storage.updateVideo(videoId, videoUpdate);

  let youtubeUpdated = false;
  if (youtubeId && channelId) {
    try {
      const pushUpdates: any = {};
      if (videoUpdate.title) pushUpdates.title = videoUpdate.title;
      if (videoUpdate.description) pushUpdates.description = videoUpdate.description;
      if (newMetadata.tags?.length) pushUpdates.tags = newMetadata.tags;
      if (Object.keys(pushUpdates).length > 0) {
        const { addToBacklog } = await import("./services/youtube-push-backlog");
        await addToBacklog({
          userId,
          videoId,
          channelId,
          youtubeVideoId: youtubeId,
          updates: pushUpdates,
          priority: 3,
        });
        youtubeUpdated = true;
      }
    } catch (err: any) {
      logger.error(`[ViralOptimize] YouTube push queue failed for ${videoId}:`, err.message);
    }
  }

  let thumbnailQueued = false;
  if (youtubeId && channelId) {
    try {
      newMetadata.autoThumbnailGenerated = false;
      newMetadata.autoThumbnailFailed = false;
      await storage.updateVideo(videoId, { metadata: newMetadata });

      const { generateThumbnailForNewVideo } = await import("./auto-thumbnail-engine");
      const success = await generateThumbnailForNewVideo(userId, videoId);
      thumbnailQueued = success;
    } catch (err: any) {
      logger.error(`[ViralOptimize] Thumbnail regeneration failed for ${videoId}:`, err.message);
    }
  }

  await storage.createAgentActivity({
    userId,
    agentId: "seo_director",
    action: `Viral-optimized "${video.title}"`,
    target: video.title,
    status: "completed",
    details: {
      description: `Full viral optimization with ${liveYouTubeData ? "live YouTube analysis" : "cached data"}. SEO score: ${suggestions.seoScore}. Tags: ${newMetadata.tags?.length || 0}. Thumbnail: ${thumbnailQueued ? "regenerated" : "skipped"}.`,
      impact: `SEO ${suggestions.seoScore}/100 | YouTube push: ${youtubeUpdated ? "queued" : "skipped"} | Thumbnail: ${thumbnailQueued ? "new" : "kept"}`,
    },
  });

  return {
    optimized: true,
    youtubeUpdated,
    thumbnailQueued,
    seoScore: suggestions.seoScore || 0,
  };
}

export async function reprocessBackCatalog(userId: string): Promise<{
  jobId: number;
  totalVideos: number;
  alreadyRunning: boolean;
}> {
  const existing = sessions.get(userId);
  if (existing && existing.state === "processing") {
    return { jobId: existing.jobId!, totalVideos: existing.totalVideos, alreadyRunning: true };
  }

  const allVideos = await storage.getVideosByUser(userId);
  const publicVideos = allVideos.filter(v => {
    const m = (v.metadata as any) || {};
    return m.privacyStatus !== "private" && m.privacyStatus !== "unlisted";
  });

  const prioritized = prioritizeVideos(publicVideos);

  const job = await storage.createJob({
    type: "viral_back_catalog_reprocess",
    status: "processing",
    priority: 1,
    payload: {
      totalVideos: prioritized.length,
      mode: "viral",
      videoIds: prioritized.map(v => v.id),
      userId,
    },
  });

  const session: BacklogSession = {
    userId,
    state: "processing",
    currentVideoId: null,
    currentAgentIndex: 0,
    currentChainStep: 0,
    totalVideos: prioritized.length,
    processedVideos: 0,
    jobId: job.id,
    startedAt: new Date(),
    lastActivityAt: new Date(),
    mode: "deep",
    priority: "backlog",
    chainResults: {},
    errors: [],
  };

  sessions.set(userId, session);
  viralReprocessAsync(userId, prioritized, job.id).catch(err =>
    logger.error(`[BackCatalog] Viral reprocess failed:`, err)
  );

  return { jobId: job.id, totalVideos: prioritized.length, alreadyRunning: false };
}

async function viralReprocessAsync(userId: string, videoList: any[], jobId: number) {
  let completed = 0;

  for (const video of videoList) {
    const currentSession = sessions.get(userId);
    if (!currentSession || currentSession.state === "paused") break;
    if (currentSession.state === "stream_active") {
      await waitForStreamEnd(userId);
      const resumed = sessions.get(userId);
      if (!resumed || resumed.state === "paused") break;
    }

    currentSession.currentVideoId = video.id;
    currentSession.lastActivityAt = new Date();

    try {
      const result = await viralOptimizeVideo(userId, video.id);
      logger.info(`[BackCatalog] ${completed + 1}/${videoList.length} — "${video.title}" → SEO ${result.seoScore}, YT push: ${result.youtubeUpdated}, thumb: ${result.thumbnailQueued}`);
    } catch (err: any) {
      logger.error(`[BackCatalog] Failed video ${video.id} "${video.title}":`, err.message);
      currentSession.errors.push({ videoId: video.id, error: err.message, timestamp: new Date() });
    }

    completed++;
    currentSession.processedVideos = completed;
    const progress = Math.round((completed / videoList.length) * 100);
    await storage.updateJobProgress(jobId, progress);

    if (completed < videoList.length) {
      await new Promise(r => setTimeout(r, 2000));
    }
  }

  const finalSession = sessions.get(userId);
  if (finalSession) {
    finalSession.state = "idle";
    finalSession.currentVideoId = null;
  }

  const wasInterrupted = completed < videoList.length;
  const jobStatus = wasInterrupted ? "partial" : "completed";
  await storage.updateJobStatus(jobId, jobStatus, {
    optimized: completed,
    total: videoList.length,
    mode: "viral",
    interrupted: wasInterrupted,
  });

  await storage.createAuditLog({
    userId,
    action: "viral_back_catalog_completed",
    target: `${completed} of ${videoList.length} videos viral-optimized`,
    riskLevel: "low",
  });

  logger.info(`[BackCatalog] ✓ Viral reprocess complete: ${completed}/${videoList.length} videos`);
}

export async function getStaleVideos(userId: string): Promise<any[]> {
  const allVideos = await storage.getVideosByUser(userId);
  return allVideos.filter(v => {
    const lastOpt = v.metadata?.aiOptimizedAt;
    if (!lastOpt) return true;
    const daysSince = (Date.now() - new Date(lastOpt).getTime()) / (1000 * 60 * 60 * 24);
    return daysSince > 30;
  }).map(v => ({
    id: v.id,
    title: v.title,
    platform: v.platform || "youtube",
    lastOptimized: v.metadata?.aiOptimizedAt || null,
    daysSinceOptimization: v.metadata?.aiOptimizedAt
      ? Math.floor((Date.now() - new Date(v.metadata.aiOptimizedAt).getTime()) / (1000 * 60 * 60 * 24))
      : null,
    optimizationScore: calculateOptimizationScore(v.metadata),
  }));
}
